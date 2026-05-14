import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';

interface LocalUser {
	id?: number;
	role?: string;
	department_id?: number | null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user as LocalUser;
	if (!user) return new Response('Unauthorized', { status: 401 });

	let query = `
        SELECT 
            e.employee_type,
            e.default_shift,
            e.subcontractor,
            e.emp_id,
            e.raw_id,
            e.citizen_id,
            e.emp_name,
            d.name as department_name, 
            e.start_date,
            e.phone_number,
            e.division,
            e.section,
            e.emp_group,
            jp.position_name,
            e.project,
            e.status 
        FROM employees e
        LEFT JOIN job_positions jp ON e.position_id = jp.id
        LEFT JOIN departments d ON e.department_id = d.id 
        WHERE 1=1
    `;

	const params: any[] = [];
	if (user.role !== 'admin' && user.department_id) {
		query += ' AND e.department_id = ?';
		params.push(user.department_id);
	}

	query += ' ORDER BY e.emp_id ASC';

	const [rows]: any = await pool.execute(query, params);

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Employee_Master');

	worksheet.columns = [
		{ header: 'Employee Type', key: 'employee_type', width: 15 },
		{ header: 'Default Shift', key: 'default_shift', width: 15 },
		{ header: 'Subcontract', key: 'subcontractor', width: 15 },
		{ header: 'ID No.', key: 'emp_id', width: 15 },
		{ header: 'Raw ID', key: 'raw_id', width: 12 },
		{ header: 'รหัสเครื่องสแกน', key: 'scan_id', width: 15 },
		{ header: 'ID', key: 'citizen_id', width: 20 },
		{ header: 'Name', key: 'emp_name', width: 30 },
		{ header: 'Department', key: 'department_name', width: 20 },
		{ header: 'Start Date', key: 'start_date', width: 15 },
		{ header: 'Phone Number', key: 'phone_number', width: 15 },
		{ header: 'Dis.', key: 'division', width: 10 },
		{ header: 'Section', key: 'section', width: 20 },
		{ header: 'Group', key: 'emp_group', width: 20 },
		{ header: 'Position', key: 'position_name', width: 20 },
		{ header: 'Project', key: 'project', width: 20 },
		{ header: 'Status', key: 'status', width: 15 }
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
			raw_id: row.raw_id || '-',
			scan_id: row.raw_id || '-',
			citizen_id: row.citizen_id || '-',
			emp_name: row.emp_name || '-',
			department_name: row.department_name || '-',
			start_date: row.start_date ? new Date(row.start_date).toLocaleDateString('en-GB') : '-',
			phone_number: row.phone_number || '-',
			division: row.division || '-',
			section: row.section || '-',
			emp_group: row.emp_group || '-',
			position_name: row.position_name || '-',
			project: row.project || '-',
			status: row.status || '-'
		});
	});

	const today = new Date().toISOString().split('T')[0];
	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Employee_Master_${today}.xlsx"`
		}
	});
};
