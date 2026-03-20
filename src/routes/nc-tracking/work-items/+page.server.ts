import { fail } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ url }) => {
	const selectedMasterId = Number(url.searchParams.get('master_id')) || null;

	const [masters] = await pool.query<any[]>('SELECT * FROM Work_Master ORDER BY id DESC');

	let details: any[] = [];
	if (selectedMasterId) {
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

	updateDetail: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const work_name = formData.get('work_name');

		try {
			await pool.execute('UPDATE Work_detail SET work_name = ?, updated_at = NOW() WHERE id = ?', [
				work_name,
				id
			]);
			return { success: true };
		} catch (error: any) {
			console.error(error);
			return fail(500, { message: 'Failed to update item' });
		}
	},

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
		const code = formData.get('code');
		const name = formData.get('name');

		try {
			await pool.execute(
				'INSERT INTO Work_Master (Work_Code, Work_description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
				[code, name]
			);
			return { success: true };
		} catch (e) {
			return fail(500, { message: 'Failed' });
		}
	},

	updateMaster: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const code = formData.get('code');
		const name = formData.get('name');

		try {
			await pool.execute(
				'UPDATE Work_Master SET Work_Code = ?, Work_description = ?, updated_at = NOW() WHERE id = ?',
				[code, name, id]
			);
			return { success: true };
		} catch (error: any) {
			console.error(error);
			return fail(500, { message: 'Failed to update master' });
		}
	},

	deleteMaster: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		try {
			await pool.execute('DELETE FROM Work_detail WHERE work_id = ?', [id]);
			await pool.execute('DELETE FROM Work_Master WHERE id = ?', [id]);
			return { success: true };
		} catch (error: any) {
			console.error(error);
			return fail(500, { message: 'Delete failed' });
		}
	}
};
