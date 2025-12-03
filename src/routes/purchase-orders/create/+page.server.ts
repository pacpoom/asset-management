import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// Interfaces
interface Vendor extends RowDataPacket {
	id: number;
	name: string;
	company_name: string | null;
	address: string | null;
	tax_id: string | null;
}

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

// Helper: สร้างเลข PO
async function generatePONumber(): Promise<string> {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const prefix = `PO-${year}${month}-`;

	const [rows] = await pool.query<RowDataPacket[]>(
		`SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY po_number DESC LIMIT 1`,
		[`${prefix}%`]
	);

	if (rows.length > 0) {
		const lastNumber = rows[0].po_number;
		const sequence = parseInt(lastNumber.split('-')[2]) + 1;
		return `${prefix}${String(sequence).padStart(4, '0')}`;
	} else {
		return `${prefix}0001`;
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	checkPermission(locals, 'view vendors');

	try {
		// 1. ดึง Vendors
		const [vendors] = await pool.query<Vendor[]>(
			'SELECT id, name, company_name, address, tax_id FROM vendors ORDER BY name ASC'
		);

		// 2. ดึง Products (แก้ใช้ purchase_cost AS price เพื่อป้องกัน error ในส่วนอื่นที่อาจเรียกใช้ price)
		// และดึง unit_name มาด้วยเพื่อทำ Auto-fill
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

		// 3. ดึง Units ทั้งหมด
		const [units] = await pool.query<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);

		const nextPONumber = await generatePONumber();

		// --- 4. Logic ดึงข้อมูลจาก PR (Convert PR to PO) ---
		let prItems: any[] = [];
		let prData: any = null;
		const fromPrId = url.searchParams.get('from_pr_id');

		if (fromPrId) {
			// ดึง Header ของ PR
			const [prRows] = await pool.query<any[]>('SELECT * FROM purchase_requests WHERE id = ?', [
				fromPrId
			]);

			if (prRows.length > 0) {
				prData = prRows[0];

				// ดึง Items ของ PR
				// Map expected_price (ราคาประเมิน) -> unit_price (ราคาซื้อจริง)
				const [items] = await pool.query<any[]>(
					'SELECT product_name, quantity, unit, expected_price, total_price FROM purchase_request_items WHERE purchase_request_id = ?',
					[fromPrId]
				);

				prItems = items.map((item) => ({
					product_name: item.product_name,
					quantity: item.quantity,
					unit: item.unit,
					unit_price: item.expected_price, // ใช้ราคาประเมินเป็นราคาตั้งต้น
					discount: 0,
					total_price: item.total_price
				}));
			}
		}
		// ----------------------------------------------------

		return {
			vendors: JSON.parse(JSON.stringify(vendors)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			nextPONumber,
			fromPR: prData ? JSON.parse(JSON.stringify(prData)) : null,
			prItems: JSON.parse(JSON.stringify(prItems))
		};
	} catch (err: any) {
		console.error('Failed to load Create PO data:', err);
		return { vendors: [], products: [], units: [], nextPONumber: '', fromPR: null, prItems: [] };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		checkPermission(locals, 'view vendors');
		const formData = await request.formData();
		const from_pr_id = formData.get('from_pr_id');

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

		if (!vendor_id || !date || items.length === 0)
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			const [result] = await connection.execute<ResultSetHeader>(
				`INSERT INTO purchase_orders 
                (po_number, po_date, vendor_id, contact_person, delivery_date, payment_term, remarks, 
                 subtotal, discount, vat_rate, vat_amount, wht_rate, wht_amount, total_amount, 
                 status, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, NOW())`,
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
					locals.user?.id
				]
			);
			const poId = result.insertId;

			for (const item of items) {
				await connection.execute(
					`INSERT INTO purchase_order_items (purchase_order_id, product_name, quantity, unit, unit_price, discount, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
					[
						poId,
						item.product_name,
						item.quantity,
						item.unit,
						item.unit_price,
						item.discount || 0,
						item.total_price
					]
				);
			}

			if (from_pr_id) {
				await connection.execute(
					`UPDATE purchase_requests SET status = 'PO_CREATED' WHERE id = ?`,
					[from_pr_id]
				);
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			return fail(500, { message: err.message });
		} finally {
			connection.release();
		}
		throw redirect(303, '/purchase-orders');
	}
};
