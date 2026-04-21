import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	const today = new Date();
	const defaultMonth = String(today.getMonth() + 1).padStart(2, '0');
	const defaultYear = today.getFullYear().toString();
	const selectedMonth = url.searchParams.get('month') || defaultMonth;
	const selectedYear = url.searchParams.get('year') || defaultYear;
	const empFilter = url.searchParams.get('emp_id') || 'All';
	const search = url.searchParams.get('search') || '';

	const yearMonthStr = `${selectedYear}-${selectedMonth}`;

	try {
		const [employees]: any = await pool.execute(
			`SELECT emp_id, emp_name FROM employees ORDER BY emp_name ASC`
		);

		// 🌟 1. แก้ไข: เปลี่ยนเป็น INNER JOIN เพื่อตัดพนักงานเก่า/พนักงานไม่มีตัวตน ออกไปจากหน้าจอนี้
		let logQuery = `
			SELECT 
				al.*, 
				al.scan_in_time as time_in_raw, 
				e.emp_name as name,
				IFNULL(jp.position_name, '-') as position,
				IFNULL(e.section, '-') as section,
				IFNULL(e.division, '-') as dis,
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out
			FROM attendance_logs al
			INNER JOIN employees e ON al.emp_id = e.emp_id
			LEFT JOIN job_positions jp ON e.position_id = jp.id
			WHERE DATE_FORMAT(al.work_date, '%Y-%m') = ?
		`;
		const params: any[] = [yearMonthStr];

		if (empFilter !== 'All') {
			logQuery += ` AND al.emp_id = ?`;
			params.push(empFilter);
		}

		if (search) {
			logQuery += ` AND (al.emp_id LIKE ? OR e.emp_name LIKE ? OR e.section LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			params.push(searchPattern, searchPattern, searchPattern);
		}

		logQuery += ` ORDER BY al.work_date DESC, al.scan_in_time DESC`;

		const [logs]: any = await pool.execute(logQuery, params);

		const unique_emps = new Set();
		let total_late_mins = 0;
		let total_ot_hours = 0;

		const processedLogs = logs.map((log: any) => {
			let lateMins = 0;

			// ตอนนี้นับยอดคน จะได้เฉพาะพนักงานที่มีตัวตนอยู่จริง (167 คน) แน่นอน
			if (log.status === 'Present') {
				unique_emps.add(log.emp_id);
			}

			total_ot_hours += parseFloat(log.ot_hours) || 0;

			if (log.is_late && log.time_in_raw && log.shift_type === 'Day') {
				const d = new Date(log.time_in_raw);
				const totalMins = d.getHours() * 60 + d.getMinutes();
				if (totalMins > 460) {
					lateMins = totalMins - 460;
					total_late_mins += lateMins;
				}
			}

			return log;
		});

		return {
			logs: processedLogs,
			employees: employees,
			selectedMonth,
			selectedYear,
			empFilter,
			searchQuery: search,
			stats: {
				total_days: unique_emps.size, // ยอด 167 คนจะตรงเป๊ะครับ
				total_late_mins,
				total_ot_hours: Math.round(total_ot_hours * 100) / 100
			}
		};
	} catch (error) {
		console.error('Error fetching attendance history:', error);
		return {
			logs: [],
			employees: [],
			selectedMonth,
			selectedYear,
			empFilter: 'All',
			searchQuery: search,
			stats: { total_days: 0, total_late_mins: 0, total_ot_hours: 0 }
		};
	}
};

export const actions: Actions = {
	importExcel: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file || file.size === 0)
			return fail(400, { success: false, message: 'กรุณาเลือกไฟล์ Excel' });

		try {
			const arrayBuffer = await file.arrayBuffer();
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(arrayBuffer);
			const worksheet = workbook.worksheets[0];

			// 🌟 2. อัปเกรดระบบจัดกลุ่มเวลา: รวบรวมเวลาทั้งหมดของพนักงาน 1 คนใน 1 วันมากองรวมกันก่อน
			const scansMap = new Map<string, string[]>();

			for (let i = 2; i <= worksheet.rowCount; i++) {
				const row = worksheet.getRow(i);

				const emp_id = row.getCell(2).value?.toString().trim();
				const work_date_raw = row.getCell(4).value?.toString().trim();
				const time_str = row.getCell(5).value?.toString().trim();

				if (!emp_id || !work_date_raw || !time_str || emp_id === 'TextBox2') continue;

				const dateParts = work_date_raw.split('/');
				if (dateParts.length !== 3) continue;
				const safe_date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`; // แปลงเป็น YYYY-MM-DD

				// จับเวลามาต่อกันเป็น String เช่น "2026-04-20 07:27:00"
				const datetime_str = `${safe_date} ${time_str}:00`;

				// โยนเวลาเข้ากระเป๋าของพนักงานคนนั้นๆ ตามวันที่
				const key = `${emp_id}_${safe_date}`;
				if (!scansMap.has(key)) {
					scansMap.set(key, []);
				}
				scansMap.get(key)!.push(datetime_str);
			}

			// 🌟 3. นำข้อมูลที่จัดกลุ่มแล้วมาหา "เวลาเข้า" และ "เวลาออก" ที่แท้จริง
			for (const [key, times] of scansMap.entries()) {
				const [emp_id, safe_date] = key.split('_');

				// เรียงลำดับเวลาจากน้อยไปมาก
				times.sort();

				const timeInStr = times[0];
				let timeOutStr = null;

				if (times.length > 1) {
					const firstTime = new Date(timeInStr).getTime();
					const lastTime = new Date(times[times.length - 1]).getTime();
					const diffMins = (lastTime - firstTime) / 60000;

					if (diffMins > 60) {
						timeOutStr = times[times.length - 1];
					}
				}

				// อัปเดตลง Database (ลบเวลาออกเก่าที่เพี้ยนทิ้งให้หมด)
				const [existingLog]: any = await pool.execute(
					`SELECT id FROM attendance_logs WHERE emp_id = ? AND work_date = ?`,
					[emp_id, safe_date]
				);

				if (existingLog.length === 0) {
					await pool.execute(
						`INSERT INTO attendance_logs (emp_id, work_date, scan_in_time, scan_out_time, status, shift_type) 
						 VALUES (?, ?, ?, ?, 'Present', 'Day')`,
						[emp_id, safe_date, timeInStr, timeOutStr]
					);
				} else {
					await pool.execute(
						`UPDATE attendance_logs SET scan_in_time = ?, scan_out_time = ? WHERE id = ?`,
						[timeInStr, timeOutStr, existingLog[0].id]
					);
				}
			}

			return { success: true, message: 'นำเข้าข้อมูลสำเร็จ! ล้างข้อมูลเวลาซ้ำเรียบร้อยแล้ว' };
		} catch (error) {
			console.error('Import Error:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์' });
		}
	}
};
