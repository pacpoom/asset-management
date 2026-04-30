import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	try {
		const [shifts]: any = await pool.execute('SELECT * FROM shift_master ORDER BY shift_code ASC');
		return { shifts };
	} catch (error) {
		console.error('Error loading shifts:', error);
		return { shifts: [] };
	}
};

export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();
		const mode = data.get('mode')?.toString() || 'add';
		const original_code = data.get('original_code')?.toString();
		
		const shift_code = data.get('shift_code')?.toString().toUpperCase().trim();
		const shift_name = data.get('shift_name')?.toString();
		const shift_category = data.get('shift_category')?.toString() || 'Normal';
		const start_time = data.get('start_time')?.toString() || null;
		const end_time = data.get('end_time')?.toString() || null;
		const ot_start_time = data.get('ot_start_time')?.toString() || null;
		const ot_end_time = data.get('ot_end_time')?.toString() || null;
		const color_theme = data.get('color_theme')?.toString() || 'gray';
		const status = data.get('status')?.toString() || 'Active';

		if (!shift_code || !shift_name) {
			return fail(400, { success: false, message: 'กรุณากรอกรหัสและชื่อกะให้ครบถ้วน' });
		}

		try {
			if (mode === 'add') {
				const [existing]: any = await pool.execute(
					'SELECT shift_code FROM shift_master WHERE shift_code = ?',
					[shift_code]
				);
				
				if (existing.length > 0) {
					return fail(400, { success: false, message: 'รหัสกะนี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น' });
				}

				await pool.execute(
					`INSERT INTO shift_master (shift_code, shift_name, shift_category, start_time, end_time, ot_start_time, ot_end_time, color_theme, status) 
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[shift_code, shift_name, shift_category, start_time, end_time, ot_start_time, ot_end_time, color_theme, status]
				);
				return { success: true, message: 'เพิ่มรูปแบบกะสำเร็จ!' };
			} else {
				await pool.execute(
					`UPDATE shift_master SET 
					shift_code = ?, shift_name = ?, shift_category = ?, start_time = ?, end_time = ?, ot_start_time = ?, ot_end_time = ?, color_theme = ?, status = ? 
					WHERE shift_code = ?`,
					[shift_code, shift_name, shift_category, start_time, end_time, ot_start_time, ot_end_time, color_theme, status, original_code]
				);
				return { success: true, message: 'อัปเดตข้อมูลรูปแบบกะสำเร็จ!' };
			}
		} catch (error) {
			console.error('Save Shift Error:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const shift_code = data.get('shift_code')?.toString();

		if (!shift_code) return fail(400, { success: false, message: 'ไม่พบรหัสกะที่ต้องการลบ' });

		try {
			await pool.execute('DELETE FROM shift_master WHERE shift_code = ?', [shift_code]);
			return { success: true, message: 'ลบข้อมูลกะสำเร็จ!' };
		} catch (error) {
			console.error('Delete Shift Error:', error);
			return fail(500, {
				success: false,
				message: 'ไม่สามารถลบกะนี้ได้ (อาจมีการนำกะนี้ไปใช้ในตารางงานพนักงานแล้ว)'
			});
		}
	}
};