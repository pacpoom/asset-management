import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export async function GET() {
	const [rows]: any = await pool.execute(`
        SELECT DISTINCT r.raw_emp_id, r.device_ip
        FROM raw_attendance_logs r
        LEFT JOIN employees e ON e.emp_id LIKE CONCAT('%', r.raw_emp_id)
        WHERE e.emp_id IS NULL
    `);

	return json({
		message: 'รหัสพนักงานเหล่านี้มีประวัติสแกนแต่ยังไม่มีชื่อใน Master',
		missing_ids: rows
	});
}
