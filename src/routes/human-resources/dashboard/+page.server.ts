import ExcelJS from 'exceljs';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';

interface LocalUser {
	id?: number;
	role?: string;
	username?: string;
	email?: string;
	department_id?: number | null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	let displayDate = url.searchParams.get('date');
	if (!displayDate) {
		const todayObj = new Date();
		const offset = todayObj.getTimezoneOffset() * 60000;
		displayDate = new Date(todayObj.getTime() - offset).toISOString().split('T')[0];
	}

	const search = url.searchParams.get('search') || '';
	const statusFilter = url.searchParams.get('status') || 'All';
	const sectionFilter = url.searchParams.get('section') || 'All';
	const groupFilter = url.searchParams.get('group') || 'All';

	try {
		const [currentUserRows]: any = await pool.execute(
			'SELECT department_id FROM users WHERE id = ? LIMIT 1',
			[locals.user?.id || 0]
		);
		const actualDeptId = currentUserRows.length > 0 ? currentUserRows[0].department_id : 0;

		const user = locals.user as LocalUser;
		const isSuperAdmin =
			user?.role === 'admin' &&
			(user?.username === 'admin' ||
				user?.email?.startsWith('admin') ||
				user?.id === 1 ||
				user?.id === 2);

		let securityWhere = '';
		let securityParams: any[] = [];
		if (!isSuperAdmin) {
			securityWhere = ' AND e.department_id = ?';
			securityParams.push(actualDeptId);
		}

		const [sectionsRows]: any = await pool.execute(
			`SELECT DISTINCT section FROM employees e WHERE section IS NOT NULL AND section != '-' ${securityWhere} ORDER BY section`,
			securityParams
		);
		const [groupsRows]: any = await pool.execute(
			`SELECT DISTINCT emp_group FROM employees e WHERE emp_group IS NOT NULL AND emp_group != '-' ${securityWhere} ORDER BY emp_group`,
			securityParams
		);

		let empWhere = '';
		let filterParams: any[] = [];

		if (sectionFilter !== 'All') {
			empWhere += ` AND e.section = ?`;
			filterParams.push(sectionFilter);
		}
		if (groupFilter !== 'All') {
			empWhere += ` AND e.emp_group = ?`;
			filterParams.push(groupFilter);
		}

		const summaryQuery = `
			SELECT 
				IFNULL(e.section, '-') as section,
				IFNULL(e.emp_group, '-') as emp_group,
				COUNT(e.emp_id) as active_emp,
				SUM(CASE WHEN al.status IN ('Present', 'Late') OR al.scan_in_time IS NOT NULL THEN 1 ELSE 0 END) as attendance
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			WHERE e.section IS NOT NULL AND e.section != '-' ${securityWhere} ${empWhere}
			GROUP BY e.section, e.emp_group
			ORDER BY e.section ASC, e.emp_group ASC
		`;
		const [departmentSummary]: any = await pool.execute(summaryQuery, [
			displayDate,
			...securityParams,
			...filterParams
		]);

		const processedSummary = departmentSummary.map((row: any) => {
			const percent = row.active_emp > 0 ? Math.round((row.attendance / row.active_emp) * 100) : 0;
			return { ...row, percent_att: percent };
		});

		let logQuery = `
			SELECT 
				al.emp_id, 
				IFNULL(e.emp_name, al.emp_name) as name, 
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
				al.status,
				IFNULL(e.division, '-') as dis,
				IFNULL(e.section, '-') as section,
				IFNULL(e.emp_group, '-') as emp_group,
				IFNULL(jp.position_name, '-') as position,
				al.is_late
			FROM attendance_logs al
			INNER JOIN employees e ON al.emp_id = e.emp_id
			LEFT JOIN job_positions jp ON e.position_id = jp.id
			WHERE al.work_date = ? ${securityWhere} ${empWhere}
		`;
		const logParams: any[] = [displayDate, ...securityParams, ...filterParams];

		if (search) {
			logQuery += ` AND (al.emp_id LIKE ? OR e.emp_name LIKE ? OR e.section LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			logParams.push(searchPattern, searchPattern, searchPattern);
		}
		if (statusFilter !== 'All') {
			logQuery += ` AND al.status = ?`;
			logParams.push(statusFilter);
		}
		logQuery += ` ORDER BY al.scan_in_time DESC`;

		const [recentLogs]: any = await pool.execute(logQuery, logParams);

		const statsQuery = `
			SELECT 
				(SELECT COUNT(emp_id) FROM employees e WHERE status != 'Resigned' ${securityWhere} ${empWhere}) as total_plan, 
				
				COUNT(DISTINCT al.emp_id) as total_scanned, 
				SUM(CASE WHEN al.is_late = 1 THEN 1 ELSE 0 END) as late,
				
				(SELECT COUNT(emp_id) FROM employees e WHERE status != 'Resigned' ${securityWhere} ${empWhere}) - COUNT(DISTINCT al.emp_id) as absent

			FROM attendance_logs al
			INNER JOIN employees e ON al.emp_id = e.emp_id 
			WHERE al.work_date = ? ${securityWhere} ${empWhere}
		`;

		const [statsRow]: any = await pool.execute(statsQuery, [
			...securityParams,
			...filterParams,
			...securityParams,
			...filterParams,
			displayDate,
			...securityParams,
			...filterParams
		]);

		let scannerQuery = `
			SELECT device_name, ip_address, status, DATE_FORMAT(last_sync, '%Y-%m-%d %H:%i:%s') as last_sync 
			FROM fingerprint_scanners 
			WHERE (status = 'Active' OR status = 1)
		`;
		let scannerParams: any[] = [];

		if (!isSuperAdmin) {
			scannerQuery += ` AND (department_id IS NULL OR department_id = ?)`;
			scannerParams.push(actualDeptId);
		}
		scannerQuery += ` ORDER BY device_name ASC`;

		const [scanners]: any = await pool.execute(scannerQuery, scannerParams);

		// Employee list for the "link raw_id" dropdown in unmatched modal
		const [employeeList]: any = await pool.execute(
			`SELECT emp_id, emp_name, IFNULL(section, '-') as section, IFNULL(raw_id, '') as raw_id
			FROM employees e
			WHERE status != 'Resigned' ${securityWhere}
			ORDER BY section, emp_name`,
			securityParams
		);

		// Unmatched ZKTeco scans: raw_emp_ids that have no matching employee record
		const [unmatchedScans]: any = await pool.execute(
			`SELECT
				r.raw_emp_id,
				COUNT(*) as scan_count,
				DATE_FORMAT(MIN(r.scan_datetime), '%H:%i') as first_scan,
				DATE_FORMAT(MAX(r.scan_datetime), '%H:%i') as last_scan
			FROM raw_attendance_logs r
			WHERE DATE(r.scan_datetime) = ?
			AND NOT EXISTS (
				SELECT 1 FROM employees e
				WHERE e.raw_id = r.raw_emp_id
				OR e.emp_id = r.raw_emp_id
				OR e.citizen_id = r.raw_emp_id
			)
			GROUP BY r.raw_emp_id
			ORDER BY r.raw_emp_id`,
			[displayDate]
		);

		return {
			title: 'Workforce Dashboard',
			departmentSummary: processedSummary,
			recentLogs: recentLogs,
			statsData: statsRow[0] || { total_scanned: 0, on_time: 0, late: 0, absent: 0 },
			displayDate,
			searchQuery: search,
			statusFilter,
			scanners,
			sectionFilter,
			groupFilter,
			sections: sectionsRows.map((s: any) => s.section),
			groups: groupsRows.map((g: any) => g.emp_group),
			unmatchedScans: unmatchedScans || [],
			employeeList: employeeList || []
		};
	} catch (err) {
		console.error('Error loading dashboard data:', err);
		return {
			title: 'Workforce Dashboard',
			departmentSummary: [],
			recentLogs: [],
			statsData: { total_scanned: 0, on_time: 0, late: 0, absent: 0 },
			displayDate: displayDate,
			searchQuery: search,
			statusFilter: 'All',
			sectionFilter: 'All',
			groupFilter: 'All',
			sections: [],
			groups: [],
			unmatchedScans: [],
			employeeList: []
		};
	}
};

export const actions: Actions = {
	simulateScan: async ({ request }) => {
		const formData = await request.formData();
		const emp_id = formData.get('emp_id')?.toString();
		const scan_time = formData.get('scan_time')?.toString();
		const target_date =
			formData.get('target_date')?.toString() || new Date().toISOString().split('T')[0];

		if (!emp_id || !scan_time) {
			return { success: false, message: 'กรุณากรอกข้อมูลให้ครบ' };
		}

		const scanDateTime = `${target_date} ${scan_time}:00`;
		const isLate = scan_time > '07:40' ? 1 : 0;

		try {
			await pool.execute(
				`INSERT INTO attendance_logs (emp_id, work_date, shift_type, scan_in_time, is_late, status) 
				VALUES (?, ?, 'Day', ?, ?, 'Present')
				ON DUPLICATE KEY UPDATE scan_in_time = VALUES(scan_in_time), is_late = VALUES(is_late), status = 'Present'`,
				[emp_id, target_date, scanDateTime, isLate]
			);
			return { success: true, message: 'บันทึกการสแกนนิ้วสำเร็จ!' };
		} catch (error) {
			console.error('Error simulating scan:', error);
			return { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' };
		}
	},

	importExcel: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		if (!file || file.size === 0) return { success: false, message: 'กรุณาเลือกไฟล์ Excel' };

		try {
			const arrayBuffer = await file.arrayBuffer();
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(arrayBuffer);
			const worksheet = workbook.worksheets[0];
			let importedCount = 0;

			for (let i = 2; i <= worksheet.rowCount; i++) {
				const row = worksheet.getRow(i);
				const emp_id = row.getCell(1).value?.toString().trim();
				const citizen_id = row.getCell(2).value?.toString().trim() || null;
				const emp_name = row.getCell(3).value?.toString().trim() || null;
				const division = row.getCell(4).value?.toString().trim() || null;
				const section = row.getCell(5).value?.toString().trim() || null;
				const emp_group = row.getCell(6).value?.toString().trim() || null;
				const position_name = row.getCell(7).value?.toString().trim() || null;
				const project = row.getCell(8).value?.toString().trim() || null;

				if (emp_id) {
					let positionId = null;
					if (position_name) {
						const [posRows]: any = await pool.execute(
							'SELECT id FROM job_positions WHERE position_name = ?',
							[position_name]
						);
						if (posRows.length > 0) positionId = posRows[0].id;
						else {
							const [insertPos]: any = await pool.execute(
								'INSERT INTO job_positions (position_name, max_capacity) VALUES (?, 10)',
								[position_name]
							);
							positionId = insertPos.insertId;
						}
					}
					await pool.execute(
						`INSERT INTO employees (emp_id, citizen_id, emp_name, division, section, emp_group, position_id, project) 
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
						ON DUPLICATE KEY UPDATE citizen_id = VALUES(citizen_id), emp_name = VALUES(emp_name), division = VALUES(division),
						section = VALUES(section), emp_group = VALUES(emp_group), position_id = VALUES(position_id), project = VALUES(project)`,
						[emp_id, citizen_id, emp_name, division, section, emp_group, positionId, project]
					);
					importedCount++;
				}
			}
			return {
				success: true,
				message: `อัปเดตข้อมูลพนักงาน (Master) สำเร็จ ${importedCount} รายการ!`
			};
		} catch (error) {
			console.error('Import Error:', error);
			return { success: false, message: 'เกิดข้อผิดพลาดในการนำเข้าข้อมูลพนักงาน' };
		}
	},

	importScannerLog: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file || file.size === 0) {
			return { success: false, message: 'กรุณาเลือกไฟล์สแกนนิ้ว (CSV)' };
		}

		try {
			const text = await file.text();
			const lines = text.split('\n');
			let importedCount = 0;
			let notFoundCount = 0;

			for (let i = 1; i < lines.length; i++) {
				const line = lines[i].trim();
				if (!line) continue;

				const cols = line.split(',');
				if (cols.length < 5) continue;

				const raw_id = cols[1]?.trim();
				const dateRaw = cols[3]?.trim();
				const timeInRaw = cols[4]?.trim();
				let timeOutRaw =
					cols.length > 5 && cols[5]?.trim() !== '' ? cols[5]?.replace('\r', '')?.trim() : null;

				if (!raw_id || !dateRaw || !timeInRaw) continue;

				const dateParts = dateRaw.split('/');
				if (dateParts.length !== 3) continue;
				const work_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
				const scanInDateTime = `${work_date} ${timeInRaw}:00`;

				const [empRows]: any = await pool.execute(
					'SELECT emp_id, emp_name FROM employees WHERE raw_id = ? OR citizen_id = ? LIMIT 1',
					[raw_id, raw_id]
				);

				if (empRows.length === 0) {
					notFoundCount++;
					continue;
				}

				const emp = empRows[0];
				const timeToMins = (t: string) => {
					if (!t) return 0;
					const [h, m] = t.split(':').map(Number);
					return h * 60 + m;
				};

				const inMins = timeToMins(timeInRaw);
				let outMins = timeOutRaw ? timeToMins(timeOutRaw) : 0;

				if (timeOutRaw) {
					let diff = outMins - inMins;
					if (diff < 0) diff += 1440;

					if (diff < 60) {
						timeOutRaw = null;
						outMins = 0;
					}
				}

				let shiftType = 'Day';
				let isLate = inMins > 460 ? 1 : 0;
				let otHours = 0;

				if (inMins >= 900) {
					shiftType = 'Night';
					isLate = inMins > 1330 ? 1 : 0;
				}

				let scanOutDateTime = null;

				if (timeOutRaw) {
					if (shiftType === 'Night' && outMins < 720) {
						const tomorrowDate = new Date(new Date(work_date).getTime() + 24 * 60 * 60 * 1000);
						const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
						scanOutDateTime = `${tomorrowStr} ${timeOutRaw}:00`;
					} else {
						scanOutDateTime = `${work_date} ${timeOutRaw}:00`;
					}

					if (shiftType === 'Day' && outMins > 1030) {
						otHours = Math.floor((outMins - 1030) / 30) * 0.5;
					}
				}

				await pool.execute(
					`INSERT INTO attendance_logs (emp_id, emp_name, work_date, shift_type, scan_in_time, scan_out_time, ot_hours, is_late, status)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Present')
					ON DUPLICATE KEY UPDATE 
					scan_in_time = IF(scan_in_time IS NULL, VALUES(scan_in_time), scan_in_time),
					scan_out_time = IF(VALUES(scan_out_time) IS NOT NULL, VALUES(scan_out_time), scan_out_time),
					ot_hours = IF(VALUES(ot_hours) > 0, VALUES(ot_hours), ot_hours),
					status = 'Present'`,
					[
						emp.emp_id,
						emp.emp_name,
						work_date,
						shiftType,
						scanInDateTime,
						scanOutDateTime,
						otHours,
						isLate
					]
				);

				importedCount++;
			}

			if (importedCount > 0) {
				const warningMsg =
					notFoundCount > 0 ? ` (ข้ามรหัสที่ไม่พบในระบบ ${notFoundCount} รายการ)` : '';
				return {
					success: true,
					message: `อัปเดตเวลาเข้า-ออกสำเร็จ ${importedCount} รายการ!` + warningMsg
				};
			} else {
				return {
					success: false,
					message: `ไม่มีข้อมูลถูกอัปเดต (ไม่พบรหัสพนักงานในระบบเลย ${notFoundCount} รายการ กรุณา Import Master ก่อน)`
				};
			}
		} catch (error) {
			console.error('CSV Import Error:', error);
			return { success: false, message: 'ไฟล์ CSV ไม่ถูกต้อง หรืออ่านไม่ได้' };
		}
	},

	linkEmployee: async ({ request }) => {
		const fd = await request.formData();
		const raw_emp_id = fd.get('raw_emp_id')?.toString()?.trim();
		const emp_id = fd.get('emp_id')?.toString()?.trim();

		if (!raw_emp_id || !emp_id) {
			return fail(400, { success: false, message: 'ข้อมูลไม่ครบ' });
		}

		try {
			// ตรวจสอบว่า raw_id นี้ถูกใช้โดยพนักงานคนอื่นหรือยัง
			const [conflict]: any = await pool.execute(
				'SELECT emp_id, emp_name FROM employees WHERE raw_id = ? AND emp_id != ? LIMIT 1',
				[raw_emp_id, emp_id]
			);
			if (conflict.length > 0) {
				return fail(409, {
					success: false,
					message: `raw_id ${raw_emp_id} ถูกใช้งานโดย ${conflict[0].emp_name} (${conflict[0].emp_id}) อยู่แล้ว`
				});
			}

			await pool.execute('UPDATE employees SET raw_id = ? WHERE emp_id = ?', [raw_emp_id, emp_id]);
			return { success: true, raw_emp_id, emp_id };
		} catch (err) {
			console.error('linkEmployee error:', err);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึก' });
		}
	},

	syncZKTeco: async ({ request, locals }) => {
		const formData = await request.formData();
		let startDate = formData.get('start_date')?.toString();
		let endDate = formData.get('end_date')?.toString();

		if (!startDate || !endDate) {
			const now = new Date();
			const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

			endDate = `${bkkNow.getUTCFullYear()}-${String(bkkNow.getUTCMonth() + 1).padStart(2, '0')}-${String(bkkNow.getUTCDate()).padStart(2, '0')}`;

			const past3Days = new Date(bkkNow.getTime() - 3 * 24 * 60 * 60 * 1000);
			startDate = `${past3Days.getUTCFullYear()}-${String(past3Days.getUTCMonth() + 1).padStart(2, '0')}-${String(past3Days.getUTCDate()).padStart(2, '0')}`;
		}

		try {
			// ── คำนวณเวลา BKK ปัจจุบัน (server รัน UTC) ──────────────────────────
			const nowLocal = new Date();
			const bkkTime = new Date(nowLocal.getTime() + 7 * 60 * 60 * 1000);
			const y_bkk = bkkTime.getUTCFullYear();
			const m_bkk = String(bkkTime.getUTCMonth() + 1).padStart(2, '0');
			const d_bkk = String(bkkTime.getUTCDate()).padStart(2, '0');
			const h_bkk = String(bkkTime.getUTCHours()).padStart(2, '0');
			const min_bkk = String(bkkTime.getUTCMinutes()).padStart(2, '0');
			const sec_bkk = String(bkkTime.getUTCSeconds()).padStart(2, '0');
			const currentThaiTime = `${y_bkk}-${m_bkk}-${d_bkk} ${h_bkk}:${min_bkk}:${sec_bkk}`;

			// ── Step 1: ดึง raw logs จากเครื่องสแกนนิ้วทุกเครื่อง ─────────────────
			const [scannerRows]: any = await pool.execute(
				"SELECT ip_address FROM fingerprint_scanners WHERE status = 'Active'"
			);
			const scanners = scannerRows as { ip_address: string }[];

			let totalRawInserted = 0;
			const deviceErrors: string[] = [];

			if (scanners.length > 0) {
				const ZKLib = (await import('node-zklib')).default;

				for (const scanner of scanners) {
					const ip = scanner.ip_address;
					const zkInstance = new ZKLib(ip, 4370, 120000, 4000);

					try {
						await zkInstance.createSocket();
						console.log(`[ManualSync] เชื่อมต่อ [${ip}] สำเร็จ กำลังดึง log ทั้งหมด...`);

						const logs = await zkInstance.getAttendances();

						// อัปเดต last_sync รายเครื่อง
						await pool.execute(
							'UPDATE fingerprint_scanners SET last_sync = ? WHERE ip_address = ?',
							[currentThaiTime, ip]
						);

						if (!logs?.data || logs.data.length === 0) {
							console.log(`[ManualSync] [${ip}] ไม่มีข้อมูลในเครื่อง`);
							await zkInstance.disconnect();
							continue;
						}

						// Insert ALL logs — ไม่กรองช่วงวันที่เพื่อให้ raw_attendance_logs สมบูรณ์
						const chunkSize = 1000;
						for (let i = 0; i < logs.data.length; i += chunkSize) {
							const chunk = logs.data.slice(i, i + chunkSize);
							const values = chunk.map((log: any) => {
								const rawId = String(log.deviceUserId).trim();

								let formattedTime: string;
								if (log.recordTime instanceof Date) {
									// node-zklib สร้าง Date ด้วย new Date(y,m,d,h,min,sec) จากเวลา BKK ของเครื่อง
									// ใช้ local methods (getFullYear/getHours) เพื่อดึงค่า BKK ที่ถูกต้องออกมา
									// (บน server UTC: getHours() คืนค่าเดิมที่ส่งเข้า constructor = เวลา BKK)
									const y = log.recordTime.getFullYear();
									const m = String(log.recordTime.getMonth() + 1).padStart(2, '0');
									const d = String(log.recordTime.getDate()).padStart(2, '0');
									const h = String(log.recordTime.getHours()).padStart(2, '0');
									const min = String(log.recordTime.getMinutes()).padStart(2, '0');
									const sec = String(log.recordTime.getSeconds()).padStart(2, '0');
									formattedTime = `${y}-${m}-${d} ${h}:${min}:${sec}`;
								} else {
									// string fallback: ตัด timezone suffix ออก ใช้ตัวเลขตรงๆ
									formattedTime = String(log.recordTime).replace('T', ' ').split('.')[0].split('Z')[0];
								}

								return [ip, rawId, formattedTime, currentThaiTime];
							});

							const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
							await pool.execute(
								`INSERT IGNORE INTO raw_attendance_logs (device_ip, raw_emp_id, scan_datetime, created_at) VALUES ${placeholders}`,
								values.flat()
							);
						}

						totalRawInserted += logs.data.length;
						console.log(`[ManualSync] [${ip}] insert raw ${logs.data.length} รายการ เรียบร้อย`);
						await zkInstance.disconnect();
					} catch (deviceErr: any) {
						const msg = `[${ip}] ${deviceErr.message ?? deviceErr}`;
						console.error(`[ManualSync] เชื่อมต่อเครื่องไม่ได้: ${msg}`);
						deviceErrors.push(msg);
						// ไม่ throw — ไปเครื่องถัดไปต่อ
					}
				}
			}

			console.log(
				`[ManualSync] ดึง raw log รวม ${totalRawInserted} รายการ เริ่มประมวลผลช่วง ${startDate} → ${endDate}...`
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

					/* is_late: สาย ถ้า scan_in เกิน start_time + 10 นาที */
					IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) > ADDTIME(IFNULL(sm.start_time, '07:30:00'), '00:10:00'), 1, 0) as is_late,

					'Present' as status,

					CASE
						/* Pre-shift OT: กะที่ OT อยู่ก่อนเริ่มงาน (Night/B shift)
						   เงื่อนไข: ot_end_time <= start_time และ ot_end_time ไม่ใช่ 00:00:00 (midnight)
						   Day Shift มี ot_end=00:00:00 ซึ่งหมายถึง "ไม่มี end" จึงต้องแยกออก */
						WHEN sm.ot_start_time IS NOT NULL
						     AND sm.ot_end_time IS NOT NULL
						     AND TIME(sm.ot_end_time) != '00:00:00'
						     AND sm.ot_end_time <= sm.start_time THEN
							IF(base.scan_in IS NOT NULL AND TIME(base.scan_in) < sm.ot_end_time,
								FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(sm.ot_end_time, GREATEST(TIME(base.scan_in), sm.ot_start_time))) / 60) / 30) * 0.5,
								0
							)

						ELSE
							/* Post-shift OT: กะที่ OT อยู่หลังเลิกงาน (Day/O shift) */
							(
								/* OT เช้ามืด: เข้างานก่อน start_time */
								IF(base.scan_in IS NOT NULL
								   AND TIME(base.scan_in) >= '04:00:00'
								   AND TIME(base.scan_in) < IFNULL(sm.start_time, '07:30:00'),
									FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(
										IFNULL(sm.start_time, '07:30:00'),
										GREATEST(TIME(base.scan_in), '05:30:00')
									)) / 60) / 30) * 0.5,
									0
								)
							)
							+
							(
								/* OT หลังเลิกงาน: scan_out หลัง ot_start_time */
								IF(base.scan_out IS NOT NULL,
									FLOOR(GREATEST(0,
										(
											TIME_TO_SEC(TIME(base.scan_out))
											+ IF(TIME(base.scan_out) < IFNULL(sm.start_time, '07:30:00'), 86400, 0)
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

						/* logical_work_date: Night Shift ลบ 12 ชม. เพื่อให้การสแกน 06:00 ของวันถัดไปตกอยู่ในวันทำงานที่ถูกต้อง */
						DATE(DATE_SUB(r_base.scan_datetime, INTERVAL IF(r_base.actual_shift = 'N', 12, 0) HOUR)) as logical_work_date,

						/* scan_in = การสแกนแรกสุดในช่วงเวลาที่เหมาะสมของกะนั้น */
						MIN(
							CASE
								WHEN r_base.actual_shift = 'N' THEN
									/* Night Shift เข้างาน: scan ตั้งแต่ 13:00 ขึ้นไป (รวม OT ก่อนกะ 17:10) */
									IF(TIME(r_base.scan_datetime) >= '13:00:00', r_base.scan_datetime, NULL)
								ELSE
									/* Day/B/O Shift เข้างาน: scan ช่วงเช้า 01:00-12:59 */
									IF(TIME(r_base.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r_base.scan_datetime, NULL)
							END
						) as scan_in,

						/* scan_out = การสแกนสุดท้ายในช่วงเวลาออกงาน */
						MAX(
							CASE
								WHEN r_base.actual_shift = 'N' THEN
									/* Night Shift ออกงาน: scan ช่วงเช้า 01:00-12:59 ของวันถัดไป */
									IF(TIME(r_base.scan_datetime) BETWEEN '01:00:00' AND '12:59:59', r_base.scan_datetime, NULL)
								ELSE
									/* Day/B/O Shift ออกงาน: scan ตั้งแต่ 13:00 ขึ้นไป */
									IF(TIME(r_base.scan_datetime) >= '13:00:00', r_base.scan_datetime, NULL)
							END
						) as scan_out

					FROM (
						SELECT
							e.emp_id, e.emp_name, r.scan_datetime,

							/* กำหนด actual_shift ของแต่ละ scan:
							   - scan 00:00-12:00: ตรวจว่าวานนี้เป็น Night Shift ไหม (อาจเป็น scan_out ของกะดึก)
							   - scan 12:01-23:59: ใช้ shift ของวันนี้ */
							IF(TIME(r.scan_datetime) BETWEEN '00:00:00' AND '12:00:00',
								IF(
									COALESCE(
										(SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(DATE_SUB(r.scan_datetime, INTERVAL 1 DAY)) LIMIT 1),
										e.default_shift, 'D'
									) = 'N',
									'N',
									COALESCE((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(r.scan_datetime) LIMIT 1), e.default_shift, 'D')
								),
								COALESCE((SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = DATE(r.scan_datetime) LIMIT 1), e.default_shift, 'D')
							) as actual_shift

						FROM raw_attendance_logs r
						/* จับคู่พนักงานจาก raw_id, emp_id, หรือ citizen_id */
						JOIN employees e ON (e.raw_id = r.raw_emp_id OR e.emp_id = r.raw_emp_id OR e.citizen_id = r.raw_emp_id)
						/* ดึงข้อมูล +1 วัน เพื่อรับ scan_out ของ Night Shift */
						WHERE DATE(r.scan_datetime) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
					) as r_base
					GROUP BY r_base.emp_id, r_base.emp_name, logical_work_date, actual_shift
				) as base
				LEFT JOIN shift_master sm ON base.actual_shift = sm.shift_code
				/* กรองให้บันทึกเฉพาะ logical_work_date ในช่วงที่เลือก (กัน Day Shift วันถัดไปรั่ว) */
				WHERE base.logical_work_date BETWEEN ? AND ?

				ON DUPLICATE KEY UPDATE
					shift_type = VALUES(shift_type),
					scan_in_time = VALUES(scan_in_time),
					scan_out_time = VALUES(scan_out_time),
					is_late = VALUES(is_late),
					ot_hours = VALUES(ot_hours),
					status = 'Present';
			`;

			await pool.execute(processQuery, [startDate, endDate, startDate, endDate]);
			console.log(`[ManualSync] ประมวลผลเสร็จสมบูรณ์`);

			const deviceSummary =
				deviceErrors.length > 0 ? ` (เชื่อมต่อไม่ได้: ${deviceErrors.join(', ')})` : '';

			return {
				success: true,
				message: `ดึง raw log ${totalRawInserted} รายการ ประมวลผลช่วง ${startDate} - ${endDate} เรียบร้อย${deviceSummary}`
			};
		} catch (error: any) {
			console.error('Sync process error:', error);
			return { success: false, message: error.message };
		}
	}
};
