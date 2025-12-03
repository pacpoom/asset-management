import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูลใบสั่งซื้อ
		const [rows] = await pool.query<any[]>(
			`
            SELECT po.*, 
                   v.name as vendor_name, v.address as vendor_address, v.tax_id as vendor_tax_id, v.phone as vendor_phone, v.email as vendor_email,
                   u.full_name as created_by_name
            FROM purchase_orders po
            LEFT JOIN vendors v ON po.vendor_id = v.id
            LEFT JOIN users u ON po.created_by = u.id
            WHERE po.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Purchase Order not found');
		const po = rows[0];

		// 2. ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY id ASC`,
			[id]
		);

		// 3. ดึงข้อมูลบริษัท
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			po: JSON.parse(JSON.stringify(po)),
			items: JSON.parse(JSON.stringify(items)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['DRAFT', 'SENT', 'PARTIAL', 'COMPLETED', 'CANCELLED']
		};
	} catch (err: any) {
		console.error('Error loading PO:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	// เปลี่ยนสถานะ
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	},

	// ลบใบสั่งซื้อ
	delete: async ({ params }) => {
		const id = parseInt(params.id);
		if (!id) return fail(400, { message: 'Invalid ID' });

		try {
			const connection = await pool.getConnection();
			await connection.beginTransaction();

			// ลบรายการสินค้าและใบสั่งซื้อ (Foreign key cascade อาจจะช่วยลบ item ให้ แต่เขียนเผื่อไว้)
			await connection.execute('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [
				id
			]);
			await connection.execute('DELETE FROM purchase_orders WHERE id = ?', [id]);

			await connection.commit();
			connection.release();
		} catch (err: any) {
			console.error('Delete Error:', err);
			return fail(500, { message: err.message });
		}

		throw redirect(303, '/purchase-orders');
	}
};
