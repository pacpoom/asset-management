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

		const [products] = await connection.query<any[]>(
			'SELECT id, name, selling_price as price, default_wht_rate FROM products ORDER BY name ASC'
		);

		let units = [];
		try {
			[units] = await connection.query<any[]>(
				'SELECT id, name, symbol FROM units ORDER BY name ASC'
			);
		} catch (unitErr) {
			console.log('No units table or error fetching units:', unitErr);
		}

		connection.release();

		return {
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units))
		};
	} catch (err: any) {
		console.error('Error loading create data:', err);
		return { customers: [], products: [], units: [] };
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
		const itemsJson = formData.get('itemsJson');

		const subtotal = parseFloat(formData.get('subtotal')?.toString() || '0');
		const discount_amount = parseFloat(formData.get('discount_amount')?.toString() || '0');
		const vat_rate = parseFloat(formData.get('vat_rate')?.toString() || '0');
		const vat_amount = parseFloat(formData.get('vat_amount')?.toString() || '0');

		const withholding_tax_amount = parseFloat(
			formData.get('withholding_tax_amount')?.toString() || '0'
		);
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const billing_note_number = await generateBillingNoteNumber(billing_date);

			const [result] = await connection.execute<any>(
				`INSERT INTO billing_notes 
                (billing_note_number, billing_date, due_date, customer_id, notes, 
                 subtotal, discount_amount, vat_rate, vat_amount, withholding_tax_amount, total_amount, 
                 status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sent', ?)`,
				[
					billing_note_number,
					billing_date,
					due_date,
					customer_id,
					notes,
					subtotal,
					discount_amount,
					vat_rate,
					vat_amount,
					withholding_tax_amount,
					total_amount,
					locals.user?.id || null
				]
			);

			const billingNoteId = result.insertId;
			const items = itemsJson ? JSON.parse(itemsJson.toString()) : [];

			if (items.length > 0) {
				for (const item of items) {
					const qty = Number(item.quantity) || 0;
					const price = Number(item.unit_price) || 0;
					const lineTotal = qty * price;

					const whtRate = Number(item.wht_rate || 0);
					const whtAmount = lineTotal * (whtRate / 100);

					const itemDescription = item.description || '';
					const unitId = item.unit_id || null;

					await connection.execute(
						`INSERT INTO billing_note_items 
						(billing_note_id, product_id, description, quantity, unit_id, unit_price, amount, wht_rate, wht_amount) 
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							billingNoteId,
							item.product_id || null,
							itemDescription,
							qty,
							unitId,
							price,
							lineTotal,
							whtRate,
							whtAmount
						]
					);
				}
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
