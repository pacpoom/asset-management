import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	const [rows] = await pool.query<any[]>('SELECT * FROM general_vouchers WHERE id = ?', [id]);
	if (rows.length === 0) throw error(404, 'Not found');

	return { voucher: JSON.parse(JSON.stringify(rows[0])) };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();

		const date = formData.get('voucher_date');
		const contact = formData.get('contact_name');
		const desc = formData.get('description');

		// รับค่าตัวเลขใหม่
		const subtotal = parseFloat(formData.get('subtotal')?.toString() || '0');
		const vat_rate = parseFloat(formData.get('vat_rate')?.toString() || '0');
		const vat_amount = parseFloat(formData.get('vat_amount')?.toString() || '0');
		const wht_rate = parseFloat(formData.get('wht_rate')?.toString() || '0');
		const wht_amount = parseFloat(formData.get('wht_amount')?.toString() || '0');
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		try {
			await pool.execute(
				`UPDATE general_vouchers 
                 SET voucher_date=?, contact_name=?, description=?, 
                     subtotal=?, vat_rate=?, vat_amount=?, wht_rate=?, wht_amount=?, total_amount=?
                 WHERE id=?`,
				[
					date,
					contact,
					desc,
					subtotal,
					vat_rate,
					vat_amount,
					wht_rate,
					wht_amount,
					total_amount,
					id
				]
			);
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
		throw redirect(303, `/payments/${id}`);
	}
};
