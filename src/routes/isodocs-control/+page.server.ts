import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import { userHasAdminRole } from '$lib/userRole';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';
import { sendMail } from '$lib/server/mailer';
import { sendLineTextMulticast } from '$lib/server/lineMessaging';

type IsoDocumentStatus =
	| 'draft'
	| 'pending'
	| 'approved'
	| 'rejected'
	| 'original_controlled'
	| 'distribution_controlled'
	| 'distribution_uncontrolled'
	| 'cancelled';

type IsoDocumentResetMode = 'yearly' | 'never';

interface IsoDocument extends RowDataPacket {
	id: number;
	doc_no: string;
	title: string;
	description: string | null;
	file_path: string | null;
	version: string;
	status: IsoDocumentStatus;
	created_by: number;
	created_at: string;
	approved_by: number | null;
	approved_at: string | null;
	updated_at: string;
	creator_name?: string | null;
	approver_name?: string | null;
	iso_document_type_id?: number | null;
	department_id?: number | null;
	iso_approval_flow_id?: number | null;
	current_approval_step_no?: number | null;
	canApprove?: boolean;
	canReject?: boolean;
}

interface IsoDocumentAuditLog extends RowDataPacket {
	id: number | string;
	iso_document_id?: number | null;
	user_id?: number | null;
	action: string;
	remark: string | null;
	created_at: string;
	doc_no?: string;
	doc_title?: string;
	department_name?: string | null;
	document_type?: string | null;
	document_name?: string | null;
	user_name?: string | null;
}

interface MasterListDocument extends RowDataPacket {
	id: number;
	doc_no: string;
	title: string;
	version: string;
	status: string;
	description: string | null;
	updated_at: string;
	effective_date: string | null;
}
interface DarStatusSummary extends RowDataPacket {
	submitted_count: number;
	reviewed_count: number;
	approved_count: number;
	registered_count: number;
	rejected_count: number;
}

interface IsoDocumentTypeNumbering extends RowDataPacket {
	id: number;
	prefix: string;
	number_format: string;
	running_digits: number;
	reset_mode: IsoDocumentResetMode;
}

const UPLOAD_DIR = path.resolve('uploads', 'isodocs');
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx']);

async function ensureUploadDir() {
	await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function sanitizeFileName(fileName: string) {
	return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function formatIsoDocumentNumber(
	numberFormat: string,
	prefix: string,
	year: number,
	running: number,
	runningDigits: number
) {
	const runningPadded = String(running).padStart(runningDigits, '0');
	return numberFormat
		.replace('{PREFIX}', prefix)
		.replace('{YEAR}', String(year))
		.replace('{RUNNING}', runningPadded);
}

async function generateIsoDocumentNoFromType(
	connection: PoolConnection,
	type: IsoDocumentTypeNumbering,
	currentYear: number
) {
	// reset_mode = never => keep single running series (period_year = 0)
	const periodYear = type.reset_mode === 'yearly' ? currentYear : 0;

	// Ensure row exists and lock it inside the transaction
	await connection.execute(
		`INSERT INTO iso_document_running_numbers
		 (iso_document_type_id, period_year, current_no)
		 VALUES (?, ?, 0)
		 ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
		[type.id, periodYear]
	);

	const [rows] = await connection.execute<RowDataPacket[]>(
		`SELECT current_no
		 FROM iso_document_running_numbers
		 WHERE iso_document_type_id = ? AND period_year = ?
		 FOR UPDATE`,
		[type.id, periodYear]
	);

	const currentNo = Number(rows[0]?.current_no ?? 0);
	const nextNo = currentNo + 1;

	await connection.execute(
		`UPDATE iso_document_running_numbers
		 SET current_no = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE iso_document_type_id = ? AND period_year = ?`,
		[nextNo, type.id, periodYear]
	);

	return formatIsoDocumentNumber(
		type.number_format,
		type.prefix,
		periodYear,
		nextNo,
		type.running_digits
	);
}

async function saveDocumentFile(file: File): Promise<string> {
	await ensureUploadDir();

	const ext = path.extname(file.name || '').toLowerCase();
	if (!ALLOWED_EXTENSIONS.has(ext)) {
		throw new Error('Only PDF, DOC, DOCX, XLS, XLSX files are allowed.');
	}

	const safeName = sanitizeFileName(file.name);
	const systemName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`;
	const fullPath = path.join(UPLOAD_DIR, systemName);

	await fs.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));
	return `/uploads/isodocs/${systemName}`;
}

async function removeDocumentFile(filePath: string | null | undefined) {
	if (!filePath || !filePath.startsWith('/uploads/isodocs/')) return;

	const fileName = path.basename(filePath);
	const fullPath = path.join(UPLOAD_DIR, fileName);

	try {
		await fs.unlink(fullPath);
	} catch (e: any) {
		if (e.code !== 'ENOENT') {
			console.error('[isodocs-control] Failed to delete file:', fullPath, e);
		}
	}
}

async function writeAuditLog(
	connection: PoolConnection,
	isoDocumentId: number,
	userId: number,
	action: string,
	remark: string | null
) {
	await connection.execute(
		`INSERT INTO iso_document_audit_logs (iso_document_id, user_id, action, remark)
		 VALUES (?, ?, ?, ?)`,
		[isoDocumentId, userId, action, remark]
	);
}

type FlowStepRecipientRow = RowDataPacket & {
	id: number;
	step_no: number;
	step_name: string | null;
	step_key: string | null;
	approver_user_id: number | null;
	approver_user_ids_json: string | null;
};

/** mysql2 parses JSON columns to JS values; arrays must not go through JSON.parse. */
function parseUserIdsJson(input: unknown): number[] {
	if (input == null) return [];
	if (Array.isArray(input)) {
		return input
			.map((v) => Number(v))
			.filter((v) => Number.isInteger(v) && v > 0);
	}
	if (Buffer.isBuffer(input)) {
		return parseUserIdsJson(input.toString('utf8'));
	}
	const raw = String(input).trim();
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((v) => Number(v))
			.filter((v) => Number.isInteger(v) && v > 0);
	} catch {
		return [];
	}
}

type ApprovalNotifyUser = {
	id: number;
	email: string;
	full_name: string | null;
	line_user_id: string | null;
};

async function getFlowStepRecipientUsers(
	connection: PoolConnection,
	flowId: number,
	stepNo: number
): Promise<ApprovalNotifyUser[]> {
	const [stepRows] = await connection.execute<FlowStepRecipientRow[]>(
		`SELECT id, step_no, step_name, step_key, approver_user_id, approver_user_ids_json
		 FROM iso_approval_flow_steps
		 WHERE iso_approval_flow_id = ? AND step_no = ? AND is_active = 1
		 LIMIT 1`,
		[flowId, stepNo]
	);
	if (!stepRows.length) return [];

	const step = stepRows[0];
	const recipientIds = new Set<number>(parseUserIdsJson(step.approver_user_ids_json));
	if (step.approver_user_id) recipientIds.add(Number(step.approver_user_id));
	if (!recipientIds.size) return [];

	const [users] = await connection.query<RowDataPacket[]>(
		`SELECT id, email, full_name, line_user_id FROM users WHERE id IN (?)`,
		[[...recipientIds]]
	);
	return users.map((u) => ({
		id: Number(u.id),
		email: String(u.email || ''),
		full_name: (u.full_name as string | null) || null,
		line_user_id:
			u.line_user_id != null && String(u.line_user_id).trim()
				? String(u.line_user_id).trim()
				: null
	}));
}

async function notifyApprovalRecipients(
	users: ApprovalNotifyUser[],
	subject: string,
	message: string,
	actionUrl: string
) {
	const emails = users.map((u) => u.email).filter(Boolean);
	if (emails.length) {
		const html = `
		<p>${message}</p>
		<p><a href="${actionUrl}">Open request</a></p>
	`;
		await sendMail({
			to: emails,
			subject,
			text: `${message}\n${actionUrl}`,
			html
		});
	}

	const lineIds = users.map((u) => u.line_user_id).filter((id): id is string => Boolean(id));
	if (lineIds.length) {
		const lineBody = `${subject}\n\n${message}\n\n${actionUrl}`;
		await sendLineTextMulticast(lineIds, lineBody);
	}
}

async function notifyQmrOnDocumentApproved(
	connection: PoolConnection,
	docNo: string,
	docId: number
) {
	const [docFlowRows] = await connection.execute<RowDataPacket[]>(
		`SELECT iso_approval_flow_id FROM iso_documents WHERE id = ? LIMIT 1`,
		[docId]
	);
	const flowId = Number(docFlowRows[0]?.iso_approval_flow_id || 0);

	let qmrRows: RowDataPacket[] = [];
	if (flowId) {
		const [flowRows] = await connection.execute<RowDataPacket[]>(
			`SELECT qmr_user_ids_json FROM iso_approval_flows WHERE id = ? LIMIT 1`,
			[flowId]
		);
		const qmrIds = parseUserIdsJson(flowRows[0]?.qmr_user_ids_json);
		if (qmrIds.length > 0) {
			const [users] = await connection.query<RowDataPacket[]>(
				`SELECT id, email, full_name, line_user_id FROM users WHERE id IN (?)`,
				[qmrIds]
			);
			qmrRows = users;
		}
	}

	// Fallback: QMR role (if not configured in flow)
	if (qmrRows.length === 0) {
		const [fallbackRows] = await connection.execute<RowDataPacket[]>(
			`SELECT u.id, u.email, u.full_name, u.line_user_id
			 FROM users u
			 JOIN roles r ON r.id = u.role_id
			 WHERE UPPER(r.name) = 'QMR'`
		);
		qmrRows = fallbackRows;
	}

	if (!qmrRows.length) return;

	const baseUrl = env.APP_BASE_URL || 'http://localhost:5174';
	const qmrNotifyUsers: ApprovalNotifyUser[] = qmrRows.map((r) => ({
		id: Number(r.id),
		email: String(r.email || ''),
		full_name: (r.full_name as string | null) || null,
		line_user_id:
			r.line_user_id != null && String(r.line_user_id).trim()
				? String(r.line_user_id).trim()
				: null
	}));
	await notifyApprovalRecipients(
		qmrNotifyUsers,
		`[IsoDocs] Document approved: ${docNo}`,
		`Document ${docNo} has been approved. Please review update status.`,
		`${baseUrl}/isodocs-control?focus=${docId}`
	);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	checkPermission(locals, 'view isodocs');
	const isAdmin = locals.user ? userHasAdminRole(locals.user) : false;
	const permissionSet = new Set(locals.user?.permissions || []);
	const showDebug = url.searchParams.get('debug') === '1';

	const search = (url.searchParams.get('search') || '').trim();
	const status = (url.searchParams.get('status') || '').trim().toLowerCase();
	const auditSearch = (url.searchParams.get('audit_search') || '').trim();
	const auditLimitRaw = Number(url.searchParams.get('audit_limit') || 50);
	const auditLimit = [20, 50, 100, 200].includes(auditLimitRaw) ? auditLimitRaw : 50;

	const statusFilter = [
		'active',
		'draft',
		'obsolete',
		'superseded'
	].includes(status)
		? status
		: '';

	let whereClause = ' WHERE 1=1 ';
	const params: (string | number)[] = [];

	if (search) {
		whereClause += ' AND (dml.doc_code LIKE ? OR dml.doc_name LIKE ? OR dml.description LIKE ?) ';
		const q = `%${search}%`;
		params.push(q, q, q);
	}

	if (statusFilter) {
		whereClause += ' AND dml.status = ? ';
		params.push(statusFilter);
	}

	const [documents] = await pool.query<MasterListDocument[]>(
		`SELECT
			dml.id,
			dml.doc_code AS doc_no,
			dml.doc_name AS title,
			dml.current_revision AS version,
			dml.status,
			dml.description,
			dml.effective_date,
			dml.updated_at
		 FROM document_master_list dml
		 ${whereClause}
		 ORDER BY dml.updated_at DESC, dml.id DESC
		 LIMIT 10`,
		params
	);
	const [darStatusRows] = await pool.execute<DarStatusSummary[]>(
		`SELECT
			SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
			SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed_count,
			SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
			SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) AS registered_count,
			SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
		 FROM dar_requests`
	);
	const [docCancelRows] = await pool.execute<RowDataPacket[]>(
		`SELECT SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
		 FROM document_master_list`
	);

	const [auditLogs] = await pool.execute<IsoDocumentAuditLog[]>(
		`SELECT
			l.id,
			l.iso_document_id,
			l.user_id,
			l.action,
			l.remark,
			l.created_at,
			d.doc_no,
			d.title AS doc_title,
			COALESCE(UPPER(LEFT(isec.code, 2)), '-') AS department_name,
			t.code AS document_type,
			d.title AS document_name,
			u.full_name AS user_name
		 FROM iso_document_audit_logs l
		 JOIN iso_documents d ON d.id = l.iso_document_id
		 LEFT JOIN iso_sections isec
		   ON (isec.code COLLATE utf8mb4_unicode_ci) =
		      (SUBSTRING_INDEX(SUBSTRING_INDEX(d.doc_no, '-', 2), '-', -1) COLLATE utf8mb4_unicode_ci)
		 LEFT JOIN iso_document_types t ON t.id = d.iso_document_type_id
		 LEFT JOIN users u ON u.id = l.user_id
		 ORDER BY l.created_at DESC, l.id DESC
		 LIMIT 50`
	);
	const [darAuditRows] = await pool.execute<RowDataPacket[]>(
		`SELECT *
		 FROM (
			SELECT
				CONCAT('dar-', dr.id, '-submit') COLLATE utf8mb4_unicode_ci AS id,
				dr.request_date AS created_at,
				'dar_submit' COLLATE utf8mb4_unicode_ci AS action,
				COALESCE(dr.remark, '') COLLATE utf8mb4_unicode_ci AS remark,
				COALESCE(dr.dar_no, '') COLLATE utf8mb4_unicode_ci AS doc_no,
				'DAR Request' COLLATE utf8mb4_unicode_ci AS doc_title,
				CAST(
					COALESCE(
						UPPER(LEFT(NULLIF(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci, ''), 2)),
						UPPER(LEFT(COALESCE(isec.code, '') COLLATE utf8mb4_unicode_ci, 2)),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS department_name,
				CAST(
					COALESCE(
						NULLIF(JSON_UNQUOTE(JSON_EXTRACT(dr.document_type_scope, '$[0]')) COLLATE utf8mb4_unicode_ci, ''),
						NULLIF(
							TRIM(BOTH '"' FROM REPLACE(REPLACE(SUBSTRING_INDEX(CAST(dr.document_type_scope AS CHAR) COLLATE utf8mb4_unicode_ci, ',', 1), '[', ''), ']', '')),
							''
						),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS document_type,
				COALESCE(di.document_name, '') COLLATE utf8mb4_unicode_ci AS document_name,
				COALESCE(dr.requester_name, '') COLLATE utf8mb4_unicode_ci AS user_name
			FROM dar_requests dr
			LEFT JOIN users ur ON ur.id = dr.requester_user_id
			LEFT JOIN iso_sections isec ON UPPER(isec.code COLLATE utf8mb4_unicode_ci) = UPPER(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci)
			LEFT JOIN dar_request_items di ON di.id = (
				SELECT x.id FROM dar_request_items x WHERE x.dar_request_id = dr.id ORDER BY x.line_no ASC LIMIT 1
			)

			UNION ALL

			SELECT
				CONCAT('dar-', dr.id, '-review') COLLATE utf8mb4_unicode_ci AS id,
				dr.reviewer_date AS created_at,
				(CASE
					WHEN dr.reviewer_approve = 1 THEN 'dar_reviewed'
					ELSE 'dar_rejected_by_mgr'
				END) COLLATE utf8mb4_unicode_ci AS action,
				COALESCE(dr.reviewer_comment, '') COLLATE utf8mb4_unicode_ci AS remark,
				COALESCE(dr.dar_no, '') COLLATE utf8mb4_unicode_ci AS doc_no,
				'DAR Request' COLLATE utf8mb4_unicode_ci AS doc_title,
				CAST(
					COALESCE(
						UPPER(LEFT(NULLIF(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci, ''), 2)),
						UPPER(LEFT(COALESCE(isec.code, '') COLLATE utf8mb4_unicode_ci, 2)),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS department_name,
				CAST(
					COALESCE(
						NULLIF(JSON_UNQUOTE(JSON_EXTRACT(dr.document_type_scope, '$[0]')) COLLATE utf8mb4_unicode_ci, ''),
						NULLIF(
							TRIM(BOTH '"' FROM REPLACE(REPLACE(SUBSTRING_INDEX(CAST(dr.document_type_scope AS CHAR) COLLATE utf8mb4_unicode_ci, ',', 1), '[', ''), ']', '')),
							''
						),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS document_type,
				COALESCE(di.document_name, '') COLLATE utf8mb4_unicode_ci AS document_name,
				COALESCE(dr.reviewer_name, '') COLLATE utf8mb4_unicode_ci AS user_name
			FROM dar_requests dr
			LEFT JOIN users ur ON ur.id = dr.requester_user_id
			LEFT JOIN iso_sections isec ON UPPER(isec.code COLLATE utf8mb4_unicode_ci) = UPPER(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci)
			LEFT JOIN dar_request_items di ON di.id = (
				SELECT x.id FROM dar_request_items x WHERE x.dar_request_id = dr.id ORDER BY x.line_no ASC LIMIT 1
			)
			WHERE dr.reviewer_date IS NOT NULL

			UNION ALL

			SELECT
				CONCAT('dar-', dr.id, '-approve') COLLATE utf8mb4_unicode_ci AS id,
				dr.approver_date AS created_at,
				(CASE
					WHEN dr.approver_approve = 1 THEN 'dar_approved_by_vp'
					ELSE 'dar_rejected_by_vp'
				END) COLLATE utf8mb4_unicode_ci AS action,
				COALESCE(dr.approver_comment, '') COLLATE utf8mb4_unicode_ci AS remark,
				COALESCE(dr.dar_no, '') COLLATE utf8mb4_unicode_ci AS doc_no,
				'DAR Request' COLLATE utf8mb4_unicode_ci AS doc_title,
				CAST(
					COALESCE(
						UPPER(LEFT(NULLIF(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci, ''), 2)),
						UPPER(LEFT(COALESCE(isec.code, '') COLLATE utf8mb4_unicode_ci, 2)),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS department_name,
				CAST(
					COALESCE(
						NULLIF(JSON_UNQUOTE(JSON_EXTRACT(dr.document_type_scope, '$[0]')) COLLATE utf8mb4_unicode_ci, ''),
						NULLIF(
							TRIM(BOTH '"' FROM REPLACE(REPLACE(SUBSTRING_INDEX(CAST(dr.document_type_scope AS CHAR) COLLATE utf8mb4_unicode_ci, ',', 1), '[', ''), ']', '')),
							''
						),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS document_type,
				COALESCE(di.document_name, '') COLLATE utf8mb4_unicode_ci AS document_name,
				COALESCE(dr.approver_name, '') COLLATE utf8mb4_unicode_ci AS user_name
			FROM dar_requests dr
			LEFT JOIN users ur ON ur.id = dr.requester_user_id
			LEFT JOIN iso_sections isec ON UPPER(isec.code COLLATE utf8mb4_unicode_ci) = UPPER(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci)
			LEFT JOIN dar_request_items di ON di.id = (
				SELECT x.id FROM dar_request_items x WHERE x.dar_request_id = dr.id ORDER BY x.line_no ASC LIMIT 1
			)
			WHERE dr.approver_date IS NOT NULL

			UNION ALL

			SELECT
				CONCAT('dar-', dr.id, '-register') COLLATE utf8mb4_unicode_ci AS id,
				dr.register_date AS created_at,
				'dar_registered_qmr' COLLATE utf8mb4_unicode_ci AS action,
				COALESCE(dr.document_controller_comment, '') COLLATE utf8mb4_unicode_ci AS remark,
				COALESCE(dr.dar_no, '') COLLATE utf8mb4_unicode_ci AS doc_no,
				'DAR Request' COLLATE utf8mb4_unicode_ci AS doc_title,
				CAST(
					COALESCE(
						UPPER(LEFT(NULLIF(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci, ''), 2)),
						UPPER(LEFT(COALESCE(isec.code, '') COLLATE utf8mb4_unicode_ci, 2)),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS department_name,
				CAST(
					COALESCE(
						NULLIF(JSON_UNQUOTE(JSON_EXTRACT(dr.document_type_scope, '$[0]')) COLLATE utf8mb4_unicode_ci, ''),
						NULLIF(
							TRIM(BOTH '"' FROM REPLACE(REPLACE(SUBSTRING_INDEX(CAST(dr.document_type_scope AS CHAR) COLLATE utf8mb4_unicode_ci, ',', 1), '[', ''), ']', '')),
							''
						),
						'-'
					) AS CHAR(255)
				) COLLATE utf8mb4_unicode_ci AS document_type,
				COALESCE(di.document_name, '') COLLATE utf8mb4_unicode_ci AS document_name,
				COALESCE(dr.register_name, '') COLLATE utf8mb4_unicode_ci AS user_name
			FROM dar_requests dr
			LEFT JOIN users ur ON ur.id = dr.requester_user_id
			LEFT JOIN iso_sections isec ON UPPER(isec.code COLLATE utf8mb4_unicode_ci) = UPPER(COALESCE(ur.iso_section, '') COLLATE utf8mb4_unicode_ci)
			LEFT JOIN dar_request_items di ON di.id = (
				SELECT x.id FROM dar_request_items x WHERE x.dar_request_id = dr.id ORDER BY x.line_no ASC LIMIT 1
			)
			WHERE dr.register_date IS NOT NULL
		) x
		ORDER BY x.created_at DESC
		LIMIT 50`
	);
	const combinedAuditLogs: IsoDocumentAuditLog[] = [...auditLogs, ...(darAuditRows as IsoDocumentAuditLog[])]
		.sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
		.filter((row) => {
			if (!auditSearch) return true;
			const q = auditSearch.toLowerCase();
			return [
				row.action,
				row.doc_no,
				row.doc_title,
				row.user_name,
				row.remark,
				row.department_name,
				row.document_type,
				row.document_name
			]
				.map((v) => String(v || '').toLowerCase())
				.some((v) => v.includes(q));
		})
		.slice(0, auditLimit);

	return {
		documents,
		auditLogs: combinedAuditLogs,
		showDebug,
		debugAuth: {
			role: locals.user?.role || null,
			permissions: Array.from(permissionSet).sort()
		},
		can: {
			create: isAdmin || permissionSet.has('create isodocs'),
			edit: isAdmin || permissionSet.has('edit isodocs'),
			delete: isAdmin || permissionSet.has('delete isodocs'),
			submit: isAdmin || permissionSet.has('submit isodocs'),
			approve: isAdmin || permissionSet.has('approve isodocs'),
			cancel: isAdmin || permissionSet.has('edit isodocs'),
			distributeControlled: isAdmin || permissionSet.has('edit isodocs'),
			distributeUncontrolled: isAdmin || permissionSet.has('edit isodocs')
		},
		statusSummary: {
			issuerSubmitted: Number(darStatusRows[0]?.submitted_count || 0),
			mgrReviewed: Number(darStatusRows[0]?.reviewed_count || 0),
			vpApproved: Number(darStatusRows[0]?.approved_count || 0),
			qmrControlled: Number(darStatusRows[0]?.registered_count || 0),
			reject: Number(darStatusRows[0]?.rejected_count || 0),
			cancel: Number(docCancelRows[0]?.cancelled_count || 0)
		},
		filters: {
			search,
			status: statusFilter,
			auditSearch,
			auditLimit
		},
		pagination: {
			page: 1,
			pageSize: 10,
			total: documents.length,
			totalPages: 1
		}
	};
};

export const actions: Actions = {
	saveDocument: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const formData = await request.formData();
		const idRaw = formData.get('id')?.toString().trim();
		const id = idRaw ? Number(idRaw) : null;

		const requiredPermission = id ? 'edit isodocs' : 'create isodocs';
		checkPermission(locals, requiredPermission);

		const title = formData.get('title')?.toString().trim() || '';
		const description = formData.get('description')?.toString().trim() || null;
		const docNoRaw = formData.get('doc_no')?.toString().trim() || '';
		const isoDocumentTypeId = Number(formData.get('iso_document_type_id')?.toString() || 0);
		const departmentId = Number(formData.get('department_id')?.toString() || 0);
		const version = formData.get('version')?.toString().trim() || '1.0';
		const file = formData.get('document_file') as File | null;

		if (!title) {
			return fail(400, {
				action: 'saveDocument',
				success: false,
				message: 'Title is required.'
			});
		}

		if (!id && (!isoDocumentTypeId || !departmentId)) {
			return fail(400, {
				action: 'saveDocument',
				success: false,
				message: 'Document Type and Department are required.'
			});
		}

		if (!id && (!file || file.size === 0)) {
			return fail(400, {
				action: 'saveDocument',
				success: false,
				message: 'File is required when creating a document.'
			});
		}

		const connection = await pool.getConnection();
		let uploadedFilePath: string | null = null;
		let oldFilePathToDelete: string | null = null;
		let finalDocNo = docNoRaw;

		try {
			if (file && file.size > 0) {
				uploadedFilePath = await saveDocumentFile(file);
			}

			await connection.beginTransaction();

			if (id) {
				const [existingRows] = await connection.execute<IsoDocument[]>(
					`SELECT id, doc_no, file_path, status FROM iso_documents WHERE id = ? LIMIT 1`,
					[id]
				);

				if (existingRows.length === 0) {
					await connection.rollback();
					if (uploadedFilePath) await removeDocumentFile(uploadedFilePath);
					return fail(404, {
						action: 'saveDocument',
						success: false,
						message: 'Document not found.'
					});
				}

				finalDocNo = existingRows[0].doc_no;
				const fields = ['title = ?', 'description = ?', 'version = ?'];
				const updateParams: (string | number | null)[] = [
					title,
					description,
					version
				];

				if (uploadedFilePath) {
					fields.push('file_path = ?');
					updateParams.push(uploadedFilePath);
					oldFilePathToDelete = existingRows[0].file_path;
				}

				updateParams.push(id);

				await connection.execute(
					`UPDATE iso_documents SET ${fields.join(', ')} WHERE id = ?`,
					updateParams
				);

				await writeAuditLog(
					connection,
					id,
					locals.user.id,
					uploadedFilePath ? 'update_with_upload' : 'update',
					`Updated document ${finalDocNo}`
				);
			} else {
				const [typeRows] = await connection.execute<IsoDocumentTypeNumbering[]>(
					`SELECT id, prefix, number_format, running_digits, reset_mode
					 FROM iso_document_types
					 WHERE id = ? AND is_active = 1
					 LIMIT 1`,
					[isoDocumentTypeId]
				);

				const type = typeRows[0];
				if (!type) {
					await connection.rollback();
					if (uploadedFilePath) await removeDocumentFile(uploadedFilePath);
					return fail(400, {
						action: 'saveDocument',
						success: false,
						message: 'Invalid or inactive document type.'
					});
				}

				const currentYear = new Date().getFullYear();
				finalDocNo = docNoRaw
					? docNoRaw
					: await generateIsoDocumentNoFromType(connection, type, currentYear);

				const [flowRows] = await connection.execute<RowDataPacket[]>(
					`SELECT id
					 FROM iso_approval_flows
					 WHERE department_id = ? AND is_active = 1
					 ORDER BY updated_at DESC, id DESC
					 LIMIT 1`,
					[departmentId]
				);
				const flowId = Number(flowRows[0]?.id || 0);
				if (!flowId) {
					await connection.rollback();
					if (uploadedFilePath) await removeDocumentFile(uploadedFilePath);
					return fail(400, {
						action: 'saveDocument',
						success: false,
						message: 'Approval flow is not configured for this Department.'
					});
				}

				const [insertResult] = await connection.execute<any>(
					`INSERT INTO iso_documents
					 (doc_no, title, description, file_path, version, status, created_by,
					  iso_document_type_id, department_id, iso_approval_flow_id, current_approval_step_no)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
					[
						finalDocNo,
						title,
						description,
						uploadedFilePath,
						version,
						'draft',
						locals.user.id,
						type.id,
						departmentId,
						flowId
					]
				);

				const newId = Number(insertResult.insertId);
				await writeAuditLog(
					connection,
					newId,
					locals.user.id,
					'create',
					`Created document ${finalDocNo}`
				);
			}

			await connection.commit();

			if (oldFilePathToDelete) {
				await removeDocumentFile(oldFilePathToDelete);
			}

			return {
				action: 'saveDocument',
				success: true,
				message: `Document '${finalDocNo}' saved successfully.`
			};
		} catch (e: any) {
			await connection.rollback();

			if (uploadedFilePath) {
				await removeDocumentFile(uploadedFilePath);
			}

			if (e.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveDocument',
					success: false,
					message: 'Document No already exists.'
				});
			}

			console.error('[isodocs-control] saveDocument error:', e);
			return fail(500, {
				action: 'saveDocument',
				success: false,
				message: e.message || 'Failed to save document.'
			});
		} finally {
			connection.release();
		}
	},

	deleteDocument: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'delete isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);

		if (!id) {
			return fail(400, {
				action: 'deleteDocument',
				success: false,
				message: 'Invalid document id.'
			});
		}

		try {
			const [rows] = await pool.execute<IsoDocument[]>(
				`SELECT file_path FROM iso_documents WHERE id = ? LIMIT 1`,
				[id]
			);

			if (rows.length === 0) {
				return fail(404, {
					action: 'deleteDocument',
					success: false,
					message: 'Document not found.'
				});
			}

			const filePath = rows[0].file_path;
			await pool.execute(`DELETE FROM iso_documents WHERE id = ?`, [id]);
			await removeDocumentFile(filePath);

			return {
				action: 'deleteDocument',
				success: true,
				message: 'Document deleted successfully.'
			};
		} catch (e: any) {
			console.error('[isodocs-control] deleteDocument error:', e);
			return fail(500, {
				action: 'deleteDocument',
				success: false,
				message: e.message || 'Failed to delete document.'
			});
		}
	},

	submitForApproval: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'submit isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);
		const remark = formData.get('remark')?.toString().trim() || null;

		if (!id) {
			return fail(400, {
				action: 'submitForApproval',
				success: false,
				message: 'Invalid document id.'
			});
		}

		if (!remark) {
			return fail(400, {
				action: 'submitForApproval',
				success: false,
				message: 'Remark is required for submit action.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [docRows] = await connection.execute<IsoDocument[]>(
				`SELECT id, status, iso_approval_flow_id
				 FROM iso_documents
				 WHERE id = ?
				 LIMIT 1`,
				[id]
			);

			if (!docRows || docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'submitForApproval',
					success: false,
					message: 'Document not found.'
				});
			}

			const doc = docRows[0];
			if (!['draft', 'rejected'].includes(doc.status)) {
				await connection.rollback();
				return fail(400, {
					action: 'submitForApproval',
					success: false,
					message: 'Only draft/rejected documents can be submitted.'
				});
			}

			if (doc.iso_approval_flow_id) {
				// Reset approval steps for (re-)submission
				await connection.execute(`DELETE FROM iso_document_approval_steps WHERE iso_document_id = ?`, [id]);

				const [flowSteps] = await connection.execute<
					RowDataPacket[] & {
						id: number;
						step_no: number;
						step_key: string | null;
						approver_user_id: number | null;
						approver_user_ids_json: string | null;
					}[]
				>(
					`SELECT id, step_no, step_key, approver_user_id, approver_user_ids_json
					 FROM iso_approval_flow_steps
					 WHERE iso_approval_flow_id = ? AND is_active = 1
					 ORDER BY step_no ASC`,
					[doc.iso_approval_flow_id]
				);

				if (!flowSteps || flowSteps.length === 0) {
					await connection.rollback();
					return fail(400, {
						action: 'submitForApproval',
						success: false,
						message: 'No active approval steps configured for this document flow.'
					});
				}

				const placeholders = flowSteps.map(() => '(?, ?, ?, ?)').join(',');
				const values: (number | string | null)[] = [];
				for (const s of flowSteps as any[]) {
					values.push(id, s.id, s.step_no, 'pending');
				}

				await connection.execute(
					`INSERT INTO iso_document_approval_steps
					 (iso_document_id, iso_approval_flow_step_id, step_no, status)
					 VALUES ${placeholders}`,
					values
				);

				const orderedSteps = flowSteps as any[];
				const firstStep = orderedSteps[0];
				const firstStepNo = Number(firstStep.step_no);
				const firstStepKey = (firstStep.step_key as string | null) || null;
				const firstStepUserIds = new Set<number>(parseUserIdsJson(firstStep.approver_user_ids_json));
				if (firstStep.approver_user_id != null) {
					firstStepUserIds.add(Number(firstStep.approver_user_id));
				}

				// Business rule: Stage 1 (Issued By) is the issuer (submitter) and should not be emailed.
				// Auto-approve the first step when it's the "issued_by" stage, then move to next step.
				const shouldAutoIssue = firstStepNo === 1 && firstStepKey === 'issued_by';
				const nextStepNo = orderedSteps.length > 1 ? Number(orderedSteps[1].step_no) : null;

				if (shouldAutoIssue) {
					if (!firstStepUserIds.has(locals.user.id)) {
						await connection.rollback();
						return fail(403, {
							action: 'submitForApproval',
							success: false,
							message: 'You are not assigned as Issued By for this flow.'
						});
					}

					await connection.execute(
						`UPDATE iso_document_approval_steps
						 SET status = 'approved',
							 acted_by = ?,
							 acted_at = NOW(),
							 remark = ?
						 WHERE iso_document_id = ? AND step_no = ?`,
						[locals.user.id, remark, id, firstStepNo]
					);
				}

				await connection.execute(
					`UPDATE iso_documents
					 SET status = 'pending',
						 approved_by = NULL,
						 approved_at = NULL,
						 current_approval_step_no = ?
					 WHERE id = ?`,
					[shouldAutoIssue && nextStepNo ? nextStepNo : firstStepNo, id]
				);

				// Notify approvers by email (skip stage 1 when it's "issued_by").
				const notifyStepNo = shouldAutoIssue && nextStepNo ? nextStepNo : firstStepNo;
				const notifyUsers = await getFlowStepRecipientUsers(
					connection,
					Number(doc.iso_approval_flow_id),
					notifyStepNo
				);
				const [docMeta] = await connection.execute<RowDataPacket[]>(
					`SELECT doc_no FROM iso_documents WHERE id = ? LIMIT 1`,
					[id]
				);
				const docNo = String(docMeta[0]?.doc_no || `#${id}`);
				const baseUrl = env.APP_BASE_URL || 'http://localhost:5174';
				await notifyApprovalRecipients(
					notifyUsers,
					`[IsoDocs] Review requested: ${docNo}`,
					`Document ${docNo} is waiting for your review/approval (step ${notifyStepNo}).`,
					`${baseUrl}/isodocs-control?focus=${id}`
				);
			} else {
				// Backward compatibility
				const [result] = await connection.execute<any>(
					`UPDATE iso_documents
					 SET status = 'pending',
						 approved_by = NULL,
						 approved_at = NULL,
						 current_approval_step_no = NULL
					 WHERE id = ? AND status IN ('draft', 'rejected')`,
					[id]
				);

				if (result.affectedRows === 0) {
					await connection.rollback();
					return fail(400, {
						action: 'submitForApproval',
						success: false,
						message: 'Only draft/rejected documents can be submitted.'
					});
				}
			}

			await writeAuditLog(connection, id, locals.user.id, 'submit', remark);
			await connection.commit();

			return {
				action: 'submitForApproval',
				success: true,
				message: 'Document submitted for approval.'
			};
		} catch (e: any) {
			await connection.rollback();
			console.error('[isodocs-control] submitForApproval error:', e);
			return fail(500, {
				action: 'submitForApproval',
				success: false,
				message: e.message || 'Failed to submit for approval.'
			});
		} finally {
			connection.release();
		}
	},

	approveDocument: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'approve isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);
		const remark = formData.get('remark')?.toString().trim() || null;

		if (!id) {
			return fail(400, {
				action: 'approveDocument',
				success: false,
				message: 'Invalid document id.'
			});
		}

		if (!remark) {
			return fail(400, {
				action: 'approveDocument',
				success: false,
				message: 'Remark is required for approve action.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [docRows] = await connection.execute<IsoDocument[]>(
				`SELECT id, status, iso_approval_flow_id, current_approval_step_no
				 FROM iso_documents
				 WHERE id = ?
				 LIMIT 1`,
				[id]
			);

			if (!docRows || docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'approveDocument',
					success: false,
					message: 'Document not found.'
				});
			}

			const doc = docRows[0];
			if (doc.status !== 'pending') {
				await connection.rollback();
				return fail(400, {
					action: 'approveDocument',
					success: false,
					message: 'Only pending documents can be approved.'
				});
			}

			if (doc.iso_approval_flow_id && doc.current_approval_step_no) {
				const [userRoleRows] = await connection.execute<RowDataPacket[]>(
					`SELECT role_id FROM users WHERE id = ? LIMIT 1`,
					[locals.user.id]
				);
				const userRoleId = Number(userRoleRows[0]?.role_id || 0);

				const stepNo = Number(doc.current_approval_step_no);

				const [stepRows] = await connection.execute<
					RowDataPacket[] & {
						das_id: number;
						require_remark: number;
						approver_role_id: number | null;
						approver_user_id: number | null;
						approver_user_ids_json: string | null;
					}[]
				>(
					`SELECT
						das.id AS das_id,
						s.require_remark,
						s.approver_role_id,
						s.approver_user_id,
						s.approver_user_ids_json
					 FROM iso_document_approval_steps das
					 JOIN iso_approval_flow_steps s
					   ON s.id = das.iso_approval_flow_step_id
					 WHERE das.iso_document_id = ?
					   AND das.step_no = ?
					   AND das.status = 'pending'
					 LIMIT 1`,
					[id, stepNo]
				);

				if (!stepRows || stepRows.length === 0) {
					await connection.rollback();
					return fail(400, {
						action: 'approveDocument',
						success: false,
						message: 'Approval step is not initialized or already processed.'
					});
				}

				const step = stepRows[0] as any;

				const stepUserIds = new Set<number>(parseUserIdsJson(step.approver_user_ids_json));
				if (step.approver_user_id != null) stepUserIds.add(Number(step.approver_user_id));
				const isAssigned =
					(step.approver_user_id != null && step.approver_user_id === locals.user.id) ||
					(step.approver_role_id != null && step.approver_role_id === userRoleId) ||
					stepUserIds.has(locals.user.id);

				if (!isAssigned) {
					await connection.rollback();
					return fail(403, {
						action: 'approveDocument',
						success: false,
						message: 'You are not the approver for the current step.'
					});
				}

				await connection.execute(
					`UPDATE iso_document_approval_steps
					 SET status = 'approved',
						 acted_by = ?,
						 acted_at = NOW(),
						 remark = ?
					 WHERE id = ?`,
					[locals.user.id, remark, step.das_id]
				);

				const [nextRows] = await connection.execute<RowDataPacket[]>(
					`SELECT step_no
					 FROM iso_approval_flow_steps
					 WHERE iso_approval_flow_id = ?
					   AND is_active = 1
					   AND step_no > ?
					 ORDER BY step_no ASC
					 LIMIT 1`,
					[doc.iso_approval_flow_id, stepNo]
				);

				if (!nextRows || nextRows.length === 0) {
					await connection.execute(
						`UPDATE iso_documents
						 SET status = 'original_controlled',
							 approved_by = ?,
							 approved_at = NOW(),
							 current_approval_step_no = ?
						 WHERE id = ?`,
						[locals.user.id, stepNo, id]
					);
					const [docMeta] = await connection.execute<RowDataPacket[]>(
						`SELECT doc_no FROM iso_documents WHERE id = ? LIMIT 1`,
						[id]
					);
					const docNo = String(docMeta[0]?.doc_no || `#${id}`);
					await notifyQmrOnDocumentApproved(connection, docNo, id);
				} else {
					const nextStepNo = Number((nextRows as any[])[0].step_no);
					await connection.execute(
						`UPDATE iso_documents
						 SET status = 'pending',
							 approved_by = NULL,
							 approved_at = NULL,
							 current_approval_step_no = ?
						 WHERE id = ?`,
						[nextStepNo, id]
					);

					// Notify next-stage approvers.
					const nextUsers = await getFlowStepRecipientUsers(
						connection,
						Number(doc.iso_approval_flow_id),
						nextStepNo
					);
					const [docMeta] = await connection.execute<RowDataPacket[]>(
						`SELECT doc_no FROM iso_documents WHERE id = ? LIMIT 1`,
						[id]
					);
					const docNo = String(docMeta[0]?.doc_no || `#${id}`);
					const baseUrl = env.APP_BASE_URL || 'http://localhost:5174';
					await notifyApprovalRecipients(
						nextUsers,
						`[IsoDocs] Next approval step: ${docNo}`,
						`Document ${docNo} moved to step ${nextStepNo}. Please review/approve.`,
						`${baseUrl}/isodocs-control?focus=${id}`
					);
				}
			} else {
				// Backward compatibility: old single-step workflow
				const [result] = await connection.execute<any>(
					`UPDATE iso_documents
					 SET status = 'original_controlled',
						 approved_by = ?,
						 approved_at = NOW(),
						 current_approval_step_no = NULL
					 WHERE id = ? AND status = 'pending'`,
					[locals.user.id, id]
				);

				if (result.affectedRows === 0) {
					await connection.rollback();
					return fail(400, {
						action: 'approveDocument',
						success: false,
						message: 'Only pending documents can be approved.'
					});
				}
			}

			await writeAuditLog(connection, id, locals.user.id, 'approve', remark);
			await connection.commit();

			return {
				action: 'approveDocument',
				success: true,
				message: 'Document approved.'
			};
		} catch (e: any) {
			await connection.rollback();
			console.error('[isodocs-control] approveDocument error:', e);
			return fail(500, {
				action: 'approveDocument',
				success: false,
				message: e.message || 'Failed to approve document.'
			});
		} finally {
			connection.release();
		}
	},

	rejectDocument: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'approve isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);
		const remark = formData.get('remark')?.toString().trim() || null;

		if (!id) {
			return fail(400, {
				action: 'rejectDocument',
				success: false,
				message: 'Invalid document id.'
			});
		}

		if (!remark) {
			return fail(400, {
				action: 'rejectDocument',
				success: false,
				message: 'Remark is required for reject action.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [docRows] = await connection.execute<IsoDocument[]>(
				`SELECT id, status, iso_approval_flow_id, current_approval_step_no
				 FROM iso_documents
				 WHERE id = ?
				 LIMIT 1`,
				[id]
			);

			if (!docRows || docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'rejectDocument',
					success: false,
					message: 'Document not found.'
				});
			}

			const doc = docRows[0];
			if (doc.status !== 'pending') {
				await connection.rollback();
				return fail(400, {
					action: 'rejectDocument',
					success: false,
					message: 'Only pending documents can be rejected.'
				});
			}

			if (doc.iso_approval_flow_id && doc.current_approval_step_no) {
				const [userRoleRows] = await connection.execute<RowDataPacket[]>(
					`SELECT role_id FROM users WHERE id = ? LIMIT 1`,
					[locals.user.id]
				);
				const userRoleId = Number(userRoleRows[0]?.role_id || 0);

				const stepNo = Number(doc.current_approval_step_no);

				const [stepRows] = await connection.execute<
					RowDataPacket[] & {
						das_id: number;
						approver_role_id: number | null;
						approver_user_id: number | null;
						approver_user_ids_json: string | null;
					}[]
				>(
					`SELECT
						das.id AS das_id,
						s.approver_role_id,
						s.approver_user_id,
						s.approver_user_ids_json
					 FROM iso_document_approval_steps das
					 JOIN iso_approval_flow_steps s
					   ON s.id = das.iso_approval_flow_step_id
					 WHERE das.iso_document_id = ?
					   AND das.step_no = ?
					   AND das.status = 'pending'
					 LIMIT 1`,
					[id, stepNo]
				);

				if (!stepRows || stepRows.length === 0) {
					await connection.rollback();
					return fail(400, {
						action: 'rejectDocument',
						success: false,
						message: 'Approval step is not initialized or already processed.'
					});
				}

				const step = stepRows[0] as any;

				const stepUserIds = new Set<number>(parseUserIdsJson(step.approver_user_ids_json));
				if (step.approver_user_id != null) stepUserIds.add(Number(step.approver_user_id));
				const isAssigned =
					(step.approver_user_id != null && step.approver_user_id === locals.user.id) ||
					(step.approver_role_id != null && step.approver_role_id === userRoleId) ||
					stepUserIds.has(locals.user.id);

				if (!isAssigned) {
					await connection.rollback();
					return fail(403, {
						action: 'rejectDocument',
						success: false,
						message: 'You are not the approver for the current step.'
					});
				}

				await connection.execute(
					`UPDATE iso_document_approval_steps
					 SET status = 'rejected',
						 acted_by = ?,
						 acted_at = NOW(),
						 remark = ?
					 WHERE id = ?`,
					[locals.user.id, remark, step.das_id]
				);

				// Skip remaining pending steps
				await connection.execute(
					`UPDATE iso_document_approval_steps
					 SET status = 'skipped'
					 WHERE iso_document_id = ?
					   AND step_no > ?
					   AND status = 'pending'`,
					[id, stepNo]
				);

				await connection.execute(
					`UPDATE iso_documents
					 SET status = 'rejected',
						 approved_by = NULL,
						 approved_at = NULL,
						 current_approval_step_no = ?
					 WHERE id = ?`,
					[stepNo, id]
				);
			} else {
				// Backward compatibility
				const [result] = await connection.execute<any>(
					`UPDATE iso_documents
					 SET status = 'rejected',
						 approved_by = NULL,
						 approved_at = NULL,
						 current_approval_step_no = NULL
					 WHERE id = ? AND status = 'pending'`,
					[id]
				);

				if (result.affectedRows === 0) {
					await connection.rollback();
					return fail(400, {
						action: 'rejectDocument',
						success: false,
						message: 'Only pending documents can be rejected.'
					});
				}
			}

			await writeAuditLog(connection, id, locals.user.id, 'reject', remark);
			await connection.commit();

			return {
				action: 'rejectDocument',
				success: true,
				message: 'Document rejected.'
			};
		} catch (e: any) {
			await connection.rollback();
			console.error('[isodocs-control] rejectDocument error:', e);
			return fail(500, {
				action: 'rejectDocument',
				success: false,
				message: e.message || 'Failed to reject document.'
			});
		} finally {
			connection.release();
		}
	},

	cancelDocument: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'edit isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);
		const remark = formData.get('remark')?.toString().trim() || null;

		if (!id) {
			return fail(400, {
				action: 'cancelDocument',
				success: false,
				message: 'Invalid document id.'
			});
		}

		if (!remark) {
			return fail(400, {
				action: 'cancelDocument',
				success: false,
				message: 'Remark is required for cancel action.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [docRows] = await connection.execute<IsoDocument[]>(
				`SELECT id, status FROM iso_documents WHERE id = ? LIMIT 1`,
				[id]
			);

			if (!docRows || docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'cancelDocument',
					success: false,
					message: 'Document not found.'
				});
			}

			const docStatus = docRows[0].status;
			const allowed = [
				'original_controlled',
				'approved',
				'distribution_controlled',
				'distribution_uncontrolled'
			];

			if (!allowed.includes(docStatus)) {
				await connection.rollback();
				return fail(400, {
					action: 'cancelDocument',
					success: false,
					message: `Cannot cancel document while status is '${docStatus}'.`
				});
			}

			await connection.execute(
				`UPDATE iso_documents
				 SET status = 'cancelled',
					 current_approval_step_no = NULL
				 WHERE id = ?`,
				[id]
			);

			// If there are still any pending approval steps (edge cases), skip them.
			await connection.execute(
				`UPDATE iso_document_approval_steps
				 SET status = 'skipped'
				 WHERE iso_document_id = ? AND status = 'pending'`,
				[id]
			);

			await writeAuditLog(connection, id, locals.user.id, 'cancel', remark);
			await connection.commit();

			return { action: 'cancelDocument', success: true, message: 'Document cancelled.' };
		} catch (e: any) {
			await connection.rollback();
			console.error('[isodocs-control] cancelDocument error:', e);
			return fail(500, {
				action: 'cancelDocument',
				success: false,
				message: e.message || 'Failed to cancel document.'
			});
		} finally {
			connection.release();
		}
	},

	distributeControlled: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'edit isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);
		const remark = formData.get('remark')?.toString().trim() || null;

		if (!id) {
			return fail(400, {
				action: 'distributeControlled',
				success: false,
				message: 'Invalid document id.'
			});
		}

		if (!remark) {
			return fail(400, {
				action: 'distributeControlled',
				success: false,
				message: 'Remark is required for distribution action.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [docRows] = await connection.execute<IsoDocument[]>(
				`SELECT id, status FROM iso_documents WHERE id = ? LIMIT 1`,
				[id]
			);

			if (!docRows || docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'distributeControlled',
					success: false,
					message: 'Document not found.'
				});
			}

			const docStatus = docRows[0].status;
			const allowed = ['original_controlled', 'approved'];

			if (!allowed.includes(docStatus)) {
				await connection.rollback();
				return fail(400, {
					action: 'distributeControlled',
					success: false,
					message: `Cannot distribute controlled while status is '${docStatus}'.`
				});
			}

			await connection.execute(
				`UPDATE iso_documents
				 SET status = 'distribution_controlled'
				 WHERE id = ?`,
				[id]
			);

			await writeAuditLog(connection, id, locals.user.id, 'distribution_controlled', remark);
			await connection.commit();

			return {
				action: 'distributeControlled',
				success: true,
				message: 'Controlled distribution issued.'
			};
		} catch (e: any) {
			await connection.rollback();
			console.error('[isodocs-control] distributeControlled error:', e);
			return fail(500, {
				action: 'distributeControlled',
				success: false,
				message: e.message || 'Failed to issue controlled distribution.'
			});
		} finally {
			connection.release();
		}
	},

	distributeUncontrolled: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		checkPermission(locals, 'edit isodocs');

		const formData = await request.formData();
		const id = Number(formData.get('id')?.toString() || 0);
		const remark = formData.get('remark')?.toString().trim() || null;

		if (!id) {
			return fail(400, {
				action: 'distributeUncontrolled',
				success: false,
				message: 'Invalid document id.'
			});
		}

		if (!remark) {
			return fail(400, {
				action: 'distributeUncontrolled',
				success: false,
				message: 'Remark is required for distribution action.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [docRows] = await connection.execute<IsoDocument[]>(
				`SELECT id, status FROM iso_documents WHERE id = ? LIMIT 1`,
				[id]
			);

			if (!docRows || docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'distributeUncontrolled',
					success: false,
					message: 'Document not found.'
				});
			}

			const docStatus = docRows[0].status;
			const allowed = ['original_controlled', 'approved'];

			if (!allowed.includes(docStatus)) {
				await connection.rollback();
				return fail(400, {
					action: 'distributeUncontrolled',
					success: false,
					message: `Cannot distribute uncontrolled while status is '${docStatus}'.`
				});
			}

			await connection.execute(
				`UPDATE iso_documents
				 SET status = 'distribution_uncontrolled'
				 WHERE id = ?`,
				[id]
			);

			await writeAuditLog(connection, id, locals.user.id, 'distribution_uncontrolled', remark);
			await connection.commit();

			return {
				action: 'distributeUncontrolled',
				success: true,
				message: 'Uncontrolled distribution issued.'
			};
		} catch (e: any) {
			await connection.rollback();
			console.error('[isodocs-control] distributeUncontrolled error:', e);
			return fail(500, {
				action: 'distributeUncontrolled',
				success: false,
				message: e.message || 'Failed to issue uncontrolled distribution.'
			});
		} finally {
			connection.release();
		}
	}
};
