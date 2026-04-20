import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async () => {
	const today = new Date().toISOString().split('T')[0];

	const [rows]: any = await pool.execute(
		`
		SELECT 
			al.emp_id AS 'ID_No',
			e.citizen_id AS 'ID',
			IFNULL(e.emp_name, al.emp_name) AS 'Name',
			e.division AS 'Dis',
			e.section AS 'Section',
			e.emp_group AS 'Group',
			jp.position_name AS 'Position',
			e.project AS 'Project',
			al.work_date,
			al.scan_in_time,
			al.scan_out_time,
			al.status,
			al.is_late
		FROM attendance_logs al
		LEFT JOIN employees e ON al.emp_id = e.emp_id
		LEFT JOIN job_positions jp ON e.position_id = jp.id
		WHERE al.work_date = ?
		ORDER BY al.scan_in_time ASC
	`,
		[today]
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
			time_in: row.scan_in_time ? new Date(row.scan_in_time).toLocaleTimeString('th-TH') : '-',
			time_out: row.scan_out_time ? new Date(row.scan_out_time).toLocaleTimeString('th-TH') : '-',
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
