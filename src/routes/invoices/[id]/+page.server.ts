import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		//ดึงข้อมูลใบแจ้งหนี้
		const [rows] = await pool.query<any[]>(
			`
            SELECT i.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN users u ON i.created_by_user_id = u.id
            WHERE i.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Invoice not found');
		const invoice = rows[0];

		//ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`
            SELECT ii.*, u.symbol as unit_symbol
            FROM invoice_items ii
            LEFT JOIN units u ON ii.unit_id = u.id
            WHERE ii.invoice_id = ?
            ORDER BY ii.item_order ASC
        `,
			[id]
		);

		//ดึงไฟล์แนบ
		const [attachments] = await pool.query<any[]>(
			`
            SELECT * FROM invoice_attachments WHERE invoice_id = ?
        `,
			[id]
		);

		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/invoices/${f.file_system_name}`
		}));

		//ดึงข้อมูลบริษัท
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			invoice: JSON.parse(JSON.stringify(invoice)),
			items: JSON.parse(JSON.stringify(items)),
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),

			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['Draft', 'Sent', 'Paid', 'Overdue', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading invoice:', err);
		throw error(500, err.message);
	}
};

//เปลี่ยนสถานะ
export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE invoices SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
