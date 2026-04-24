import type { RequestHandler } from './$types';
import * as xlsx from 'xlsx';

export const GET: RequestHandler = async () => {
	const worksheetData = [
		['Container No.', 'Plan Type', 'Pulling Order', 'Pulling Date', 'Shop'],
		['TGBU9658282', 'All', '1', '2026-04-22', 'SKD']
	];

	const workbook = xlsx.utils.book_new();
	const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

	worksheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

	xlsx.utils.book_append_sheet(workbook, worksheet, 'Template');

	const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="Pulling_Plan_Template.xlsx"'
		}
	});
};
