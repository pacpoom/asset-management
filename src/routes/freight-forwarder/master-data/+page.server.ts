import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async () => {
	const [rows] = await pool.query('SELECT * FROM liners ORDER BY name ASC');
	return { liners: JSON.parse(JSON.stringify(rows)) };
};

export const actions = {
	save: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const code = formData.get('code') || null;
		const name = formData.get('name');
		const contact_person = formData.get('contact_person') || null;
		const phone = formData.get('phone') || null;
		const email = formData.get('email') || null;
		const status = formData.get('status') || 'Active';

		if (!name) return fail(400, { message: 'กรุณากรอกชื่อสายเรือ' });

		try {
			if (id) {
				await pool.query(
					'UPDATE liners SET code=?, name=?, contact_person=?, phone=?, email=?, status=?, updated_at=NOW() WHERE id=?',
					[code, name, contact_person, phone, email, status, id]
				);
			} else {
				await pool.query(
					'INSERT INTO liners (code, name, contact_person, phone, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
					[code, name, contact_person, phone, email, status]
				);
			}
			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบ ID ที่ต้องการลบ' });

		try {
			await pool.query('DELETE FROM liners WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, {
				message: 'เกิดข้อผิดพลาด ไม่สามารถลบข้อมูลได้ (อาจมีการอ้างอิงใช้งานอยู่)'
			});
		}
	}
};
