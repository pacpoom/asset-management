import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

async function generateBillingNoteNumber(dateStr: string) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const prefix = `BN-${year}${month}-`;

	const [rows] = await pool.query<any[]>(
		`SELECT billing_note_number FROM billing_notes WHERE billing_note_number LIKE ? ORDER BY billing_note_number DESC LIMIT 1`,
		[`${prefix}%`]
	);

	let nextNum = 1;
	if (rows.length > 0) {
		const lastNumStr = rows[0].billing_note_number.split('-').pop();
		nextNum = parseInt(lastNumStr) + 1;
	}
	return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export const load: PageServerLoad = async () => {
	try {
		const connection = await pool.getConnection();

		const [customers] = await connection.query<any[]>(
			'SELECT id, name FROM customers ORDER BY name ASC'
		);

		const [products] = await connection.query<any[]>('SELECT * FROM products ORDER BY name ASC');

		connection.release();

		return {
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products))
		};
	} catch (err: any) {
		console.error('Error loading create data:', err);
		return { customers: [], products: [] };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const billing_date =
			formData.get('billing_date')?.toString() || new Date().toISOString().split('T')[0];
		const due_date = formData.get('due_date')?.toString() || null;
		const notes = formData.get('notes')?.toString() || '';

		const itemsJson = formData.get('items');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const billing_note_number = await generateBillingNoteNumber(billing_date);

			const [result] = await connection.execute<any>(
				`INSERT INTO billing_notes 
                (billing_note_number, billing_date, due_date, customer_id, notes, total_amount, status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, 0, 'Sent', ?)`,
				[billing_note_number, billing_date, due_date, customer_id, notes, locals.user?.id || null]
			);

			const billingNoteId = result.insertId;
			const items = itemsJson ? JSON.parse(itemsJson.toString()) : [];
			let grandTotal = 0;

			if (items.length > 0) {
				for (const item of items) {
					const qty = Number(item.quantity) || 0;
					const price = Number(item.unit_price) || 0;
					const lineTotal = qty * price;

					await connection.execute(
						`INSERT INTO billing_note_items (billing_note_id, product_id, item_name, quantity, unit_price, amount) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
						[billingNoteId, item.product_id || null, item.item_name, qty, price, lineTotal]
					);
					grandTotal += lineTotal;
				}

				await connection.execute(`UPDATE billing_notes SET total_amount = ? WHERE id = ?`, [
					grandTotal,
					billingNoteId
				]);
			}

			await connection.commit();

			throw redirect(303, `/billing-notes/${billingNoteId}`);
		} catch (err: any) {
			await connection.rollback();
			if (err.status === 303) throw err;
			console.error('Create billing note error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}
	}
};
