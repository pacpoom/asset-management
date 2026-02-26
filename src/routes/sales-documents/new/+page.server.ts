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

// ฟังก์ชันรันเลขเอกสารตามมาตรฐานสากล
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

    // Insert หรือ อัปเดต Sequence แบบป้องกัน Race Condition
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

export const load: PageServerLoad = async () => {
	try {
		const [customers] = await pool.query('SELECT id, name FROM customers ORDER BY name ASC');
		const [products] = await pool.query('SELECT id, name, sku, selling_price AS price, unit_id, default_wht_rate FROM products WHERE is_active = 1 ORDER BY name ASC');
		const [units] = await pool.query('SELECT id, symbol FROM units ORDER BY symbol ASC');

		return {
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units))
		};
	} catch (error: any) {
		return { customers: [], products: [], units: [] };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const document_type = formData.get('document_type')?.toString() || 'INV';
		const customer_id = formData.get('customer_id');
		const document_date = formData.get('document_date')?.toString() || new Date().toISOString().split('T')[0];
		const due_date = formData.get('due_date')?.toString() || null;
		const reference_doc = formData.get('reference_doc')?.toString() || '';
		const notes = formData.get('notes')?.toString() || '';
		const itemsJson = formData.get('items_json')?.toString() || '[]';

		const subtotal = parseFloat(formData.get('subtotal')?.toString() || '0');
		const discount_amount = parseFloat(formData.get('discount_amount')?.toString() || '0');
		const total_after_discount = parseFloat(formData.get('total_after_discount')?.toString() || '0');
		const vat_rate = parseFloat(formData.get('vat_rate')?.toString() || '0');
		const vat_amount = parseFloat(formData.get('vat_amount')?.toString() || '0');

		const wht_rate = parseFloat(formData.get('wht_rate')?.toString() || '0'); // Legacy field, might not be needed
		const wht_amount = parseFloat(formData.get('wht_amount')?.toString() || '0');
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// สร้างเลขเอกสารแบบใหม่
			const document_number = await generateDocumentNumber(document_type, document_date, connection);

			const [result] = await connection.execute<any>(
				`INSERT INTO sales_documents 
                (document_type, document_number, document_date, due_date, customer_id, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, wht_amount, total_amount,
                 status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`, // เปลี่ยน default เป็น Draft
				[
					document_type, document_number, document_date, due_date, customer_id, reference_doc, notes,
					subtotal, discount_amount, total_after_discount,
					vat_rate, vat_amount, wht_rate, wht_amount, wht_amount, total_amount,
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
						`INSERT INTO sales_document_items 
                        (document_id, product_id, description, quantity, unit_id, unit_price, line_total, wht_rate, wht_amount, item_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							documentId, item.product_id || null, item.description, item.quantity, item.unit_id || null,
							item.unit_price, lineTotal, lineWhtRate, lineWhtAmount, index
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
						[documentId, savedFile.originalName, savedFile.systemName, savedFile.mimeType, savedFile.size, locals.user?.id]
					);
				}
			}

			await connection.commit();
            // Redirect ไปหน้ารายละเอียดเมื่อสร้างเสร็จ
			throw redirect(303, `/sales-documents/${documentId}`);
		} catch (err: any) {
			await connection.rollback();
			if(err.status === 303) throw err; // rethrow redirect
			console.error('Create document error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}
	}
};