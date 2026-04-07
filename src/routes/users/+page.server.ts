import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import bcrypt from 'bcrypt';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { checkPermission } from '$lib/server/auth';

// --- Types (คงเดิม) ---
type Department = {
	id: number;
	name: string;
};

type Position = {
	id: number;
	name: string;
};

type Role = {
	id: number;
	name: string;
};

type IsoSection = {
	id: number;
	code: string;
	name_th: string | null;
	name_en: string | null;
};

type User = RowDataPacket & {
	id: number;
	username: string;
	email: string;
	created_at: string;
	updated_at?: string | null;
	role_id: number | null;
	role: string;
	roles_csv: string | null;
	role_ids_csv: string | null;
	full_name: string | null;
	emp_id: string | null;
	profile_image_url: string | null;
	department_id: number | null;
	position_id: number | null;
	iso_section: string | null;
	line_user_id: string | null;
	department_name: string | null;
	position_name: string | null;
};

/** Same shape as sql/user_transaction_log.sql but no FKs so CREATE can run from the app if missing. */
const CREATE_USER_TRANSACTION_LOG_SQL = `
CREATE TABLE IF NOT EXISTS user_transaction_log (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	target_user_id BIGINT UNSIGNED NOT NULL,
	actor_user_id BIGINT UNSIGNED NOT NULL,
	\`transaction\` TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_utl_target_created (target_user_id, created_at),
	KEY idx_utl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let userTransactionLogTableEnsured = false;

async function ensureUserTransactionLogTable(): Promise<boolean> {
	if (userTransactionLogTableEnsured) return true;
	try {
		await pool.execute(CREATE_USER_TRANSACTION_LOG_SQL);
		userTransactionLogTableEnsured = true;
		return true;
	} catch (err) {
		console.error('[users] ensureUserTransactionLogTable failed:', err);
		return false;
	}
}

function transactionTextFromLegacyRoleLog(row: RowDataPacket): string {
	const reason = row.change_reason != null ? String(row.change_reason).trim() : '';
	if (reason.length > 0) return reason;
	const o = row.old_role != null ? String(row.old_role) : '—';
	const n = row.new_role != null ? String(row.new_role) : '—';
	return `Role change: ${o} → ${n}`;
}

type MergedAuditRow = {
	id?: number;
	created_at: unknown;
	user_name: unknown;
	emp_id: unknown;
	changed_by_name: unknown;
	transaction: string;
	logKey: string;
};

async function loadMergedUserTransactionLogs(limit: number): Promise<MergedAuditRow[]> {
	const cap = Math.min(200, Math.max(1, limit * 2));
	// LIMIT as prepared param breaks on some MySQL/mysql2 combos (ER_WRONG_ARGUMENTS 1210).
	const capSql = String(Number.isFinite(cap) ? Math.floor(cap) : 100);
	await ensureUserTransactionLogTable();

	const utlMapped: MergedAuditRow[] = [];
	try {
		const [rows] = await pool.query<RowDataPacket[]>(
			`
			SELECT
				utl.id,
				utl.created_at,
				COALESCE(u.full_name, u.username, CONCAT('user #', utl.target_user_id)) AS user_name,
				u.emp_id,
				COALESCE(changer.full_name, changer.username, CONCAT('user #', utl.actor_user_id)) AS changed_by_name,
				utl.\`transaction\` AS transaction_text
			FROM user_transaction_log utl
			LEFT JOIN users u ON utl.target_user_id = u.id
			LEFT JOIN users changer ON utl.actor_user_id = changer.id
			ORDER BY utl.created_at DESC
			LIMIT ${capSql}`
		);
		for (const r of rows) {
			utlMapped.push({
				id: Number(r.id),
				created_at: r.created_at,
				user_name: r.user_name,
				emp_id: r.emp_id,
				changed_by_name: r.changed_by_name,
				transaction: String(r.transaction_text ?? ''),
				logKey: `utl-${r.id}`
			});
		}
	} catch (err) {
		console.error('[users] user_transaction_log SELECT failed:', err);
	}

	const legacyMapped: MergedAuditRow[] = [];
	try {
		const [legacyRows] = await pool.query<RowDataPacket[]>(
			`
			SELECT
				rcl.id,
				rcl.created_at,
				u.full_name AS user_name,
				u.emp_id,
				old_r.name AS old_role,
				new_r.name AS new_role,
				changer.full_name AS changed_by_name,
				rcl.change_reason
			FROM role_change_logs rcl
			JOIN users u ON rcl.user_id = u.id
			LEFT JOIN roles old_r ON rcl.old_role_id = old_r.id
			JOIN roles new_r ON rcl.new_role_id = new_r.id
			JOIN users changer ON rcl.changed_by_user_id = changer.id
			ORDER BY rcl.created_at DESC
			LIMIT ${capSql}`
		);
		for (const r of legacyRows) {
			legacyMapped.push({
				created_at: r.created_at,
				user_name: r.user_name,
				emp_id: r.emp_id,
				changed_by_name: r.changed_by_name,
				transaction: transactionTextFromLegacyRoleLog(r),
				logKey: `rcl-${r.id}`
			});
		}
	} catch (err) {
		console.error('[users] role_change_logs SELECT skipped:', err);
	}

	const merged = [...utlMapped, ...legacyMapped].sort(
		(a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
	);
	return merged.slice(0, limit);
}

/** Append one audit row (roles, password, quick actions). Non-fatal on failure. */
async function logUserTransaction(
	targetUserId: number,
	actorUserId: number,
	transaction: string
): Promise<void> {
	const ok = await ensureUserTransactionLogTable();
	if (!ok) return;
	try {
		await pool.execute(
			`INSERT INTO user_transaction_log (target_user_id, actor_user_id, \`transaction\`) VALUES (?, ?, ?)`,
			[targetUserId, actorUserId, transaction]
		);
	} catch (err) {
		console.error('[users] user_transaction_log insert failed:', err);
	}
}

async function roleNamesByIds(ids: number[]): Promise<Map<number, string>> {
	const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
	if (unique.length === 0) return new Map();
	const placeholders = unique.map(() => '?').join(', ');
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT id, name FROM roles WHERE id IN (${placeholders})`,
		unique
	);
	const m = new Map<number, string>();
	for (const r of rows) {
		m.set(Number(r.id), String(r.name));
	}
	return m;
}

function normPositiveIntOrNull(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : null;
}

function normIsoSection(v: unknown): string | null {
	const t = String(v ?? '').trim();
	return t.length > 0 ? t : null;
}

async function labelDepartment(id: number | null): Promise<string> {
	if (id == null) return '—';
	const [rows] = await pool.execute<RowDataPacket[]>(
		'SELECT name FROM departments WHERE id = ? LIMIT 1',
		[id]
	);
	return rows[0]?.name != null ? String(rows[0].name) : `#${id}`;
}

async function labelPosition(id: number | null): Promise<string> {
	if (id == null) return '—';
	const [rows] = await pool.execute<RowDataPacket[]>(
		'SELECT name FROM positions WHERE id = ? LIMIT 1',
		[id]
	);
	return rows[0]?.name != null ? String(rows[0].name) : `#${id}`;
}

/** Log department / position / iso_section changes (not roles — those use auditUserProfileRoleChanges). */
async function auditUserProfileOrgFields(
	userId: number,
	actorUserId: number,
	old: { departmentId: number | null; positionId: number | null; iso: string | null },
	next: { departmentId: number | null; positionId: number | null; iso: string | null }
): Promise<void> {
	if (old.departmentId !== next.departmentId) {
		const [a, b] = await Promise.all([
			labelDepartment(old.departmentId),
			labelDepartment(next.departmentId)
		]);
		await logUserTransaction(userId, actorUserId, `Department: ${a} → ${b}`);
	}
	if (old.positionId !== next.positionId) {
		const [a, b] = await Promise.all([
			labelPosition(old.positionId),
			labelPosition(next.positionId)
		]);
		await logUserTransaction(userId, actorUserId, `Position: ${a} → ${b}`);
	}
	if (old.iso !== next.iso) {
		const disp = (s: string | null) => (s == null ? '—' : s);
		await logUserTransaction(
			userId,
			actorUserId,
			`Iso_Section: ${disp(old.iso)} → ${disp(next.iso)}`
		);
	}
}

async function getQmrRoleId(): Promise<number | null> {
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT id FROM roles WHERE UPPER(TRIM(name)) = 'QMR' LIMIT 1`
	);
	const n = Number(rows[0]?.id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

/** Compare old vs new roles after profile save; one log line per kind of change (comma-separated roles). */
async function auditUserProfileRoleChanges(
	userId: number,
	oldPrimary: number | null,
	oldSet: Set<number>,
	newRoleIds: number[],
	changedByUserId: number,
	isoSection: string | null | undefined
): Promise<void> {
	if (newRoleIds.length === 0) return;

	const newPrimary = newRoleIds[0];
	const newSet = new Set(newRoleIds);
	const qmrId = await getQmrRoleId();
	const isoQm = (isoSection || '').trim().toUpperCase() === 'QM';

	const sameMembers =
		oldSet.size === newSet.size && [...oldSet].every((rid) => newSet.has(rid));

	if (sameMembers && oldPrimary != null && oldPrimary !== newPrimary) {
		const map = await roleNamesByIds([oldPrimary, newPrimary]);
		const oldN = map.get(oldPrimary) ?? `#${oldPrimary}`;
		const newN = map.get(newPrimary) ?? `#${newPrimary}`;
		await logUserTransaction(
			userId,
			changedByUserId,
			`Primary role changed: ${oldN} → ${newN}`
		);
		return;
	}

	const removed = [...oldSet].filter((rid) => !newSet.has(rid));
	const added = [...newSet].filter((rid) => !oldSet.has(rid));

	if (removed.length > 0) {
		const map = await roleNamesByIds(removed);
		const names = removed.map((id) => map.get(id) ?? `#${id}`).join(', ');
		await logUserTransaction(userId, changedByUserId, `Removed roles: ${names}`);
	}

	if (added.length > 0) {
		const map = await roleNamesByIds(added);
		let line = `Granted roles: ${added.map((id) => map.get(id) ?? `#${id}`).join(', ')}`;
		if (isoQm && qmrId != null && added.includes(qmrId)) {
			line += ' (includes QMR for Iso_Section QM)';
		}
		await logUserTransaction(userId, changedByUserId, line);
	}
}

/** Hint when password audit migration was not applied */
function messageForMissingPasswordAuditMigration(err: unknown): string | null {
	const e = err as { code?: string; errno?: number; message?: string };
	const msg = String(e?.message || '');
	if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.errno !== 1054) return null;
	if (msg.includes('password_changed_at')) {
		return 'ฐานข้อมูลยังไม่มีคอลัมน์ password_changed_at — รันไฟล์ sql/user_transaction_log.sql บน MySQL แล้วลองอีกครั้ง';
	}
	return null;
}

/** True if migration added users.password_changed_at (avoids 500 before SQL is applied). */
async function usersHasPasswordChangedAtColumn(): Promise<boolean> {
	try {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at'`
		);
		return Number(rows[0]?.c) > 0;
	} catch (err) {
		console.error('[users] password_changed_at column check failed:', err);
		return false;
	}
}

async function usersHasUpdatedAtColumn(): Promise<boolean> {
	try {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at'`
		);
		return Number(rows[0]?.c) > 0;
	} catch (err) {
		console.error('[users] updated_at column check failed:', err);
		return false;
	}
}

/** Clear hint when DB migration for LINE was not applied */
function messageForMissingLineUserIdColumn(err: unknown): string | null {
	const e = err as { code?: string; errno?: number; message?: string };
	const msg = String(e?.message || '');
	if (!msg.includes('line_user_id')) return null;
	if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.errno === 1054) {
		return 'ฐานข้อมูลยังไม่มีคอลัมน์ line_user_id — รันไฟล์ sql/users_line_user_id.sql บน MySQL (ฐานเดียวกับแอป) แล้วลอง Save อีกครั้ง';
	}
	return null;
}

/** When Iso_Section is QM, ensure QMR role is included (DAR Approver + register alignment). */
async function mergeQmrRoleIfQmIsoSection(
	isoSection: string | null | undefined,
	roleIds: number[]
): Promise<number[]> {
	const code = (isoSection || '').trim().toUpperCase();
	if (code !== 'QM') return roleIds;
	const qmrId = await getQmrRoleId();
	if (qmrId == null) return roleIds;
	return Array.from(new Set([...roleIds, qmrId]));
}

/**
 *
 */
export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'manage users');
	try {
		const hasUpdatedAt = await usersHasUpdatedAtColumn();
		const orderSql = hasUpdatedAt
			? 'ORDER BY u.updated_at DESC, u.id DESC'
			: 'ORDER BY u.created_at DESC, u.id DESC';
		const [userRows] = await pool.execute<User[]>(`
            SELECT
                u.*, 
                r.name as role,
                urx.roles_csv,
                urx.role_ids_csv,
                d.name as department_name,
                p.name as position_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
			LEFT JOIN (
				SELECT
					ur.user_id,
					GROUP_CONCAT(DISTINCT r2.name ORDER BY r2.name) AS roles_csv,
					GROUP_CONCAT(DISTINCT ur.role_id ORDER BY ur.role_id) AS role_ids_csv
				FROM user_roles ur
				JOIN roles r2 ON ur.role_id = r2.id
				GROUP BY ur.user_id
			) urx ON urx.user_id = u.id
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN positions p ON u.position_id = p.id
            ${orderSql}
        `);

		const [departmentRows] = await pool.execute<Department[] & RowDataPacket[]>(
			'SELECT id, name FROM departments ORDER BY name ASC'
		);
		const [positionRows] = await pool.execute<Position[] & RowDataPacket[]>(
			'SELECT id, name FROM positions ORDER BY name ASC'
		);
		const [roleRows] = await pool.execute<Role[] & RowDataPacket[]>(
			'SELECT id, name FROM roles ORDER BY name ASC'
		);
		const [isoSectionRows] = await pool.execute<IsoSection[] & RowDataPacket[]>(
			'SELECT id, code, name_th, name_en FROM iso_sections ORDER BY code ASC'
		);

		const userTransactionLogs = await loadMergedUserTransactionLogs(20);

		return {
			users: userRows,
			departments: departmentRows,
			positions: positionRows,
			roles: roleRows,
			isoSections: isoSectionRows,
			userTransactionLogs
		};
	} catch (err) {
		console.error('Failed to load data:', err);
		throw error(500, { message: 'Failed to load data from the server.' });
	}
};

export const actions: Actions = {
	/**
	 *
	 */
	addUser: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');

		const data = await request.formData();

		const username = data.get('username')?.toString();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const role_id = data.get('role_id')?.toString();
		const role_ids_raw = data.getAll('role_ids');
		const full_name = data.get('full_name')?.toString();
		const emp_id = data.get('emp_id')?.toString();
		const department_id_str = data.get('department_id')?.toString();
		const position_id_str = data.get('position_id')?.toString();
		const iso_section = data.get('iso_section')?.toString();
		const line_user_id = data.get('line_user_id')?.toString();
		const profile_image = data.get('profile_image') as File;

		let roleIds = Array.from(
			new Set(
				role_ids_raw
					.map((value) => Number(value.toString()))
					.filter((value) => Number.isInteger(value) && value > 0)
			)
		);
		if (roleIds.length === 0 && role_id) {
			const fallbackRole = Number(role_id);
			if (Number.isInteger(fallbackRole) && fallbackRole > 0) roleIds.push(fallbackRole);
		}

		roleIds = await mergeQmrRoleIfQmIsoSection(iso_section, roleIds);

		if (!username || !email || !full_name || !password || roleIds.length === 0) {
			return fail(400, {
				action: 'addUser',
				success: false,
				message: 'Please fill in all required fields.'
			});
		}
		if (password.length < 6) {
			return fail(400, {
				action: 'addUser',
				success: false,
				message: 'Password must be at least 6 characters long.'
			});
		}

		let profile_image_url: string | null = null;
		let uploadedFilePath: string | null = null;

		if (profile_image && profile_image.size > 0) {
			try {
				const fileExt = path.extname(profile_image.name);
				const fileName = `${uuidv4()}${fileExt}`;
				const uploadDir = path.join('static', 'uploads', 'profiles');

				if (!fs.existsSync(uploadDir)) {
					fs.mkdirSync(uploadDir, { recursive: true });
				}

				uploadedFilePath = path.join(uploadDir, fileName);
				fs.writeFileSync(uploadedFilePath, Buffer.from(await profile_image.arrayBuffer()));
				profile_image_url = `/uploads/profiles/${fileName}`;
			} catch (err) {
				console.error('File upload failed:', err);
				return fail(500, {
					action: 'addUser',
					success: false,
					message: 'Failed to upload profile image.'
				});
			}
		}

		try {
			const salt = await bcrypt.genSalt(10);
			const password_hash = await bcrypt.hash(password, salt);

			const departmentIdValue =
				department_id_str && department_id_str !== 'undefined' ? Number(department_id_str) : null;
			const positionIdValue =
				position_id_str && position_id_str !== 'undefined' ? Number(position_id_str) : null;
			const primaryRoleId = roleIds[0];
			const isoSectionValue = iso_section?.trim() ? iso_section.trim() : null;
			const lineUserIdValue = line_user_id?.trim() ? line_user_id.trim() : null;

			const hasPwdCol = await usersHasPasswordChangedAtColumn();

			const conn = await pool.getConnection();
			try {
				await conn.beginTransaction();

				const insertSql = hasPwdCol
					? `INSERT INTO users (
						username, email, password_hash, password_changed_at, role_id,
						full_name, emp_id, department_id, position_id, iso_section,
						line_user_id,
						profile_image_url
					)
					VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`
					: `INSERT INTO users (
						username, email, password_hash, role_id,
						full_name, emp_id, department_id, position_id, iso_section,
						line_user_id,
						profile_image_url
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

				const insertParams = hasPwdCol
					? [
							username,
							email,
							password_hash,
							primaryRoleId,
							full_name,
							emp_id || null,
							departmentIdValue,
							positionIdValue,
							isoSectionValue,
							lineUserIdValue,
							profile_image_url
						]
					: [
							username,
							email,
							password_hash,
							primaryRoleId,
							full_name,
							emp_id || null,
							departmentIdValue,
							positionIdValue,
							isoSectionValue,
							lineUserIdValue,
							profile_image_url
						];

				const [insertResult] = await conn.execute<ResultSetHeader>(insertSql, insertParams);

				const newUserId = insertResult.insertId;
				const placeholders = roleIds.map(() => '(?, ?)').join(', ');
				const params = roleIds.flatMap((selectedRoleId) => [newUserId, selectedRoleId]);
				await conn.execute(`INSERT INTO user_roles (user_id, role_id) VALUES ${placeholders}`, params);

				await conn.commit();

				const qmrId = await getQmrRoleId();
				const isoQm = (iso_section || '').trim().toUpperCase() === 'QM';
				const nameMap = await roleNamesByIds(roleIds);
				const names = roleIds.map((id) => nameMap.get(id) ?? `#${id}`).join(', ');
				let tx = `User created. Roles: ${names}`;
				if (isoQm && qmrId != null && roleIds.includes(qmrId)) {
					tx += ' (includes QMR for Iso_Section QM)';
				}
				await logUserTransaction(newUserId, locals.user!.id, tx);
			} catch (txErr) {
				await conn.rollback();
				throw txErr;
			} finally {
				conn.release();
			}

			return { action: 'addUser', success: true, message: 'User added successfully!' };
		} catch (err: any) {
			if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
				fs.unlinkSync(uploadedFilePath);
			}

			console.error('Database error on adding user:', err);
			if (err.code === 'ER_DUP_ENTRY') {
				const message = err.message.includes('emp_id')
					? 'This Employee ID is already in use.'
					: 'This username is already taken.';
				return fail(409, { action: 'addUser', success: false, message });
			}
			const lineHint = messageForMissingLineUserIdColumn(err);
			if (lineHint) {
				return fail(500, { action: 'addUser', success: false, message: lineHint });
			}
			const pwdHint = messageForMissingPasswordAuditMigration(err);
			if (pwdHint) {
				return fail(500, { action: 'addUser', success: false, message: pwdHint });
			}
			return fail(500, {
				action: 'addUser',
				success: false,
				message: 'Failed to add user to the database.'
			});
		}
	},

	/**
	 *
	 */
	editUser: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');

		const data = await request.formData();

		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'editUser', success: false, message: 'Invalid User ID.' });

		const userIdNum = Number(id);
		if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
			return fail(400, { action: 'editUser', success: false, message: 'Invalid User ID.' });
		}

		const hasPwdCol = await usersHasPasswordChangedAtColumn();
		const [existingUserRows] = await pool.execute<RowDataPacket[]>(
			hasPwdCol
				? 'SELECT role_id, password_changed_at, department_id, position_id, iso_section FROM users WHERE id = ? LIMIT 1'
				: 'SELECT role_id, department_id, position_id, iso_section FROM users WHERE id = ? LIMIT 1',
			[userIdNum]
		);
		if (!existingUserRows.length) {
			return fail(404, { action: 'editUser', success: false, message: 'User not found.' });
		}
		const oldPrimary =
			existingUserRows[0].role_id != null ? Number(existingUserRows[0].role_id) : null;
		const priorPwdForAge =
			hasPwdCol && existingUserRows[0].password_changed_at != null
				? new Date(existingUserRows[0].password_changed_at as string | Date)
				: null;
		const oldDepartmentId = normPositiveIntOrNull(existingUserRows[0].department_id);
		const oldPositionId = normPositiveIntOrNull(existingUserRows[0].position_id);
		const oldIso = normIsoSection(existingUserRows[0].iso_section);
		const [oldUrRows] = await pool.execute<RowDataPacket[]>(
			'SELECT role_id FROM user_roles WHERE user_id = ?',
			[userIdNum]
		);
		const oldRoleSet = new Set<number>();
		for (const row of oldUrRows) {
			oldRoleSet.add(Number(row.role_id));
		}
		if (oldRoleSet.size === 0 && oldPrimary != null) {
			oldRoleSet.add(oldPrimary);
		}

		// Fields
		const full_name = data.get('full_name')?.toString();
		const email = data.get('email')?.toString();
		const username = data.get('username')?.toString();
		const emp_id = data.get('emp_id')?.toString();
		const role_id = data.get('role_id')?.toString();
		const role_ids_raw = data.getAll('role_ids');
		const department_id_str = data.get('department_id')?.toString();
		const position_id_str = data.get('position_id')?.toString();
		const iso_section = data.get('iso_section')?.toString();
		const line_user_id = data.get('line_user_id')?.toString();

		// Optional fields
		const new_password = data.get('password')?.toString();
		const profile_image = data.get('profile_image') as File;

		let roleIds = Array.from(
			new Set(
				role_ids_raw
					.map((value) => Number(value.toString()))
					.filter((value) => Number.isInteger(value) && value > 0)
			)
		);
		if (roleIds.length === 0 && role_id) {
			const fallbackRole = Number(role_id);
			if (Number.isInteger(fallbackRole) && fallbackRole > 0) roleIds.push(fallbackRole);
		}

		roleIds = await mergeQmrRoleIfQmIsoSection(iso_section, roleIds);

		if (!full_name || !email || !username || roleIds.length === 0) {
			return fail(400, { action: 'editUser', success: false, message: 'Missing required fields.' });
		}

		let profile_image_url: string | undefined = undefined;
		let old_image_path: string | null = null;
		let uploadedFilePath: string | null = null;

		// 1. Handle file upload (if new one provided)
		if (profile_image && profile_image.size > 0) {
			try {
				// 1a. Get old image path (to delete later)
				const [userRows] = await pool.execute<RowDataPacket[]>(
					'SELECT profile_image_url FROM users WHERE id = ?',
					[id]
				);
				if (userRows.length > 0) old_image_path = userRows[0].profile_image_url;

				// 1b. Save new image
				const fileExt = path.extname(profile_image.name);
				const fileName = `${uuidv4()}${fileExt}`;
				const uploadDir = path.join('static', 'uploads', 'profiles');

				if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

				uploadedFilePath = path.join(uploadDir, fileName);
				fs.writeFileSync(uploadedFilePath, Buffer.from(await profile_image.arrayBuffer()));
				profile_image_url = `/uploads/profiles/${fileName}`;
			} catch (err) {
				console.error('File upload failed:', err);
				return fail(500, {
					action: 'editUser',
					success: false,
					message: 'Failed to upload image.'
				});
			}
		}

		// 2. Build and execute DB update
		try {
			const queryParams: any[] = [];
			const queryFields: string[] = [];

			// Add standard fields
			queryFields.push('full_name = ?');
			queryParams.push(full_name);
			queryFields.push('email = ?');
			queryParams.push(email);
			queryFields.push('username = ?');
			queryParams.push(username);
			queryFields.push('emp_id = ?');
			queryParams.push(emp_id || null);
			queryFields.push('role_id = ?');
			queryParams.push(roleIds[0]);
			queryFields.push('iso_section = ?');
			queryParams.push(iso_section?.trim() ? iso_section.trim() : null);
			queryFields.push('line_user_id = ?');
			queryParams.push(line_user_id?.trim() ? line_user_id.trim() : null);

			const departmentIdValue = normPositiveIntOrNull(
				department_id_str && department_id_str !== 'undefined' ? department_id_str : null
			);
			const positionIdValue = normPositiveIntOrNull(
				position_id_str && position_id_str !== 'undefined' ? position_id_str : null
			);
			const newIso = normIsoSection(iso_section);
			queryFields.push('department_id = ?');
			queryParams.push(departmentIdValue);
			queryFields.push('position_id = ?');
			queryParams.push(positionIdValue);

			// Add optional file
			if (profile_image_url) {
				queryFields.push('profile_image_url = ?');
				queryParams.push(profile_image_url);
			}

			// Add optional password
			const passwordChanged = !!(new_password && new_password.length > 0);
			if (passwordChanged) {
				if (new_password!.length < 6)
					return fail(400, {
						action: 'editUser',
						success: false,
						message: 'Password must be at least 6 characters.'
					});
				const salt = await bcrypt.genSalt(10);
				const password_hash = await bcrypt.hash(new_password!, salt);
				queryFields.push('password_hash = ?');
				queryParams.push(password_hash);
				if (hasPwdCol) {
					queryFields.push('password_changed_at = NOW()');
				}
			}

			const conn = await pool.getConnection();
			try {
				await conn.beginTransaction();
				queryParams.push(id); // For WHERE
				const sql = `UPDATE users SET ${queryFields.join(', ')} WHERE id = ?`;
				await conn.execute(sql, queryParams);

				await conn.execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
				const placeholders = roleIds.map(() => '(?, ?)').join(', ');
				const params = roleIds.flatMap((selectedRoleId) => [Number(id), selectedRoleId]);
				await conn.execute(`INSERT INTO user_roles (user_id, role_id) VALUES ${placeholders}`, params);

				await conn.commit();

				await auditUserProfileRoleChanges(
					userIdNum,
					oldPrimary,
					oldRoleSet,
					roleIds,
					locals.user!.id,
					iso_section
				);

				await auditUserProfileOrgFields(
					userIdNum,
					locals.user!.id,
					{
						departmentId: oldDepartmentId,
						positionId: oldPositionId,
						iso: oldIso
					},
					{
						departmentId: departmentIdValue,
						positionId: positionIdValue,
						iso: newIso
					}
				);

				if (passwordChanged) {
					let agePart: string;
					if (!hasPwdCol) {
						agePart =
							' (run sql/user_transaction_log.sql to track password age on future changes)';
					} else if (priorPwdForAge) {
						const days = Math.floor((Date.now() - priorPwdForAge.getTime()) / 86400000);
						agePart = ` (previous password was ${days} day(s) old)`;
					} else {
						agePart = ' (no previous change date on record)';
					}
					await logUserTransaction(
						userIdNum,
						locals.user!.id,
						`Password changed${agePart}.`
					);
				}
			} catch (txErr) {
				await conn.rollback();
				throw txErr;
			} finally {
				conn.release();
			}

			// 3. Success: Delete old file
			if (profile_image_url && old_image_path) {
				const oldFilePath = path.join('static', old_image_path);
				if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
			}

			return { action: 'editUser', success: true, message: 'User updated successfully!' };
		} catch (err: any) {
			// 4. DB Error: Rollback file upload
			if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
				fs.unlinkSync(uploadedFilePath);
			}
			console.error('Profile update failed:', err);
			if (err.code === 'ER_DUP_ENTRY')
				return fail(409, {
					action: 'editUser',
					success: false,
					message: 'Username or Employee ID already exists.'
				});
			const lineHint = messageForMissingLineUserIdColumn(err);
			if (lineHint) {
				return fail(500, { action: 'editUser', success: false, message: lineHint });
			}
			const pwdHint = messageForMissingPasswordAuditMigration(err);
			if (pwdHint) {
				return fail(500, { action: 'editUser', success: false, message: pwdHint });
			}
			return fail(500, { action: 'editUser', success: false, message: 'Failed to update user.' });
		}
	},

	/**
	 *
	 */
	deleteUser: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');

		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'deleteUser', success: false, message: 'Invalid ID.' });

		let old_image_path: string | null = null;

		try {
			// 1. Get image path before deleting
			const [userRows] = await pool.execute<RowDataPacket[]>(
				'SELECT profile_image_url FROM users WHERE id = ?',
				[id]
			);
			if (userRows.length > 0) old_image_path = userRows[0].profile_image_url;

			// 2. Delete user from DB
			await pool.execute('DELETE FROM users WHERE id = ?', [id]);

			// 3. Delete file (if it exists)
			if (old_image_path) {
				const oldFilePath = path.join('static', old_image_path);
				if (fs.existsSync(oldFilePath)) {
					fs.unlinkSync(oldFilePath);
				}
			}

			return { action: 'deleteUser', success: true, message: 'User deleted.' };
		} catch (err: any) {
			console.error('Failed to delete user:', err);

			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteUser',
					success: false,
					message:
						'Cannot delete user: This user is referenced in other parts of the system (e.g., assets, approvals).'
				});
			}
			return fail(500, {
				action: 'deleteUser',
				success: false,
				message: 'Failed to delete user.'
			});
		}
	},

	assignIsoDocsRole: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');

		const data = await request.formData();
		const userId = Number(data.get('id')?.toString() || 0);

		if (!userId) {
			return fail(400, {
				action: 'assignIsoDocsRole',
				success: false,
				message: 'Invalid user id.'
			});
		}

		if (locals.user?.id === userId) {
			return fail(400, {
				action: 'assignIsoDocsRole',
				success: false,
				message: 'Cannot change your own role from this quick action.'
			});
		}

		try {
			const [roleRows] = await pool.execute<RowDataPacket[]>(
				`SELECT id FROM roles WHERE name = 'ISO_DOCS' LIMIT 1`
			);

			if (roleRows.length === 0) {
				return fail(404, {
					action: 'assignIsoDocsRole',
					success: false,
					message: 'Role ISO_DOCS not found.'
				});
			}

			const isoRoleId = Number(roleRows[0].id);

			// Get current role before update
			const [userRows] = await pool.execute<RowDataPacket[]>(
				`SELECT role_id FROM users WHERE id = ? LIMIT 1`,
				[userId]
			);

			if (userRows.length === 0) {
				return fail(404, {
					action: 'assignIsoDocsRole',
					success: false,
					message: 'User not found.'
				});
			}

			const oldRoleId = userRows[0].role_id as number | null;

			const conn = await pool.getConnection();
			let updateResult: ResultSetHeader | null = null;
			try {
				await conn.beginTransaction();
				const [updateRows] = await conn.execute<ResultSetHeader>(
					`UPDATE users SET role_id = ? WHERE id = ?`,
					[isoRoleId, userId]
				);
				updateResult = updateRows;
				await conn.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
				await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, isoRoleId]);
				await conn.commit();
			} catch (txErr) {
				await conn.rollback();
				throw txErr;
			} finally {
				conn.release();
			}

			if (!updateResult || updateResult.affectedRows === 0) {
				return fail(404, {
					action: 'assignIsoDocsRole',
					success: false,
					message: 'User not found.'
				});
			}

			const nm = await roleNamesByIds(
				[isoRoleId, ...(oldRoleId != null ? [oldRoleId] : [])].filter((x) => x > 0)
			);
			const oldLabel = oldRoleId != null ? (nm.get(oldRoleId) ?? `#${oldRoleId}`) : 'none';
			const newLabel = nm.get(isoRoleId) ?? `#${isoRoleId}`;
			await logUserTransaction(
				userId,
				locals.user!.id,
				`Quick assign: primary set to ${newLabel} (was: ${oldLabel})`
			);

			return {
				action: 'assignIsoDocsRole',
				success: true,
				message: 'Assigned ISO_DOCS role successfully.'
			};
		} catch (err: any) {
			console.error('Failed to assign ISO_DOCS role:', err);
			return fail(500, {
				action: 'assignIsoDocsRole',
				success: false,
				message: 'Failed to assign ISO_DOCS role.'
			});
		}
	},

	quickChangeUserRole: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');

		const data = await request.formData();
		const userId = Number(data.get('id')?.toString() || 0);
		const roleId = Number(data.get('role_id')?.toString() || 0);

		if (!userId || !roleId) {
			return fail(400, {
				action: 'quickChangeUserRole',
				success: false,
				message: 'Invalid user or role.'
			});
		}

		if (locals.user?.id === userId) {
			return fail(400, {
				action: 'quickChangeUserRole',
				success: false,
				message: 'Cannot change your own role from quick action.'
			});
		}

		try {
			const [roleRows] = await pool.execute<RowDataPacket[]>(
				`SELECT id, name FROM roles WHERE id = ? LIMIT 1`,
				[roleId]
			);

			if (roleRows.length === 0) {
				return fail(404, {
					action: 'quickChangeUserRole',
					success: false,
					message: 'Selected role not found.'
				});
			}

			const roleName = String(roleRows[0].name);

			// Get current role before update
			const [userRows] = await pool.execute<RowDataPacket[]>(
				`SELECT role_id FROM users WHERE id = ? LIMIT 1`,
				[userId]
			);

			if (userRows.length === 0) {
				return fail(404, {
					action: 'quickChangeUserRole',
					success: false,
					message: 'User not found.'
				});
			}

			const oldRoleId = userRows[0].role_id as number | null;

			const conn = await pool.getConnection();
			let updateResult: ResultSetHeader | null = null;
			try {
				await conn.beginTransaction();
				const [updateRows] = await conn.execute<ResultSetHeader>(
					`UPDATE users SET role_id = ? WHERE id = ?`,
					[roleId, userId]
				);
				updateResult = updateRows;
				await conn.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
				await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
				await conn.commit();
			} catch (txErr) {
				await conn.rollback();
				throw txErr;
			} finally {
				conn.release();
			}

			if (!updateResult || updateResult.affectedRows === 0) {
				return fail(404, {
					action: 'quickChangeUserRole',
					success: false,
					message: 'User not found.'
				});
			}

			const nm = await roleNamesByIds(
				[roleId, ...(oldRoleId != null ? [oldRoleId] : [])].filter((x) => x > 0)
			);
			const oldLabel = oldRoleId != null ? (nm.get(oldRoleId) ?? `#${oldRoleId}`) : 'none';
			const newLabel = nm.get(roleId) ?? `#${roleId}`;
			await logUserTransaction(
				userId,
				locals.user!.id,
				`Quick role change: ${oldLabel} → ${newLabel}`
			);

			return {
				action: 'quickChangeUserRole',
				success: true,
				message: `Role updated to '${roleName}'.`
			};
		} catch (err: any) {
			console.error('Failed to quick change role:', err);
			return fail(500, {
				action: 'quickChangeUserRole',
				success: false,
				message: 'Failed to update role.'
			});
		}
	},

	// --- Department Actions  ---
	saveDepartment: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();

		if (!name) {
			return fail(400, {
				action: 'saveDepartment',
				success: false,
				message: 'Department name is required.'
			});
		}

		try {
			if (id) {
				await pool.execute('UPDATE departments SET name = ? WHERE id = ?', [name, parseInt(id)]);
			} else {
				await pool.execute('INSERT INTO departments (name) VALUES (?)', [name]);
			}
			return { action: 'saveDepartment', success: true, message: `Department '${name}' saved.` };
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveDepartment',
					success: false,
					message: 'Department name already exists.'
				});
			}
			return fail(500, {
				action: 'saveDepartment',
				success: false,
				message: `Failed to save department: ${err.message}`
			});
		}
	},

	deleteDepartment: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id)
			return fail(400, { action: 'deleteDepartment', success: false, message: 'Invalid ID.' });

		try {
			const [userRefs] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM users WHERE department_id = ? LIMIT 1',
				[id]
			);
			if (userRefs.length > 0) {
				return fail(409, {
					action: 'deleteDepartment',
					success: false,
					message: 'Cannot delete: Department is assigned to users.'
				});
			}

			const [result] = await pool.execute<ResultSetHeader>('DELETE FROM departments WHERE id = ?', [
				id
			]);
			if (result.affectedRows === 0) {
				return fail(404, {
					action: 'deleteDepartment',
					success: false,
					message: 'Department not found.'
				});
			}
			return { action: 'deleteDepartment', success: true, message: 'Department deleted.' };
		} catch (err: any) {
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteDepartment',
					success: false,
					message: 'Cannot delete: Department is referenced elsewhere.'
				});
			}
			return fail(500, {
				action: 'deleteDepartment',
				success: false,
				message: `Failed to delete department: ${err.message}`
			});
		}
	},

	// --- Position Actions  ---
	savePosition: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();

		if (!name) {
			return fail(400, {
				action: 'savePosition',
				success: false,
				message: 'Position name is required.'
			});
		}

		try {
			if (id) {
				await pool.execute('UPDATE positions SET name = ? WHERE id = ?', [name, parseInt(id)]);
			} else {
				await pool.execute('INSERT INTO positions (name) VALUES (?)', [name]);
			}
			return { action: 'savePosition', success: true, message: `Position '${name}' saved.` };
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'savePosition',
					success: false,
					message: 'Position name already exists.'
				});
			}
			return fail(500, {
				action: 'savePosition',
				success: false,
				message: `Failed to save position: ${err.message}`
			});
		}
	},

	deletePosition: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'deletePosition', success: false, message: 'Invalid ID.' });

		try {
			const [userRefs] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM users WHERE position_id = ? LIMIT 1',
				[id]
			);
			if (userRefs.length > 0) {
				return fail(409, {
					action: 'deletePosition',
					success: false,
					message: 'Cannot delete: Position is assigned to users.'
				});
			}

			const [result] = await pool.execute<ResultSetHeader>('DELETE FROM positions WHERE id = ?', [
				id
			]);
			if (result.affectedRows === 0) {
				return fail(404, {
					action: 'deletePosition',
					success: false,
					message: 'Position not found.'
				});
			}
			return { action: 'deletePosition', success: true, message: 'Position deleted.' };
		} catch (err: any) {
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deletePosition',
					success: false,
					message: 'Cannot delete: Position is referenced elsewhere.'
				});
			}
			return fail(500, {
				action: 'deletePosition',
				success: false,
				message: `Failed to delete position: ${err.message}`
			});
		}
	},

	// --- ISO Section Actions ---
	saveIsoSection: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const code = data.get('code')?.toString()?.trim().toUpperCase();
		const name_th = data.get('name_th')?.toString()?.trim();
		const name_en = data.get('name_en')?.toString()?.trim();

		if (!code) {
			return fail(400, {
				action: 'saveIsoSection',
				success: false,
				message: 'ISO Section code is required.'
			});
		}

		try {
			if (id) {
				await pool.execute(
					'UPDATE iso_sections SET code = ?, name_th = ?, name_en = ? WHERE id = ?',
					[code, name_th || null, name_en || null, parseInt(id)]
				);
			} else {
				await pool.execute('INSERT INTO iso_sections (code, name_th, name_en) VALUES (?, ?, ?)', [
					code,
					name_th || null,
					name_en || null
				]);
			}
			return { action: 'saveIsoSection', success: true, message: `Iso_Section '${code}' saved.` };
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveIsoSection',
					success: false,
					message: 'Iso_Section code already exists.'
				});
			}
			return fail(500, {
				action: 'saveIsoSection',
				success: false,
				message: `Failed to save Iso_Section: ${err.message}`
			});
		}
	},

	deleteIsoSection: async ({ request, locals }) => {
		checkPermission(locals, 'manage users');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'deleteIsoSection', success: false, message: 'Invalid ID.' });

		try {
			const [rows] = await pool.execute<RowDataPacket[]>(
				'SELECT code FROM iso_sections WHERE id = ? LIMIT 1',
				[id]
			);
			if (rows.length === 0) {
				return fail(404, {
					action: 'deleteIsoSection',
					success: false,
					message: 'Iso_Section not found.'
				});
			}

			const code = String(rows[0].code);
			const [userRefs] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM users WHERE iso_section = ? LIMIT 1',
				[code]
			);
			if (userRefs.length > 0) {
				return fail(409, {
					action: 'deleteIsoSection',
					success: false,
					message: 'Cannot delete: Iso_Section is assigned to users.'
				});
			}

			const [result] = await pool.execute<ResultSetHeader>('DELETE FROM iso_sections WHERE id = ?', [id]);
			if (result.affectedRows === 0) {
				return fail(404, {
					action: 'deleteIsoSection',
					success: false,
					message: 'Iso_Section not found.'
				});
			}
			return { action: 'deleteIsoSection', success: true, message: 'Iso_Section deleted.' };
		} catch (err: any) {
			return fail(500, {
				action: 'deleteIsoSection',
				success: false,
				message: `Failed to delete Iso_Section: ${err.message}`
			});
		}
	}
};