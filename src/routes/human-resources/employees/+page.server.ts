import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import { fail } from '@sveltejs/kit';
import path from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || '';

	try {
		let query = `
		SELECT 
			e.*, 
			jp.position_name,
			(SELECT COUNT(*) FROM attendance_logs al 
			WHERE al.emp_id = e.emp_id 
			AND MONTH(al.work_date) = MONTH(CURRENT_DATE()) 
			AND YEAR(al.work_date) = YEAR(CURRENT_DATE()) 
			AND al.is_late = 1) as late_count,

			(SELECT COUNT(*) FROM attendance_logs al 
			WHERE al.emp_id = e.emp_id 
			AND MONTH(al.work_date) = MONTH(CURRENT_DATE()) 
			AND YEAR(al.work_date) = YEAR(CURRENT_DATE()) 
			AND al.status = 'Absent') as absent_count,

			(SELECT IFNULL(SUM(DATEDIFF(IFNULL(lr.end_date, lr.leave_date), lr.leave_date) + 1), 0) 
			FROM leave_records lr 
			WHERE lr.emp_id = e.emp_id 
			AND YEAR(lr.leave_date) = YEAR(CURRENT_DATE()) 
			AND lr.status = 'Approved') as leave_used

		FROM employees e
		LEFT JOIN job_positions jp ON e.position_id = jp.id
		WHERE 1=1
	`;

		const params: any[] = [];

		if (search) {
			query += ` AND (e.emp_id LIKE ? OR e.emp_name LIKE ? OR e.citizen_id LIKE ? OR e.subcontractor LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			params.push(searchPattern, searchPattern, searchPattern, searchPattern);
		}

		query += ` ORDER BY e.emp_id ASC`;

		const [employees]: any = await pool.execute(query, params);
		const [divisions]: any = await pool.execute(
			"SELECT division_name FROM divisions WHERE status = 'Active' ORDER BY division_name ASC"
		);

		const formattedEmployees = employees.map((emp: any) => {
			const rawDate = emp.start_date || emp.start_ih;
			let finalDate = '-';

			if (rawDate) {
				const d = new Date(rawDate);
				if (!isNaN(d.getTime())) {
					const year = d.getFullYear();
					const month = String(d.getMonth() + 1).padStart(2, '0');
					const day = String(d.getDate()).padStart(2, '0');

					finalDate = `${year}-${month}-${day}`;
				} else {
					finalDate = rawDate;
				}
			}

			return {
				...emp,
				start_date: finalDate
			};
		});

		return {
			employees: formattedEmployees,
			divisions: divisions,
			searchQuery: search
		};
	} catch (error) {
		console.error('Error loading employees:', error);
		return { employees: [], divisions: [], searchQuery: search };
	}
};

export const actions: Actions = {
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

			const headerRow = worksheet.getRow(1);
			const colMap: Record<string, number> = {};
			headerRow.eachCell((cell, colNumber) => {
				const headerText = cell.text?.trim().toLowerCase();
				if (headerText) colMap[headerText] = colNumber;
			});

			const idCol = colMap['id no.'] || 1;
			const citizenCol = colMap['id'] || 2;
			const nameCol = colMap['name'] || 3;
			const disCol = colMap['dis.'] || 4;
			const secCol = colMap['section'] || 5;
			const groupCol = colMap['group'] || 6;
			const posCol = colMap['position'] || 7;
			const projectCol = colMap['project'] || 8;

			for (let i = 2; i <= worksheet.rowCount; i++) {
				const row = worksheet.getRow(i);
				const emp_id = row.getCell(idCol).value?.toString().trim();

				if (emp_id) {
					const citizen_id = row.getCell(citizenCol).value?.toString().trim() || null;
					let emp_name = row.getCell(nameCol).value?.toString().trim() || null;
					if (emp_name) {
						emp_name = emp_name.replace(/\+/g, ' ');
					}

					const division = row.getCell(disCol).value?.toString().trim() || null;
					const section = row.getCell(secCol).value?.toString().trim() || null;
					const emp_group = row.getCell(groupCol).value?.toString().trim() || null;
					const position_name = row.getCell(posCol).value?.toString().trim() || null;
					const project = row.getCell(projectCol).value?.toString().trim() || null;

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
						`INSERT INTO employees 
						(emp_id, citizen_id, emp_name, division, section, emp_group, position_id, project) 
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
						ON DUPLICATE KEY UPDATE 
						citizen_id = VALUES(citizen_id), emp_name = VALUES(emp_name), division = VALUES(division),
						section = VALUES(section), emp_group = VALUES(emp_group), position_id = VALUES(position_id), project = VALUES(project)`,
						[emp_id, citizen_id, emp_name, division, section, emp_group, positionId, project]
					);
					importedCount++;
				}
			}
			return { success: true, message: `นำเข้าพนักงานสำเร็จ ${importedCount} รายการ!` };
		} catch (error) {
			console.error('Import Error:', error);
			return { success: false, message: 'เกิดข้อผิดพลาดในการนำเข้าไฟล์รายชื่อ' };
		}
	},

	save: async ({ request }) => {
		const data = await request.formData();
		const emp_id = data.get('emp_id')?.toString();
		const citizen_id = data.get('citizen_id')?.toString() || null;

		let emp_name = data.get('emp_name')?.toString();
		if (emp_name) emp_name = emp_name.replace(/\+/g, ' ');

		const subcontractor = data.get('subcontractor')?.toString() || null;
		let start_date = data.get('start_date')?.toString() || null;

		const phone_number = data.get('phone_number')?.toString() || null;
		const tenure = data.get('tenure')?.toString() || null;
		const division = data.get('dis')?.toString() || null;
		const section = data.get('section')?.toString() || null;
		const emp_group = data.get('emp_group')?.toString() || null;
		const position_name = data.get('position_name')?.toString() || null;
		const project = data.get('project')?.toString() || null;
		const status = data.get('status')?.toString() || 'Active';

		if (!emp_id || !emp_name)
			return fail(400, { success: false, message: 'ข้อมูล ID และชื่อพนักงานห้ามว่าง' });

		const file = data.get('profile_image') as File;
		const existing_path = data.get('existing_image_path')?.toString() || '';
		let profile_image_path = existing_path;

		if (file && file.size > 0) {
			try {
				const uploadDir = path.join(process.cwd(), 'static', 'uploads', 'profiles');
				if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

				const fileName = `${emp_id}-${Date.now()}-${file.name}`;
				const filePath = path.join(uploadDir, fileName);
				writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
				profile_image_path = `/uploads/profiles/${fileName}`;
			} catch (err) {
				console.error('File Upload Error:', err);
			}
		}

		try {
			let positionId = null;
			if (position_name && position_name !== '-') {
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
				`UPDATE employees SET 
				citizen_id = ?, emp_name = ?, subcontractor = ?, start_date = ?, phone_number = ?, profile_image_path = ?, tenure = ?, 
				division = ?, section = ?, emp_group = ?, position_id = ?, project = ?, status = ?
				WHERE emp_id = ?`,
				[
					citizen_id,
					emp_name,
					subcontractor,
					start_date,
					phone_number,
					profile_image_path,
					tenure,
					division,
					section,
					emp_group,
					positionId,
					project,
					status,
					emp_id
				]
			);

			return { success: true, message: 'อัปเดตข้อมูลพนักงานสำเร็จ!' };
		} catch (error) {
			console.error('Error updating employee:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	},

	delete: async ({ request }) => {
		// (ใช้โค้ดเดิม)
		const data = await request.formData();
		const emp_id = data.get('emp_id')?.toString();

		if (!emp_id) return fail(400, { success: false, message: 'ไม่พบ ID พนักงานที่ต้องการลบ' });

		try {
			await pool.execute('DELETE FROM employees WHERE emp_id = ?', [emp_id]);
			return { success: true, message: 'ลบข้อมูลพนักงานสำเร็จ!' };
		} catch (error) {
			console.error('Error deleting employee:', error);
			return fail(500, {
				success: false,
				message: 'เกิดข้อผิดพลาดในการลบข้อมูล (อาจมีข้อมูลผูกพันอยู่)'
			});
		}
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const idsString = data.get('ids')?.toString();

		if (!idsString) return fail(400, { success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' });

		const ids = JSON.parse(idsString);
		if (!Array.isArray(ids) || ids.length === 0)
			return fail(400, { success: false, message: 'ข้อมูลไม่ถูกต้อง' });

		try {
			const placeholders = ids.map(() => '?').join(',');
			await pool.execute(`DELETE FROM employees WHERE emp_id IN (${placeholders})`, ids);

			return { success: true, message: `ลบข้อมูลพนักงานสำเร็จ ${ids.length} รายการ!` };
		} catch (error) {
			console.error('Bulk Delete Error:', error);
			return fail(500, {
				success: false,
				message: 'เกิดข้อผิดพลาดในการลบข้อมูล (อาจมีข้อมูลผูกพันอยู่)'
			});
		}
	}
};
