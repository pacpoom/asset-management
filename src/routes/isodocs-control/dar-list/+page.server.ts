import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { checkPermission } from '$lib/server/auth';
import { userHasAdminRole } from '$lib/userRole';
import { env } from '$env/dynamic/private';
import { hasDarListAccess, darStepFlagsWithPermissions } from '$lib/isodocsDarPermissions';
import { notifyDarWorkflow } from '$lib/server/darNotifications';
import { DAR_ROLE_MGR, DAR_ROLE_VP, DAR_ROLE_QMR } from '$lib/darWorkflowLabels';
import fs from 'fs/promises';
import path from 'path';

const DAR_UPLOAD_DIR = path.resolve('uploads', 'isodocs', 'dar');
const MASTER_UPLOAD_DIR = path.resolve('uploads', 'isodocs', 'document-master');
/** ให้ตรงกับหน้า Document Master List — อัปโหลดออโต้จาก DAR ใช้ชนิดเดียวกัน */
const MASTER_ATTACH_EXT = new Set(['.pdf', '.doc', '.docx']);

async function ensureMasterUploadDir() {
	await fs.mkdir(MASTER_UPLOAD_DIR, { recursive: true });
}

/** ให้ Document Code Generator (document_running_masters) สอดคล้องกับเลขที่ออกจาก DAR register */
async function upsertDocumentRunningMaster(
	connection: PoolConnection,
	docType: string,
	departmentCode: string,
	runningNo: number
) {
	await connection.execute(
		`INSERT INTO document_running_masters
		 (doc_type, department_code, last_running_no)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE
		 last_running_no = GREATEST(last_running_no, VALUES(last_running_no)),
		 updated_at = CURRENT_TIMESTAMP`,
		[docType, departmentCode, runningNo]
	);
}

/** คัดลอกไฟล์แนบแถวแรกของ DAR item ไปเก็บใน Document Master (และลบไฟล์เก่าบน master ถ้ามี) */
async function copyFirstDarAttachmentToDocumentMaster(
	connection: PoolConnection,
	darRequestItemId: number,
	masterId: number,
	previousMasterSystemName: string | null
): Promise<void> {
	const [atts] = await connection.execute<RowDataPacket[]>(
		`SELECT file_original_name, file_system_name
		 FROM dar_request_item_attachments
		 WHERE dar_request_item_id = ?
		 ORDER BY id ASC
		 LIMIT 1`,
		[darRequestItemId]
	);
	if (!atts.length) return;

	const orig = String(atts[0].file_original_name || '').trim();
	let sys = String(atts[0].file_system_name || '').trim();
	if (!sys) return;
	sys = path.basename(sys);
	const ext = path.extname((orig || sys).toLowerCase());
	if (!MASTER_ATTACH_EXT.has(ext)) {
		console.warn('[dar-list] skip auto master file: extension not allowed for master list', ext);
		return;
	}

	const src = path.join(DAR_UPLOAD_DIR, sys);
	try {
		await fs.access(src);
	} catch {
		console.warn('[dar-list] DAR attachment missing on disk, skip master copy:', src);
		return;
	}

	await ensureMasterUploadDir();
	const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
	const sanitizedOriginal =
		path.basename(orig || sys).replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
	const newSystemName = `${uniqueSuffix}-${sanitizedOriginal}`;
	const dest = path.join(MASTER_UPLOAD_DIR, newSystemName);
	await fs.copyFile(src, dest);

	await connection.execute(
		`UPDATE document_master_list
		 SET attached_file_original_name = ?, attached_file_system_name = ?
		 WHERE id = ?`,
		[orig || sanitizedOriginal, newSystemName, masterId]
	);

	if (previousMasterSystemName) {
		const prevSafe = path.basename(String(previousMasterSystemName));
		try {
			await fs.unlink(path.join(MASTER_UPLOAD_DIR, prevSafe));
		} catch {
			// ignore missing
		}
	}
}

function toDateOnly(input?: string | null): string {
	if (!input) return new Date().toISOString().slice(0, 10);
	if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
	const d = new Date(input);
	return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function extractDocCodeParts(docCode: string) {
	const match = docCode.trim().toUpperCase().match(/^([A-Z]+)-([A-Z]+)-(\d+)$/);
	if (!match) return null;
	return {
		docType: match[1],
		isoSectionCode: match[2],
		runningNo: Number(match[3]),
		runningWidth: match[3].length
	};
}

function parseRevisionNumber(input: string | null | undefined): number {
	const n = Number(String(input || '0').replace(/[^\d]/g, ''));
	return Number.isFinite(n) ? n : 0;
}

function parseDocumentTypeScope(scopeJson: unknown): string[] {
	if (!scopeJson) return [];
	if (Array.isArray(scopeJson)) {
		return scopeJson
			.map((v) => String(v || '').trim().toUpperCase())
			.filter(Boolean);
	}
	try {
		const parsed = JSON.parse(String(scopeJson));
		if (!Array.isArray(parsed)) return [];
		return parsed.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean);
	} catch {
		// When mysql2 already returns a scalar/string value (not JSON), still accept it.
		const raw = String(scopeJson).trim().toUpperCase();
		return raw ? [raw] : [];
	}
}

const DOC_TYPE_CODES = new Set(['QM', 'QP', 'WI', 'STD', 'EIS', 'FM', 'SD', 'ED']);

function inferDocTypeFromText(text: string): string | null {
	const upper = String(text || '').toUpperCase();
	const m = upper.match(/\b(QM|QP|WI|STD|EIS|FM|SD|ED)\b/);
	return m?.[1] || null;
}

async function inferDocTypeFallback(
	connection: PoolConnection,
	isoSectionCode: string
): Promise<string | null> {
	const [rowsRaw] = await connection.execute(
		`SELECT doc_type
		 FROM document_master_list
		 WHERE UPPER(doc_code) LIKE UPPER(?)
		 ORDER BY updated_at DESC, id DESC
		 LIMIT 1`,
		[`%-${isoSectionCode}-%`]
	);
	const rows = rowsRaw as RowDataPacket[];
	const type = String(rows[0]?.doc_type || '').trim().toUpperCase();
	return DOC_TYPE_CODES.has(type) ? type : null;
}

async function resolveDepartmentIdByIsoSectionCode(
	connection: PoolConnection,
	isoSectionCode: string
): Promise<number | null> {
	const normalizedCode = isoSectionCode.trim().toUpperCase();
	const [isoRowsRaw] = await connection.execute(
		`SELECT id, code, name_th, name_en
		 FROM iso_sections
		 WHERE UPPER(code) = ?
		 LIMIT 1`,
		[normalizedCode]
	);
	const isoRows = isoRowsRaw as RowDataPacket[];
	if (!isoRows.length) return null;
	const section = isoRows[0];

	const [departmentRowsRaw] = await connection.execute(
		`SELECT id, name
		 FROM departments
		 WHERE UPPER(name) LIKE ?
		    OR UPPER(name) = UPPER(?)
		    OR UPPER(name) = UPPER(?)
		 ORDER BY id ASC
		 LIMIT 1`,
		[`%(${normalizedCode})%`, String(section.name_th || ''), String(section.name_en || '')]
	);
	const departmentRows = departmentRowsRaw as RowDataPacket[];
	if (departmentRows.length > 0) return Number(departmentRows[0].id);

	const generatedName = section.name_en
		? `${section.name_en} (${section.code})`
		: section.name_th
			? `${section.name_th} (${section.code})`
			: section.code;
	const [insertResult] = await connection.execute(
		`INSERT INTO departments (name) VALUES (?)`,
		[generatedName]
	);
	return Number((insertResult as any).insertId || 0);
}

interface DarRequestRow extends RowDataPacket {
	id: number;
	dar_no: string;
	request_type: 'new_document' | 'revise_document' | 'cancel_document' | 'request_copy';
	document_type_scope: string | null;
	requester_user_id: number | null;
	requester_name: string | null;
	request_date: string;
	status: 'submitted' | 'reviewed' | 'approved' | 'rejected' | 'registered';
	remark: string | null;
	reviewer_comment: string | null;
	reviewer_name: string | null;
	reviewer_date: string | null;
	approver_comment: string | null;
	approver_name: string | null;
	approver_date: string | null;
	register_name: string | null;
	register_date: string | null;
}

type DarStepPermissions = {
	canReview: boolean;
	canApprove: boolean;
	canRegister: boolean;
};

type DarFlowActors = {
	reviewerUserIds: number[];
	approverUserIds: number[];
	controllerUserIds: number[];
};

function parseUserIdsJson(input: unknown): number[] {
	if (input == null) return [];
	if (Array.isArray(input)) {
		return input.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
	}
	const raw = String(input).trim();
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
	} catch {
		return [];
	}
}

function scopeTypesCacheKey(scopeTypes: string[]): string {
	return [...scopeTypes].map((s) => s.trim().toUpperCase()).filter(Boolean).sort().join(',') || '_';
}

/**
 * เลือก Flow ที่ใช้กับ DAR จาก Flow ที่ active ทั้งระบบ — ไม่กรองตามแผนกผู้ขอหรือแผนกที่บันทึกบน flow
 * ถ้ามีหลาย flow จะเลือกตาม document type scope ของใบ แล้วจึง flow แบบ generic (iso_document_type_id NULL) แล้วค่อยใบล่าสุด
 */
async function resolveDarFlowActors(
	connection: PoolConnection,
	scopeTypes: string[]
): Promise<DarFlowActors | null> {
	const [flowRowsRaw] = await connection.execute<RowDataPacket[]>(
		`SELECT f.id, f.iso_document_type_id, f.qmr_user_ids_json
		 FROM iso_approval_flows f
		 WHERE f.is_active = 1
		 ORDER BY f.id DESC`,
		[]
	);
	if (!flowRowsRaw.length) return null;

	const flowRows = flowRowsRaw;
	let chosen: RowDataPacket;

	if (flowRows.length === 1) {
		chosen = flowRows[0];
	} else {
		let matched: RowDataPacket | undefined;
		for (const code of scopeTypes) {
			const c = String(code || '').trim();
			if (!c) continue;
			const [typeRows] = await connection.execute<RowDataPacket[]>(
				`SELECT id FROM iso_document_types WHERE UPPER(TRIM(code)) = UPPER(TRIM(?)) AND is_active = 1 LIMIT 1`,
				[c]
			);
			const tid = Number(typeRows[0]?.id || 0);
			if (!tid) continue;
			const matchFlow = flowRows.find((f: RowDataPacket) => Number(f.iso_document_type_id) === tid);
			if (matchFlow) {
				matched = matchFlow;
				break;
			}
		}
		chosen =
			matched ||
			flowRows.find((f: RowDataPacket) => f.iso_document_type_id == null) ||
			flowRows[0];
	}

	const flowId = Number(chosen.id);
	const controllerUserIds = parseUserIdsJson(chosen.qmr_user_ids_json);

	const [stepRows] = await connection.execute<RowDataPacket[]>(
		`SELECT step_key, approver_user_id, approver_user_ids_json
		 FROM iso_approval_flow_steps
		 WHERE iso_approval_flow_id = ? AND is_active = 1`,
		[flowId]
	);

	let reviewerUserIds: number[] = [];
	let approverUserIds: number[] = [];

	for (const s of stepRows) {
		const key = String(s.step_key || '');
		const ids = parseUserIdsJson(s.approver_user_ids_json);
		if (s.approver_user_id) ids.push(Number(s.approver_user_id));
		const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
		if (key === 'reviewed_by') reviewerUserIds = unique;
		else if (key === 'approved_by') approverUserIds = unique;
	}

	return { reviewerUserIds, approverUserIds, controllerUserIds };
}

interface DarItemRow extends RowDataPacket {
	id: number;
	dar_request_id: number;
	line_no: number;
	document_code: string;
	document_name: string;
	revision: string;
	effective_date: string | null;
	request_reason: string | null;
	copies_requested: number | null;
}

interface DarAttachmentRow extends RowDataPacket {
	id: number;
	dar_request_item_id: number;
	file_original_name: string;
	file_system_name: string;
}

function checkDarWorkflowPermission(locals: App.Locals) {
	if (!locals.user) {
		console.warn('[dar-list] reject: no locals.user (unauthorized)');
		return fail(401, { success: false, message: 'Unauthorized.' });
	}
	if (hasDarListAccess(locals.user)) {
		return null;
	}
	const perms = new Set(locals.user.permissions || []);
	console.warn('[dar-list] reject: permission denied', {
		userId: locals.user.id,
		fullName: locals.user.full_name,
		role: locals.user.role,
		permissions: [...perms].sort()
	});
	return fail(403, { success: false, message: 'Forbidden: You do not have DAR workflow permission.' });
}

async function computeDarStepPermissions(
	locals: App.Locals,
	actors: DarFlowActors | null,
	requesterUserId?: number | null
): Promise<DarStepPermissions> {
	const u = locals.user!;
	const uid = u.id;

	/** Only admin may skip ISO flow (e.g. break-glass). `manage isodocs dar` still follows flow lists. */
	if (userHasAdminRole(u)) {
		return { canReview: true, canApprove: true, canRegister: true };
	}

	const rid = requesterUserId != null ? Number(requesterUserId) : 0;
	if (rid > 0 && uid === rid) {
		return { canReview: false, canApprove: false, canRegister: false };
	}

	if (!actors) {
		return { canReview: false, canApprove: false, canRegister: false };
	}

	return darStepFlagsWithPermissions(actors, uid, u.permissions || []);
}

async function assertDarStepAllowed(
	locals: App.Locals,
	darRequestId: number,
	step: 'review' | 'approve' | 'register'
) {
	const denied = checkDarWorkflowPermission(locals);
	if (denied) return denied;

	const connection = await pool.getConnection();
	try {
		const [rows] = await connection.execute<RowDataPacket[]>(
			`SELECT requester_user_id, document_type_scope FROM dar_requests WHERE id = ? LIMIT 1`,
			[darRequestId]
		);
		if (!rows.length) {
			return fail(404, { success: false, message: 'DAR not found.' });
		}
		const requesterUserId =
			rows[0].requester_user_id != null ? Number(rows[0].requester_user_id) : null;
		const scopeTypes = parseDocumentTypeScope(rows[0].document_type_scope);
		const actors = await resolveDarFlowActors(connection, scopeTypes);
		const flags = await computeDarStepPermissions(locals, actors, requesterUserId);
		const ok =
			step === 'review'
				? flags.canReview
				: step === 'approve'
					? flags.canApprove
					: flags.canRegister;
		if (!ok) {
			return fail(403, {
				success: false,
				message:
					step === 'review'
						? `Forbidden: ${DAR_ROLE_MGR}: be listed under Reviewed By in the flow, or have isodocs dar approval manager, or approve/manage isodocs dar while listed in the flow.`
						: step === 'approve'
							? `Forbidden: ${DAR_ROLE_VP}: be listed under Approved By, or have isodocs dar approval vp, or approve/manage isodocs dar while listed.`
							: `Forbidden: ${DAR_ROLE_QMR}: be listed under Notify QMR, or have isodocs dar approval qmr, or approve/manage isodocs dar while listed.`
			});
		}
		return null;
	} finally {
		connection.release();
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized.');
	const perms = new Set(locals.user.permissions || []);
	console.info('[dar-list] load auth context', {
		userId: locals.user.id,
		fullName: locals.user.full_name,
		role: locals.user.role,
		permissions: [...perms].sort()
	});
	if (!hasDarListAccess(locals.user)) {
		console.warn('[dar-list] load reject: missing DAR workflow permission');
		throw error(403, 'Forbidden: You do not have DAR workflow permission.');
	}

	const statusFilter = (url.searchParams.get('status') || '').trim();
	const search = (url.searchParams.get('search') || '').trim();

	let whereSql = 'WHERE 1=1';
	const params: Array<string> = [];

	if (statusFilter) {
		whereSql += ' AND dr.status = ?';
		params.push(statusFilter);
	}

	if (search) {
		whereSql += ' AND (dr.dar_no LIKE ? OR dr.requester_name LIKE ?)';
		params.push(`%${search}%`, `%${search}%`);
	}

	const [requests] = await pool.execute<DarRequestRow[]>(
		`SELECT
			dr.id,
			dr.dar_no,
			dr.request_type,
			dr.document_type_scope,
			dr.requester_user_id,
			dr.requester_name,
			dr.request_date,
			dr.status,
			dr.remark,
			dr.reviewer_comment,
			dr.reviewer_name,
			dr.reviewer_date,
			dr.approver_comment,
			dr.approver_name,
			dr.approver_date,
			dr.register_name,
			dr.register_date
		 FROM dar_requests dr
		 ${whereSql}
		 ORDER BY dr.id DESC`,
		params
	);

	const requestIds = requests.map((row) => row.id);
	let items: DarItemRow[] = [];
	let attachments: DarAttachmentRow[] = [];

	if (requestIds.length > 0) {
		const [itemRows] = await pool.query<DarItemRow[]>(
			`SELECT
				id,
				dar_request_id,
				line_no,
				document_code,
				document_name,
				revision,
				effective_date,
				request_reason,
				copies_requested
			 FROM dar_request_items
			 WHERE dar_request_id IN (?)
			 ORDER BY dar_request_id DESC, line_no ASC`,
			[requestIds]
		);
		items = itemRows;

		const itemIds = items.map((item) => item.id);
		if (itemIds.length > 0) {
			const [attachmentRows] = await pool.query<DarAttachmentRow[]>(
				`SELECT id, dar_request_item_id, file_original_name, file_system_name
				 FROM dar_request_item_attachments
				 WHERE dar_request_item_id IN (?)
				 ORDER BY id ASC`,
				[itemIds]
			);
			attachments = attachmentRows;
		}
	}

	const flowCache = new Map<string, DarFlowActors | null>();
	const connection = await pool.getConnection();
	let requestsWithPerms: Array<DarRequestRow & { darPermissions: DarStepPermissions }>;
	try {
		requestsWithPerms = [];
		for (const r of requests) {
			const scopeTypes = parseDocumentTypeScope(r.document_type_scope);
			const cacheKey = scopeTypesCacheKey(scopeTypes);
			let actors = flowCache.get(cacheKey);
			if (actors === undefined) {
				actors = await resolveDarFlowActors(connection, scopeTypes);
				flowCache.set(cacheKey, actors);
			}
			const darPermissions = await computeDarStepPermissions(
				locals,
				actors,
				r.requester_user_id != null ? Number(r.requester_user_id) : null
			);
			requestsWithPerms.push({ ...r, darPermissions });
		}
	} finally {
		connection.release();
	}

	return {
		requests: requestsWithPerms,
		items,
		attachments,
		filters: {
			status: statusFilter,
			search
		}
	};
};

export const actions: Actions = {
	deleteDar: async ({ request, locals }) => {
		checkPermission(locals, 'manage isodocs dar');
		const formData = await request.formData();
		const id = Number(formData.get('id') || 0);
		if (!id) return fail(400, { success: false, message: 'Invalid DAR id.' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [rows] = await connection.execute<RowDataPacket[]>(
				`SELECT dr.id, dr.dar_no
				 FROM dar_requests dr
				 WHERE dr.id = ?
				 LIMIT 1`,
				[id]
			);
			if (!rows.length) {
				await connection.rollback();
				return fail(404, { success: false, message: 'DAR not found.' });
			}

			const [fileRows] = await connection.execute<RowDataPacket[]>(
				`SELECT a.file_system_name
				 FROM dar_request_item_attachments a
				 JOIN dar_request_items i ON i.id = a.dar_request_item_id
				 WHERE i.dar_request_id = ?`,
				[id]
			);
			const fileNames = fileRows.map((r) => String(r.file_system_name || '')).filter(Boolean);

			// Delete DB rows (attachments -> items -> request)
			await connection.execute(
				`DELETE a
				 FROM dar_request_item_attachments a
				 JOIN dar_request_items i ON i.id = a.dar_request_item_id
				 WHERE i.dar_request_id = ?`,
				[id]
			);
			await connection.execute(`DELETE FROM dar_request_items WHERE dar_request_id = ?`, [id]);
			await connection.execute(`DELETE FROM dar_requests WHERE id = ?`, [id]);

			await connection.commit();

			// Best-effort file cleanup (after commit)
			for (const name of fileNames) {
				const fullPath = path.join(DAR_UPLOAD_DIR, name);
				try {
					await fs.unlink(fullPath);
				} catch (e: any) {
					if (e?.code !== 'ENOENT') console.error('[dar-list] delete attachment failed:', fullPath, e);
				}
			}

			return { success: true, message: 'DAR deleted successfully.' };
		} catch (e: any) {
			await connection.rollback();
			console.error('[dar-list] deleteDar error:', e);
			return fail(500, { success: false, message: e?.message || 'Failed to delete DAR.' });
		} finally {
			connection.release();
		}
	},

	reviewDar: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id') || 0);
		const stepDenied = await assertDarStepAllowed(locals, id, 'review');
		if (stepDenied) return stepDenied;
		const comment = (formData.get('reviewer_comment')?.toString() || '').trim();
		const decision = formData.get('reviewer_decision')?.toString() || '';

		if (!id || !['approve', 'reject'].includes(decision)) {
			return fail(400, { success: false, message: 'Invalid review payload.' });
		}

		const [statusRows] = await pool.execute<RowDataPacket[]>(
			`SELECT status FROM dar_requests WHERE id = ? LIMIT 1`,
			[id]
		);
		if (!statusRows.length) {
			return fail(404, { success: false, message: 'DAR not found.' });
		}
		if (String(statusRows[0]?.status || '').toLowerCase() !== 'submitted') {
			return fail(400, {
				success: false,
				message: 'Manager (Reviewed By) is only available while the DAR status is submitted.'
			});
		}

		const approve = decision === 'approve' ? 1 : 0;
		const nextStatus = approve ? 'reviewed' : 'rejected';

		await pool.execute(
			`UPDATE dar_requests
			 SET reviewer_comment = ?,
				reviewer_approve = ?,
				reviewer_name = ?,
				reviewer_date = NOW(),
				status = ?
			 WHERE id = ?`,
			[comment || null, approve, locals.user?.full_name || null, nextStatus, id]
		);

		if (approve) {
			try {
				const [darRows] = await pool.execute<RowDataPacket[]>(
					`SELECT dar_no FROM dar_requests WHERE id = ? LIMIT 1`,
					[id]
				);
				const darNo = String(darRows[0]?.dar_no || id);
				await notifyDarWorkflow(pool, env, 'after_review', darNo, {
					requestOrigin: url.origin,
					darRequestId: id
				});
			} catch (e) {
				console.error('[dar-list] reviewDar notify failed:', e);
			}
		}

		return { success: true, message: `${DAR_ROLE_MGR} (Reviewed By) saved.` };
	},

	approveDar: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id') || 0);
		const stepDenied = await assertDarStepAllowed(locals, id, 'approve');
		if (stepDenied) return stepDenied;
		const comment = (formData.get('approver_comment')?.toString() || '').trim();
		const decision = formData.get('approver_decision')?.toString() || '';

		if (!id || !['approve', 'reject'].includes(decision)) {
			return fail(400, { success: false, message: 'Invalid approve payload.' });
		}

		const [statusRows] = await pool.execute<RowDataPacket[]>(
			`SELECT status FROM dar_requests WHERE id = ? LIMIT 1`,
			[id]
		);
		if (!statusRows.length) {
			return fail(404, { success: false, message: 'DAR not found.' });
		}
		if (String(statusRows[0]?.status || '').toLowerCase() !== 'reviewed') {
			return fail(400, {
				success: false,
				message: 'VP (Approved By) is only available after manager approval (status: reviewed).'
			});
		}

		const approve = decision === 'approve' ? 1 : 0;
		const nextStatus = approve ? 'approved' : 'rejected';

		await pool.execute(
			`UPDATE dar_requests
			 SET approver_comment = ?,
				approver_approve = ?,
				approver_name = ?,
				approver_date = NOW(),
				status = ?
			 WHERE id = ?`,
			[comment || null, approve, locals.user?.full_name || null, nextStatus, id]
		);

		if (approve) {
			try {
				const [darRows] = await pool.execute<RowDataPacket[]>(
					`SELECT dar_no FROM dar_requests WHERE id = ? LIMIT 1`,
					[id]
				);
				const darNo = String(darRows[0]?.dar_no || id);
				await notifyDarWorkflow(pool, env, 'after_approve', darNo, {
					requestOrigin: url.origin,
					darRequestId: id
				});
			} catch (e) {
				console.error('[dar-list] approveDar notify failed:', e);
			}
		}

		return { success: true, message: `${DAR_ROLE_VP} (Approved By) saved.` };
	},

	registerDar: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id') || 0);
		const stepDenied = await assertDarStepAllowed(locals, id, 'register');
		if (stepDenied) return stepDenied;
		console.info('[dar-list] registerDar auth context', {
			userId: locals.user?.id,
			fullName: locals.user?.full_name,
			role: locals.user?.role,
			permissions: [...new Set(locals.user?.permissions || [])].sort()
		});
		const comment = (formData.get('document_controller_comment')?.toString() || '').trim();
		const qmrDecision = (formData.get('qmr_decision')?.toString() || 'approve').trim();

		if (!id) {
			return fail(400, { success: false, message: 'Invalid register payload.' });
		}
		if (!['approve', 'reject'].includes(qmrDecision)) {
			return fail(400, { success: false, message: 'Invalid QMR decision.' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [requestRows] = await connection.execute<RowDataPacket[]>(
				`SELECT id, dar_no, request_type, status, document_type_scope, requester_user_id
				 FROM dar_requests
				 WHERE id = ?
				 LIMIT 1`,
				[id]
			);
			if (!requestRows.length) {
				await connection.rollback();
				return fail(404, { success: false, message: 'DAR not found.' });
			}
			const requestRow = requestRows[0];
			const requestType = String(requestRow.request_type || '');
			const currentStatus = String(requestRow.status || '').toLowerCase();
			if (currentStatus !== 'approved') {
				console.warn('[dar-list] registerDar reject: status is not approved', {
					darId: id,
					currentStatus
				});
				await connection.rollback();
				return fail(400, {
					success: false,
					message: 'DAR can be registered only after approver status is approved.'
				});
			}

			if (qmrDecision === 'reject') {
				await connection.execute(
					`UPDATE dar_requests
					 SET document_controller_comment = ?,
						register_name = ?,
						register_date = NOW(),
						status = 'rejected'
					 WHERE id = ?`,
					[comment || null, locals.user?.full_name || null, id]
				);
				await connection.commit();
				return { success: true, message: `${DAR_ROLE_QMR}: rejected.` };
			}

			const scopeTypes = parseDocumentTypeScope(String(requestRow.document_type_scope || ''));

			let requesterIsoSection = '';
			if (requestType === 'new_document' && requestRow.requester_user_id) {
				const [requesterRows] = await connection.execute<RowDataPacket[]>(
					`SELECT u.iso_section, d.name AS department_name
					 FROM users u
					 LEFT JOIN departments d ON d.id = u.department_id
					 WHERE u.id = ?
					 LIMIT 1`,
					[Number(requestRow.requester_user_id)]
				);
				const requester = requesterRows[0];
				const isoFromUser = String(requester?.iso_section || '').trim().toUpperCase();
				const deptName = String(requester?.department_name || '');
				const deptCodeMatch = deptName.match(/\(([^)]+)\)/);
				const isoFromDept = (deptCodeMatch?.[1] || '').trim().toUpperCase();
				requesterIsoSection = isoFromUser || isoFromDept;
			}

			const [itemRows] = await connection.execute<RowDataPacket[]>(
				`SELECT
					id,
					document_master_id,
					document_code,
					document_name,
					revision,
					effective_date
				 FROM dar_request_items
				 WHERE dar_request_id = ?
				 ORDER BY line_no ASC`,
				[id]
			);

			for (const item of itemRows) {
				const requestedCode = String(item.document_code || '').trim().toUpperCase();
				const requestedName = String(item.document_name || '').trim();

				if (!requestedName) continue;
				if (requestType !== 'new_document' && !requestedCode) continue;

				if (requestType === 'revise_document') {
					const [docRows] = await connection.execute<RowDataPacket[]>(
						`SELECT id, current_revision, attached_file_system_name
						 FROM document_master_list
						 WHERE id = ? OR UPPER(doc_code) = UPPER(?)
						 ORDER BY id DESC
						 LIMIT 1`,
						[Number(item.document_master_id || 0), requestedCode]
					);
					if (!docRows.length) {
						await connection.rollback();
						return fail(400, {
							success: false,
							message: `Document not found for revise: ${requestedCode}`
						});
					}
					const doc = docRows[0];
					const masterId = Number(doc.id);
					const prevMasterFile =
						doc.attached_file_system_name != null
							? String(doc.attached_file_system_name)
							: null;
					const currentRev = parseRevisionNumber(String(doc.current_revision || '0'));
					const nextRev = String(currentRev + 1).padStart(2, '0');
					const effectiveDate = toDateOnly(String(item.effective_date || ''));

					await connection.execute(
						`UPDATE document_master_list
						 SET doc_name = ?,
							 current_revision = ?,
							 effective_date = ?,
							 status = 'active'
						 WHERE id = ?`,
						[requestedName, nextRev, effectiveDate, masterId]
					);

					await copyFirstDarAttachmentToDocumentMaster(
						connection,
						Number(item.id),
						masterId,
						prevMasterFile
					);
				}

				if (requestType === 'new_document') {
					const partsFromCode = extractDocCodeParts(requestedCode);
					const isoSectionCode = (requesterIsoSection || partsFromCode?.isoSectionCode || '').trim().toUpperCase();
					const scopeType = String(scopeTypes[0] || '').trim().toUpperCase();
					const codeType = String(partsFromCode?.docType || '').trim().toUpperCase();
					const nameType = String(inferDocTypeFromText(requestedName) || '').trim().toUpperCase();
					const fallbackType = isoSectionCode
						? String((await inferDocTypeFallback(connection, isoSectionCode)) || '').trim().toUpperCase()
						: '';
					const docType = [scopeType, codeType, nameType, fallbackType].find((v) => DOC_TYPE_CODES.has(v)) || '';
					if (!docType || !isoSectionCode) {
						console.warn('[dar-list] registerDar reject: missing docType or isoSection', {
							darId: id,
							requestType,
							scopeTypes,
							scopeType,
							codeType,
							nameType,
							fallbackType,
							requesterIsoSection,
							requestedCode
						});
						await connection.rollback();
						return fail(400, {
							success: false,
							message:
								'Cannot generate document code for new document. Please select document type and set requester Iso_Section/department code.'
						});
					}

					const prefix = `${docType}-${isoSectionCode}`;
					const [samePrefixRows] = await connection.execute<RowDataPacket[]>(
						`SELECT doc_code
						 FROM document_master_list
						 WHERE UPPER(doc_code) LIKE UPPER(?)`,
						[`${prefix}-%`]
					);
					let maxRunning = 0;
					let maxWidth = Math.max(partsFromCode?.runningWidth || 2, 2);
					for (const row of samePrefixRows) {
						const found = extractDocCodeParts(String(row.doc_code || ''));
						if (!found) continue;
						maxRunning = Math.max(maxRunning, found.runningNo);
						maxWidth = Math.max(maxWidth, found.runningWidth);
					}
					const nextRunning = maxRunning + 1;
					const nextCode = `${prefix}-${String(nextRunning).padStart(maxWidth, '0')}`;
					const departmentId = await resolveDepartmentIdByIsoSectionCode(
						connection,
						isoSectionCode
					);
					if (!departmentId) {
						console.warn('[dar-list] registerDar reject: iso section not found', {
							darId: id,
							isoSectionCode
						});
						await connection.rollback();
						return fail(400, {
							success: false,
							message: `Iso_Section not found for code: ${isoSectionCode}`
						});
					}
					const effectiveDate = toDateOnly(String(item.effective_date || ''));

					const [insertMaster] = await connection.execute<ResultSetHeader>(
						`INSERT INTO document_master_list
						 (doc_code, doc_name, doc_type, department_id, current_revision, effective_date, status, description)
						 VALUES (?, ?, ?, ?, ?, ?, 'active', NULL)`,
						[nextCode, requestedName, docType, departmentId, '00', effectiveDate]
					);
					const newMasterId = Number(insertMaster.insertId);
					if (newMasterId > 0) {
						await connection.execute(
							`UPDATE dar_request_items
							 SET document_code = ?, document_master_id = ?
							 WHERE id = ?`,
							[nextCode, newMasterId, Number(item.id)]
						);
						await upsertDocumentRunningMaster(
							connection,
							docType,
							isoSectionCode,
							nextRunning
						);
						await copyFirstDarAttachmentToDocumentMaster(
							connection,
							Number(item.id),
							newMasterId,
							null
						);
					}
				}
			}

			await connection.execute(
				`UPDATE dar_requests
				 SET document_controller_comment = ?,
					register_name = ?,
					register_date = NOW(),
					status = 'registered'
				 WHERE id = ?`,
				[comment || null, locals.user?.full_name || null, id]
			);

			await connection.commit();

			const darNo = String(requestRow.dar_no || id);
			const requesterUid =
				requestRow.requester_user_id != null ? Number(requestRow.requester_user_id) : null;
			try {
				await notifyDarWorkflow(pool, env, 'after_register', darNo, {
					requesterUserId: requesterUid,
					requestOrigin: url.origin,
					darRequestId: id
				});
			} catch (notifyErr) {
				console.error('[dar-list] registerDar notify failed:', notifyErr);
			}
		} catch (e: any) {
			await connection.rollback();
			console.error('[dar-list] registerDar error:', e);
			return fail(500, { success: false, message: e?.message || 'Failed to register DAR.' });
		} finally {
			connection.release();
		}

		return { success: true, message: `${DAR_ROLE_QMR} completed. DAR registered.` };
	}
};
