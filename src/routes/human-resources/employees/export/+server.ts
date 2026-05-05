import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async () => {
	const [rows]: any = await pool.execute(`
		SELECT 
			e.employee_type,
			e.default_shift,
			e.subcontractor,
			e.emp_id,
			e.citizen_id,
			e.emp_name,
			e.start_date,
			e.phone_number,
			e.division,
			e.section,
			e.emp_group,
			jp.position_name,
			e.project
		FROM employees e
		LEFT JOIN job_positions jp ON e.position_id = jp.id
		ORDER BY e.emp_id ASC
	`);

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Employee_Master');

	worksheet.columns = [
		{ header: 'Employee Type', key: 'employee_type', width: 15 },
		{ header: 'Default Shift', key: 'default_shift', width: 15 },
		{ header: 'Subcontract', key: 'subcontractor', width: 15 },
		{ header: 'ID No.', key: 'emp_id', width: 15 },
		{ header: 'ID', key: 'citizen_id', width: 20 },
		{ header: 'Name', key: 'emp_name', width: 30 },
		{ header: 'Start Date', key: 'start_date', width: 15 },
		{ header: 'Phone Number', key: 'phone_number', width: 15 },
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

	rows.forEach((row: any) => {
		worksheet.addRow({
			employee_type: row.employee_type || '-',
			default_shift: row.default_shift || '-',
			subcontractor: row.subcontractor || '-',
			emp_id: row.emp_id || '-',
			citizen_id: row.citizen_id || '-',
			emp_name: row.emp_name || '-',
			start_date: row.start_date ? new Date(row.start_date).toLocaleDateString('en-GB') : '-',
			phone_number: row.phone_number || '-',
			division: row.division || '-',
			section: row.section || '-',
			emp_group: row.emp_group || '-',
			position_name: row.position_name || '-',
			project: row.project || '-'
		});
	});

	const today = new Date().toISOString().split('T')[0];
	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Employee_Master_${today}.xlsx"` // เปลี่ยนชื่อไฟล์ให้มีวันที่
		}
	});
};
