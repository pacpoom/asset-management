import type { RequestHandler } from './$types';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async () => {
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Employee_Master');

	worksheet.columns = [
		{ header: 'Subcontract', key: 'subcontractor', width: 15 },
		{ header: 'ID No.', key: 'emp_id', width: 15 },
		{ header: 'ID', key: 'citizen_id', width: 20 },
		{ header: 'Name', key: 'emp_name', width: 30 },
		{ header: 'วันเริ่มงาน TC', key: 'start_date', width: 15 },
		{ header: 'Start IH', key: 'start_ih', width: 15 },
		{ header: 'อายุงาน', key: 'tenure', width: 15 },
		{ header: 'Dis.', key: 'division', width: 10 },
		{ header: 'Section', key: 'section', width: 20 },
		{ header: 'Group', key: 'emp_group', width: 20 },
		{ header: 'Position', key: 'position_name', width: 20 },
		{ header: 'Project', key: 'project', width: 20 }
	];

	worksheet.views = [{ state: 'frozen', ySplit: 1 }];
	const headerRow = worksheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFE0F7FA' }
	};

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Employee_Master_Template.xlsx"`
		}
	});
};
