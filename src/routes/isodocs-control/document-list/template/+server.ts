import type { RequestHandler } from './$types';
import { checkPermission } from '$lib/server/auth';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ locals }) => {
	checkPermission(locals, 'view isodocs');

	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Template');

	ws.columns = [
		{ header: 'Document code', key: 'doc_code', width: 20 },
		{ header: 'Document Name', key: 'doc_name', width: 28 },
		{ header: 'Rev', key: 'rev', width: 12 },
		{ header: 'Effective Date', key: 'effective_date', width: 18 }
	];

	ws.getRow(1).font = { bold: true };
	ws.getColumn(3).numFmt = '@';

	ws.addRow({
		doc_code: 'QP-IT-01',
		doc_name: 'IT Security',
		rev: '04',
		effective_date: 'May 01, 2025'
	});
	ws.addRow({
		doc_code: 'QP-IT-02',
		doc_name: 'IT Data Backup',
		rev: '03',
		effective_date: 'May 31, 2025'
	});

	// Force text type for Rev sample cells.
	ws.getCell('C2').value = '04';
	ws.getCell('C3').value = '03';

	const buf = await wb.xlsx.writeBuffer();
	return new Response(buf as ArrayBuffer, {
		headers: {
			'Content-Type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="document_import_template.xlsx"',
			'Cache-Control': 'no-store'
		}
	});
};

