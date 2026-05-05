import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import ExcelJS from 'exceljs';

export const load: PageServerLoad = async ({ url, locals }) => {
	const user: any = locals.user || { role: 'staff' };

	let displayDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	let filterSection = url.searchParams.get('section') || 'All';
	let filterGroup = url.searchParams.get('group') || 'All';

	try {
		let whereClause = `1=1`;
		let params: any[] = [];

		if (filterSection !== 'All') {
			whereClause += ` AND e.section = ?`;
			params.push(filterSection);
		}

		if (filterGroup !== 'All') {
			whereClause += ` AND e.emp_group = ?`;
			params.push(filterGroup);
		}

		const [sections]: any = await pool.execute(
			`SELECT DISTINCT section FROM employees WHERE section IS NOT NULL AND section != '-' ORDER BY section`
		);
		const [groups]: any = await pool.execute(
			`SELECT DISTINCT emp_group FROM employees WHERE emp_group IS NOT NULL AND emp_group != '-' ORDER BY emp_group`
		);

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

		const listQuery = `
			SELECT 
				e.emp_id, 
				e.emp_name, 
				IFNULL(e.emp_group, '-') as emp_group,
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
				IFNULL(al.status, 'Pending') as status,
				
				COALESCE(
					al.shift_type, 
					(SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = ? LIMIT 1),
					e.default_shift, 
					'D'
				) as shift_type,
				
				al.remark
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			WHERE ${whereClause}
			ORDER BY e.emp_group ASC, e.emp_name ASC
		`;

		const [employeeList]: any = await pool.execute(listQuery, [
			displayDate,
			displayDate,
			...params
		]);

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
			user: locals.user || { role: 'staff' }
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
	}
};
