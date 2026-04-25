import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	try {
		const [divisions]: any = await pool.execute(
			'SELECT * FROM divisions ORDER BY division_name ASC'
		);
		const [sections]: any = await pool.execute('SELECT * FROM sections ORDER BY section_name ASC');
		const [rawPositions]: any = await pool.execute(
			'SELECT * FROM job_positions ORDER BY position_name ASC'
		);
		const positions = rawPositions.map((pos: any) => ({
			...pos,
			status: pos.status == 1 || pos.status === 'Active' ? 'Active' : 'Inactive'
		}));

		return { divisions, sections, positions };
	} catch (error) {
		return { divisions: [], sections: [], positions: [] };
	}
};

export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();
		const tab = data.get('tab')?.toString();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;
		const status = data.get('status')?.toString() || 'Active';

		if (!name) return fail(400, { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

		let table = 'divisions',
			col = 'division_name';
		let finalStatus: string | number = status;

		if (tab === 'section') {
			table = 'sections';
			col = 'section_name';
		}
		if (tab === 'position') {
			table = 'job_positions';
			col = 'position_name';
			finalStatus = status === 'Active' ? 1 : 0;
		}

		try {
			if (id) {
				await pool.execute(
					`UPDATE ${table} SET ${col} = ?, description = ?, status = ? WHERE id = ?`,
					[name, description, finalStatus, id]
				);
			} else {
				await pool.execute(`INSERT INTO ${table} (${col}, description, status) VALUES (?, ?, ?)`, [
					name,
					description,
					finalStatus
				]);
			}
			return { success: true, message: 'บันทึกสำเร็จ' };
		} catch (error) {
			console.error(error);
			return fail(400, { success: false, message: 'ข้อมูลซ้ำหรือผิดพลาด' });
		}
	},
	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const tab = data.get('tab')?.toString();
		let table = tab === 'section' ? 'sections' : tab === 'position' ? 'job_positions' : 'divisions';
		try {
			await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
			return { success: true, message: 'ลบข้อมูลสำเร็จ' };
		} catch (error) {
			return fail(500, { success: false, message: 'ไม่สามารถลบได้ ข้อมูลกำลังถูกใช้งาน' });
		}
	}
};
