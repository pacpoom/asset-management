import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูลหัวใบวางบิล
		const [rows] = await pool.query<any[]>('SELECT * FROM billing_notes WHERE id = ?', [id]);
		if (rows.length === 0) throw error(404, 'Billing Note not found');
		const billingNote = rows[0];

		// 2. ดึงรายชื่อลูกค้า
		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');

		// 3. ดึงรายการ Invoice ที่เกี่ยวข้อง
		// Logic: เอา Invoice ที่ (เป็นของลูกค้านี้) AND ((สถานะค้างจ่าย) OR (อยู่ในใบวางบิลนี้อยู่แล้ว))
		const [invoices] = await pool.query<any[]>(
			`
            SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.total_amount, i.customer_id,
                   CASE WHEN bni.id IS NOT NULL THEN 1 ELSE 0 END as is_selected
            FROM invoices i
            LEFT JOIN billing_note_invoices bni ON i.id = bni.invoice_id AND bni.billing_note_id = ?
            WHERE i.customer_id = ? 
              AND (i.status IN ('Sent', 'Overdue') OR bni.id IS NOT NULL)
            ORDER BY i.invoice_date ASC
        `,
			[id, billingNote.customer_id]
		);

		return {
			billingNote: JSON.parse(JSON.stringify(billingNote)),
			customers: JSON.parse(JSON.stringify(customers)),
			availableInvoices: JSON.parse(JSON.stringify(invoices))
		};
	} catch (err: any) {
		console.error('Error loading edit data:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();

		const billing_date = formData.get('billing_date')?.toString();
		const due_date = formData.get('due_date')?.toString();
		const notes = formData.get('notes')?.toString() || '';
		const selectedInvoiceIdsJson = formData.get('selected_invoices')?.toString() || '[]';
		const selectedInvoiceIds = JSON.parse(selectedInvoiceIdsJson);

		if (selectedInvoiceIds.length === 0) {
			return fail(400, { message: 'กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// 1. คำนวณยอดรวมใหม่
			const placeholders = selectedInvoiceIds.map(() => '?').join(',');
			const [invoicesToBill] = await connection.query<any[]>(
				`SELECT id, total_amount FROM invoices WHERE id IN (${placeholders})`,
				selectedInvoiceIds
			);
			const totalAmount = invoicesToBill.reduce(
				(sum: number, inv: any) => sum + Number(inv.total_amount),
				0
			);

			// 2. อัปเดตหัวเอกสาร
			await connection.execute(
				`UPDATE billing_notes 
                 SET billing_date = ?, due_date = ?, notes = ?, total_amount = ? 
                 WHERE id = ?`,
				[billing_date, due_date, notes, totalAmount, id]
			);

			// 3. อัปเดตรายการ (ลบเก่า ใส่ใหม่)
			await connection.execute('DELETE FROM billing_note_invoices WHERE billing_note_id = ?', [id]);

			for (const inv of invoicesToBill) {
				await connection.execute(
					`INSERT INTO billing_note_invoices (billing_note_id, invoice_id, amount) VALUES (?, ?, ?)`,
					[id, inv.id, inv.total_amount]
				);
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			return fail(500, { message: err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/billing-notes/${id}`);
	}
};
