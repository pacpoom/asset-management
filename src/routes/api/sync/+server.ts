import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export async function GET() {
	startBackgroundSync();

	return json({
		success: true,
		message: 'สั่งรันการดูดข้อมูลเรียบร้อยแล้ว! ข้อมูลจะใช้มาตรฐานเดียวกับหน้า Dashboard'
	});
}

async function startBackgroundSync() {
	const ZKLib = (await import('node-zklib')).default;

	const [scannerRows]: any = await pool.execute(
		"SELECT ip_address FROM fingerprint_scanners WHERE status = 'Active'"
	);
	const ips = scannerRows.map((row: any) => row.ip_address);

	if (ips.length === 0) {
		console.log('[AutoSync] ไม่พบเครื่องสแกนที่เปิดใช้งานอยู่ในระบบ');
		return;
	}

	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const endDate = today.toISOString().split('T')[0];
	const startDate = yesterday.toISOString().split('T')[0];

	try {
		console.log('กำลังเตรียมข้อมูลพนักงาน (Caching)...');
		const [empRows]: any = await pool.execute('SELECT emp_id, citizen_id, raw_id FROM employees');
		const empMap = new Map();

		empRows.forEach((e: any) => {
			if (e.citizen_id) empMap.set(e.citizen_id, e.emp_id);
			if (e.raw_id) empMap.set(e.raw_id, e.emp_id);
			empMap.set(e.emp_id, e.emp_id);
			const numericOnly = e.emp_id.replace(/\D/g, '');
			if (numericOnly) empMap.set(numericOnly, e.emp_id);
		});

		let totalImported = 0;

		for (const ip of ips) {
			const zkInstance = new ZKLib(ip, 4370, 120000, 4000);

			try {
				await zkInstance.createSocket();
				console.log(`[AutoSync] เชื่อมต่อเครื่อง [${ip}] สำเร็จ! กำลังดึงข้อมูล...`);

				const logs = await zkInstance.getAttendances();

				if (!logs.data || logs.data.length === 0) {
					console.log(`[AutoSync] ⏭ [${ip}] ไม่มีข้อมูลในเครื่อง ข้าม!`);
					await zkInstance.disconnect();
					continue;
				}

				const filteredLogs = logs.data.filter((log: any) => {
					const d = new Date(log.recordTime);
					const logDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
					return logDateStr >= startDate && logDateStr <= endDate;
				});

				if (filteredLogs.length > 0) {
					const chunkSize = 1000;
					for (let i = 0; i < filteredLogs.length; i += chunkSize) {
						const chunk = filteredLogs.slice(i, i + chunkSize);

						const values = chunk.map((log: any) => {
							const rawId = log.deviceUserId.toString().trim();
							return [ip, rawId, log.recordTime];
						});

						const placeholders = values.map(() => '(?, ?, ?)').join(', ');
						await pool.execute(
							`INSERT IGNORE INTO raw_attendance_logs (device_ip, raw_emp_id, scan_datetime) VALUES ${placeholders}`,
							values.flat()
						);
					}
					totalImported += filteredLogs.length;
					console.log(`[AutoSync] ดึงข้อมูลดิบจาก [${ip}] สำเร็จ ${filteredLogs.length} รายการ.`);
				}

				await zkInstance.disconnect();
			} catch (error) {
				console.error(`[AutoSync] เกิดข้อผิดพลาดกับเครื่อง ${ip}:`, error);
			}
		}

		console.log(
			`\n[AutoSync] กวาดข้อมูลลง raw_logs เรียบร้อย เริ่มคำนวณเข้าตารางจริงด้วย Standard Query...`
		);

		const processQuery = `
				INSERT INTO attendance_logs (emp_id, emp_name, work_date, shift_type, scan_in_time, scan_out_time, is_late, status, ot_hours)
				SELECT 
					base.emp_id, 
					base.emp_name, 
					base.logical_work_date, 
					base.actual_shift as shift_type, 
					base.scan_in, 
					base.scan_out, 
					
					IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) > ADDTIME(IFNULL(sm.start_time, '07:30:00'), '00:10:00'), 1, 0) as is_late,
					
					'Present' as status,
					
					/* คำนวณ OT */
					CASE 
						/* กะดึก (N) */
						WHEN sm.ot_start_time IS NOT NULL AND sm.ot_end_time <= sm.start_time THEN
							IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) < sm.ot_end_time,
								FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(sm.ot_end_time, GREATEST(TIME(base.scan_in), sm.ot_start_time))) / 60) / 30) * 0.5,
								0
							)
							
						/* กะเช้า (D) */
						ELSE
							(
								/* OT เช้ามืด */
								IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) >= '04:00:00' AND TIME(base.scan_in) < '07:30:00',
									FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF('07:30:00', GREATEST(TIME(base.scan_in), '05:30:00'))) / 60) / 30) * 0.5,
									0
								)
							)
							+
							(
								/* OT เย็นหลังเลิกงาน */
								IF(base.scan_out IS NOT NULL,
									FLOOR(GREATEST(0, 
										(
											TIME_TO_SEC(TIME(base.scan_out)) 
											+ IF(TIME(base.scan_out) < sm.start_time, 86400, 0) /* เผื่อทำโอทีทะลุเที่ยงคืน */
											- TIME_TO_SEC(IFNULL(sm.ot_start_time, '17:10:00'))
										) / 60
									) / 30) * 0.5,
									0
								)
							)
					END as ot_hours
					
				FROM (
					SELECT 
						r_base.emp_id,
						r_base.emp_name,
						r_base.actual_shift,
						
						DATE(DATE_SUB(r_base.scan_datetime, INTERVAL IF(r_base.actual_shift = 'N', 12, 0) HOUR)) as logical_work_date,
						
						MIN(
							CASE 
								WHEN r_base.actual_shift = 'N' THEN 
									IF(TIME(r_base.scan_datetime) >= '13:00:00', r_base.scan_datetime, NULL)
								ELSE 
									IF(TIME(r_base.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r_base.scan_datetime, NULL)
							END
						) as scan_in,
						
						MAX(
							CASE 
								WHEN r_base.actual_shift = 'N' THEN 
									IF(TIME(r_base.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r_base.scan_datetime, NULL)
								ELSE 
									IF(TIME(r_base.scan_datetime) >= '13:00:00', r_base.scan_datetime, NULL)
							END
						) as scan_out
						
					FROM (
						SELECT 
							e.emp_id, e.emp_name, r.scan_datetime,

							IF(TIME(r.scan_datetime) BETWEEN '00:00:00' AND '12:00:00',
								IF(
									(SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(DATE_SUB(r.scan_datetime, INTERVAL 1 DAY)) LIMIT 1) = 'N',
									'N',
									COALESCE((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(r.scan_datetime) LIMIT 1), e.default_shift, 'D')
								),
								COALESCE((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(r.scan_datetime) LIMIT 1), e.default_shift, 'D')
							) as actual_shift
							
						FROM raw_attendance_logs r
						JOIN employees e ON e.raw_id = r.raw_emp_id
						WHERE DATE(r.scan_datetime) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
					) as r_base
					GROUP BY r_base.emp_id, r_base.emp_name, logical_work_date, actual_shift
				) as base
				LEFT JOIN shift_master sm ON base.actual_shift = sm.shift_code
				
				ON DUPLICATE KEY UPDATE 
					shift_type = VALUES(shift_type),
					scan_in_time = VALUES(scan_in_time),
					scan_out_time = VALUES(scan_out_time),
					is_late = VALUES(is_late),
					ot_hours = VALUES(ot_hours),
					status = 'Present';
			`;

		await pool.execute(processQuery, [startDate, endDate]);
		console.log(`[AutoSync] คำนวณเวลาเข้าออกและ OT เรียบร้อยทั้งหมด`);

		const logMissingQuery = `
			INSERT INTO missing_scan_logs (raw_id, device_ip, latest_scan_time)
			SELECT 
				r.raw_emp_id, 
				MAX(r.device_ip) as device_ip, 
				MAX(r.scan_datetime) as latest_scan_time
			FROM raw_attendance_logs r
			LEFT JOIN employees e ON e.raw_id = r.raw_emp_id 
			WHERE e.emp_id IS NULL 
			  AND DATE(r.scan_datetime) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
			GROUP BY r.raw_emp_id
			ON DUPLICATE KEY UPDATE 
				latest_scan_time = GREATEST(latest_scan_time, VALUES(latest_scan_time)),
				device_ip = VALUES(device_ip);
		`;

		await pool.execute(logMissingQuery, [startDate, endDate]);
		console.log(`[AutoSync] ตรวจสอบและอัปเดต Log รหัสที่ไม่มีในระบบเสร็จสิ้น`);
	} catch (err) {
		console.error('[AutoSync] Error in background sync:', err);
	}
}
