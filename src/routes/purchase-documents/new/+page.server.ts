import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'purchase_documents');

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

async function generateDocumentNumber(docType: string, dateStr: string, connection: any) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const monthStr = String(month).padStart(2, '0');

	let prefix = '';
	switch (docType) {
		case 'PR': prefix = 'PR-'; break;
		case 'PO': prefix = 'PO-'; break;
		case 'GR': prefix = 'GR-'; break;
		case 'AP': prefix = 'AP-'; break;
		case 'PV': prefix = 'PV-'; break;
		default: prefix = 'DOC-';
	}

	const updateQuery = `
        INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length)
        VALUES (?, ?, ?, ?, 1, 4)
        ON DUPLICATE KEY UPDATE last_number = last_number + 1;
    `;
	await connection.execute(updateQuery, [docType, prefix, year, month]);

	const selectQuery = `
        SELECT last_number, padding_length 
        FROM document_sequences 
        WHERE document_type = ? AND year = ? AND month = ?
    `;
	const [rows] = await connection.execute(selectQuery, [docType, year, month]);

	const lastNumber = rows[0].last_number;
	const padding = rows[0].padding_length;

	const runningNumber = String(lastNumber).padStart(padding, '0');
	return `${prefix}${year}${monthStr}-${runningNumber}`;
}

export const load: PageServerLoad = async ({ url }) => {
	const sourceId = url.searchParams.get('source_id');
	const targetType = url.searchParams.get('target_type') || 'PO';
	let prefillData = null;

	try {
		if (sourceId) {
			const [docs] = await pool.query<any[]>('SELECT * FROM purchase_documents WHERE id = ?', [sourceId]);
			const [items] = await pool.query<any[]>('SELECT * FROM purchase_document_items WHERE document_id = ? ORDER BY item_order ASC', [sourceId]);
			
			if (docs.length > 0) {
				prefillData = {
					document: docs[0],
					items: items,
					targetType: targetType
				};
			}
		}

		const [vendors] = await pool.query('SELECT id, COALESCE(company_name, name) AS name FROM vendors ORDER BY COALESCE(company_name, name) ASC');
		const [vendorContacts] = await pool.query('SELECT id, vendor_id, name, position, email, phone FROM vendor_contacts ORDER BY name ASC');
		const [products] = await pool.query('SELECT id, name, sku, purchase_cost AS price, purchase_unit_id as unit_id, default_wht_rate FROM products WHERE is_active = 1 ORDER BY name ASC');
		const [units] = await pool.query('SELECT id, symbol, name FROM units ORDER BY symbol ASC');
		
		// 🌟 เพิ่ม vendor_id ใน Query เพื่อให้หน้าบ้านสามารถ Filter ได้
		const [jobOrders] = await pool.query('SELECT id, job_number, customer_id, vendor_id, job_type, bl_number, invoice_no, job_status FROM job_orders WHERE job_status != "Cancelled" ORDER BY id DESC');
		
		const [categories] = await pool.query('SELECT id, name FROM product_categories ORDER BY name');
		const [accounts] = await pool.query('SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code');

		return {
			vendors: JSON.parse(JSON.stringify(vendors)),
			vendorContacts: JSON.parse(JSON.stringify(vendorContacts)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			jobOrders: JSON.parse(JSON.stringify(jobOrders)),
			categories: JSON.parse(JSON.stringify(categories)),
			accounts: JSON.parse(JSON.stringify(accounts)),
			prefillData: prefillData ? JSON.parse(JSON.stringify(prefillData)) : null 
		};
	} catch (error: any) {
		console.error('Load data error:', error);
		return { vendors: [], vendorContacts: [], products: [], units: [], jobOrders: [], categories: [], accounts: [], prefillData: null };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const document_type = formData.get('document_type')?.toString() || 'PO';
		const vendor_id = formData.get('vendor_id');
		const vendor_contact_id = formData.get('vendor_contact_id')?.toString() || null;
		const delivery_address_id = formData.get('delivery_address_id')?.toString() || null;
		const job_id = formData.get('job_id')?.toString() || null;

		const document_date = formData.get('document_date')?.toString() || new Date().toISOString().split('T')[0];
		const credit_term = parseInt(formData.get('credit_term')?.toString() || '0', 10);
		const due_date = formData.get('due_date')?.toString() || null;

		const reference_doc = formData.get('reference_doc')?.toString() || '';
		const notes = formData.get('notes')?.toString() || '';
		const itemsJson = formData.get('items_json')?.toString() || '[]';

		const subtotal = parseFloat(formData.get('subtotal')?.toString() || '0');
		const discount_amount = parseFloat(formData.get('discount_amount')?.toString() || '0');
		const total_after_discount = parseFloat(formData.get('total_after_discount')?.toString() || '0');
		const vat_rate = parseFloat(formData.get('vat_rate')?.toString() || '0');
		const vat_amount = parseFloat(formData.get('vat_amount')?.toString() || '0');

		const wht_rate = parseFloat(formData.get('wht_rate')?.toString() || '0');
		const wht_amount = parseFloat(formData.get('wht_amount')?.toString() || '0');
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!vendor_id) return fail(400, { message: 'กรุณาเลือกผู้จำหน่าย (Vendor)' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const document_number = await generateDocumentNumber(document_type, document_date, connection);

			const [result] = await connection.execute<any>(
				`INSERT INTO purchase_documents 
                (document_type, document_number, document_date, credit_term, due_date, vendor_id, vendor_contact_id, delivery_address_id, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, wht_amount, total_amount,
                 status, created_by_user_id, job_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
				[
					document_type, document_number, document_date, credit_term, due_date, vendor_id, vendor_contact_id, delivery_address_id, reference_doc, notes, 
					subtotal, discount_amount, total_after_discount, vat_rate, vat_amount, wht_rate, wht_amount, wht_amount, total_amount,
					locals.user?.id || null, job_id
				]
			);
			const documentId = result.insertId;

			const items = JSON.parse(itemsJson);
			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					const lineWhtRate = parseFloat(item.wht_rate || '0');
					const lineTotal = parseFloat(item.line_total || '0');
					const lineWhtAmount = lineTotal * (lineWhtRate / 100);
					const isVat = item.is_vat === false ? 0 : 1;

					await connection.execute(
						`INSERT INTO purchase_document_items 
                        (document_id, product_id, description, quantity, unit_id, unit_price, line_total, wht_rate, wht_amount, item_order, is_vat) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							documentId, item.product_id || null, item.description, item.quantity, item.unit_id || null,
							item.unit_price, lineTotal, lineWhtRate, lineWhtAmount, index, isVat
						]
					);
				}
			}

			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO purchase_document_attachments 
                        (document_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							documentId, savedFile.originalName, savedFile.systemName, savedFile.mimeType, savedFile.size, locals.user?.id
						]
					);
				}
			}

			await connection.commit();
			throw redirect(303, `/purchase-documents/${documentId}`);
		} catch (err: any) {
			await connection.rollback();
			if (err.status === 303) throw err;
			console.error('Create document error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}
	}
};