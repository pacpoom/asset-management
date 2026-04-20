import { fail, redirect } from '@sveltejs/kit';
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

async function generateDocumentNumber(docType: string, dateStr: string, connection: any) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const monthStr = String(month).padStart(2, '0');

	let prefix = '';
	switch (docType) {
		case 'QT': prefix = 'QT-'; break;
		case 'BN': prefix = 'BN-'; break;
		case 'INV': prefix = 'INV-'; break;
		case 'RE': prefix = 'RE-'; break;
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
	// รับ Parameter สำหรับทำ Auto-Generate (Pre-fill)
	const sourceId = url.searchParams.get('source_id');
	const targetType = url.searchParams.get('target_type') || 'INV';
	
	// รับ Parameter กรณีสร้างตรงจาก Job Order
	const jobId = url.searchParams.get('job_id');
	const customerId = url.searchParams.get('customer_id');

	let prefillData = null;

	try {
		// หากมี source_id ให้ไปดึงข้อมูลเอกสารเก่าและรายการสินค้ามารอไว้
		if (sourceId) {
			const [docs] = await pool.query<any[]>('SELECT * FROM sales_documents WHERE id = ?', [sourceId]);
			const [items] = await pool.query<any[]>('SELECT * FROM sales_document_items WHERE document_id = ? ORDER BY item_order ASC', [sourceId]);
			
			if (docs.length > 0) {
				prefillData = {
					document: docs[0],
					items: items,
					targetType: targetType
				};
			}
		} else if (jobId || customerId) {
			prefillData = {
				document: {
					job_order_id: jobId ? parseInt(jobId) : null,
					customer_id: customerId && customerId !== 'null' ? parseInt(customerId) : null
				},
				items: [],
				targetType: targetType
			};
		}

		const [customers] = await pool.query('SELECT id, name, company_name FROM customers ORDER BY COALESCE(company_name, name) ASC');
		// โหลด Contact Persons
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
			customers: JSON.parse(JSON.stringify(customers)),
			customerContacts: JSON.parse(JSON.stringify(customerContacts)), // ส่ง Contact ไปให้ Client
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			jobOrders: JSON.parse(JSON.stringify(jobOrders)),
			categories: JSON.parse(JSON.stringify(categories)),
			vendors: JSON.parse(JSON.stringify(vendors)),
			accounts: JSON.parse(JSON.stringify(accounts)),
			prefillData: prefillData ? JSON.parse(JSON.stringify(prefillData)) : null 
		};
	} catch (error: any) {
		console.error('Load data error:', error);
		return {
			customers: [],
			customerContacts: [],
			products: [],
			units: [],
			jobOrders: [],
			categories: [],
			vendors: [],
			accounts: [],
			prefillData: null
		};
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const document_type = formData.get('document_type')?.toString() || 'INV';
		const customer_id = formData.get('customer_id');
		const customer_contact_id = formData.get('customer_contact_id')?.toString() || null; // รับค่า contact
		const job_order_id = formData.get('job_order_id')?.toString() || null;

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

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const document_number = await generateDocumentNumber(document_type, document_date, connection);

			const [result] = await connection.execute<any>(
				`INSERT INTO sales_documents 
                (document_type, document_number, document_date, credit_term, due_date, customer_id, customer_contact_id, job_order_id, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, wht_amount, total_amount,
                 status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
				[
					document_type, document_number, document_date, credit_term, due_date, customer_id, customer_contact_id, job_order_id, reference_doc, notes, 
					subtotal, discount_amount, total_after_discount, vat_rate, vat_amount, wht_rate, wht_amount, wht_amount, total_amount,
					locals.user?.id || null
				]
			);
			const documentId = result.insertId;

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
						`INSERT INTO sales_document_attachments 
                        (document_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							documentId, savedFile.originalName, savedFile.systemName, savedFile.mimeType, savedFile.size, locals.user?.id
						]
					);
				}
			}

			// Update job order status to 'Completed' if this is an Invoice (INV)
			if (document_type === 'INV' && job_order_id) {
				await connection.execute(
					`UPDATE job_orders SET job_status = 'Completed' WHERE id = ?`,
					[job_order_id]
				);
			}

			await connection.commit();
			throw redirect(303, `/sales-documents/${documentId}`);
		} catch (err: any) {
			await connection.rollback();
			if (err.status === 303) throw err;
			console.error('Create document error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}
	},

	createProduct: async ({ request }) => {
		const formData = await request.formData();

		const name = formData.get('name')?.toString()?.trim() || '';
		const description = formData.get('description')?.toString()?.trim() || null;
		const product_type = formData.get('product_type')?.toString() || 'Stock';

		const parseNum = (val: any) =>
			val && val !== 'null' && val !== 'undefined' ? Number(val) : null;

		const category_id = parseNum(formData.get('category_id'));
		const unit_id = parseNum(formData.get('unit_id'));
		const purchase_unit_id = parseNum(formData.get('purchase_unit_id'));
		const sales_unit_id = parseNum(formData.get('sales_unit_id'));
		const preferred_vendor_id = parseNum(formData.get('preferred_vendor_id'));
		const preferred_customer_id = parseNum(formData.get('preferred_customer_id'));
		const asset_account_id = parseNum(formData.get('asset_account_id'));
		const income_account_id = parseNum(formData.get('income_account_id'));
		const expense_account_id = parseNum(formData.get('expense_account_id'));

		const purchase_cost = parseNum(formData.get('purchase_cost')) || 0;
		const selling_price = parseNum(formData.get('selling_price')) || 0;
		const quantity_on_hand =
			product_type === 'Stock' ? parseNum(formData.get('quantity_on_hand')) || 0 : 0;
		const reorder_level = parseNum(formData.get('reorder_level')) || 0;
		const default_wht_rate = parseNum(formData.get('default_wht_rate')) || 0;

		const is_active =
			formData.get('is_active') === 'on' || formData.get('is_active') === 'true' ? 1 : 0;

		if (!name || !unit_id) return fail(400, { message: 'กรุณากรอกชื่อสินค้าและเลือก Base Unit' });

		const prefix = 'PROD';
		const today = new Date();
		const year = today.getFullYear().toString().slice(-2);
		const month = (today.getMonth() + 1).toString().padStart(2, '0');
		const datePrefix = `${prefix}${year}${month}`;

		const [skuRows]: any[] = await pool.execute(
			`SELECT sku FROM products WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1`,
			[`${datePrefix}-%`]
		);
		let nextNumber = 1;
		if (skuRows.length > 0) {
			const lastNumberStr = skuRows[0].sku.split('-')[1];
			if (lastNumberStr && !isNaN(parseInt(lastNumberStr, 10))) {
				nextNumber = parseInt(lastNumberStr, 10) + 1;
			}
		}
		const newSku = `${datePrefix}-${nextNumber.toString().padStart(5, '0')}`;

		let imageUrl: string | null = null;
		const imageFile = formData.get('image') as File | null;
		if (imageFile && imageFile.size > 0) {
			try {
				const PROD_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');
				await fs.mkdir(PROD_UPLOADS_DIR, { recursive: true });
				const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
				const sanitizedOriginalName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
				const filename = `${uniqueSuffix}-${sanitizedOriginalName}`;
				const uploadPath = path.join(PROD_UPLOADS_DIR, filename);
				await fs.writeFile(uploadPath, Buffer.from(await imageFile.arrayBuffer()));
				imageUrl = `/uploads/products/${filename}`;
			} catch (err) {
				console.error('Image upload failed:', err);
			}
		}

		try {
			const sql = `INSERT INTO products (
                sku, name, description, product_type, category_id, unit_id, purchase_unit_id, sales_unit_id,
                preferred_vendor_id, preferred_customer_id, purchase_cost, selling_price, quantity_on_hand, reorder_level, 
                is_active, image_url, asset_account_id, income_account_id, expense_account_id, default_wht_rate, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;

			const [result] = await pool.execute<any>(sql, [
				newSku,
				name,
				description,
				product_type,
				category_id,
				unit_id,
				purchase_unit_id,
				sales_unit_id,
				preferred_vendor_id,
				preferred_customer_id,
				purchase_cost,
				selling_price,
				quantity_on_hand,
				reorder_level,
				is_active,
				imageUrl,
				asset_account_id,
				income_account_id,
				expense_account_id,
				default_wht_rate
			]);

			const newProductId = result.insertId;
			const [newProduct] = await pool.query<any[]>(
				'SELECT id, name, sku, selling_price AS price, unit_id, default_wht_rate FROM products WHERE id = ?',
				[newProductId]
			);

			return { success: true, product: newProduct[0] };
		} catch (err: any) {
			console.error('Create product error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการสร้างสินค้า: ' + err.message });
		}
	}
};