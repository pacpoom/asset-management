import type { RequestHandler } from './$types';
import { formatDarNoDisplay } from '$lib/darNoFormat';
import { formatOptionalDateTime } from '$lib/formatDateTime';
import { checkPermission } from '$lib/server/auth';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';
import ExcelJS from 'exceljs';

type AuditRow = RowDataPacket & {
	id: number | string;
	created_at: string;
	action: string;
	remark: string | null;
	doc_no?: string;
	doc_title?: string;
	department_name?: string | null;
	document_type?: string | null;
	document_name?: string | null;
	user_name?: string | null;
};

export const GET: RequestHandler = async ({ locals, url }) => {
	checkPermission(locals, 'view isodocs');

	const auditSearch = (url.searchParams.get('audit_search') || '').trim().toLowerCase();
	const auditLimitRaw = Number(url.searchParams.get('audit_limit') || 20);
	const auditLimit = [10, 20, 50, 100, 200].includes(auditLimitRaw) ? auditLimitRaw : 20;

	const [isoRows] = await pool.execute<AuditRow[]>(
		`SELECT
			l.id,
			l.created_at,
			l.action,
			l.remark,
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
		 LIMIT 500`
	);

	const [darRowsRaw] = await pool.execute<RowDataPacket[]>(
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
				(CASE WHEN dr.reviewer_approve = 1 THEN 'dar_reviewed' ELSE 'dar_rejected_by_mgr' END) COLLATE utf8mb4_unicode_ci AS action,
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
				(CASE WHEN dr.approver_approve = 1 THEN 'dar_approved_by_vp' ELSE 'dar_rejected_by_vp' END) COLLATE utf8mb4_unicode_ci AS action,
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
		LIMIT 500`
	);
	const darRows = darRowsRaw as AuditRow[];

	const rows = [...isoRows, ...darRows]
		.sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
		.filter((row) => {
			if (!auditSearch) return true;
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
				.some((v) => v.includes(auditSearch));
		})
		.slice(0, auditLimit);

	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Audit Logs');
	ws.columns = [
		{ header: 'Time', key: 'created_at', width: 24 },
		{ header: 'User', key: 'user_name', width: 26 },
		{ header: 'Action', key: 'action', width: 28 },
		{ header: 'Iso_Section (BB)', key: 'department_name', width: 28 },
		{ header: 'Document Type', key: 'document_type', width: 18 },
		{ header: 'Document Name', key: 'document_name', width: 40 },
		{ header: 'Document', key: 'document', width: 34 },
		{ header: 'Remark', key: 'remark', width: 50 }
	];

	for (const row of rows) {
		ws.addRow({
			created_at: formatOptionalDateTime(row.created_at),
			user_name: row.user_name || '-',
			action: row.action || '-',
			department_name: row.department_name || '-',
			document_type: row.document_type || '-',
			document_name: row.document_name || '-',
			document: `${formatDarNoDisplay(String(row.doc_no || '-'))} ${row.doc_title ? `- ${row.doc_title}` : ''}`.trim(),
			remark: row.remark || '-'
		});
	}

	const buffer = await wb.xlsx.writeBuffer();
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="isodocs-audit-logs.xlsx"`
		}
	});
};

