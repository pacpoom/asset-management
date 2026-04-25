import ExcelJS from 'exceljs';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';

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
		const [sectionsRows]: any = await pool.execute(
			`SELECT DISTINCT section FROM employees WHERE section IS NOT NULL AND section != '-' ORDER BY section`
		);
		const [groupsRows]: any = await pool.execute(
			`SELECT DISTINCT emp_group FROM employees WHERE emp_group IS NOT NULL AND emp_group != '-' ORDER BY emp_group`
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
			WHERE e.section IS NOT NULL AND e.section != '-' ${empWhere}
			GROUP BY e.section, e.emp_group
			ORDER BY e.section ASC, e.emp_group ASC
		`;
		const [departmentSummary]: any = await pool.execute(summaryQuery, [
			displayDate,
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
			LEFT JOIN employees e ON al.emp_id = e.emp_id
			LEFT JOIN job_positions jp ON e.position_id = jp.id
			WHERE al.work_date = ? ${empWhere}
		`;
		const logParams: any[] = [displayDate, ...filterParams];

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
				COUNT(al.id) as total_scanned,
				SUM(CASE WHEN al.status = 'Present' AND al.is_late = 0 THEN 1 ELSE 0 END) as on_time,
				SUM(CASE WHEN al.status = 'Present' AND al.is_late = 1 THEN 1 ELSE 0 END) as late,
				SUM(CASE WHEN al.status IN ('Absent', 'Leave') THEN 1 ELSE 0 END) as absent
			FROM attendance_logs al
			LEFT JOIN employees e ON al.emp_id = e.emp_id
			WHERE al.work_date = ? ${empWhere}
		`;
		const [statsRow]: any = await pool.execute(statsQuery, [displayDate, ...filterParams]);

		return {
			title: 'Workforce Dashboard',
			departmentSummary: processedSummary,
			recentLogs: recentLogs,
			statsData: statsRow[0] || { total_scanned: 0, on_time: 0, late: 0, absent: 0 },
			displayDate,
			searchQuery: search,
			statusFilter,
			sectionFilter,
			groupFilter,
			sections: sectionsRows.map((s: any) => s.section),
			groups: groupsRows.map((g: any) => g.emp_group)
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
			groups: []
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
					'SELECT emp_id, emp_name FROM employees WHERE citizen_id = ? OR emp_id = ? LIMIT 1',
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
						otHours = (outMins - 1030) / 60;
					}
					otHours = Math.round(otHours * 100) / 100;
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
	}
};
