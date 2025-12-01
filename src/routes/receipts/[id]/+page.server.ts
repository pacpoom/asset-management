import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูลใบเสร็จรับเงิน
		const [rows] = await pool.query<any[]>(
			`
            SELECT r.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name
            FROM receipts r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN users u ON r.created_by_user_id = u.id
            WHERE r.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Receipt not found');
		const receipt = rows[0];

		// 2. ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`
            SELECT ri.*, u.symbol as unit_symbol
            FROM receipt_items ri
            LEFT JOIN units u ON ri.unit_id = u.id
            WHERE ri.receipt_id = ?
            ORDER BY ri.item_order ASC
        `,
			[id]
		);

		// 3. ดึงไฟล์แนบ
		const [attachments] = await pool.query<any[]>(
			`
            SELECT * FROM receipt_attachments WHERE receipt_id = ?
        `,
			[id]
		);

		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/receipts/${f.file_system_name}`
		}));

		// 4. ดึงข้อมูลบริษัท
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			receipt: JSON.parse(JSON.stringify(receipt)),
			items: JSON.parse(JSON.stringify(items)),
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			// สถานะใบเสร็จฯ มักจะมีแค่ Draft (ร่าง), Issued (ออกแล้ว), Void (ยกเลิก)
			availableStatuses: ['Draft', 'Issued', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading receipt:', err);
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
			await pool.execute('UPDATE receipts SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
