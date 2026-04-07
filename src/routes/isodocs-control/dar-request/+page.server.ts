import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import { env } from '$env/dynamic/private';
import { notifyDarWorkflow } from '$lib/server/darNotifications';

interface DocumentMaster extends RowDataPacket {
	id: number;
	doc_code: string;
	doc_name: string;
	current_revision: string;
	effective_date: string | null;
}

interface UserProfile extends RowDataPacket {
	full_name: string;
	position_name: string | null;
	department_name: string | null;
}

type DarItemPayload = {
	line_no: number;
	document_master_id: number | null;
	document_code: string;
	document_name: string;
	revision: string;
	effective_date: string | null;
	request_reason: string;
	copies_requested: number | null;
};

function normalizeDateOnly(input: unknown): string | null {
	if (!input) return null;
	const raw = String(input).trim();
	if (!raw) return null;

	// Already date-only
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

	// ISO string with time -> take the date part
	const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
	if (isoMatch) return isoMatch[1];

	// Fallback: try Date parse and keep local Y-M-D
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

const UPLOAD_DIR = path.resolve('uploads', 'isodocs', 'dar');

async function ensureUploadDir() {
	await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function saveFile(file: File) {
	if (!file || file.size === 0) return null;
	await ensureUploadDir();

	const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
	const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
	const uploadPath = path.join(UPLOAD_DIR, systemName);
	await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

	return {
		systemName,
		originalName: file.name,
		mimeType: mime.lookup(file.name) || file.type || 'application/octet-stream',
		size: file.size
	};
}

/** รูปแบบใหม่: DAR No. GG/YYYY (GG = ลำดับใบ DAR แสดง 2 หลัก, YYYY = ปี ค.ศ. ตามวันที่ขอ) */
const DAR_NO_NEW_RE = /^DAR No\. (\d+)\/(\d{4})$/;
/** รูปแบบเดิม: DAR-YYYYMM-NNNN — ใช้ร่วมเพื่อนับลำดับต่อในปีเดียวกัน */
const DAR_NO_LEGACY_RE = /^DAR-(\d{4})(\d{2})-(\d+)$/;

async function generateDarNo(connection: any, requestDate: string) {
	const date = new Date(requestDate);
	const year = date.getFullYear();
	const yearStr = String(year);

	const [rawRows] = await connection.execute(
		`SELECT dar_no
		 FROM dar_requests
		 WHERE dar_no LIKE ? OR dar_no LIKE ?
		 FOR UPDATE`,
		[`DAR No. %/${yearStr}`, `DAR-${yearStr}%`]
	);
	const rows = rawRows as RowDataPacket[];

	let maxGg = 0;
	for (const r of rows) {
		const s = String(r.dar_no || '');
		const newM = s.match(DAR_NO_NEW_RE);
		if (newM && newM[2] === yearStr) {
			maxGg = Math.max(maxGg, Number(newM[1]) || 0);
			continue;
		}
		const legM = s.match(DAR_NO_LEGACY_RE);
		if (legM && legM[1] === yearStr) {
			maxGg = Math.max(maxGg, Number(legM[3]) || 0);
		}
	}

	const next = maxGg + 1;
	return `DAR No. ${String(next).padStart(2, '0')}/${yearStr}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const [documents] = await pool.execute<DocumentMaster[]>(
		`SELECT id, doc_code, doc_name, current_revision, effective_date
		 FROM document_master_list
		 WHERE status = 'active'
		 ORDER BY doc_code ASC`
	);

	let requester = {
		full_name: locals.user?.full_name || '-',
		position_name: null as string | null,
		department_name: null as string | null
	};

	if (locals.user?.id) {
		const [users] = await pool.execute<UserProfile[]>(
			`SELECT u.full_name, p.name AS position_name, d.name AS department_name
			 FROM users u
			 LEFT JOIN positions p ON u.position_id = p.id
			 LEFT JOIN departments d ON u.department_id = d.id
			 WHERE u.id = ?
			 LIMIT 1`,
			[locals.user.id]
		);

		if (users[0]) {
			requester = {
				full_name: users[0].full_name || requester.full_name,
				position_name: users[0].position_name || null,
				department_name: users[0].department_name || null
			};
		}
	}

	return {
		documents,
		requester,
		today: new Date().toISOString().slice(0, 10)
	};
};

export const actions: Actions = {
	submitDar: async ({ request, locals, url }) => {
		const formData = await request.formData();

		const requestType = (formData.get('request_type')?.toString() || '').trim();
		const requestDate = (formData.get('request_date')?.toString() || '').trim();
		const remark = (formData.get('remark')?.toString() || '').trim();
		const documentTypeScope = formData.getAll('document_type_scope').map((value) => String(value));
		const itemsJson = formData.get('items_json')?.toString() || '[]';

		if (!requestType || !requestDate) {
			return fail(400, {
				success: false,
				message: 'Request type and request date are required.'
			});
		}

		if (
			!['new_document', 'revise_document', 'cancel_document', 'request_copy'].includes(requestType)
		) {
			return fail(400, {
				success: false,
				message: 'Invalid request type.'
			});
		}

		let parsedItems: DarItemPayload[] = [];
		try {
			parsedItems = JSON.parse(itemsJson);
		} catch {
			return fail(400, { success: false, message: 'Invalid items payload.' });
		}

		const isNewDocument = requestType === 'new_document';
		const validItems = parsedItems.filter((item) => {
			const hasName = Boolean(String(item.document_name || '').trim());
			const hasCode = Boolean(String(item.document_code || '').trim());
			return isNewDocument ? hasName : hasName && hasCode;
		});
		if (validItems.length === 0) {
			return fail(400, {
				success: false,
				message: isNewDocument
					? 'At least one document name is required.'
					: 'At least one document item is required.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const darNo = await generateDarNo(connection, requestDate);
			const [headerResult] = await connection.execute<ResultSetHeader>(
				`INSERT INTO dar_requests
				 (dar_no, request_type, document_type_scope, requester_user_id, requester_name, request_date, remark)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					darNo,
					requestType,
					JSON.stringify(documentTypeScope),
					locals.user?.id || null,
					locals.user?.full_name || null,
					requestDate,
					remark || null
				]
			);

			const darRequestId = headerResult.insertId;

			for (let i = 0; i < validItems.length; i++) {
				const item = validItems[i];
				const effectiveDateValue = normalizeDateOnly(item.effective_date);
				const documentCodeValue = isNewDocument
					? String(item.document_code || '').trim() || `AUTO-${i + 1}`
					: String(item.document_code || '').trim();
				const [itemResult] = await connection.execute<ResultSetHeader>(
					`INSERT INTO dar_request_items
					 (dar_request_id, line_no, document_master_id, document_code, document_name, revision, effective_date, request_reason, copies_requested)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						darRequestId,
						i + 1,
						item.document_master_id || null,
						documentCodeValue,
						item.document_name,
						item.revision || '00',
						effectiveDateValue,
						item.request_reason || null,
						item.copies_requested || null
					]
				);

				const upload = formData.get(`item_attachment_${i}`) as File | null;
				if (upload && upload.size > 0) {
					const saved = await saveFile(upload);
					if (saved) {
						await connection.execute(
							`INSERT INTO dar_request_item_attachments
							 (dar_request_item_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
							 VALUES (?, ?, ?, ?, ?, ?)`,
							[
								itemResult.insertId,
								saved.originalName,
								saved.systemName,
								saved.mimeType,
								saved.size,
								locals.user?.id || null
							]
						);
					}
				}
			}

			await connection.commit();

			try {
				await notifyDarWorkflow(pool, env, 'submit', darNo, {
					requestOrigin: url.origin,
					darRequestId: darRequestId
				});
			} catch (notifyErr) {
				console.error('[dar-request] notify approvers failed:', notifyErr);
			}

			return {
				success: true,
				message: `DAR submitted successfully (${darNo})`
			};
		} catch (error: any) {
			await connection.rollback();
			console.error('submitDar error:', error);
			return fail(500, {
				success: false,
				message: 'Failed to submit DAR request.'
			});
		} finally {
			connection.release();
		}
	}
};
