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
			sm.start_time as shift_start_time,
			sm.end_time as shift_end_time,
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
		LEFT JOIN shift_master sm ON e.default_shift = sm.shift_code
		WHERE 1=1
	`;

		const params: any[] = [];

		if (search) {
			// เพิ่มการค้นหาจาก raw_id เข้าไปด้วย
			query += ` AND (e.emp_id LIKE ? OR e.raw_id LIKE ? OR e.emp_name LIKE ? OR e.citizen_id LIKE ? OR e.subcontractor LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
		}

		query += ` ORDER BY e.emp_id ASC`;

		const [employees]: any = await pool.execute(query, params);
		const [divisions]: any = await pool.execute(
			"SELECT division_name FROM divisions WHERE status = 'Active' ORDER BY division_name ASC"
		);
		// ดึงข้อมูลกะเพื่อไปทำ Dropdown
		const [shifts]: any = await pool.execute(
			"SELECT shift_code, shift_name FROM shift_master WHERE status = 'Active' ORDER BY shift_code ASC"
		);

		const formattedEmployees = employees.map((emp: any) => {
			const rawDate = emp.start_date || emp.start_ih;
			let finalDate = '-';
			let years_of_experience = '-';
			let tenure_days = 0;

			if (rawDate) {
				const d = new Date(rawDate);
				if (!isNaN(d.getTime())) {
					const year = d.getFullYear();
					const month = String(d.getMonth() + 1).padStart(2, '0');
					const day = String(d.getDate()).padStart(2, '0');

					finalDate = `${year}-${month}-${day}`;

					// Calculate Years of Experience
					const start = new Date(rawDate);
					const now = new Date();
					
					if (now >= start) {
						const diffTime = now.getTime() - start.getTime();
						tenure_days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

						let y = now.getFullYear() - start.getFullYear();
						let m = now.getMonth() - start.getMonth();
						let d_days = now.getDate() - start.getDate();

						if (d_days < 0) {
							m--;
							const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
							d_days += prevMonth.getDate();
						}
						if (m < 0) {
							y--;
							m += 12;
						}

						const parts = [];
						if (y > 0) parts.push(`${y} ปี`);
						if (m > 0) parts.push(`${m} เดือน`);
						if (d_days > 0) parts.push(`${d_days} วัน`);
						
						years_of_experience = parts.length > 0 ? parts.join(' ') : '0 วัน';
					} else {
						years_of_experience = '0 วัน';
						tenure_days = 0;
					}
				} else {
					finalDate = rawDate;
				}
			}

			// Format เวลาทำงาน (ตัดวินาทีออก 08:00:00 -> 08:00)
			const formatTime = (timeStr: string) => timeStr ? timeStr.substring(0, 5) : null;
			let shift_time_display = '-';
			
			if (emp.shift_start_time && emp.shift_end_time) {
				shift_time_display = `${formatTime(emp.shift_start_time)} - ${formatTime(emp.shift_end_time)}`;
			}

			return {
				...emp,
				start_date: finalDate,
				years_of_experience,
				tenure_days,
				shift_time_display
			};
		});

		return {
			employees: formattedEmployees,
			divisions: divisions,
			shifts: shifts,
			searchQuery: search
		};
	} catch (error) {
		console.error('Error loading employees:', error);
		return { employees: [], divisions: [], shifts: [], searchQuery: search };
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

			const idCol = colMap['id no.'] || colMap['emp id'] || 1;
			const rawIdCol = colMap['raw id'] || colMap['raw_id'] || null;
			const citizenCol = colMap['id'] || colMap['citizen id'] || 2;
			const nameCol = colMap['name'] || 3;
			const typeCol = colMap['employee type'] || colMap['type'] || null;
			const shiftCol = colMap['default shift'] || colMap['shift'] || null;
			const disCol = colMap['dis.'] || colMap['division'] || 4;
			const secCol = colMap['section'] || 5;
			const groupCol = colMap['group'] || 6;
			const posCol = colMap['position'] || 7;
			const projectCol = colMap['project'] || 8;

			for (let i = 2; i <= worksheet.rowCount; i++) {
				const row = worksheet.getRow(i);
				const emp_id = row.getCell(idCol).value?.toString().trim();

				if (emp_id) {
					const raw_id = rawIdCol ? row.getCell(rawIdCol).value?.toString().trim() || null : null;
					const citizen_id = row.getCell(citizenCol).value?.toString().trim() || null;
					let emp_name = row.getCell(nameCol).value?.toString().trim() || null;
					if (emp_name) {
						emp_name = emp_name.replace(/\+/g, ' ');
					}

					let employee_type = 'Sub Contract';
					if (typeCol) {
						const typeVal = row.getCell(typeCol).value?.toString().trim();
						if (typeVal && typeVal.toLowerCase() === 'permanent') {
							employee_type = 'Permanent';
						}
					}
					
					const default_shift = shiftCol ? row.getCell(shiftCol).value?.toString().trim().toUpperCase() : null;
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
						(emp_id, raw_id, citizen_id, emp_name, employee_type, default_shift, division, section, emp_group, position_id, project) 
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						ON DUPLICATE KEY UPDATE 
						raw_id = VALUES(raw_id), citizen_id = VALUES(citizen_id), emp_name = VALUES(emp_name), employee_type = VALUES(employee_type), default_shift = VALUES(default_shift), division = VALUES(division),
						section = VALUES(section), emp_group = VALUES(emp_group), position_id = VALUES(position_id), project = VALUES(project)`,
						[emp_id, raw_id, citizen_id, emp_name, employee_type, default_shift, division, section, emp_group, positionId, project]
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
		const mode = data.get('mode')?.toString() || 'edit';
		const emp_id = data.get('emp_id')?.toString();
		const raw_id = data.get('raw_id')?.toString() || null;
		const citizen_id = data.get('citizen_id')?.toString() || null;

		let emp_name = data.get('emp_name')?.toString();
		if (emp_name) emp_name = emp_name.replace(/\+/g, ' ');

		const employee_type = data.get('employee_type')?.toString() || 'Sub Contract';
		const default_shift = data.get('default_shift')?.toString() || null;
		const subcontractor = data.get('subcontractor')?.toString() || null;
		let start_date = data.get('start_date')?.toString() || null;

		const phone_number = data.get('phone_number')?.toString() || null;
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

			if (mode === 'add') {
				const [existing]: any = await pool.execute('SELECT emp_id FROM employees WHERE emp_id = ?', [emp_id]);
				if (existing.length > 0) {
					return fail(400, { success: false, message: 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว' });
				}

				await pool.execute(
					`INSERT INTO employees 
					(emp_id, raw_id, citizen_id, emp_name, employee_type, default_shift, subcontractor, start_date, phone_number, profile_image_path, division, section, emp_group, position_id, project, status) 
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						emp_id,
						raw_id,
						citizen_id,
						emp_name,
						employee_type,
						default_shift,
						subcontractor,
						start_date,
						phone_number,
						profile_image_path,
						division,
						section,
						emp_group,
						positionId,
						project,
						status
					]
				);
				return { success: true, message: 'เพิ่มข้อมูลพนักงานสำเร็จ!' };

			} else {
				await pool.execute(
					`UPDATE employees SET 
					raw_id = ?, citizen_id = ?, emp_name = ?, employee_type = ?, default_shift = ?, subcontractor = ?, start_date = ?, phone_number = ?, profile_image_path = ?, 
					division = ?, section = ?, emp_group = ?, position_id = ?, project = ?, status = ?
					WHERE emp_id = ?`,
					[
						raw_id,
						citizen_id,
						emp_name,
						employee_type,
						default_shift,
						subcontractor,
						start_date,
						phone_number,
						profile_image_path,
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
			}
		} catch (error) {
			console.error('Error saving employee:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	},

	delete: async ({ request }) => {
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