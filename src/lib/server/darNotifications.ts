import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { formatDarNoDisplay } from '$lib/darNoFormat';
import { DAR_ROLE_MGR, DAR_ROLE_QMR, DAR_ROLE_VP } from '$lib/darWorkflowLabels';
import { PERM_ISODOCS_DAR_QMR } from '$lib/isodocsDarPermissions';
import { sendMail } from '$lib/server/mailer';
import { sendLineTextMulticast } from '$lib/server/lineMessaging';

export type DarNotifyStage = 'submit' | 'after_review' | 'after_approve' | 'after_register';

type PrivateEnv = Record<string, string | undefined>;

interface DarNotifyUser extends RowDataPacket {
	id: number;
	email: string;
	full_name: string | null;
	line_user_id: string | null;
}

function splitEmailList(raw: string | undefined): string[] {
	return (raw || '')
		.split(/[;,]/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** ชื่อเอกสาร + revision จาก dar_request_items (ทุกบรรทัดในใบ) */
async function fetchDarDocumentsSummary(
	pool: Pool,
	darRequestId: number
): Promise<{ plain: string; html: string }> {
	const rid = Number(darRequestId);
	if (!Number.isInteger(rid) || rid <= 0) {
		return { plain: '', html: '' };
	}
	const [rows] = await pool.query<RowDataPacket[]>(
		`SELECT document_name, revision, document_code, line_no
		 FROM dar_request_items
		 WHERE dar_request_id = ?
		 ORDER BY line_no ASC`,
		[rid]
	);
	if (!Array.isArray(rows) || rows.length === 0) {
		return { plain: '', html: '' };
	}
	const lines: string[] = [];
	const htmlItems: string[] = [];
	for (const r of rows) {
		const name = String(r.document_name ?? '').trim() || '-';
		const rev = String(r.revision ?? '').trim() || '-';
		const line = `${name} — Rev. ${rev}`;
		lines.push(line);
		htmlItems.push(`<li>${escapeHtml(line)}</li>`);
	}
	return {
		plain: lines.join('\n'),
		html: `<ul>${htmlItems.join('')}</ul>`
	};
}

function documentsSection(docs: { plain: string; html: string }): { plain: string; html: string } {
	if (!docs.plain) return { plain: '', html: '' };
	return {
		plain: `\n\nDocuments / รายการเอกสาร:\n${docs.plain}`,
		html: `<p><strong>Documents / รายการเอกสาร</strong></p>${docs.html}`
	};
}

function configuredEmailsForStage(env: PrivateEnv, stage: DarNotifyStage): string[] {
	switch (stage) {
		case 'submit':
			return splitEmailList(env.DAR_NOTIFY_EMAILS);
		case 'after_review':
			return splitEmailList(env.DAR_AFTER_REVIEW_NOTIFY_EMAILS);
		case 'after_approve':
			return splitEmailList(env.DAR_AFTER_APPROVE_NOTIFY_EMAILS);
		case 'after_register':
			return splitEmailList(env.DAR_AFTER_REGISTER_NOTIFY_EMAILS);
		default:
			return [];
	}
}

async function fetchUsersByEmails(pool: Pool, emails: string[]): Promise<DarNotifyUser[]> {
	if (!emails.length) return [];
	const lowered = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
	const [rows] = await pool.query<DarNotifyUser[]>(
		`SELECT id, email, full_name, line_user_id
		 FROM users
		 WHERE LOWER(TRIM(email)) IN (?)`,
		[lowered]
	);
	return rows;
}

async function fetchUsersByIds(pool: Pool, ids: number[]): Promise<DarNotifyUser[]> {
	const clean = [...new Set(ids.map((n) => Number(n)).filter((n) => n > 0))];
	if (!clean.length) return [];
	const [rows] = await pool.query<DarNotifyUser[]>(
		`SELECT id, email, full_name, line_user_id FROM users WHERE id IN (?)`,
		[clean]
	);
	return rows;
}

async function fetchUsersWithDarApprovePermission(pool: Pool): Promise<DarNotifyUser[]> {
	const [rows] = await pool.execute<DarNotifyUser[]>(
		`SELECT DISTINCT u.id, u.email, u.full_name, u.line_user_id
		 FROM users u
		 JOIN (
			 SELECT id AS user_id, role_id FROM users WHERE role_id IS NOT NULL
			 UNION
			 SELECT user_id, role_id FROM user_roles
		 ) AS ur ON ur.user_id = u.id
		 JOIN role_has_permissions rhp ON rhp.role_id = ur.role_id
		 JOIN permissions p ON p.id = rhp.permission_id
		 WHERE p.name IN (
				'approve isodocs dar',
				'manage isodocs dar',
				'isodocs dar approval manager',
				'isodocs dar approval vp',
				'isodocs dar approval qmr'
			)`
	);
	return rows;
}

/**
 * ผู้ที่ควรได้รับแจ้งหลัง VP อนุมัติ — ตรงกับ Role ISODOCS_QMR / sql/roles_isodocs_approval_flow.sql
 * (เดิมค้นแค่ role ชื่อ QMR เลยไม่ match ผู้ใช้ที่เป็น ISODOCS_QMR หรือมีสิทธิ์ qmr ผ่าน user_roles)
 */
async function fetchUsersForAfterApproveQmr(pool: Pool): Promise<DarNotifyUser[]> {
	const [rows] = await pool.execute<DarNotifyUser[]>(
		`SELECT DISTINCT u.id, u.email, u.full_name, u.line_user_id
		 FROM users u
		 JOIN (
			 SELECT id AS user_id, role_id FROM users WHERE role_id IS NOT NULL
			 UNION
			 SELECT user_id, role_id FROM user_roles
		 ) AS ur ON ur.user_id = u.id
		 JOIN roles r ON r.id = ur.role_id
		 LEFT JOIN role_has_permissions rhp ON rhp.role_id = ur.role_id
		 LEFT JOIN permissions p ON p.id = rhp.permission_id
		 WHERE UPPER(TRIM(r.name)) IN ('ISODOCS_QMR', 'QMR')
		    OR p.name = ?`,
		[PERM_ISODOCS_DAR_QMR]
	);
	return rows;
}

async function resolveRecipients(
	pool: Pool,
	env: PrivateEnv,
	stage: DarNotifyStage,
	requesterUserId: number | null | undefined
): Promise<{ mailTo: string[]; lineUserIds: string[] }> {
	const configured = configuredEmailsForStage(env, stage);

	if (configured.length > 0) {
		const dbMatch = await fetchUsersByEmails(pool, configured);
		const lineUserIds = dbMatch
			.map((u) => (u.line_user_id != null ? String(u.line_user_id).trim() : ''))
			.filter(Boolean);
		return { mailTo: [...new Set(configured)], lineUserIds: [...new Set(lineUserIds)] };
	}

	if (stage === 'submit' || stage === 'after_review') {
		const users = await fetchUsersWithDarApprovePermission(pool);
		const mailTo = [...new Set(users.map((u) => String(u.email || '').trim()).filter(Boolean))];
		const lineUserIds = users
			.map((u) => (u.line_user_id != null ? String(u.line_user_id).trim() : ''))
			.filter(Boolean);
		return { mailTo, lineUserIds: [...new Set(lineUserIds)] };
	}

	if (stage === 'after_approve') {
		const users = await fetchUsersForAfterApproveQmr(pool);
		const mailTo = [...new Set(users.map((u) => String(u.email || '').trim()).filter(Boolean))];
		const lineUserIds = users
			.map((u) => (u.line_user_id != null ? String(u.line_user_id).trim() : ''))
			.filter(Boolean);
		return { mailTo, lineUserIds: [...new Set(lineUserIds)] };
	}

	if (stage === 'after_register') {
		const uid = requesterUserId != null && requesterUserId > 0 ? Number(requesterUserId) : 0;
		if (!uid) return { mailTo: [], lineUserIds: [] };
		const users = await fetchUsersByIds(pool, [uid]);
		const mailTo = [...new Set(users.map((u) => String(u.email || '').trim()).filter(Boolean))];
		const lineUserIds = users
			.map((u) => (u.line_user_id != null ? String(u.line_user_id).trim() : ''))
			.filter(Boolean);
		return { mailTo, lineUserIds: [...new Set(lineUserIds)] };
	}

	return { mailTo: [], lineUserIds: [] };
}

/** ขั้นที่ต้องกด Approve — plain text vs HTML (ลิงก์ในอีเมลแสดงเป็นข้อความนำ ไม่โชว์ URL ดิบ) */
function approvePromptForStage(stage: DarNotifyStage): { plain: string; html: string } {
	switch (stage) {
		case 'submit':
			return {
				plain: `Please open the DAR List link below (sign in if asked), find this request, then press Approve at ${DAR_ROLE_MGR} (Reviewed By).\nกรุณาเปิดลิงก์ DAR List ด้านล่าง ล็อกอิน ค้นหาใบนี้ แล้วกด Approve ที่ขั้น ${DAR_ROLE_MGR} (Reviewed By)`,
				html: `Please open the DAR List link below (sign in if asked), find this request, then press <strong>Approve</strong> at <strong>${DAR_ROLE_MGR}</strong> (Reviewed By).<br/>กรุณาเปิดลิงก์ DAR List ด้านล่าง ล็อกอิน ค้นหาใบนี้ แล้วกด <strong>Approve</strong> ที่ขั้น <strong>${DAR_ROLE_MGR}</strong> (Reviewed By)`
			};
		case 'after_review':
			return {
				plain: `Please open the link below, sign in, then press Approve at ${DAR_ROLE_VP} (Approved By).\nกรุณาเปิดลิงก์ด้านล่าง ล็อกอิน แล้วกด Approve ที่ขั้น ${DAR_ROLE_VP} (Approved By)`,
				html: `Please open the link below, sign in, then press <strong>Approve</strong> at <strong>${DAR_ROLE_VP}</strong> (Approved By).<br/>กรุณาเปิดลิงก์ด้านล่าง ล็อกอิน แล้วกด <strong>Approve</strong> ที่ขั้น <strong>${DAR_ROLE_VP}</strong> (Approved By)`
			};
		case 'after_approve':
			return {
				plain: `Please open the link below, sign in, then press Approve at ${DAR_ROLE_QMR} (Notify QMR / register).\nกรุณาเปิดลิงก์ด้านล่าง ล็อกอิน แล้วกด Approve ที่ขั้น ${DAR_ROLE_QMR} (Notify QMR / ลงทะเบียน)`,
				html: `Please open the link below, sign in, then press <strong>Approve</strong> at <strong>${DAR_ROLE_QMR}</strong> (Notify QMR / register).<br/>กรุณาเปิดลิงก์ด้านล่าง ล็อกอิน แล้วกด <strong>Approve</strong> ที่ขั้น <strong>${DAR_ROLE_QMR}</strong> (Notify QMR / ลงทะเบียน)`
			};
		case 'after_register':
			return {
				plain: `You may use the link below to view this DAR in the list (no further Approve step).\nเปิดลิงก์ด้านล่างเพื่อดูใบนี้ในระบบได้ (ไม่มีขั้น Approve เพิ่ม)`,
				html: `You may use the link below to view this DAR in the list (no further <strong>Approve</strong> step).<br/>เปิดลิงก์ด้านล่างเพื่อดูใบนี้ในระบบได้ (ไม่มีขั้น Approve เพิ่ม)`
			};
	}
}

function copyForStage(
	stage: DarNotifyStage,
	darNo: string,
	listUrl: string,
	docs: { plain: string; html: string }
): { subject: string; text: string; html: string } {
	const d = formatDarNoDisplay(darNo);
	const approve = approvePromptForStage(stage);
	const linkLabel =
		stage === 'after_register' ? 'Open DAR List:' : 'Open DAR List for approve:';
	const doc = documentsSection(docs);

	switch (stage) {
		case 'submit':
			return {
				subject: `New DAR request: ${d}`,
				text: `A new DAR request has been submitted (${d}).${doc.plain}\n\n${linkLabel}\n${listUrl}`,
				html: `<p>A new DAR request has been submitted (<strong>${d}</strong>).</p>${doc.html}<p><a href="${listUrl}">${linkLabel}</a></p>`
			};
		case 'after_review':
			return {
				subject: `[IsoDocs DAR] ${DAR_ROLE_MGR} done — awaiting ${DAR_ROLE_VP}: ${d}`,
				text: `DAR ${d} passed ${DAR_ROLE_MGR} (Reviewed By). ${DAR_ROLE_VP} (Approved By) is needed.${doc.plain}\n\n${approve.plain}\n\n${linkLabel}\n${listUrl}`,
				html: `<p>DAR <strong>${d}</strong> passed <strong>${DAR_ROLE_MGR}</strong> (Reviewed By). <strong>${DAR_ROLE_VP}</strong> (Approved By) is needed.</p>${doc.html}<p>${approve.html}</p><p><a href="${listUrl}">${linkLabel}</a></p>`
			};
		case 'after_approve':
			return {
				subject: `[IsoDocs DAR] ${DAR_ROLE_VP} done — awaiting ${DAR_ROLE_QMR}: ${d}`,
				text: `DAR ${d} passed ${DAR_ROLE_VP} (Approved By). ${DAR_ROLE_QMR} (register / final step) is needed.${doc.plain}\n\n${approve.plain}\n\n${linkLabel}\n${listUrl}`,
				html: `<p>DAR <strong>${d}</strong> passed <strong>${DAR_ROLE_VP}</strong> (Approved By). <strong>${DAR_ROLE_QMR}</strong> (register / final step) is needed.</p>${doc.html}<p>${approve.html}</p><p><a href="${listUrl}">${linkLabel}</a></p>`
			};
		case 'after_register':
			return {
				subject: `[IsoDocs DAR] ${DAR_ROLE_QMR} done — registered: ${d}`,
				text: `DAR ${d} was completed by ${DAR_ROLE_QMR} and registered (master list updated).${doc.plain}\n\n${approve.plain}\n\n${linkLabel}\n${listUrl}`,
				html: `<p>DAR <strong>${d}</strong> was completed by <strong>${DAR_ROLE_QMR}</strong> and registered (master list updated).</p>${doc.html}<p>${approve.html}</p><p><a href="${listUrl}">${linkLabel}</a></p>`
			};
	}
}

/**
 * Email + LINE for DAR workflow. LINE uses users.line_user_id when the recipient exists in DB.
 *
 * Env (optional CSV/semicolon emails):
 * - DAR_NOTIFY_EMAILS — submit → reviewers (fallback: users with "approve isodocs dar")
 * - DAR_AFTER_REVIEW_NOTIFY_EMAILS — review pass → approvers (fallback: same permission)
 * - DAR_AFTER_APPROVE_NOTIFY_EMAILS — approve → QMR/controller (fallback: primary role QMR)
 * - DAR_AFTER_REGISTER_NOTIFY_EMAILS — registered → extra recipients; if unset, notifies requester only
 *
 * Pass `requestOrigin` (e.g. action `url.origin`) so links match the browser host:port; if omitted, `APP_BASE_URL` is used.
 */
function resolveDarBaseUrl(env: PrivateEnv, requestOrigin?: string | null): string {
	const fromRequest = (requestOrigin || '').trim().replace(/\/$/, '');
	if (fromRequest) return fromRequest;
	return (env.APP_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
}

export async function notifyDarWorkflow(
	pool: Pool,
	env: PrivateEnv,
	stage: DarNotifyStage,
	darNo: string,
	options?: {
		requesterUserId?: number | null;
		requestOrigin?: string | null;
		/** DB id — links open DAR list with ?request= so post-login lands on that row */
		darRequestId?: number | null;
	}
): Promise<void> {
	const baseUrl = resolveDarBaseUrl(env, options?.requestOrigin);
	const rid = options?.darRequestId != null ? Number(options.darRequestId) : 0;
	const listPath =
		rid > 0
			? `/isodocs-control/dar-list?request=${encodeURIComponent(String(rid))}`
			: `/isodocs-control/dar-list`;
	const listUrl = `${baseUrl}${listPath}`;

	const { mailTo, lineUserIds } = await resolveRecipients(
		pool,
		env,
		stage,
		options?.requesterUserId
	);

	if (!mailTo.length && !lineUserIds.length) {
		if (stage === 'after_register') {
			console.info('[darNotifications] skip after_register: no requester email and no DAR_AFTER_REGISTER_NOTIFY_EMAILS');
		}
		return;
	}

	const docsSummary = await fetchDarDocumentsSummary(pool, rid);
	const { subject, text, html } = copyForStage(stage, darNo, listUrl, docsSummary);

	try {
		if (mailTo.length) {
			await sendMail({
				to: mailTo,
				subject,
				text,
				html
			});
		}
		if (lineUserIds.length) {
			const lineBody = stage === 'submit' ? text : `${subject}\n\n${text}`;
			await sendLineTextMulticast(lineUserIds, lineBody);
		}
	} catch (e) {
		console.error(`[darNotifications] ${stage} failed:`, e);
	}
}
