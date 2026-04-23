import type { RequestHandler } from './$types';
import { checkPermission } from '$lib/server/auth';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface DocumentMaster extends RowDataPacket {
	doc_code: string;
	doc_name: string;
	doc_type: string;
	iso_section_code: string | null;
	iso_section_name_th: string | null;
	current_revision: string;
	effective_date: string;
	status: string;
	description: string | null;
	attached_file_original_name: string | null;
}

function formatEffectiveDate(value: string | Date | null | undefined): string {
	if (value == null || value === '') return '';
	const raw = String(value).trim();
	let d: Date;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		const [yy, mm, dd] = raw.split('-').map((v) => Number(v));
		d = new Date(yy, mm - 1, dd);
	} else {
		d = value instanceof Date ? value : new Date(raw);
	}
	if (Number.isNaN(d.getTime())) return String(value);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const GET: RequestHandler = async ({ locals, url }) => {
	checkPermission(locals, 'view isodocs');

	const search = (url.searchParams.get('search') || '').trim().toLowerCase();
	const docType = (url.searchParams.get('doc_type') || '').trim();
	const isoSection = (url.searchParams.get('iso_section') || '').trim();
	const limitRaw = url.searchParams.get('limit') || '20';
	const limitAll = limitRaw === 'all' || limitRaw === '';
	const limitNum = limitAll ? null : Number(limitRaw);
	const limit =
		limitNum != null && [10, 20, 50, 100, 200].includes(limitNum) ? limitNum : limitAll ? null : 20;

	const [documents] = await pool.execute<DocumentMaster[]>(`
			SELECT
				dml.doc_code,
				dml.doc_name,
				dml.doc_type,
				SUBSTRING_INDEX(SUBSTRING_INDEX(dml.doc_code, '-', 2), '-', -1) AS iso_section_code,
				isec.name_th AS iso_section_name_th,
				dml.current_revision,
				dml.effective_date,
				dml.status,
				dml.description,
				dml.attached_file_original_name
			FROM document_master_list dml
			LEFT JOIN iso_sections isec
				ON (isec.code COLLATE utf8mb4_unicode_ci) =
				   (SUBSTRING_INDEX(SUBSTRING_INDEX(dml.doc_code, '-', 2), '-', -1) COLLATE utf8mb4_unicode_ci)
			WHERE LOWER(TRIM(COALESCE(dml.status, ''))) IN ('active', 'inactive', 'draft', 'obsolete', 'superseded')
			ORDER BY isec.code ASC, dml.doc_code ASC
		`);

	let rows = documents || [];
	if (docType) {
		rows = rows.filter((r) => r.doc_type === docType);
	}
	if (isoSection) {
		const u = isoSection.toUpperCase();
		rows = rows.filter((r) => (r.iso_section_code || '').toUpperCase() === u);
	}
	if (search) {
		rows = rows.filter(
			(r) =>
				r.doc_code.toLowerCase().includes(search) || r.doc_name.toLowerCase().includes(search)
		);
	}
	if (limit != null) {
		rows = rows.slice(0, limit);
	}

	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Document Master');
	ws.columns = [
		{ header: 'Document Code', key: 'doc_code', width: 18 },
		{ header: 'Document Name', key: 'doc_name', width: 42 },
		{ header: 'Type', key: 'doc_type', width: 10 },
		{ header: 'Iso_Section (BB)', key: 'iso_section', width: 36 },
		{ header: 'Revision', key: 'revision', width: 12 },
		{ header: 'Effective Date', key: 'effective_date', width: 18 },
		{ header: 'Status', key: 'status', width: 14 },
		{ header: 'Description', key: 'description', width: 48 },
		{ header: 'Attached file', key: 'attached', width: 36 }
	];

	for (const r of rows) {
		const bb =
			(r.iso_section_code || '-') +
			(r.iso_section_name_th ? ` (${r.iso_section_name_th})` : '');
		ws.addRow({
			doc_code: r.doc_code,
			doc_name: r.doc_name,
			doc_type: r.doc_type,
			iso_section: bb,
			revision: `Rev.${r.current_revision}`,
			effective_date: formatEffectiveDate(r.effective_date),
			status: r.status || '',
			description: r.description || '',
			attached: r.attached_file_original_name || ''
		});
	}

	const buffer = await wb.xlsx.writeBuffer();
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="document-master-list.xlsx"'
		}
	});
};
