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

		const [vendors] = await pool.query('SELECT id, name FROM vendors ORDER BY name ASC');
		const [products] = await pool.query(
			'SELECT id, name, sku, purchase_cost AS price, unit_id, default_wht_rate FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol, name FROM units ORDER BY symbol ASC');
		const [categories] = await pool.query('SELECT id, name FROM product_categories ORDER BY name');
		const [accounts] = await pool.query(
			'SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code'
		);
		
		// โหลดรายการสถานที่จัดส่ง (เฉพาะที่ยังใช้งานอยู่)
		const [deliveryAddresses] = await pool.query('SELECT * FROM delivery_addresses WHERE is_active = 1 ORDER BY id ASC');

		return {
			vendors: JSON.parse(JSON.stringify(vendors)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			categories: JSON.parse(JSON.stringify(categories)),
			accounts: JSON.parse(JSON.stringify(accounts)),
			deliveryAddresses: JSON.parse(JSON.stringify(deliveryAddresses)),
			prefillData: prefillData ? JSON.parse(JSON.stringify(prefillData)) : null 
		};
	} catch (error: any) {
		console.error('Load data error:', error);
		return {
			vendors: [],
			products: [],
			units: [],
			categories: [],
			accounts: [],
			deliveryAddresses: [],
			prefillData: null
		};
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const document_type = formData.get('document_type')?.toString() || 'PO';
		const vendor_id = formData.get('vendor_id');
		const delivery_address_id = formData.get('delivery_address_id')?.toString() || null;
		
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
                (document_type, document_number, document_date, credit_term, due_date, vendor_id, delivery_address_id, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, wht_amount, total_amount,
                 status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
				[
					document_type,
					document_number,
					document_date,
					credit_term,
					due_date,
					vendor_id,
					delivery_address_id,
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
					locals.user?.id || null
				]
			);
			const documentId = result.insertId;

			const items = JSON.parse(itemsJson);
			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					const lineWhtRate = parseFloat(item.wht_rate || '0');
					const lineTotal = parseFloat(item.line_total || '0');
					const lineWhtAmount = lineTotal * (lineWhtRate / 100);

					await connection.execute(
						`INSERT INTO purchase_document_items 
                        (document_id, product_id, description, quantity, unit_id, unit_price, line_total, wht_rate, wht_amount, item_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
							index
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
			throw redirect(303, `/purchase-documents/${documentId}`);
		} catch (err: any) {
			await connection.rollback();
			if (err.status === 303) throw err;
			console.error('Create purchase document error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}
	},

	// Action สำหรับสร้างที่อยู่จัดส่งใหม่
	createAddress: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const address_line = formData.get('address_line')?.toString()?.trim();
		const contact_name = formData.get('contact_name')?.toString()?.trim();
		const contact_phone = formData.get('contact_phone')?.toString()?.trim();

		if (!name || !address_line) {
			return fail(400, { message: 'กรุณากรอกชื่อสถานที่และรายละเอียดที่อยู่' });
		}

		try {
			const [result] = await pool.execute<any>(
				`INSERT INTO delivery_addresses (name, address_line, contact_name, contact_phone, is_active) VALUES (?, ?, ?, ?, 1)`,
				[name, address_line, contact_name || null, contact_phone || null]
			);
			
			const [newAddress] = await pool.query<any[]>(
				'SELECT * FROM delivery_addresses WHERE id = ?',
				[result.insertId]
			);
			
			return { success: true, address: newAddress[0] };
		} catch (err: any) {
			console.error('Create address error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการสร้างที่อยู่: ' + err.message });
		}
	},

	// Action สำหรับแก้ไขที่อยู่จัดส่ง
	updateAddress: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const name = formData.get('name')?.toString()?.trim();
		const address_line = formData.get('address_line')?.toString()?.trim();
		const contact_name = formData.get('contact_name')?.toString()?.trim();
		const contact_phone = formData.get('contact_phone')?.toString()?.trim();

		if (!id || !name || !address_line) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		try {
			await pool.execute(
				`UPDATE delivery_addresses SET name = ?, address_line = ?, contact_name = ?, contact_phone = ? WHERE id = ?`,
				[name, address_line, contact_name || null, contact_phone || null, id]
			);
			
			const [updatedAddress] = await pool.query<any[]>(
				'SELECT * FROM delivery_addresses WHERE id = ?',
				[id]
			);
			
			return { success: true, address: updatedAddress[0] };
		} catch (err: any) {
			console.error('Update address error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขที่อยู่: ' + err.message });
		}
	},

	// Action สำหรับลบที่อยู่จัดส่ง (Soft Delete)
	deleteAddress: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสที่อยู่จัดส่ง' });

		try {
			// ใช้ Soft Delete เพื่อไม่ให้กระทบเอกสารเก่าที่เคยใช้ที่อยู่นี้
			await pool.execute(`UPDATE delivery_addresses SET is_active = 0 WHERE id = ?`, [id]);
			return { success: true, deletedId: Number(id) };
		} catch (err: any) {
			console.error('Delete address error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบที่อยู่: ' + err.message });
		}
	}
};