import { fail, redirect, error } from '@sveltejs/kit';
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

async function deleteFile(filename: string) {
	if (!filename) return;
	try {
		const filePath = path.join(UPLOAD_DIR, filename);
		await fs.unlink(filePath);
	} catch (e) {
		console.error('Delete file error:', e);
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		const [rows] = await pool.query<any[]>('SELECT * FROM quotations WHERE id = ?', [id]);
		if (rows.length === 0) throw error(404, 'Quotation not found');
		const quotation = rows[0];

		const [itemRows] = await pool.query<any[]>(
			'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY item_order ASC',
			[id]
		);

		const [attachmentRows] = await pool.query<any[]>(
			'SELECT * FROM quotation_attachments WHERE quotation_id = ?',
			[id]
		);
		const attachments = attachmentRows.map((f: any) => ({
			...f,
			url: `/uploads/quotations/${f.file_system_name}`
		}));

		const [customers] = await pool.query(
			'SELECT id, name, company_name FROM customers ORDER BY name ASC'
		);
		const [products] = await pool.query(
			'SELECT id, name, sku, selling_price AS price, unit_id FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, name, symbol FROM units ORDER BY name ASC');

		return {
			quotation: JSON.parse(JSON.stringify(quotation)),
			quotationItems: JSON.parse(JSON.stringify(itemRows)),
			attachments: JSON.parse(JSON.stringify(attachments)),
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units))
		};
	} catch (err: any) {
		console.error('Error loading quotation for edit:', err);
		throw error(500, 'Internal Server Error');
	}
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const quotation_date = formData.get('quotation_date')?.toString() || '';
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

		if (!customer_id || !quotation_date) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			await connection.execute(
				`UPDATE quotations 
                 SET customer_id=?, quotation_date=?, valid_until=?, reference_doc=?, notes=?,
                     subtotal=?, discount_amount=?, total_after_discount=?, 
                     vat_rate=?, vat_amount=?, withholding_tax_rate=0, withholding_tax_amount=?, total_amount=?
                 WHERE id=?`,
				[
					customer_id,
					quotation_date,
					valid_until,
					reference_doc,
					notes,
					subtotal,
					discount_amount,
					total_after_discount,
					vat_rate,
					vat_amount,
					withholding_tax_amount,
					total_amount,
					id
				]
			);

			await connection.execute('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

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
							id,
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
							id,
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
			console.error('Update quotation error:', err);
			return fail(500, { message: 'Error: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/quotations/${id}`);
	},

	deleteAttachment: async ({ request }) => {
		const formData = await request.formData();
		const attachmentId = formData.get('attachment_id');
		if (!attachmentId) return fail(400, { message: 'Missing attachment ID' });

		try {
			const [rows] = await pool.query<any[]>(
				'SELECT file_system_name FROM quotation_attachments WHERE id = ?',
				[attachmentId]
			);
			if (rows.length > 0) {
				await deleteFile(rows[0].file_system_name);
				await pool.query('DELETE FROM quotation_attachments WHERE id = ?', [attachmentId]);
			}
			return { success: true };
		} catch (e: any) {
			console.error('Delete attachment error:', e);
			return fail(500, { message: 'Failed to delete attachment' });
		}
	}
};
