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
		// 1. ดึงลูกค้า
		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');

		// 2. ดึงใบแจ้งหนี้ที่ "รอวางบิล/ค้างจ่าย" (Sent, Overdue)
		// เราดึงมาหมดก่อน แล้วค่อยไป Filter ตามลูกค้าในหน้าเว็บ (หรือจะทำ API แยกก็ได้ถ้าข้อมูลเยอะ)
		const [unpaidInvoices] = await pool.query(`
            SELECT id, invoice_number, invoice_date, due_date, total_amount, customer_id 
            FROM invoices 
            WHERE status IN ('Sent', 'Overdue') 
            ORDER BY invoice_date ASC
        `);

		return {
			customers: JSON.parse(JSON.stringify(customers)),
			unpaidInvoices: JSON.parse(JSON.stringify(unpaidInvoices))
		};
	} catch (error: any) {
		console.error('Load error:', error);
		return { customers: [], unpaidInvoices: [] };
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

		// รับรายการ ID ของ Invoice ที่เลือก (ส่งมาเป็น JSON Array)
		const selectedInvoiceIdsJson = formData.get('selected_invoices')?.toString() || '[]';
		const selectedInvoiceIds = JSON.parse(selectedInvoiceIdsJson);

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });
		if (selectedInvoiceIds.length === 0)
			return fail(400, { message: 'กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// 1. คำนวณยอดรวม (Security Check: ดึงราคาจริงจาก DB มาบวกกัน กัน User แก้หน้าเว็บ)
			// สร้าง string placeholder เช่น (?, ?, ?)
			const placeholders = selectedInvoiceIds.map(() => '?').join(',');
			const [invoicesToBill] = await connection.query<any[]>(
				`SELECT id, total_amount FROM invoices WHERE id IN (${placeholders})`,
				selectedInvoiceIds
			);

			const totalAmount = invoicesToBill.reduce(
				(sum: number, inv: any) => sum + Number(inv.total_amount),
				0
			);

			// 2. สร้างเลขที่เอกสาร
			const billing_note_number = await generateBillingNoteNumber(billing_date);

			// 3. บันทึกหัวเอกสาร (billing_notes)
			const [result] = await connection.execute<any>(
				`INSERT INTO billing_notes 
                (billing_note_number, billing_date, due_date, customer_id, notes, total_amount, status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, 'Sent', ?)`,
				[
					billing_note_number,
					billing_date,
					due_date,
					customer_id,
					notes,
					totalAmount,
					locals.user?.id || null
				]
			);
			const billingNoteId = result.insertId;

			// 4. บันทึกรายการ (billing_note_invoices)
			for (const inv of invoicesToBill) {
				await connection.execute(
					`INSERT INTO billing_note_invoices (billing_note_id, invoice_id, amount) VALUES (?, ?, ?)`,
					[billingNoteId, inv.id, inv.total_amount]
				);
			}

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
