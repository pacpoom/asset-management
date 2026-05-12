import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ url, locals }) => {
	const search = url.searchParams.get('search') || '';
	const sectionFilter = url.searchParams.get('section') || 'All';

	// ดึงข้อมูล user และ department_id จาก session
	const user: any = (locals as any).user || {};
	const userDeptId = user.department_id;

	try {
		let query = `
			SELECT 
				lr.*,
				IFNULL(e.emp_name, '-') as emp_name,
				IFNULL(e.section, '-') as section,
				IFNULL(e.emp_group, '-') as emp_group
			FROM leave_records lr
			LEFT JOIN employees e ON lr.emp_id = e.emp_id
			WHERE 1=1
		`;
		const params: any[] = [];

		// 1. เพิ่มเงื่อนไขกรองประวัติการลาตาม department_id
		if (userDeptId) {
			query += ` AND e.department_id = ?`;
			params.push(userDeptId);
		}

		if (sectionFilter !== 'All') {
			query += ` AND e.section = ?`;
			params.push(sectionFilter);
		}

		if (search) {
			query += ` AND (lr.emp_id LIKE ? OR e.emp_name LIKE ? OR e.section LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			params.push(searchPattern, searchPattern, searchPattern);
		}

		query += ` ORDER BY lr.created_at DESC`;

		const [leaves]: any = await pool.execute(query, params);

		// 2. กรองตัวเลือกรายชื่อพนักงานใน Dropdown ให้เหลือเฉพาะในแผนกเดียวกัน
		let empQuery = `SELECT emp_id, emp_name FROM employees`;
		let empParams: any[] = [];
		if (userDeptId) {
			empQuery += ` WHERE department_id = ?`;
			empParams.push(userDeptId);
		}
		empQuery += ` ORDER BY emp_name ASC`;
		const [employees]: any = await pool.execute(empQuery, empParams);

		const [leaveTypes]: any = await pool.execute(
			`SELECT * FROM leave_types WHERE is_active = 1 ORDER BY id ASC`
		);

		// 3. กรองตัวเลือก Section ให้เหลือเฉพาะ Section ในแผนกเดียวกัน
		let secQuery = `SELECT DISTINCT section FROM employees WHERE section IS NOT NULL AND section != '-'`;
		let secParams: any[] = [];
		if (userDeptId) {
			secQuery += ` AND department_id = ?`;
			secParams.push(userDeptId);
		}
		secQuery += ` ORDER BY section`;
		const [sectionsRows]: any = await pool.execute(secQuery, secParams);
		const sections = sectionsRows.map((s: any) => s.section);

		return {
			leaves,
			employees,
			leaveTypes,
			sections,
			searchQuery: search,
			sectionFilter
		};
	} catch (err) {
		console.error('Error loading leave records:', err);
		return {
			leaves: [],
			employees: [],
			leaveTypes: [],
			sections: [],
			searchQuery: search,
			sectionFilter: 'All'
		};
	}
};

export const actions: Actions = {
	saveLeave: async ({ request, locals }) => {
		const data = await request.formData();

		const id = data.get('id')?.toString();
		const emp_id = data.get('emp_id')?.toString();
		const leave_type = data.get('leave_type')?.toString();
		const leave_date = data.get('leave_date')?.toString();
		let end_date = data.get('end_date')?.toString() || null;
		if (end_date === '') end_date = null;

		const remark = data.get('remark')?.toString() || '';
		const status = data.get('status')?.toString() || 'Pending';
		const existing_document_path = data.get('existing_document_path')?.toString() || null;
		// ใช้ full_name เพื่อให้ตรงกับข้อมูลที่ส่งมาจาก hooks
		const created_by = (locals as any).user?.full_name || 'Admin';

		const file = data.get('document') as File;
		let documentPath = existing_document_path;

		if (file && file.size > 0) {
			try {
				const uploadDir = path.join(process.cwd(), 'static', 'uploads', 'leaves');
				if (!existsSync(uploadDir)) {
					mkdirSync(uploadDir, { recursive: true });
				}

				const fileName = `${Date.now()}-${file.name}`;
				const filePath = path.join(uploadDir, fileName);
				const buffer = Buffer.from(await file.arrayBuffer());
				writeFileSync(filePath, buffer);

				documentPath = `/uploads/leaves/${fileName}`;
			} catch (err) {
				console.error('File Upload Error:', err);
			}
		}

		try {
			if (id) {
				await pool.execute(
					`UPDATE leave_records SET 
						emp_id = ?, 
						leave_type = ?, 
						leave_date = ?, 
						end_date = ?, 
						remark = ?, 
						status = ? 
						${documentPath !== existing_document_path ? ', document_path = ?' : ''}
					WHERE id = ?`,
					documentPath !== existing_document_path
						? [emp_id, leave_type, leave_date, end_date, remark, status, documentPath, id]
						: [emp_id, leave_type, leave_date, end_date, remark, status, id]
				);
				return { success: true, message: 'อัปเดตข้อมูลการลาสำเร็จ!' };
			} else {
				await pool.execute(
					`INSERT INTO leave_records (emp_id, leave_type, leave_date, end_date, remark, document_path, status, created_by)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
					[emp_id, leave_type, leave_date, end_date, remark, documentPath, status, created_by]
				);
				return { success: true, message: 'บันทึกใบลาสำเร็จ!' };
			}
		} catch (error: any) {
			console.error('Save Leave Error:', error);
			return fail(500, {
				success: false,
				message: `เกิดข้อผิดพลาด: ${error.sqlMessage || 'ไม่สามารถบันทึกข้อมูลได้'}`
			});
		}
	},

	deleteLeave: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { success: false, message: 'ไม่พบ ID ที่ต้องการลบ' });

		try {
			await pool.execute(`DELETE FROM leave_records WHERE id = ?`, [id]);
			return { success: true, message: 'ลบรายการสำเร็จ' };
		} catch (error) {
			console.error('Delete Error:', error);
			return fail(500, { success: false, message: 'ไม่สามารถลบข้อมูลได้' });
		}
	}
};