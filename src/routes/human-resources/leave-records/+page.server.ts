import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ url, locals }) => {
	const search = url.searchParams.get('search') || '';

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

		if (search) {
			query += ` AND (lr.emp_id LIKE ? OR e.emp_name LIKE ? OR e.section LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			params.push(searchPattern, searchPattern, searchPattern);
		}

		query += ` ORDER BY lr.created_at DESC`;

		const [leaves]: any = await pool.execute(query, params);
		const [employees]: any = await pool.execute(
			`SELECT emp_id, emp_name FROM employees ORDER BY emp_name ASC`
		);

		return { leaves, employees, searchQuery: search };
	} catch (error) {
		console.error('Error loading leaves:', error);
		return { leaves: [], employees: [], searchQuery: search };
	}
};

export const actions: Actions = {
	saveLeave: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const emp_id = data.get('emp_id')?.toString();
		const leave_type = data.get('leave_type')?.toString();
		const leave_date = data.get('leave_date')?.toString();
		const end_date = data.get('end_date')?.toString() || leave_date;
		const remark = data.get('remark')?.toString();
		const status = data.get('status')?.toString() || 'Pending';
		const file = data.get('document') as File;

		const created_by = (locals as any).user?.name || 'Admin';

		if (!emp_id || !leave_type || !leave_date) {
			return fail(400, { success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
		}

		let documentPath = data.get('existing_document_path')?.toString() || null;

		if (file && file.size > 0) {
			const uploadDir = 'static/uploads/leaves';
			if (!existsSync(uploadDir)) {
				mkdirSync(uploadDir, { recursive: true });
			}
			const ext = file.name.split('.').pop();
			const fileName = `${Date.now()}_${emp_id}.${ext}`;
			const filePath = path.join(uploadDir, fileName);

			writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
			documentPath = `/uploads/leaves/${fileName}`;
		}

		try {
			if (id) {
				await pool.execute(
					`UPDATE leave_records SET 
					leave_type = ?, leave_date = ?, end_date = ?, remark = ?, status = ? ${documentPath ? ', document_path = ?' : ''}
					WHERE id = ?`,
					documentPath
						? [leave_type, leave_date, end_date, remark, status, documentPath, id]
						: [leave_type, leave_date, end_date, remark, status, id]
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
		} catch (error) {
			console.error('Save Leave Error:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	},

	deleteLeave: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { success: false, message: 'ไม่พบ ID ที่ต้องการลบ' });

		try {
			await pool.execute('DELETE FROM leave_records WHERE id = ?', [id]);
			return { success: true, message: 'ลบข้อมูลใบลาสำเร็จ!' };
		} catch (error) {
			console.error('Delete Leave Error:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
		}
	}
};
