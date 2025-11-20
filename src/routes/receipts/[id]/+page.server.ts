import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params, locals }) => {
	const receiptId = parseInt(params.id);
	if (isNaN(receiptId)) throw error(404, 'Invalid Receipt ID');

	try {
		// 1. ดึงข้อมูลหัวใบเสร็จ (Header) + ข้อมูลลูกค้า
		const [receiptRows] = await pool.query<any[]>(
			`
            SELECT r.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name
            FROM receipts r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN users u ON r.created_by_user_id = u.id
            WHERE r.id = ?
        `,
			[receiptId]
		);

		if (receiptRows.length === 0) throw error(404, 'Receipt not found');
		const receipt = receiptRows[0];

		// 2. ดึงรายการสินค้า (Items)
		const [itemRows] = await pool.query<any[]>(
			`
            SELECT ri.*, u.symbol as unit_symbol
            FROM receipt_items ri
            LEFT JOIN units u ON ri.unit_id = u.id
            WHERE ri.receipt_id = ?
            ORDER BY ri.item_order ASC
        `,
			[receiptId]
		);

		// 3. ดึงไฟล์แนบ (Attachments)
		const [attachmentRows] = await pool.query<any[]>(
			`
            SELECT * FROM receipt_attachments WHERE receipt_id = ?
        `,
			[receiptId]
		);

		// ปรับ path ให้พร้อมใช้งานหน้าเว็บ
		const attachments = attachmentRows.map((file: any) => ({
			...file,
			url: `/uploads/receipts/${file.file_system_name}`
		}));

		return {
			receipt: JSON.parse(JSON.stringify(receipt)),
			items: JSON.parse(JSON.stringify(itemRows)),
			attachments: JSON.parse(JSON.stringify(attachments))
		};
	} catch (err: any) {
		console.error('Error loading receipt detail:', err);
		throw error(500, err.message);
	}
};
