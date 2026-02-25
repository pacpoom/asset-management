import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูลใบวางบิล พร้อม Join ข้อมูลลูกค้า
		const [rows] = await pool.query<any[]>(
			`SELECT bn.*, 
                    c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id
             FROM billing_notes bn
             LEFT JOIN customers c ON bn.customer_id = c.id
             WHERE bn.id = ?`,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Billing Note not found');
		const billingNote = rows[0];

		// 2. ดึงรายการสินค้า พร้อม Join หน่วย (Symbol)
		const [items] = await pool.query<any[]>(
			`SELECT bni.*, u.symbol as unit_symbol
             FROM billing_note_items bni
             LEFT JOIN units u ON bni.unit_id = u.id
             WHERE bni.billing_note_id = ?
             ORDER BY bni.id ASC`,
			[id]
		);

		// 3. ดึงข้อมูลบริษัท (สำหรับหัวกระดาษ)
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			billingNote: JSON.parse(JSON.stringify(billingNote)),
			items: JSON.parse(JSON.stringify(items)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['Draft', 'Sent', 'Paid', 'Overdue', 'Void'],
			attachments: [] // ถ้ามีตารางไฟล์แนบให้ดึงมาใส่ตรงนี้ครับ
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

		if (!id || !status) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง' });

		try {
			await pool.execute('UPDATE billing_notes SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
