import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'sales_documents');

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
	const documentId = parseInt(params.id);
	if (isNaN(documentId)) throw error(404, 'Invalid Document ID');

	try {
		const [docRows] = await pool.query<any[]>('SELECT * FROM sales_documents WHERE id = ?', [
			documentId
		]);
		if (docRows.length === 0) throw error(404, 'Document not found');
		const document = docRows[0];

		const [itemRows] = await pool.query<any[]>(
			'SELECT * FROM sales_document_items WHERE document_id = ? ORDER BY item_order ASC',
			[documentId]
		);

		const [attachmentRows] = await pool.query<any[]>(
			'SELECT * FROM sales_document_attachments WHERE document_id = ?',
			[documentId]
		);
		const attachments = attachmentRows.map((f: any) => ({
			...f,
			url: `/uploads/sales_documents/${f.file_system_name}`
		}));

		const [customers] = await pool.query('SELECT id, name, company_name FROM customers ORDER BY COALESCE(company_name, name) ASC');
		const [customerContacts] = await pool.query('SELECT id, customer_id, name, position, email, phone FROM customer_contacts ORDER BY name ASC');

		const [products] = await pool.query(
			'SELECT id, name, sku, selling_price AS price, unit_id, default_wht_rate FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol, name FROM units ORDER BY symbol ASC');

		const [jobOrders] = await pool.query(
			'SELECT id, job_number, customer_id, job_type, bl_number, invoice_no, job_status FROM job_orders WHERE job_status != "Cancelled" ORDER BY id DESC'
		);

		const [categories] = await pool.query('SELECT id, name FROM product_categories ORDER BY name');
		const [vendors] = await pool.query('SELECT id, name FROM vendors ORDER BY name');
		const [accounts] = await pool.query(
			'SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code'
		);

		return {
			document: JSON.parse(JSON.stringify(document)),
			existingItems: JSON.parse(JSON.stringify(itemRows)),
			existingAttachments: JSON.parse(JSON.stringify(attachments)),
			customers: JSON.parse(JSON.stringify(customers)),
			customerContacts: JSON.parse(JSON.stringify(customerContacts)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			jobOrders: JSON.parse(JSON.stringify(jobOrders)),
			categories: JSON.parse(JSON.stringify(categories)),
			vendors: JSON.parse(JSON.stringify(vendors)),
			accounts: JSON.parse(JSON.stringify(accounts))
		};
	} catch (err: any) {
		console.error('Load edit error:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const documentId = parseInt(params.id);
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const customer_contact_id = formData.get('customer_contact_id')?.toString() || null;
		const job_order_id = formData.get('job_order_id')?.toString() || null;
		const document_date = formData.get('document_date')?.toString();
		const credit_term = parseInt(formData.get('credit_term')?.toString() || '0', 10);
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

			await connection.execute(
				`UPDATE sales_documents SET 
                 document_date = ?, credit_term = ?, due_date = ?, customer_id = ?, customer_contact_id = ?, job_order_id = ?, reference_doc = ?, notes = ?,
                 subtotal = ?, discount_amount = ?, total_after_discount = ?,
                 vat_rate = ?, vat_amount = ?, withholding_tax_rate = ?, withholding_tax_amount = ?, wht_amount = ?, total_amount = ?
                 WHERE id = ?`,
				[
					document_date,
					credit_term,
					due_date,
					customer_id,
					customer_contact_id,
					job_order_id,
					reference_doc,
					notes,
					subtotal,
					discount_amount,
					total_after_discount,
					vat_rate,
					vat_amount,
					wht_rate,
					wht_amount,
					wht_amount,
					total_amount,
					documentId
				]
			);

			await connection.execute('DELETE FROM sales_document_items WHERE document_id = ?', [
				documentId
			]);

			const items = JSON.parse(itemsJson);
			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					const lineWhtRate = parseFloat(item.wht_rate || '0');
					const lineTotal = parseFloat(item.line_total || '0');
					const isVat = item.is_vat === false ? 0 : 1;
					
					let baseAmount = lineTotal;
					if (isVat === 1 && vat_rate > 0) {
						baseAmount = lineTotal * 100 / (100 + vat_rate);
					}
					const lineWhtAmount = baseAmount * (lineWhtRate / 100);

					await connection.execute(
						`INSERT INTO sales_document_items 
                        (document_id, product_id, description, quantity, unit_id, unit_price, line_total, wht_rate, wht_amount, item_order, is_vat) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							documentId,
							item.product_id || null,
							item.description,
							item.quantity,
							item.unit_id || null,
							item.unit_price,
							lineTotal,
							lineWhtRate,
							lineWhtAmount,
							index,
							isVat
						]
					);
				}
			}

			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO sales_document_attachments 
                        (document_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							documentId,
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
			console.error('Update document error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไข: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/sales-documents/${documentId}`);
	},

	deleteAttachment: async ({ request }) => {
		//...
	},
	createProduct: async ({ request }) => {
		//...
	}
};