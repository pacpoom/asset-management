import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

export const config = { bodySize: 20 * 1024 * 1024 };

interface AdvanceApp extends RowDataPacket {
	id: number;
	document_number: string;
	document_date: string;
	application_title: string;
	bank_id: number;
	bank_name: string | null;
	bank_account: string | null;
	reason: string;
	amount: number;
	remark: string | null;
	status: string;
	created_by: number;
	creator_name: string | null;
	creator_email: string | null;
	created_at: string;
}

interface AdvanceTransaction extends RowDataPacket {
	id: number;
	advance_application_id: number;
	job_order_id: number | null;
	job_number: string | null;
	customer_name: string | null;
	transaction_date: string;
	description: string | null;
	amount: number;
	type: 'expense' | 'refund';
	invoice_image: string | null;
	slip_image: string | null;
	remark: string | null;
	created_at: string;
}

interface JobOrder extends RowDataPacket {
	id: number;
	job_number: string;
	customer_name: string | null;
}

interface Product extends RowDataPacket {
	id: number;
	name: string;
	description: string | null;
	purchase_cost: number | null;
}

interface ItemPayload {
	product_id: string | null;
	product_name: string;
	description: string | null;
	qty: number;
	price: number;
	amount: number;
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

export const load: PageServerLoad = async ({ locals, params }) => {
	checkPermission(locals, 'view advance expense');
	const id = parseInt(params.id);
	if (!id) throw error(400, 'Invalid ID');

	try {
		const [appRows] = await pool.execute<AdvanceApp[]>(
			`SELECT aa.*, b.bank_name AS bank_name, b.account_number AS bank_account,
				u.full_name AS creator_name, u.email AS creator_email
			 FROM advance_applications aa
			 LEFT JOIN banks b ON aa.bank_id = b.id
			 LEFT JOIN users u ON aa.created_by = u.id
			 WHERE aa.id = ?`,
			[id]
		);
		if (!appRows.length) throw error(404, 'ไม่พบเอกสาร');
		const application = JSON.parse(JSON.stringify(appRows[0]));

		const [txRows] = await pool.execute<AdvanceTransaction[]>(
			`SELECT at2.*, jo.job_number, c.name AS customer_name
			 FROM advance_transactions at2
			 LEFT JOIN job_orders jo ON at2.job_order_id = jo.id
			 LEFT JOIN customers c ON jo.customer_id = c.id
			 WHERE at2.advance_application_id = ?
			 ORDER BY at2.transaction_date ASC, at2.id ASC`,
			[id]
		);
		const transactions = JSON.parse(JSON.stringify(txRows));

		// Compute balance
		let runningBalance = Number(application.amount);
		const txWithBalance = transactions.map((tx: any) => {
			if (tx.type === 'expense') runningBalance -= Number(tx.amount);
			else runningBalance += Number(tx.amount);
			return { ...tx, running_balance: runningBalance };
		});

		const totalSpent = transactions
			.filter((t: any) => t.type === 'expense')
			.reduce((s: number, t: any) => s + Number(t.amount), 0);
		const totalRefund = transactions
			.filter((t: any) => t.type === 'refund')
			.reduce((s: number, t: any) => s + Number(t.amount), 0);
		const currentBalance = Number(application.amount) - totalSpent + totalRefund;

		// Job orders for dropdown — ไม่แสดง Completed และ Cancelled
		let jobOrders: JobOrder[] = [];
		try {
			const [joRows] = await pool.execute<JobOrder[]>(
				`SELECT jo.id, jo.job_number, c.name AS customer_name
				 FROM job_orders jo
				 LEFT JOIN customers c ON jo.customer_id = c.id
				 WHERE jo.job_status NOT IN ('Completed', 'Cancelled')
				 ORDER BY jo.job_number DESC LIMIT 500`
			);
			jobOrders = JSON.parse(JSON.stringify(joRows));
		} catch {
			jobOrders = [];
		}

		// Products (category 27)
		let products: Product[] = [];
		try {
			const [productRows] = await pool.execute<Product[]>(
				`SELECT id, name, description, purchase_cost
				 FROM products WHERE is_active = 1 AND category_id = 27 ORDER BY name ASC`
			);
			products = JSON.parse(JSON.stringify(productRows));
		} catch { products = []; }

		return {
			application,
			transactions: txWithBalance,
			totalSpent,
			totalRefund,
			currentBalance,
			jobOrders,
			products,
			currentUser: locals.user
		};
	} catch (err: any) {
		if (err.status) throw err;
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	addTransaction: async ({ request, locals, params }) => {
		checkPermission(locals, 'view advance expense');
		const userId = locals.user?.id;
		const appId = parseInt(params.id);

		const data = await request.formData();
		const job_order_id = data.get('job_order_id')?.toString() || null;
		const transaction_date = data.get('transaction_date')?.toString();
		const type = data.get('type')?.toString() || 'expense';
		const remark = data.get('remark')?.toString()?.trim() || null;
		const invoiceFile = data.get('invoice_image') as File;
		const slipFile = data.get('slip_image') as File;

		// Parse items
		let items: ItemPayload[] = [];
		try {
			items = JSON.parse(data.get('items_json')?.toString() || '[]');
		} catch {
			return fail(400, { action: 'addTransaction', success: false, message: 'ข้อมูลรายการสินค้าไม่ถูกต้อง' });
		}

		if (!items.length)
			return fail(400, { action: 'addTransaction', success: false, message: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' });

		for (const item of items) {
			if (!item.product_name)
				return fail(400, { action: 'addTransaction', success: false, message: 'กรุณาเลือกสินค้า/บริการให้ครบทุกรายการ' });
			if (item.qty <= 0 || item.price < 0)
				return fail(400, { action: 'addTransaction', success: false, message: 'จำนวนและราคาต้องมากกว่า 0' });
		}

		const totalAmount = items.reduce((sum, i) => sum + i.qty * i.price, 0);
		if (totalAmount <= 0)
			return fail(400, { action: 'addTransaction', success: false, message: 'ยอดรวมต้องมากกว่า 0 บาท' });

		if (!transaction_date)
			return fail(400, { action: 'addTransaction', success: false, message: 'กรุณาระบุวันที่' });

		const descSnapshot = items.length === 1
			? items[0].product_name
			: `${items[0].product_name} +${items.length - 1} รายการ`;

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const invoicePath = await saveImageFile(invoiceFile);
			const slipPath = await saveImageFile(slipFile);

			const [txResult]: any = await connection.execute(
				`INSERT INTO advance_transactions
				 (advance_application_id, job_order_id, transaction_date, description, amount, type, invoice_image, slip_image, remark, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[appId, job_order_id ? parseInt(job_order_id) : null, transaction_date,
				 descSnapshot, totalAmount.toFixed(2), type, invoicePath, slipPath, remark, userId]
			);
			const txId = txResult.insertId;

			for (const item of items) {
				const lineAmount = item.qty * item.price;
				await connection.execute(
					`INSERT INTO advance_transaction_items
					 (advance_transaction_id, product_id, product_name, description, qty, price, amount)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					[txId, item.product_id ? parseInt(item.product_id) : null,
					 item.product_name, item.description ?? null, item.qty, item.price, lineAmount.toFixed(2)]
				);
			}

			await connection.commit();
			return { action: 'addTransaction', success: true, message: 'บันทึกรายการสำเร็จ' };
		} catch (err: any) {
			await connection.rollback();
			return fail(500, { action: 'addTransaction', success: false, message: err.message });
		} finally {
			connection.release();
		}
	},

	deleteTransaction: async ({ request, locals }) => {
		checkPermission(locals, 'view advance expense');
		const data = await request.formData();
		const id = parseInt(data.get('id')?.toString() || '0');
		if (!id) return fail(400, { action: 'deleteTransaction', success: false, message: 'Invalid ID' });

		try {
			const [rows] = await pool.execute<any[]>(
				'SELECT invoice_image, slip_image FROM advance_transactions WHERE id = ?',
				[id]
			);
			await pool.execute('DELETE FROM advance_transactions WHERE id = ?', [id]);

			// Clean up files
			for (const row of rows) {
				for (const imgPath of [row.invoice_image, row.slip_image]) {
					if (imgPath) {
						try {
							const fullPath = path.resolve(process.cwd(), imgPath.startsWith('/') ? imgPath.slice(1) : imgPath);
							await fs.unlink(fullPath);
						} catch {}
					}
				}
			}

			return { action: 'deleteTransaction', success: true, message: 'ลบรายการสำเร็จ' };
		} catch (err: any) {
			return fail(500, { action: 'deleteTransaction', success: false, message: err.message });
		}
	}
};
