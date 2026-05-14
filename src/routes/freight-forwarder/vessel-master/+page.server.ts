import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async () => {
	try {
		const [vessels] = await pool.query(
			`SELECT vm.*, l.name AS liner_name, l.code AS liner_code
       FROM vessel_master vm
       LEFT JOIN liners l ON vm.liner_id = l.id
       ORDER BY vm.vessel_name ASC`
		);

		const [liners] = await pool.query(
			`SELECT id, code, name FROM liners WHERE status = 'Active' ORDER BY name ASC`
		);

		return {
			vessels: JSON.parse(JSON.stringify(vessels)),
			liners: JSON.parse(JSON.stringify(liners))
		};
	} catch (error) {
		console.error('Vessel Master Load Error:', error);
		return { vessels: [], liners: [] };
	}
};

export const actions = {
	save: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString().trim() || '';
		const vessel_name = formData.get('vessel_name')?.toString().trim();
		const liner_id = formData.get('liner_id')?.toString().trim() || null;
		const storage_days = parseInt(formData.get('storage_days')?.toString() || '3') || 3;
		const demurrage_days = parseInt(formData.get('demurrage_days')?.toString() || '3') || 3;
		const detention_days = parseInt(formData.get('detention_days')?.toString() || '32') || 32;
		const status = formData.get('status')?.toString() || 'Active';

		if (!vessel_name) return fail(400, { message: 'กรุณากรอกชื่อเรือ' });

		try {
			if (id) {
				await pool.query(
					`UPDATE vessel_master
           SET vessel_name=?, liner_id=?, storage_days=?, demurrage_days=?, detention_days=?, status=?, updated_at=NOW()
           WHERE id=?`,
					[vessel_name, liner_id || null, storage_days, demurrage_days, detention_days, status, id]
				);
			} else {
				await pool.query(
					`INSERT INTO vessel_master (vessel_name, liner_id, storage_days, demurrage_days, detention_days, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
					[vessel_name, liner_id || null, storage_days, demurrage_days, detention_days, status]
				);
			}
			return { success: true };
		} catch (error) {
			console.error('Save Vessel Error:', error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลเรือ' });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบ ID ที่ต้องการลบ' });

		try {
			await pool.query('DELETE FROM vessel_master WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			console.error('Delete Vessel Error:', error);
			return fail(500, { message: 'ไม่สามารถลบข้อมูลเรือได้' });
		}
	}
};
