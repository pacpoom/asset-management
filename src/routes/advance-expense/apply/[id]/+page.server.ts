import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

export const config = { bodySize: 20 * 1024 * 1024 };

interface AdvanceApp extends RowDataPacket {
	id: number;
	document_number: string;
	document_date: string;
	application_title: string;
	reason: string;
	amount: number;
	remark: string | null;
	status: string;
	bank_name: string | null;
	creator_name: string | null;
}

interface JobOrder extends RowDataPacket {
	id: number;
	job_number: string;
	customer_name: string | null;
}

interface TxSummary extends RowDataPacket {
	total_spent: number;
	total_refund: number;
}

interface Product extends RowDataPacket {
	id: number;
	name: string;
	description: string | null;
	purchase_cost: number | null;
}

interface CostCenter extends RowDataPacket {
	cost_center_code: string;
	cost_center_name: string;
	department: string | null;
}

interface ItemPayload {
	product_id: string | null;
	product_name: string;
	description: string | null;
	qty: number;
	price: number;
	amount: number;
	cost_center_code: string | null;
	debit_credit: 'Debit' | 'Credit';
}

const UPLOAD_DIR = path.resolve('uploads', 'advance_expense');

async function saveImageFile(file: File): Promise<string | null> {
	if (!file || file.size === 0) return null;
	await fs.mkdir(UPLOAD_DIR, { recursive: true });
	const ext = file.name.split('.').pop() || 'jpg';
	const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
	const filepath = path.join(UPLOAD_DIR, filename);
	await fs.writeFile(filepath, Buffer.from(await file.arrayBuffer()));
	return `/uploads/advance_expense/${filename}`;
}

// Public page — no auth check
export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (!id) throw error(400, 'Invalid ID');

	try {
		const [appRows] = await pool.execute<AdvanceApp[]>(
			`SELECT aa.*, b.bank_name AS bank_name, u.full_name AS creator_name
			 FROM advance_applications aa
			 LEFT JOIN banks b ON aa.bank_id = b.id
			 LEFT JOIN users u ON aa.created_by = u.id
			 WHERE aa.id = ?`,
			[id]
		);
		if (!appRows.length) throw error(404, 'ไม่พบเอกสาร');
		const application = JSON.parse(JSON.stringify(appRows[0]));

		const [txSummary] = await pool.execute<TxSummary[]>(
			`SELECT
				COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_spent,
				COALESCE(SUM(CASE WHEN type='refund' THEN amount ELSE 0 END),0) AS total_refund
			 FROM advance_transactions WHERE advance_application_id = ?`,
			[id]
		);
		const totalSpent = Number(txSummary[0]?.total_spent || 0);
		const totalRefund = Number(txSummary[0]?.total_refund || 0);
		const currentBalance = Number(application.amount) - totalSpent + totalRefund;

		let jobOrders: JobOrder[] = [];
		try {
			const [joRows] = await pool.execute<JobOrder[]>(
				`SELECT jo.id, jo.job_number, c.name AS customer_name
				 FROM job_orders jo
				 LEFT JOIN customers c ON jo.customer_id = c.id
				 WHERE jo.job_status != 'Cancelled'
				 ORDER BY jo.job_number DESC LIMIT 500`
			);
			jobOrders = JSON.parse(JSON.stringify(joRows));
		} catch {
			jobOrders = [];
		}

		// ── Load products ─────────────────────────────────────────────────────
		let products: Product[] = [];
		try {
			const [productRows] = await pool.execute<Product[]>(
				`SELECT id, name, description, purchase_cost
				 FROM products
				 WHERE is_active = 1 AND category_id = 27
				 ORDER BY name ASC`
			);
			products = JSON.parse(JSON.stringify(productRows));
		} catch {
			products = [];
		}

		// Cost Centers
		let costCenters: CostCenter[] = [];
		try {
			const [ccRows] = await pool.execute<CostCenter[]>(
				`SELECT cost_center_code, cost_center_name, department
				 FROM cost_centers WHERE is_active = 1 ORDER BY cost_center_code ASC`
			);
			costCenters = JSON.parse(JSON.stringify(ccRows));
		} catch { costCenters = []; }

		return {
			application,
			totalSpent,
			totalRefund,
			currentBalance,
			jobOrders,
			products,
			costCenters
		};
	} catch (err: any) {
		if (err.status) throw err;
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	submit: async ({ request, params }) => {
		const appId = parseInt(params.id);
		const data = await request.formData();

		const job_order_id = data.get('job_order_id')?.toString() || null;
		const transaction_date = data.get('transaction_date')?.toString();
		const type = data.get('type')?.toString() || 'expense';
		const remark = data.get('remark')?.toString()?.trim() || null;
		const invoiceFile = data.get('invoice_image') as File;
		const slipFile = data.get('slip_image') as File;

		// ── Parse & validate items ────────────────────────────────────────────
		let items: ItemPayload[] = [];
		try {
			const raw = data.get('items_json')?.toString() || '[]';
			items = JSON.parse(raw);
		} catch {
			return fail(400, { success: false, message: 'ข้อมูลรายการสินค้าไม่ถูกต้อง' });
		}

		if (!items.length) {
			return fail(400, { success: false, message: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' });
		}

		// Validate each item has a product and positive amount
		for (const item of items) {
			if (!item.product_name) {
				return fail(400, { success: false, message: 'กรุณาเลือกสินค้า / บริการให้ครบทุกรายการ' });
			}
			if (item.qty <= 0 || item.price < 0) {
				return fail(400, { success: false, message: 'จำนวนและราคาต้องมากกว่า 0' });
			}
		}

		// Compute total from items (server-side recalculation for safety)
		const totalAmount = items.reduce((sum, item) => sum + item.qty * item.price, 0);

		if (totalAmount <= 0) {
			return fail(400, { success: false, message: 'ยอดรวมต้องมากกว่า 0 บาท' });
		}

		if (!transaction_date) {
			return fail(400, { success: false, message: 'กรุณาระบุวันที่' });
		}

		// Build description snapshot from product names
		const descSnapshot =
			items.length === 1
				? items[0].product_name
				: `${items[0].product_name} +${items.length - 1} รายการ`;

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const invoicePath = await saveImageFile(invoiceFile);
			const slipPath = await saveImageFile(slipFile);

			// Insert main transaction
			const [txResult]: any = await connection.execute(
				`INSERT INTO advance_transactions
				 (advance_application_id, job_order_id, transaction_date, description, amount, type, invoice_image, slip_image, remark, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
				[
					appId,
					job_order_id ? parseInt(job_order_id) : null,
					transaction_date,
					descSnapshot,
					totalAmount.toFixed(2),
					type,
					invoicePath,
					slipPath,
					remark
				]
			);

			const txId = txResult.insertId;

			// Insert line items
			for (const item of items) {
				const lineAmount = item.qty * item.price;
				await connection.execute(
					`INSERT INTO advance_transaction_items
					 (advance_transaction_id, product_id, product_name, description, qty, price, amount, cost_center_code, debit_credit)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						txId,
						item.product_id ? parseInt(item.product_id) : null,
						item.product_name,
						item.description ?? null,
						item.qty,
						item.price,
						lineAmount.toFixed(2),
						item.cost_center_code || null,
						item.debit_credit || 'Debit'
					]
				);
			}

			await connection.commit();
			return { success: true, message: 'บันทึกรายการสำเร็จ! ขอบคุณครับ/ค่ะ' };
		} catch (err: any) {
			await connection.rollback();
			return fail(500, { success: false, message: err.message });
		} finally {
			connection.release();
		}
	}
};
