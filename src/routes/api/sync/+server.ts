import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export async function GET() {
	// เรียกใช้ฟังก์ชันทำงานแบบ Background 
	startBackgroundSync();

	return json({
		success: true,
		message: 'สั่งรันการดูดข้อมูลเรียบร้อยแล้ว! ข้อมูลจะใช้มาตรฐานเดียวกับหน้า Dashboard'
	});
}

async function startBackgroundSync() {
	const ZKLib = (await import('node-zklib')).default;
	const ips = ['192.168.115.69', '192.168.115.70', '192.168.115.71'];
	//const ips = ['192.168.116.80'];
	
	// สำหรับ Auto Sync จะดึงข้อมูลย้อนหลัง 1 วัน จนถึง วันปัจจุบัน เพื่อให้ชัวร์ว่ากะดึกเลิกงานตอนเช้าจะถูกเก็บครบ
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

				// คัดกรองเฉพาะวันที่ต้องการ (เมื่อวาน กับ วันนี้)
				const filteredLogs = logs.data.filter((log: any) => {
					const d = new Date(log.recordTime);
					const logDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
					return logDateStr >= startDate && logDateStr <= endDate;
				});

				if (filteredLogs.length > 0) {
					const chunkSize = 1000;
					for (let i = 0; i < filteredLogs.length; i += chunkSize) {
						const chunk = filteredLogs.slice(i, i + chunkSize);
						
						// แปลง Raw ID เป็นรหัสพนักงาน (emp_id) จริง ก่อนนำลง DB
						const values = chunk.map((log: any) => {
							const rawId = log.deviceUserId.toString().trim();
							const mappedEmpId = empMap.get(rawId) || rawId; 
							return [ip, mappedEmpId, log.recordTime];
						});

						const placeholders = values.map(() => '(?, ?, ?)').join(', ');

						// โยนเข้าตารางพัก (raw_attendance_logs)
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

		console.log(`\n[AutoSync] กวาดข้อมูลลง raw_logs เรียบร้อย เริ่มคำนวณเข้าตารางจริงด้วย Standard Query...`);

		// ⭐️ 1. ใช้ Query มาตรฐานเดียวกับหน้า Dashboard (แก้ปัญหากะดึก + จำแนกช่วงเวลา In/Out 100%)
		const processQuery = `
			INSERT INTO attendance_logs (emp_id, emp_name, work_date, shift_type, scan_in_time, scan_out_time, is_late, status, ot_hours)
			SELECT 
				base.emp_id, 
				base.emp_name, 
				base.logical_work_date, 
				base.shift_type, 
				base.scan_in, 
				base.scan_out, 
				
				-- ⭐️ เกณฑ์การมาสาย วัดจาก scan_in 
				IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) > ADDTIME(IFNULL(sm.start_time, '07:30:00'), '00:10:00'), 1, 0) as is_late,
				
				'Present' as status,
				
				-- ⭐️ คำนวณ OT วัดจาก scan_out
				IF(base.scan_out IS NOT NULL, 
					FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(TIME(base.scan_out), IFNULL(sm.ot_start_time, '17:10:00'))) / 60) / 30) * 0.5, 
					0
				) as ot_hours
			FROM (
				SELECT 
					e.emp_id, 
					e.emp_name, 
					
					-- ปรับวันที่ให้กะดึก (ดึงถอยหลัง 12 ชม.) เพื่อให้เลิกงานตอนเช้าจัดอยู่ในวันเดียวกับตอนเข้า
					DATE(DATE_SUB(r.scan_datetime, INTERVAL IF(IFNULL(e.default_shift, 'D') = 'N', 12, 0) HOUR)) as logical_work_date,
					
					IFNULL(e.default_shift, 'D') as shift_type,
					
					-- ⭐️ Time In: 
					-- กะปกติ 01:00 ถึง 12:59 | กะ N 13:00 ถึง 23:59
					MIN(
						CASE 
							WHEN IFNULL(e.default_shift, 'D') = 'N' THEN 
								IF(TIME(r.scan_datetime) >= '13:00:00', r.scan_datetime, NULL)
							ELSE 
								IF(TIME(r.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r.scan_datetime, NULL)
						END
					) as scan_in,
					
					-- ⭐️ Time Out: 
					-- กะปกติ 13:00 ขึ้นไป | กะ N 01:00 ถึง 12:59 ของวันถัดไป
					MAX(
						CASE 
							WHEN IFNULL(e.default_shift, 'D') = 'N' THEN 
								IF(TIME(r.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r.scan_datetime, NULL)
							ELSE 
								IF(TIME(r.scan_datetime) >= '13:00:00', r.scan_datetime, NULL)
						END
					) as scan_out

				FROM raw_attendance_logs r
				JOIN employees e ON e.emp_id = r.raw_emp_id 
				WHERE DATE(r.scan_datetime) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) 
				GROUP BY e.emp_id, e.emp_name, logical_work_date, shift_type
			) as base
			LEFT JOIN shift_master sm ON base.shift_type = sm.shift_code
			
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

		// ⭐️ 2. ค้นหาและบันทึก Log รหัสพนักงานที่สแกนนิ้ว แต่ไม่มีรายชื่ออยู่ใน Master (employees)
		const logMissingQuery = `
			INSERT INTO missing_scan_logs (raw_id, device_ip, latest_scan_time)
			SELECT 
				r.raw_emp_id, 
				MAX(r.device_ip) as device_ip, 
				MAX(r.scan_datetime) as latest_scan_time
			FROM raw_attendance_logs r
			LEFT JOIN employees e ON e.emp_id = r.raw_emp_id 
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