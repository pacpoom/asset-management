import { fail } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ url }) => {
	// รับ id ของ Work Master ที่เลือก (ถ้ามี)
	const selectedMasterId = Number(url.searchParams.get('master_id')) || null;

	// [แก้ไข] เพิ่ม <any[]> เพื่อบอก TypeScript ว่าผลลัพธ์คือ Array
	const [masters] = await pool.query<any[]>('SELECT * FROM Work_Master ORDER BY id DESC');

	// 2. ดึงข้อมูล Work Items (Detail) เฉพาะของ Master ที่เลือก
	let details: any[] = [];
	if (selectedMasterId) {
		// [แก้ไข] เพิ่ม <any[]> ตรงนี้ด้วย
		const [rows] = await pool.query<any[]>(
			'SELECT * FROM Work_detail WHERE work_id = ? ORDER BY id ASC',
			[selectedMasterId]
		);
		details = rows;
	}

	return {
		masters: JSON.parse(JSON.stringify(masters)),
		details: JSON.parse(JSON.stringify(details)),
		selectedMasterId
	};
};

export const actions = {
	// Action สำหรับเพิ่ม Work Item (Detail)
	addDetail: async ({ request }) => {
		const formData = await request.formData();
		const work_id = formData.get('work_id');
		const work_name = formData.get('work_name');

		try {
			await pool.execute(
				'INSERT INTO Work_detail (work_id, work_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
				[work_id, work_name]
			);
			return { success: true };
		} catch (error: any) {
			console.error(error);
			return fail(500, { message: 'Failed to add item' });
		}
	},

	// Action สำหรับลบ Item
	deleteDetail: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		try {
			await pool.execute('DELETE FROM Work_detail WHERE id = ?', [id]);
			return { success: true };
		} catch (error: any) {
			return fail(500, { message: 'Delete failed' });
		}
	},

	addMaster: async ({ request }) => {
		const formData = await request.formData();
		const autoCode = `WC-${Date.now().toString().slice(-5)}`;
		const name = formData.get('name');

		try {
			await pool.execute(
				'INSERT INTO Work_Master (Work_Code, Work_description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
				[autoCode, name]
			);
			return { success: true };
		} catch (e) {
			return fail(500, { message: 'Failed' });
		}
	}
};
