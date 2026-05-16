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

		// Job orders for dropdown
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

		return {
			application,
			transactions: txWithBalance,
			totalSpent,
			totalRefund,
			currentBalance,
			jobOrders,
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
		const description = data.get('description')?.toString()?.trim() || null;
		const amount = parseFloat(data.get('amount')?.toString() || '0');
		const type = data.get('type')?.toString() || 'expense';
		const remark = data.get('remark')?.toString()?.trim() || null;
		const invoiceFile = data.get('invoice_image') as File;
		const slipFile = data.get('slip_image') as File;

		if (!transaction_date || isNaN(amount) || amount <= 0) {
			return fail(400, { action: 'addTransaction', success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		try {
			const invoicePath = await saveImageFile(invoiceFile);
			const slipPath = await saveImageFile(slipFile);

			await pool.execute(
				`INSERT INTO advance_transactions (advance_application_id, job_order_id, transaction_date, description, amount, type, invoice_image, slip_image, remark, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[appId, job_order_id ? parseInt(job_order_id) : null, transaction_date, description, amount, type, invoicePath, slipPath, remark, userId]
			);

			return { action: 'addTransaction', success: true, message: 'บันทึกรายการสำเร็จ' };
		} catch (err: any) {
			return fail(500, { action: 'addTransaction', success: false, message: err.message });
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
