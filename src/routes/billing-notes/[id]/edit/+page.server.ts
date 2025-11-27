import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูลใบวางบิล
		const [rows] = await pool.query<any[]>('SELECT * FROM billing_notes WHERE id = ?', [id]);
		if (rows.length === 0) throw error(404, 'Billing Note not found');

		// แปลงข้อมูลให้เป็น Plain Object
		const billingNote = JSON.parse(JSON.stringify(rows[0]));

		// 2. ดึงรายชื่อลูกค้า (สำหรับ Dropdown)
		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');

		return {
			billingNote,
			customers: JSON.parse(JSON.stringify(customers))
		};
	} catch (err: any) {
		console.error('Load Edit Billing Note Error:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const billing_date = formData.get('billing_date')?.toString();
		const due_date = formData.get('due_date')?.toString() || null;
		const notes = formData.get('notes')?.toString() || '';

		// รับค่า Total Amount โดยตรงจากการกรอก (Manual)
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });
		if (total_amount <= 0) return fail(400, { message: 'ยอดเงินรวมต้องมากกว่า 0' });

		try {
			// อัปเดตข้อมูลใบวางบิล (ไม่ต้องยุ่งกับตาราง billing_note_invoices หรือ invoices แล้ว)
			await pool.execute(
				`UPDATE billing_notes 
                 SET billing_date = ?, due_date = ?, customer_id = ?, notes = ?, total_amount = ? 
                 WHERE id = ?`,
				[billing_date, due_date, customer_id, notes, total_amount, id]
			);
		} catch (err: any) {
			console.error('Update Billing Note Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาด: ' + err.message });
		}

		throw redirect(303, `/billing-notes/${id}`);
	}
};
