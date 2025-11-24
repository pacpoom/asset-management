import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const invoiceId = parseInt(params.id);
	if (isNaN(invoiceId)) throw error(404, 'Invalid Invoice ID');

	try {
		// 1. ดึงข้อมูลหัวใบแจ้งหนี้ + ลูกค้า
		const [invoiceRows] = await pool.query<any[]>(
			`
            SELECT i.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN users u ON i.created_by_user_id = u.id
            WHERE i.id = ?
        `,
			[invoiceId]
		);

		if (invoiceRows.length === 0) throw error(404, 'Invoice not found');
		const invoice = invoiceRows[0];

		// 2. ดึงรายการสินค้า
		const [itemRows] = await pool.query<any[]>(
			`
            SELECT ii.*, u.symbol as unit_symbol
            FROM invoice_items ii
            LEFT JOIN units u ON ii.unit_id = u.id
            WHERE ii.invoice_id = ?
            ORDER BY ii.item_order ASC
        `,
			[invoiceId]
		);

		// 3. ดึงไฟล์แนบ
		const [attachmentRows] = await pool.query<any[]>(
			`
            SELECT * FROM invoice_attachments WHERE invoice_id = ?
        `,
			[invoiceId]
		);

		const attachments = attachmentRows.map((file: any) => ({
			...file,
			url: `/uploads/invoices/${file.file_system_name}`
		}));

		return {
			invoice: JSON.parse(JSON.stringify(invoice)),
			items: JSON.parse(JSON.stringify(itemRows)),
			attachments: JSON.parse(JSON.stringify(attachments)),
			availableStatuses: ['Draft', 'Sent', 'Paid', 'Overdue', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading invoice detail:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const invoiceId = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (isNaN(invoiceId) || !status) {
			return fail(400, { message: 'ข้อมูลไม่ครบถ้วน' });
		}

		try {
			await pool.execute('UPDATE invoices SET status = ? WHERE id = ?', [status, invoiceId]);
			return { success: true };
		} catch (err: any) {
			console.error('Update Status Error:', err);
			return fail(500, { message: err.message });
		}
	}
};
