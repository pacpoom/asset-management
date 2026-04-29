import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export async function GET() {
	startBackgroundSync();

	return json({
		success: true,
		message:
			'สั่งรันการดูดข้อมูลเรียบร้อยแล้ว! กรุณาเปิดดูความคืบหน้าในหน้าจอ Terminal ของ VS Code ครับ'
	});
}

async function startBackgroundSync() {
	const ZKLib = (await import('node-zklib')).default;
	const ips = ['192.168.115.69', '192.168.115.70', '192.168.115.71'];

	try {
		console.log('กำลังเตรียมข้อมูลพนักงาน (Caching)...');
		const [employeesRows]: any = await pool.execute(
			'SELECT emp_id, citizen_id, emp_name FROM employees'
		);
		const empMap = new Map();
		employeesRows.forEach((e: any) => {
			if (e.citizen_id) empMap.set(e.citizen_id, e);
			empMap.set(e.emp_id, e);

			if (e.emp_id) {
				const numericOnly = e.emp_id.replace(/\D/g, '');
				if (numericOnly) {
					empMap.set(numericOnly, e);
				}
			}
		});
		console.log(`โหลดข้อมูลพนักงานสำเร็จ ${empMap.size} รหัส`);

		for (const ip of ips) {
			const zkInstance = new ZKLib(ip, 4370, 120000, 4000);

			try {
				await zkInstance.createSocket();
				console.log(`\n========================================`);
				console.log(`เชื่อมต่อเครื่อง [${ip}] สำเร็จ! กำลังดูดข้อมูล...`);

				const logs = await zkInstance.getAttendances();

				if (!logs.data || logs.data.length === 0) {
					console.log(`⏭ [${ip}] ไม่มีข้อมูลในเครื่อง ข้าม!`);
					await zkInstance.disconnect();
					continue;
				}

				console.log(
					`ดึงข้อมูลดิบจากเครื่อง [${ip}] สำเร็จ ${logs.data.length} รายการ. เริ่มกระบวนการคัดกรอง...`
				);

				const validLogs = [];
				for (const log of logs.data) {
					const raw_id = log.deviceUserId?.toString().trim();

					if (validLogs.length < 5) {
						console.log(`เครื่องสแกนส่งรหัส: "${raw_id}"`);
					}

					const emp = empMap.get(raw_id);
					if (!emp) continue;

					const recordDate = new Date(log.recordTime);
					const work_date = recordDate.toISOString().split('T')[0];
					const timeInStr = recordDate.toLocaleTimeString('th-TH', {
						hour12: false,
						hour: '2-digit',
						minute: '2-digit'
					});
					const scanInDateTime = `${work_date} ${timeInStr}:00`;
					const inMins = recordDate.getHours() * 60 + recordDate.getMinutes();
					const shiftType = 'Day';
					const isLate = inMins > 460 ? 1 : 0;

					validLogs.push([
						emp.emp_id,
						emp.emp_name,
						work_date,
						shiftType,
						scanInDateTime,
						isLate,
						'Present'
					]);
				}

				console.log(
					`คัดกรองข้อมูลรหัสตรงกันได้ ${validLogs.length} รายการ. กำลังเริ่มบันทึกลง Database ทีละ 1,000 แถว...`
				);

				const chunkSize = 1000;
				for (let i = 0; i < validLogs.length; i += chunkSize) {
					const chunk = validLogs.slice(i, i + chunkSize);

					const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
					const flatValues = chunk.flat();

					const query = `
						INSERT INTO attendance_logs (emp_id, emp_name, work_date, shift_type, scan_in_time, is_late, status)
						VALUES ${placeholders}
						ON DUPLICATE KEY UPDATE 
						scan_out_time = CASE
							WHEN VALUES(scan_in_time) > scan_in_time THEN 
								IF(scan_out_time IS NULL, VALUES(scan_in_time), GREATEST(scan_out_time, VALUES(scan_in_time)))
							WHEN VALUES(scan_in_time) < scan_in_time THEN 
								IF(scan_out_time IS NULL, scan_in_time, GREATEST(scan_out_time, scan_in_time))
							ELSE scan_out_time
						END,
						-- เช็คเวลาเข้า (Time In): ถ้าเวลาสแกนใหม่เช้ากว่าเวลาเข้าเดิม ให้อัปเดตเวลาเข้าใหม่
						scan_in_time = CASE
							WHEN VALUES(scan_in_time) < scan_in_time THEN VALUES(scan_in_time)
							ELSE scan_in_time
						END,
						status = 'Present'
					`;

					await pool.execute(query, flatValues);
					console.log(
						` บันทึกแล้ว: ${Math.min(i + chunkSize, validLogs.length)} / ${validLogs.length} รายการ`
					);
				}

				await zkInstance.disconnect();
				console.log(`เครื่อง [${ip}] บันทึกเสร็จสมบูรณ์!`);
			} catch (error) {
				console.error(`เกิดข้อผิดพลาดกับเครื่อง ${ip}:`, error);
			}
		}

		console.log(`\nการดึงข้อมูลสแกนนิ้วครบทั้ง 3 เครื่องเสร็จสมบูรณ์แล้ว`);
	} catch (err) {
		console.error('error in background sync:', err);
	}
}
