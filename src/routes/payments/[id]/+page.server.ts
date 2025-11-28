import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		const [rows] = await pool.query<any[]>('SELECT * FROM general_vouchers WHERE id = ?', [id]);
		if (rows.length === 0) throw error(404, 'Voucher not found');

		return {
			voucher: JSON.parse(JSON.stringify(rows[0]))
		};
	} catch (err: any) {
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	delete: async ({ params }) => {
		const id = parseInt(params.id);
		try {
			await pool.execute('DELETE FROM general_vouchers WHERE id = ?', [id]);
		} catch (err: any) {
			console.error('Delete error:', err);
			return fail(500, { message: 'ลบไม่สำเร็จ: ' + err.message });
		}
		throw redirect(303, '/payments');
	}
};
