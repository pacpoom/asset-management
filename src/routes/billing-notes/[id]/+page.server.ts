import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	let connection;
	try {
		connection = await pool.getConnection();

		const [bnRows] = await connection.query<any[]>(`SELECT * FROM billing_notes WHERE id = ?`, [
			id
		]);
		if (bnRows.length === 0) throw error(404, 'Not found');
		const billingNote = bnRows[0];

		let customer = { name: '-', address: '-', tax_id: '-' };
		if (billingNote.customer_id) {
			const [cRows] = await connection.query<any[]>(`SELECT * FROM customers WHERE id = ?`, [
				billingNote.customer_id
			]);
			if (cRows.length > 0) customer = cRows[0];
		}
		billingNote.customer_name = customer.name;
		billingNote.customer_address = customer.address;
		billingNote.customer_tax_id = customer.tax_id;

		const [uRows] = await connection.query<any[]>(`SELECT full_name FROM users WHERE id = ?`, [
			billingNote.created_by_user_id || 0
		]);
		billingNote.created_by_name = uRows[0]?.full_name || '-';

		const [items] = await connection.query<any[]>(
			`SELECT * FROM billing_note_items WHERE billing_note_id = ? ORDER BY id ASC`,
			[id]
		);

		const [companyRows] = await connection.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			billingNote: JSON.parse(JSON.stringify(billingNote)),
			items: JSON.parse(JSON.stringify(items)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null
		};
	} catch (err: any) {
		console.error('Error:', err);
		throw error(500, err.message);
	} finally {
		if (connection) connection.release();
	}
};

export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE billing_notes SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
