import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface Vendor extends RowDataPacket {
	id: number;
	name: string;
	company_name: string | null;
	address: string | null;
	tax_id: string | null;
}

// เพิ่ม Interface
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	purchase_cost: number;
	unit_id: number | null;
	unit_name: string | null;
}

interface Unit extends RowDataPacket {
	id: number;
	name: string;
	symbol: string | null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	checkPermission(locals, 'view vendors');
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงรายชื่อ Vendors
		const [vendors] = await pool.query<Vendor[]>(
			'SELECT id, name, company_name, address, tax_id FROM vendors ORDER BY name ASC'
		);

		// 2. ดึงข้อมูลใบสั่งซื้อ (Header)
		const [poRows] = await pool.query<RowDataPacket[]>(
			'SELECT * FROM purchase_orders WHERE id = ?',
			[id]
		);
		if (poRows.length === 0) throw error(404, 'Purchase Order not found');
		const po = poRows[0];

		// 3. ดึงรายการสินค้า (Items)
		const [itemRows] = await pool.query<RowDataPacket[]>(
			'SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY id ASC',
			[id]
		);

		// 4. (เพิ่มใหม่) ดึง Products สำหรับ Dropdown
		const [products] = await pool.query<Product[]>(`
            SELECT 
                p.id, 
                p.sku, 
                p.name, 
                p.purchase_cost, 
                p.unit_id,
                u.name AS unit_name
            FROM products p
            LEFT JOIN units u ON p.unit_id = u.id
            WHERE p.is_active = 1
            ORDER BY p.name ASC
        `);

		// 5. (เพิ่มใหม่) ดึง Units ทั้งหมด
		const [units] = await pool.query<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);

		return {
			vendors: JSON.parse(JSON.stringify(vendors)),
			po: JSON.parse(JSON.stringify(po)),
			items: JSON.parse(JSON.stringify(itemRows)),
			products: JSON.parse(JSON.stringify(products)), // ส่งเพิ่ม
			units: JSON.parse(JSON.stringify(units)) // ส่งเพิ่ม
		};
	} catch (err: any) {
		console.error('Failed to load Edit PO data:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	// ... (ส่วน actions.update ใช้โค้ดเดิมได้เลยครับ ไม่ต้องแก้)
	update: async ({ request, params, locals }) => {
		checkPermission(locals, 'view vendors');
		const id = parseInt(params.id);
		const formData = await request.formData();

		const po_number = formData.get('po_number') as string;
		const date = formData.get('date') as string;
		const vendor_id = formData.get('vendor_id');
		const contact_person = (formData.get('contact_person') as string) || null;
		const delivery_date = (formData.get('delivery_date') as string) || null;
		const payment_term = (formData.get('payment_term') as string) || null;
		const remarks = (formData.get('remarks') as string) || '';

		const itemsJson = formData.get('items_json') as string;
		let items = [];
		try {
			items = JSON.parse(itemsJson);
		} catch (e) {
			return fail(400, { message: 'Items error' });
		}

		const subtotal = parseFloat((formData.get('subtotal') as string) || '0');
		const discount = parseFloat((formData.get('discount') as string) || '0');
		const vat_rate = parseFloat((formData.get('vat_rate') as string) || '7');
		const vat_amount = parseFloat((formData.get('vat_amount') as string) || '0');
		const wht_rate = parseFloat((formData.get('wht_rate') as string) || '0');
		const wht_amount = parseFloat((formData.get('wht_amount') as string) || '0');
		const total_amount = parseFloat((formData.get('total_amount') as string) || '0');

		if (!vendor_id || !date || items.length === 0) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// Update หัวบิล
			await connection.execute(
				`UPDATE purchase_orders 
                 SET po_number=?, po_date=?, vendor_id=?, contact_person=?, delivery_date=?, payment_term=?, remarks=?, 
                     subtotal=?, discount=?, vat_rate=?, vat_amount=?, wht_rate=?, wht_amount=?, total_amount=?, 
                     updated_at=NOW()
                 WHERE id=?`,
				[
					po_number,
					date,
					vendor_id,
					contact_person,
					delivery_date,
					payment_term,
					remarks,
					subtotal,
					discount,
					vat_rate,
					vat_amount,
					wht_rate,
					wht_amount,
					total_amount,
					id
				]
			);

			// Update รายการสินค้า
			await connection.execute('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [
				id
			]);

			for (const item of items) {
				await connection.execute(
					`INSERT INTO purchase_order_items 
                    (purchase_order_id, product_name, quantity, unit, unit_price, discount, total_price)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
					[
						id,
						item.product_name,
						item.quantity,
						item.unit,
						item.unit_price,
						item.discount || 0,
						item.total_price
					]
				);
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Update PO Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึก: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/purchase-orders/${id}`);
	}
};
