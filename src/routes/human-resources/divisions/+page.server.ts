import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	try {
		const [divisions]: any = await pool.execute(
			'SELECT * FROM divisions ORDER BY division_name ASC'
		);
		return { divisions };
	} catch (error) {
		console.error('Error loading divisions:', error);
		return { divisions: [] };
	}
};

export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const division_name = data.get('division_name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;
		const status = data.get('status')?.toString() || 'Active';

		if (!division_name) {
			return fail(400, { success: false, message: 'กรุณากรอกชื่อหน่วยงาน (Division Name)' });
		}

		try {
			if (id) {
				await pool.execute(
					'UPDATE divisions SET division_name = ?, description = ?, status = ? WHERE id = ?',
					[division_name, description, status, id]
				);
				return { success: true, message: 'อัปเดตข้อมูลสำเร็จ!' };
			} else {
				// กรณีเพิ่มข้อมูลใหม่
				await pool.execute(
					'INSERT INTO divisions (division_name, description, status) VALUES (?, ?, ?)',
					[division_name, description, status]
				);
				return { success: true, message: 'เพิ่มข้อมูลสำเร็จ!' };
			}
		} catch (error: any) {
			console.error('Save Division Error:', error);
			if (error.code === 'ER_DUP_ENTRY') {
				return fail(400, { success: false, message: 'ชื่อหน่วยงานนี้มีอยู่ในระบบแล้ว' });
			}
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในระบบฐานข้อมูล' });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { success: false, message: 'ไม่พบ ID ที่ต้องการลบ' });

		try {
			await pool.execute('DELETE FROM divisions WHERE id = ?', [id]);
			return { success: true, message: 'ลบข้อมูลสำเร็จ!' };
		} catch (error) {
			return fail(500, { success: false, message: 'ไม่สามารถลบได้ เนื่องจากข้อมูลถูกใช้งานอยู่' });
		}
	}
};
