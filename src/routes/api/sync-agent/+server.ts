import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export async function POST({ request }) {
	try {
		const body = await request.json();

		if (body.secret_key !== 'bize_core.freedomsoft.in.th') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { ip, data } = body;
		if (!ip) {
			return json({ error: 'Missing IP address' }, { status: 400 });
		}

		const nowLocal = new Date();
		const bkkTimeSync = new Date(nowLocal.getTime() + 7 * 60 * 60 * 1000);
		const y_bkk = bkkTimeSync.getUTCFullYear();
		const m_bkk = String(bkkTimeSync.getUTCMonth() + 1).padStart(2, '0');
		const d_bkk = String(bkkTimeSync.getUTCDate()).padStart(2, '0');
		const h_bkk = String(bkkTimeSync.getUTCHours()).padStart(2, '0');
		const min_bkk = String(bkkTimeSync.getUTCMinutes()).padStart(2, '0');
		const sec_bkk = String(bkkTimeSync.getUTCSeconds()).padStart(2, '0');
		const currentThaiTime = `${y_bkk}-${m_bkk}-${d_bkk} ${h_bkk}:${min_bkk}:${sec_bkk}`;

		await pool.execute("UPDATE fingerprint_scanners SET status = 'Active' WHERE ip_address = ?", [
			ip
		]);

		if (!data || data.length === 0) {
			return json({ success: true, message: 'เครื่องออนไลน์อยู่ แต่ไม่มีข้อมูลใหม่' });
		}

		const chunkSize = 1000;
		for (let i = 0; i < data.length; i += chunkSize) {
			const chunk = data.slice(i, i + chunkSize);
			const values = chunk.map((log: any) => {
				const rawId = log.deviceUserId.toString().trim();
				let formattedTime = log.recordTime;
				if (typeof formattedTime === 'string') {
					formattedTime = formattedTime.replace('T', ' ').split('.')[0];
				}
				return [ip, rawId, formattedTime, currentThaiTime];
			});

			const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
			await pool.execute(
				`INSERT IGNORE INTO raw_attendance_logs (device_ip, raw_emp_id, scan_datetime, created_at) VALUES ${placeholders}`,
				values.flat()
			);
		}

		const bkkYesterday = new Date(bkkTimeSync.getTime() - 24 * 60 * 60 * 1000);
		const endDate = `${y_bkk}-${m_bkk}-${d_bkk}`;
		const startDate = `${bkkYesterday.getUTCFullYear()}-${String(bkkYesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(bkkYesterday.getUTCDate()).padStart(2, '0')}`;

		const processQuery = `
			INSERT INTO attendance_logs (emp_id, emp_name, work_date, shift_type, scan_in_time, scan_out_time, is_late, status, ot_hours)
			SELECT 
				base.emp_id, base.emp_name, base.logical_work_date, base.actual_shift, 
				base.scan_in, base.scan_out, 
				IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) > ADDTIME(IFNULL(sm.start_time, '07:30:00'), '00:10:00'), 1, 0) as is_late,
				'Present',
				CASE 
					WHEN sm.ot_start_time IS NOT NULL AND sm.ot_end_time <= sm.start_time THEN
						IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) < sm.ot_end_time,
							FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(sm.ot_end_time, GREATEST(TIME(base.scan_in), sm.ot_start_time))) / 60) / 30) * 0.5,
							0
						)
					ELSE
						(IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) >= '04:00:00' AND TIME(base.scan_in) < '07:30:00',
							FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF('07:30:00', GREATEST(TIME(base.scan_in), '05:30:00'))) / 60) / 30) * 0.5, 0))
						+
						(IF(base.scan_out IS NOT NULL,
							FLOOR(GREATEST(0, (TIME_TO_SEC(TIME(base.scan_out)) + IF(TIME(base.scan_out) < sm.start_time, 86400, 0) - TIME_TO_SEC(IFNULL(sm.ot_start_time, '17:10:00'))) / 60) / 30) * 0.5, 0))
				END as ot_hours
			FROM (
				SELECT 
					r_base.emp_id, r_base.emp_name, r_base.actual_shift,
					DATE(DATE_SUB(r_base.scan_datetime, INTERVAL IF(r_base.actual_shift = 'N', 12, 0) HOUR)) as logical_work_date,
					MIN(CASE WHEN r_base.actual_shift = 'N' THEN IF(TIME(r_base.scan_datetime) >= '13:00:00', r_base.scan_datetime, NULL) ELSE IF(TIME(r_base.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r_base.scan_datetime, NULL) END) as scan_in,
					MAX(CASE WHEN r_base.actual_shift = 'N' THEN IF(TIME(r_base.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r_base.scan_datetime, NULL) ELSE IF(TIME(r_base.scan_datetime) >= '13:00:00', r_base.scan_datetime, NULL) END) as scan_out
				FROM (
					SELECT e.emp_id, e.emp_name, r.scan_datetime,
						IF(TIME(r.scan_datetime) BETWEEN '00:00:00' AND '12:00:00',
							IF((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(DATE_SUB(r.scan_datetime, INTERVAL 1 DAY)) LIMIT 1) = 'N', 'N', COALESCE((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(r.scan_datetime) LIMIT 1), e.default_shift, 'D')),
							COALESCE((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(r.scan_datetime) LIMIT 1), e.default_shift, 'D')
						) as actual_shift
					FROM raw_attendance_logs r
					JOIN employees e ON (e.raw_id = r.raw_emp_id OR e.emp_id = r.raw_emp_id OR e.citizen_id = r.raw_emp_id)
					WHERE DATE(r.scan_datetime) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
				) as r_base
				GROUP BY r_base.emp_id, r_base.emp_name, logical_work_date, actual_shift
			) as base
			LEFT JOIN shift_master sm ON base.actual_shift = sm.shift_code
			ON DUPLICATE KEY UPDATE 
				shift_type = VALUES(shift_type), scan_in_time = VALUES(scan_in_time), scan_out_time = VALUES(scan_out_time),
				is_late = VALUES(is_late), ot_hours = VALUES(ot_hours), status = 'Present';
		`;

		await pool.execute(processQuery, [startDate, endDate]);

		const logMissingQuery = `
			INSERT INTO missing_scan_logs (raw_id, device_ip, latest_scan_time)
			SELECT r.raw_emp_id, MAX(r.device_ip), MAX(r.scan_datetime)
			FROM raw_attendance_logs r
			LEFT JOIN employees e ON e.raw_id = r.raw_emp_id 
			WHERE e.emp_id IS NULL AND DATE(r.scan_datetime) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
			GROUP BY r.raw_emp_id
			ON DUPLICATE KEY UPDATE latest_scan_time = GREATEST(latest_scan_time, VALUES(latest_scan_time)), device_ip = VALUES(device_ip);
		`;
		await pool.execute(logMissingQuery, [startDate, endDate]);

		return json({
			success: true,
			message: `รับข้อมูลและคำนวณเวลาจาก ${ip} จำนวน ${data.length} รายการ เรียบร้อย!`
		});
	} catch (error) {
		console.error('API Error:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
