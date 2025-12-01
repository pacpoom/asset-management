import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'invoices');

// --- Helper: บันทึกและลบไฟล์ ---
async function saveFile(file: File) {
	if (!file || file.size === 0) return null;
	try {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
		const uploadPath = path.join(UPLOAD_DIR, systemName);
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
		return {
			systemName,
			originalName: file.name,
			mimeType: mime.lookup(file.name) || file.type || 'application/octet-stream',
			size: file.size
		};
	} catch (e) {
		console.error('Save file error:', e);
		return null;
	}
}

async function deleteFile(filename: string) {
	if (!filename) return;
	try {
		const filePath = path.join(UPLOAD_DIR, filename);
		await fs.unlink(filePath);
	} catch (e) {
		console.error('Delete file error:', e);
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const invoiceId = parseInt(params.id);
	if (isNaN(invoiceId)) throw error(404, 'Invalid Invoice ID');

	try {
		const [invoiceRows] = await pool.query<any[]>('SELECT * FROM invoices WHERE id = ?', [
			invoiceId
		]);
		if (invoiceRows.length === 0) throw error(404, 'Invoice not found');
		const invoice = invoiceRows[0];

		const [itemRows] = await pool.query<any[]>(
			'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_order ASC',
			[invoiceId]
		);

		const [attachmentRows] = await pool.query<any[]>(
			'SELECT * FROM invoice_attachments WHERE invoice_id = ?',
			[invoiceId]
		);
		const attachments = attachmentRows.map((f: any) => ({
			...f,
			url: `/uploads/invoices/${f.file_system_name}`
		}));

		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');
		const [products] = await pool.query(
			'SELECT id, name, sku, selling_price AS price, unit_id FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol FROM units ORDER BY symbol ASC');

		return {
			invoice: JSON.parse(JSON.stringify(invoice)),
			existingItems: JSON.parse(JSON.stringify(itemRows)),
			existingAttachments: JSON.parse(JSON.stringify(attachments)),
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units))
		};
	} catch (err: any) {
		console.error('Load edit error:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const invoiceId = parseInt(params.id);
		const formData = await request.formData();

		// รับค่าจากฟอร์ม
		const customer_id = formData.get('customer_id');
		const invoice_date = formData.get('invoice_date')?.toString();
		const due_date = formData.get('due_date')?.toString() || null;
		const reference_doc = formData.get('reference_doc')?.toString() || '';
		const notes = formData.get('notes')?.toString() || '';
		const itemsJson = formData.get('items_json')?.toString() || '[]';

		const subtotal = parseFloat(formData.get('subtotal')?.toString() || '0');
		const discount_amount = parseFloat(formData.get('discount_amount')?.toString() || '0');
		const total_after_discount = parseFloat(
			formData.get('total_after_discount')?.toString() || '0'
		);
		const vat_rate = parseFloat(formData.get('vat_rate')?.toString() || '0');
		const vat_amount = parseFloat(formData.get('vat_amount')?.toString() || '0');
		const wht_rate = parseFloat(formData.get('wht_rate')?.toString() || '0');
		const wht_amount = parseFloat(formData.get('wht_amount')?.toString() || '0');
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			//อัปเดตหัวเอกสาร
			await connection.execute(
				`UPDATE invoices SET 
                 invoice_date = ?, due_date = ?, customer_id = ?, reference_doc = ?, notes = ?,
                 subtotal = ?, discount_amount = ?, total_after_discount = ?,
                 vat_rate = ?, vat_amount = ?, withholding_tax_rate = ?, withholding_tax_amount = ?, total_amount = ?
                 WHERE id = ?`,
				[
					invoice_date,
					due_date,
					customer_id,
					reference_doc,
					notes,
					subtotal,
					discount_amount,
					total_after_discount,
					vat_rate,
					vat_amount,
					wht_rate,
					wht_amount,
					total_amount,
					invoiceId
				]
			);

			//อัปเดตรายการสินค้า
			await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);

			const items = JSON.parse(itemsJson);
			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					await connection.execute(
						`INSERT INTO invoice_items 
                        (invoice_id, product_id, description, quantity, unit_id, unit_price, line_total, item_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							invoiceId,
							item.product_id || null,
							item.description,
							item.quantity,
							item.unit_id || null,
							item.unit_price,
							item.line_total,
							index
						]
					);
				}
			}

			//เพิ่มไฟล์แนบใหม่
			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO invoice_attachments 
                        (invoice_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							invoiceId,
							savedFile.originalName,
							savedFile.systemName,
							savedFile.mimeType,
							savedFile.size,
							locals.user?.id
						]
					);
				}
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Update invoice error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไข: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/invoices/${invoiceId}`);
	},

	deleteAttachment: async ({ request }) => {
		const formData = await request.formData();
		const attachmentId = formData.get('attachment_id');

		try {
			const [rows] = await pool.query<any[]>(
				'SELECT file_system_name FROM invoice_attachments WHERE id = ?',
				[attachmentId]
			);
			if (rows.length > 0) {
				await deleteFile(rows[0].file_system_name);
				await pool.execute('DELETE FROM invoice_attachments WHERE id = ?', [attachmentId]);
				return { success: true };
			}
			return fail(404, { message: 'File not found' });
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
