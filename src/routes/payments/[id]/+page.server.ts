import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		//ดึงข้อมูลใบสำคัญทั่วไป
		const [rows] = await pool.query<any[]>(`SELECT * FROM general_vouchers WHERE id = ?`, [id]);

		if (rows.length === 0) throw error(404, 'Voucher not found');
		const voucher = rows[0];

		//ดึงข้อมูลบริษัท
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			voucher: JSON.parse(JSON.stringify(voucher)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			// สถานะที่เปลี่ยนได้
			availableStatuses: ['Draft', 'Posted', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading payment voucher:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE general_vouchers SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	},

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
