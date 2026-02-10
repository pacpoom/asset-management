import { fail, error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'bill_payments');

async function ensureUploadDir() {
	try {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
	} catch (e) {
		/* ignore */
	}
}

async function saveFile(file: File): Promise<{
	systemName: string;
	originalName: string;
	mimeType: string | null;
	size: number;
} | null> {
	if (!file || file.size === 0) return null;
	try {
		await ensureUploadDir();
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
		const uploadPath = path.join(UPLOAD_DIR, systemName);
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
		return {
			systemName,
			originalName: file.name,
			mimeType: mime.lookup(file.name) || file.type,
			size: file.size
		};
	} catch (e) {
		return null;
	}
}

async function deleteFile(systemName: string | null | undefined) {
	if (!systemName) return;
	try {
		const fullPath = path.join(UPLOAD_DIR, path.basename(systemName));
		await fs.unlink(fullPath);
	} catch (e) {
		/* ignore */
	}
}

export const load: PageServerLoad = async ({ locals, params }) => {
	checkPermission(locals, 'view bill payments');
	const id = params.id;

	try {
		const [rows] = await pool.execute<RowDataPacket[]>(`SELECT * FROM bill_payments WHERE id = ?`, [
			id
		]);
		if (rows.length === 0) throw error(404, 'Bill Payment not found');
		const payment = rows[0];

		const [items] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM bill_payment_items WHERE bill_payment_id = ? ORDER BY item_order ASC`,
			[id]
		);

		const [attachments] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM bill_payment_attachments WHERE bill_payment_id = ?`,
			[id]
		);

		const [vendors] = await pool.execute<RowDataPacket[]>(
			'SELECT id, name FROM vendors ORDER BY name ASC'
		);
		const [units] = await pool.execute<RowDataPacket[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);
		const [products] = await pool.execute<RowDataPacket[]>(
			`SELECT id, sku, name, unit_id, purchase_cost FROM products WHERE is_active = 1 ORDER BY sku ASC`
		);
		const [contracts] = await pool.execute<RowDataPacket[]>(
			`SELECT id, title, vendor_id, contract_number FROM vendor_contracts WHERE status = 'Active' ORDER BY title ASC`
		);

		return {
			payment,
			items,
			attachments,
			vendors,
			units,
			products,
			contracts
		};
	} catch (err: any) {
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	updatePayment: async ({ request, locals, params }) => {
		checkPermission(locals, 'edit bill payments');
		const id = params.id;
		const formData = await request.formData();
		const files = formData.getAll('new_attachments') as File[];
		const userId = locals.user?.id;

		const vendor_id = formData.get('vendor_id')?.toString();
		const vendor_contract_id = formData.get('vendor_contract_id')?.toString() || null;
		const payment_date = formData.get('payment_date')?.toString();
		const payment_reference = formData.get('payment_reference')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		const discountAmount = parseFloat(formData.get('discountAmount')?.toString() || '0');
		const vatRate = parseFloat(formData.get('vatRate')?.toString() || '0');
		const calculateWithholdingTax = formData.get('calculateWithholdingTax')?.toString() === 'true';
		const withholdingTaxRate = parseFloat(formData.get('withholdingTaxRate')?.toString() || '0');

		const itemsJson = formData.get('itemsJson')?.toString();
		let items: any[] = [];
		try {
			items = JSON.parse(itemsJson || '[]');
		} catch (e) {
			return fail(400, { message: 'Invalid items data' });
		}

		if (!vendor_id || !payment_date) {
			return fail(400, { message: 'Required fields missing' });
		}

		const subTotal = items.reduce((sum, item) => sum + parseFloat(item.line_total || 0), 0);
		const totalAfterDiscount = subTotal - discountAmount;
		const vatAmount = parseFloat((totalAfterDiscount * (vatRate / 100)).toFixed(2));
		const actualWhtRate = calculateWithholdingTax ? withholdingTaxRate : 0;
		const withholdingTaxAmount = calculateWithholdingTax
			? parseFloat((totalAfterDiscount * (actualWhtRate / 100)).toFixed(2))
			: 0;
		const grandTotal = totalAfterDiscount + vatAmount - withholdingTaxAmount;

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			await connection.execute(
				`UPDATE bill_payments SET 
                    vendor_id=?, vendor_contract_id=?, payment_date=?, payment_reference=?, notes=?, 
                    subtotal=?, discount_amount=?, total_after_discount=?, 
                    vat_rate=?, vat_amount=?, withholding_tax_rate=?, withholding_tax_amount=?, total_amount=?,
					status=? -- Reset status or keep logic if needed, usually editing doesn't approve it automatically
                 WHERE id=?`,
				[
					vendor_id,
					vendor_contract_id,
					payment_date,
					payment_reference,
					notes,
					subTotal,
					discountAmount,
					totalAfterDiscount,
					vatRate,
					vatAmount,
					actualWhtRate,
					withholdingTaxAmount,
					grandTotal,
					'Draft',
					id
				]
			);

			await connection.execute(`DELETE FROM bill_payment_items WHERE bill_payment_id = ?`, [id]);
			if (items.length > 0) {
				const itemValues = items.map((item, index) => [
					id,
					item.product_id,
					item.description,
					item.quantity,
					item.unit_id,
					item.unit_price,
					item.line_total,
					index
				]);
				await connection.query(
					`INSERT INTO bill_payment_items (bill_payment_id, product_id, description, quantity, unit_id, unit_price, line_total, item_order) VALUES ?`,
					[itemValues]
				);
			}

			const validFiles = files.filter((f) => f && f.size > 0);
			for (const file of validFiles) {
				const fileInfo = await saveFile(file);
				if (fileInfo) {
					await connection.execute(
						`INSERT INTO bill_payment_attachments (bill_payment_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)`,
						[
							id,
							fileInfo.originalName,
							fileInfo.systemName,
							fileInfo.mimeType,
							fileInfo.size,
							userId
						]
					);
				}
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error(err);
			return fail(500, { message: err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, '/bill-payments');
	},

	deleteAttachment: async ({ request, locals }) => {
		checkPermission(locals, 'edit bill payments');
		const formData = await request.formData();
		const attachmentId = formData.get('attachment_id');

		if (!attachmentId) return fail(400, { message: 'Missing Attachment ID' });

		const connection = await pool.getConnection();
		try {
			const [rows] = await connection.execute<RowDataPacket[]>(
				'SELECT file_system_name FROM bill_payment_attachments WHERE id = ?',
				[attachmentId]
			);
			if (rows.length > 0) {
				await deleteFile(rows[0].file_system_name);
				await connection.execute('DELETE FROM bill_payment_attachments WHERE id = ?', [
					attachmentId
				]);
			}
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		} finally {
			connection.release();
		}
	}
};
