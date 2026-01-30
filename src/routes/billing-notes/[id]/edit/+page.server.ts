// ไฟล์: billing-notes/[id]/edit/+page.server.ts
import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		const connection = await pool.getConnection();

		// 1. ดึงข้อมูล Header
		const [rows] = await connection.query<any[]>('SELECT * FROM billing_notes WHERE id = ?', [id]);
		if (rows.length === 0) throw error(404, 'Billing Note not found');
		const billingNote = rows[0];

		// 2. ดึงรายการสินค้าเดิม (Items)
		const [items] = await connection.query<any[]>(
			'SELECT * FROM billing_note_items WHERE billing_note_id = ? ORDER BY id ASC',
			[id]
		);

		// 3. ดึงลูกค้า และ สินค้า (สำหรับ Dropdown)
		const [customers] = await connection.query('SELECT id, name FROM customers ORDER BY name ASC');
		const [products] = await connection.query('SELECT * FROM products ORDER BY name ASC');

		connection.release();

		return {
			billingNote: JSON.parse(JSON.stringify(billingNote)),
			existingItems: JSON.parse(JSON.stringify(items)), // ส่งรายการเดิมไป
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products))
		};
	} catch (err: any) {
		console.error('Load Edit Error:', err);
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

		// รับรายการสินค้าที่แก้ไขแล้ว (JSON)
		const itemsJson = formData.get('items');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// 1. อัปเดต Header ข้อมูลทั่วไป
			await connection.execute(
				`UPDATE billing_notes 
                 SET billing_date = ?, due_date = ?, customer_id = ?, notes = ?
                 WHERE id = ?`,
				[billing_date, due_date, customer_id, notes, id]
			);

			// 2. จัดการรายการสินค้า (ลบของเก่า -> ใส่ของใหม่)
			const items = itemsJson ? JSON.parse(itemsJson.toString()) : [];
			let grandTotal = 0;

			// 2.1 ลบรายการเดิมทั้งหมดของใบวางบิลนี้
			await connection.execute('DELETE FROM billing_note_items WHERE billing_note_id = ?', [id]);

			// 2.2 วนลูปบันทึกรายการใหม่
			if (items.length > 0) {
				for (const item of items) {
					const qty = Number(item.quantity) || 0;
					const price = Number(item.unit_price) || 0;
					const lineTotal = qty * price;

					await connection.execute(
						`INSERT INTO billing_note_items (billing_note_id, product_id, item_name, quantity, unit_price, amount) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
						[id, item.product_id || null, item.item_name, qty, price, lineTotal]
					);
					grandTotal += lineTotal;
				}
			}

			// 3. อัปเดตยอดรวม (Total Amount) ใหม่ที่ Header
			await connection.execute(`UPDATE billing_notes SET total_amount = ? WHERE id = ?`, [
				grandTotal,
				id
			]);

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Update Billing Note Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาด: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/billing-notes/${id}`);
	}
};
