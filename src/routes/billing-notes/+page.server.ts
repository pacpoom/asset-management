import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const filterCustomer = url.searchParams.get('customer') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (bn.billing_note_number LIKE ? OR c.name LIKE ?) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}
		if (filterStatus) {
			whereClause += ` AND bn.status = ? `;
			params.push(filterStatus);
		}
		if (filterCustomer) {
			whereClause += ` AND bn.customer_id = ? `;
			params.push(filterCustomer);
		}

		// Count Query
		const countSql = `SELECT COUNT(bn.id) as total FROM billing_notes bn LEFT JOIN customers c ON bn.customer_id = c.id ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch Query
		const fetchSql = `
            SELECT
                bn.*,
                c.name as customer_name,
                u.full_name as created_by_name
            FROM billing_notes bn
            LEFT JOIN customers c ON bn.customer_id = c.id
            LEFT JOIN users u ON bn.created_by_user_id = u.id
            ${whereClause}
            ORDER BY bn.billing_date DESC, bn.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [billingNotes] = await pool.query(fetchSql, fetchParams);

		// --- Dropdowns ---
		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');

		// [แก้ไขจุดที่ Error] ใช้ sku และ selling_price ตามตารางจริง
		const [products] = await pool.query(
			'SELECT id, sku, name, selling_price, unit_id FROM products ORDER BY name ASC'
		);

		const [units] = await pool.query('SELECT id, name, symbol FROM units ORDER BY name ASC');

		return {
			billingNotes: JSON.parse(JSON.stringify(billingNotes)),
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			currentPage: page,
			totalPages,
			searchQuery,
			filters: { status: filterStatus, customer: filterCustomer }
		};
	} catch (err: any) {
		console.error('Failed to load billing notes:', err);
		throw error(500, `Failed to load billing notes: ${err.message}`);
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const billing_date = formData.get('billing_date');
		const due_date = formData.get('due_date');
		const notes = formData.get('notes');
		const itemsJson = formData.get('itemsJson') as string;

		const subtotal = formData.get('subtotal');
		const discount_amount = formData.get('discount_amount');
		const vat_rate = formData.get('vat_rate');
		const vat_amount = formData.get('vat_amount');
		const withholding_tax_rate = formData.get('withholding_tax_rate');
		const withholding_tax_amount = formData.get('withholding_tax_amount');
		const total_amount = formData.get('total_amount');

		const userId = (locals as any).user?.id || null;

		if (!customer_id || !billing_date) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const billing_note_number = `BN-${Date.now()}`;

			// 1. Insert Header
			const [result] = await connection.execute<any>(
				`
                INSERT INTO billing_notes 
                (billing_note_number, customer_id, billing_date, due_date, notes, status, created_by_user_id,
                 subtotal, discount_amount, vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, total_amount)
                VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?)
            `,
				[
					billing_note_number,
					customer_id,
					billing_date,
					due_date || null,
					notes || null,
					userId,
					subtotal || 0,
					discount_amount || 0,
					vat_rate || 7,
					vat_amount || 0,
					withholding_tax_rate || 0,
					withholding_tax_amount || 0,
					total_amount || 0
				]
			);

			const newId = result.insertId;

			// 2. Insert Items
			if (itemsJson) {
				const items = JSON.parse(itemsJson);
				for (const item of items) {
					await connection.execute(
						`
                        INSERT INTO billing_note_items 
                        (billing_note_id, product_id, description, quantity, unit_id, unit_price, amount)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `,
						[
							newId,
							item.product_id || null,
							item.description,
							item.quantity,
							item.unit_id || null,
							item.unit_price,
							item.amount
						]
					);
				}
			}

			await connection.commit();
			return { success: true, message: 'สร้างใบวางบิลเรียบร้อยแล้ว' };
		} catch (err: any) {
			await connection.rollback();
			console.error('Create Billing Note Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาด: ' + err.message });
		} finally {
			connection.release();
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });

		try {
			await pool.execute('DELETE FROM billing_note_items WHERE billing_note_id = ?', [id]);
			await pool.execute('DELETE FROM billing_notes WHERE id = ?', [id]);
			return { success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
