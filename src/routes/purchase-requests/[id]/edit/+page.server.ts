import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface Department extends RowDataPacket {
	name: string;
}
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	price: number;
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
		// 1. ดึงข้อมูลใบขอซื้อ (Header)
		const [prRows] = await pool.query<RowDataPacket[]>(
			'SELECT * FROM purchase_requests WHERE id = ?',
			[id]
		);
		if (prRows.length === 0) throw error(404, 'Purchase Request not found');
		const pr = prRows[0];

		// 2. ดึงรายการสินค้า (Items)
		const [itemRows] = await pool.query<RowDataPacket[]>(
			'SELECT * FROM purchase_request_items WHERE purchase_request_id = ? ORDER BY id ASC',
			[id]
		);

		// 3. ดึงรายชื่อแผนก (สำหรับ Datalist)
		const [departments] = await pool.query<Department[]>(
			'SELECT name FROM departments ORDER BY name ASC'
		);

		// 4. (แก้ไข) ดึงสินค้า ใช้ p.purchase_cost AS price
		const [products] = await pool.query<Product[]>(`
            SELECT 
                p.id, 
                p.sku, 
                p.name, 
                p.purchase_cost AS price, 
                p.unit_id,
                u.name AS unit_name
            FROM products p
            LEFT JOIN units u ON p.unit_id = u.id
            WHERE p.is_active = 1
            ORDER BY p.name ASC
        `);

		// 5. ดึงหน่วยนับ
		const [units] = await pool.query<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);

		return {
			pr: JSON.parse(JSON.stringify(pr)),
			items: JSON.parse(JSON.stringify(itemRows)),
			departments: JSON.parse(JSON.stringify(departments)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			user: locals.user
		};
	} catch (err: any) {
		console.error('Failed to load Edit PR data:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		checkPermission(locals, 'view vendors');
		const id = parseInt(params.id);
		const formData = await request.formData();

		const pr_number = formData.get('pr_number') as string;
		const request_date = formData.get('request_date') as string;
		const department = (formData.get('department') as string) || '';
		const description = (formData.get('description') as string) || '';

		const itemsJson = formData.get('items_json') as string;
		let items = [];
		try {
			items = JSON.parse(itemsJson);
		} catch (e) {
			return fail(400, { message: 'ข้อมูลรายการสินค้าไม่ถูกต้อง' });
		}

		const total_amount = parseFloat((formData.get('total_amount') as string) || '0');

		if (!request_date || items.length === 0) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// 1. Update หัวเอกสาร (PR)
			await connection.execute(
				`UPDATE purchase_requests 
                 SET request_date=?, department=?, description=?, total_amount=?, updated_at=NOW()
                 WHERE id=?`,
				[request_date, department, description, total_amount, id]
			);

			// 2. Update รายการสินค้า (ลบของเก่าแล้วลงใหม่)
			await connection.execute('DELETE FROM purchase_request_items WHERE purchase_request_id = ?', [
				id
			]);

			for (const item of items) {
				await connection.execute(
					`INSERT INTO purchase_request_items 
                    (purchase_request_id, product_name, quantity, unit, expected_price, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)`,
					[
						id,
						item.product_name,
						item.quantity,
						item.unit,
						item.expected_price || 0,
						item.total_price
					]
				);
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Update PR Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึก: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/purchase-requests/${id}`);
	}
};
