import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
	// 🌟 1. จำลองสิทธิ์เป็น Admin ไว้ก่อน เพื่อให้คุณทดสอบเปลี่ยนแผนกดูข้อมูลได้
	// (ถ้าเปลี่ยน role เป็น 'leader' มันจะล็อกให้ดูได้แค่ section ตัวเองทันที)
	const user: any = locals.user || {
		role: 'admin',
		section: 'Loc inbound',
		name: 'Admin Tester'
	};

	let displayDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	// ถ้าเป็น admin ให้เลือกแผนกได้ ถ้าเป็น leader จะถูกบังคับใช้แผนกตัวเอง
	let filterSection =
		url.searchParams.get('section') || (user.role === 'admin' ? 'All' : user.section);
	let filterGroup = url.searchParams.get('group') || 'All';

	try {
		let whereClause = `1=1`;
		let params: any[] = [];

		// 🌟 2. การกรองข้อมูลตามสิทธิ์
		if (user.role !== 'admin') {
			// ลีดเดอร์ แต่ละแผนกสามารถดูลูกน้องของแผนกตัวเองได้เท่านั้น
			whereClause += ` AND e.section = ?`;
			params.push(user.section);
		} else if (filterSection !== 'All') {
			whereClause += ` AND e.section = ?`;
			params.push(filterSection);
		}

		if (filterGroup !== 'All') {
			whereClause += ` AND e.emp_group = ?`;
			params.push(filterGroup);
		}

		// 🌟 3. ดึงตัวเลือก Section และ Group จาก Employee Master มาทำ Dropdown
		const [sections]: any = await pool.execute(
			`SELECT DISTINCT section FROM employees WHERE section IS NOT NULL AND section != '-' ORDER BY section`
		);
		const [groups]: any = await pool.execute(
			`SELECT DISTINCT emp_group FROM employees WHERE emp_group IS NOT NULL AND emp_group != '-' ORDER BY emp_group`
		);

		// 🌟 4. Query สรุปยอด (Summary) เพื่อหาเปอร์เซ็นต์ % Att.
		const summaryQuery = `
			SELECT 
				IFNULL(e.division, '-') as division,
				IFNULL(e.section, '-') as section,
				IFNULL(e.emp_group, '-') as emp_group,
				COUNT(e.emp_id) as total_plan,
				COUNT(e.emp_id) as active_emp, 
				SUM(CASE WHEN al.status IN ('Present', 'Late') OR al.scan_in_time IS NOT NULL THEN 1 ELSE 0 END) as attendance,
				SUM(CASE WHEN al.status LIKE 'Leave%' THEN 1 ELSE 0 END) as leave_count,
				SUM(CASE WHEN al.status = 'Absent' THEN 1 ELSE 0 END) as absent_count
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			WHERE ${whereClause}
			GROUP BY e.division, e.section, e.emp_group
			ORDER BY e.section ASC, e.emp_group ASC
		`;
		const [summary]: any = await pool.execute(summaryQuery, [displayDate, ...params]);

		// 🌟 5. Query รายชื่อลูกน้อง (Employee Master + เวลาเข้าออก)
		const listQuery = `
			SELECT 
				e.emp_id, 
				e.emp_name, 
				IFNULL(e.emp_group, '-') as emp_group,
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
				IFNULL(al.status, 'Pending') as status,
				IFNULL(al.shift_type, 'Day') as shift_type,
				al.remark
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			WHERE ${whereClause}
			ORDER BY e.emp_group ASC, e.emp_name ASC
		`;
		const [employeeList]: any = await pool.execute(listQuery, [displayDate, ...params]);

		// 🌟 คำนวณ % Att. สำหรับแต่ละกลุ่ม
		const processedSummary = summary.map((row: any) => {
			const percent = row.active_emp > 0 ? (row.attendance / row.active_emp) * 100 : 0;
			return { ...row, percent_att: Math.round(percent * 10) / 10 };
		});

		return {
			displayDate,
			filterSection,
			filterGroup,
			sections: sections.map((s: any) => s.section),
			groups: groups.map((g: any) => g.emp_group),
			summary: processedSummary,
			employeeList,
			user
		};
	} catch (error) {
		console.error('Verification Load Error:', error);
		return {
			displayDate,
			filterSection: 'All',
			filterGroup: 'All',
			sections: [],
			groups: [],
			summary: [],
			employeeList: [],
			user: locals.user
		};
	}
};

export const actions: Actions = {
	saveVerification: async ({ request, locals }) => {
		const data = await request.formData();
		const date = data.get('date')?.toString();

		if (!date) return fail(400, { success: false, message: 'วันที่ไม่ถูกต้อง' });

		const empIds = data.getAll('emp_id[]');
		const shifts = data.getAll('shift[]');
		const statuses = data.getAll('status[]');
		const remarks = data.getAll('remark[]');

		try {
			for (let i = 0; i < empIds.length; i++) {
				const emp_id = empIds[i].toString();
				const shift = shifts[i].toString();
				const status = statuses[i].toString();
				const remark = remarks[i].toString();

				if (status === 'Pending') continue;

				const [emp]: any = await pool.execute('SELECT emp_name FROM employees WHERE emp_id = ?', [
					emp_id
				]);
				const emp_name = emp[0]?.emp_name || '';

				await pool.execute(
					`INSERT INTO attendance_logs (emp_id, emp_name, work_date, shift_type, status, remark) 
					VALUES (?, ?, ?, ?, ?, ?)
					ON DUPLICATE KEY UPDATE 
					shift_type = VALUES(shift_type), 
					status = VALUES(status), 
					remark = VALUES(remark)`,
					[emp_id, emp_name, date, shift, status, remark]
				);
			}

			return { success: true, message: 'บันทึกการตรวจสอบเวลาและกะทำงานเรียบร้อยแล้ว!' };
		} catch (error) {
			console.error('Save Verification Error:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	}
};
