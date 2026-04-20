import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ url }) => {
	const month = url.searchParams.get('month');
	const year = url.searchParams.get('year');
	const search = url.searchParams.get('search') || '';

	let query = `
		SELECT 
			al.work_date,
			al.emp_id AS 'ID_No',
			IFNULL(e.emp_name, al.emp_name) AS 'Name',
			IFNULL(e.division, '-') AS 'Dis',
			IFNULL(e.section, '-') AS 'Section',
			IFNULL(e.emp_group, '-') AS 'Group',
			IFNULL(jp.position_name, '-') AS 'Position',
			al.shift_type AS 'Shift',
			al.scan_in_time,
			al.scan_out_time,
			al.ot_hours AS 'OT',
			al.status,
			al.is_late
		FROM attendance_logs al
		LEFT JOIN employees e ON al.emp_id = e.emp_id
		LEFT JOIN job_positions jp ON e.position_id = jp.id
		WHERE MONTH(al.work_date) = ? AND YEAR(al.work_date) = ?
	`;
	const params: any[] = [month, year];

	if (search) {
		query += ` AND (al.emp_id LIKE ? OR IFNULL(e.emp_name, al.emp_name) LIKE ?)`;
		const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
		params.push(searchPattern, searchPattern);
	}
	query += ` ORDER BY al.work_date ASC, al.scan_in_time ASC`;

	const [rows]: any = await pool.execute(query, params);

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet(`Attendance_${year}_${month}`);

	worksheet.columns = [
		{ header: 'Date', key: 'date', width: 15 },
		{ header: 'ID No.', key: 'id_no', width: 15 },
		{ header: 'Name', key: 'name', width: 25 },
		{ header: 'Dis.', key: 'dis', width: 10 },
		{ header: 'Section', key: 'section', width: 20 },
		{ header: 'Position', key: 'position', width: 20 },
		{ header: 'Shift', key: 'shift', width: 10 },
		{ header: 'Time In', key: 'time_in', width: 15 },
		{ header: 'Time Out', key: 'time_out', width: 15 },
		{ header: 'OT (Hrs)', key: 'ot', width: 10 },
		{ header: 'Status', key: 'status', width: 12 }
	];

	rows.forEach((row: any) => {
		worksheet.addRow({
			date: row.work_date ? new Date(row.work_date).toLocaleDateString('en-GB') : '-',
			id_no: row.ID_No || '-',
			name: row.Name || '-',
			dis: row.Dis || '-',
			section: row.Section || '-',
			position: row.Position || '-',
			shift: row.Shift === 'Day' ? 'เช้า' : row.Shift === 'Night' ? 'ดึก' : '-',
			time_in: row.scan_in_time ? new Date(row.scan_in_time).toLocaleTimeString('th-TH') : '-',
			time_out: row.scan_out_time ? new Date(row.scan_out_time).toLocaleTimeString('th-TH') : '-',
			ot: row.OT > 0 ? row.OT : '-',
			status:
				row.status === 'Present' && row.is_late === 1
					? 'สาย'
					: row.status === 'Present'
						? 'ปกติ'
						: 'ขาด'
		});
	});

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Attendance_${year}_${month}.xlsx"`
		}
	});
};
