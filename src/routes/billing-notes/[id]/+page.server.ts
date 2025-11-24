import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงหัวเอกสาร
		const [rows] = await pool.query<any[]>(
			`
            SELECT bn.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name
            FROM billing_notes bn
            LEFT JOIN customers c ON bn.customer_id = c.id
            LEFT JOIN users u ON bn.created_by_user_id = u.id
            WHERE bn.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Billing Note not found');
		const billingNote = rows[0];

		// 2. ดึงรายการใบแจ้งหนี้ที่วางบิล
		const [invoices] = await pool.query<any[]>(
			`
            SELECT bni.*, i.invoice_number, i.invoice_date, i.due_date as invoice_due_date
            FROM billing_note_invoices bni
            LEFT JOIN invoices i ON bni.invoice_id = i.id
            WHERE bni.billing_note_id = ?
        `,
			[id]
		);

		return {
			billingNote: JSON.parse(JSON.stringify(billingNote)),
			invoices: JSON.parse(JSON.stringify(invoices)),
			// ส่ง status ไปให้ Dropdown เปลี่ยนสถานะ
			availableStatuses: ['Draft', 'Sent', 'Paid', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading billing note:', err);
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
			await pool.execute('UPDATE billing_notes SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
