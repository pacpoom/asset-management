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

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');

		return {
			customers: JSON.parse(JSON.stringify(customers))
		};
	} catch (error: any) {
		console.error('Load error:', error);
		return { customers: [] };
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

		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });
		if (total_amount <= 0) return fail(400, { message: 'ยอดเงินรวมต้องมากกว่า 0' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const billing_note_number = await generateBillingNoteNumber(billing_date);

			await connection.execute<any>(
				`INSERT INTO billing_notes 
                (billing_note_number, billing_date, due_date, customer_id, notes, total_amount, status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, 'Sent', ?)`,
				[
					billing_note_number,
					billing_date,
					due_date,
					customer_id,
					notes,
					total_amount,
					locals.user?.id || null
				]
			);

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Create billing note error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, '/billing-notes');
	}
};
