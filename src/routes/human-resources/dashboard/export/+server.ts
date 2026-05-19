import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async () => {
	const today = new Date().toISOString().split('T')[0];

	const [rows]: any = await pool.execute(
		`
		SELECT 
			e.emp_id AS 'ID_No',
			e.citizen_id AS 'ID',
			e.emp_name AS 'Name',
			IFNULL(e.division, '-') AS 'Dis',
			IFNULL(e.section, '-') AS 'Section',
			IFNULL(e.emp_group, '-') AS 'Group',
			IFNULL(jp.position_name, '-') AS 'Position',
			IFNULL(e.project, '-') AS 'Project',
			? AS 'work_date',
			DATE_FORMAT(al.scan_in_time, '%H:%i:%s') as time_in_str,
			DATE_FORMAT(al.scan_out_time, '%H:%i:%s') as time_out_str,
			CASE 
				WHEN al.status IS NULL AND (e.default_shift = 'N' OR e.default_shift = 'Night') THEN 'Night shift'
				ELSE IFNULL(al.status, 'Absent') 
			END AS 'status',
			IFNULL(al.is_late, 0) AS 'is_late'
		FROM employees e
		LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
		LEFT JOIN job_positions jp ON e.position_id = jp.id
		WHERE e.status != 'Resigned'
		ORDER BY al.scan_in_time ASC, e.emp_id ASC
	`,
		[today, today]
	);

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Attendance ' + today);

	worksheet.columns = [
		{ header: 'ID No.', key: 'id_no', width: 15 },
		{ header: 'ID', key: 'id', width: 20 },
		{ header: 'Name', key: 'name', width: 25 },
		{ header: 'Dis.', key: 'dis', width: 10 },
		{ header: 'Section', key: 'section', width: 20 },
		{ header: 'Group', key: 'group', width: 20 },
		{ header: 'Position', key: 'position', width: 20 },
		{ header: 'Project', key: 'project', width: 20 },
		{ header: 'Date', key: 'date', width: 15 },
		{ header: 'Time In', key: 'time_in', width: 15 },
		{ header: 'Time Out', key: 'time_out', width: 15 },
		{ header: 'Status', key: 'status', width: 12 },
		{ header: 'Late', key: 'late', width: 10 }
	];

	rows.forEach((row: any) => {
		worksheet.addRow({
			id_no: row.ID_No || '-',
			id: row.ID || '-',
			name: row.Name || '-',
			dis: row.Dis || '-',
			section: row.Section || '-',
			group: row.Group || '-',
			position: row.Position || '-',
			project: row.Project || '-',
			date: row.work_date ? new Date(row.work_date).toLocaleDateString('en-GB') : '-',
			time_in: row.time_in_str || '-',
			time_out: row.time_out_str || '-',
			status: row.status,
			late: row.is_late ? 'สาย' : 'ปกติ'
		});
	});

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="workforce_daily_${today}.xlsx"`
		}
	});
};
