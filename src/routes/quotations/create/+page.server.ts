import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'quotations');

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

async function generateQuotationNumber(dateStr: string, connection: any) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const mm = String(month).padStart(2, '0');

	const selectQuery = `SELECT prefix, last_number, padding_length FROM document_sequences WHERE document_type = 'QT' LIMIT 1`;
	const [rows] = await connection.execute(selectQuery);

	let lastNumber = 0;
	let padding = 4;
	let prefix = 'QT-';

	if ((rows as any[]).length > 0) {
		await connection.execute(
			`UPDATE document_sequences SET last_number = last_number + 1, year = ?, month = ? WHERE document_type = 'QT'`,
			[year, month]
		);
		lastNumber = (rows as any[])[0].last_number + 1;
		padding = (rows as any[])[0].padding_length;
		prefix = (rows as any[])[0].prefix;
	} else {
		await connection.execute(
			`INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length) VALUES ('QT', 'QT-', ?, ?, 1, 4)`,
			[year, month]
		);
		lastNumber = 1;
	}

	const runningNumber = String(lastNumber).padStart(padding, '0');
	return `${prefix}${year}${mm}-${runningNumber}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [customers] = await pool.query(
			'SELECT id, name, company_name FROM customers ORDER BY name ASC'
		);
		const [products] = await pool.query(
			'SELECT id, name, sku, selling_price AS price, unit_id FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol, name FROM units ORDER BY symbol ASC');

		return {
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units))
		};
	} catch (error: any) {
		console.error('Load error:', error);
		return { customers: [], products: [], units: [] };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const quotation_date =
			formData.get('quotation_date')?.toString() || new Date().toISOString().split('T')[0];
		const valid_until = formData.get('valid_until')?.toString() || null;
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

		const withholding_tax_amount = parseFloat(
			formData.get('withholding_tax_amount')?.toString() || '0'
		);
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!customer_id) return fail(400, { message: 'กรุณาเลือกลูกค้า' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const quotation_number = await generateQuotationNumber(quotation_date, connection);

			const [result] = await connection.execute<any>(
				`INSERT INTO quotations 
                (quotation_number, quotation_date, valid_until, customer_id, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, total_amount,
                 status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'Sent', ?)`,
				[
					quotation_number,
					quotation_date,
					valid_until,
					customer_id,
					reference_doc,
					notes,
					subtotal,
					discount_amount,
					total_after_discount,
					vat_rate,
					vat_amount,
					withholding_tax_amount,
					total_amount,
					locals.user?.id || null
				]
			);
			const quotationId = result.insertId;

			const items = JSON.parse(itemsJson);
			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					const lineTotal = Number(item.line_total) || 0;
					const whtR = Number(item.wht_rate) || 0;
					const whtA = (lineTotal * whtR) / 100;

					await connection.execute(
						`INSERT INTO quotation_items 
                        (quotation_id, product_id, description, quantity, unit_id, unit_price, line_total, item_order, wht_rate, wht_amount) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							quotationId,
							item.product_id || null,
							item.description,
							item.quantity,
							item.unit_id || null,
							item.unit_price,
							lineTotal,
							index,
							whtR,
							whtA
						]
					);
				}
			}

			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO quotation_attachments 
                        (quotation_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							quotationId,
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
			console.error('Create quotation error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, '/quotations');
	}
};
