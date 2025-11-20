import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

// --- Helper: ฟังก์ชันบันทึกไฟล์ (เหมือนใน Bill Payments) ---
const UPLOAD_DIR = path.resolve('uploads', 'receipts');

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

// --- Helper: ฟังก์ชันสร้างเลขที่เอกสาร (Running Number) ---
async function generateReceiptNumber(dateStr: string) {
	// รูปแบบ: RC-YYYYMM-XXXX (เช่น RC-202311-0001)
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const prefix = `RC-${year}${month}-`;

	const [rows] = await pool.query<any[]>(
		`SELECT receipt_number FROM receipts WHERE receipt_number LIKE ? ORDER BY receipt_number DESC LIMIT 1`,
		[`${prefix}%`]
	);

	let nextNum = 1;
	if (rows.length > 0) {
		const lastNumStr = rows[0].receipt_number.split('-').pop();
		nextNum = parseInt(lastNumStr) + 1;
	}
	return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	// ดึงลูกค้าและสินค้า เพื่อไปทำ Dropdown
	try {
		const [customers] = await pool.query(
			'SELECT id, name, address, tax_id FROM customers ORDER BY name ASC'
		);
		const [products] = await pool.query(
			'SELECT id, name, sku, selling_price AS price, unit_id FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol FROM units ORDER BY symbol ASC');

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

		// รับค่าจากฟอร์ม
		const customer_id = formData.get('customer_id');
		const receipt_date =
			formData.get('receipt_date')?.toString() || new Date().toISOString().split('T')[0];
		const reference_doc = formData.get('reference_doc')?.toString() || '';
		const notes = formData.get('notes')?.toString() || '';
		const itemsJson = formData.get('items_json')?.toString() || '[]';

		// ตัวเลขสรุป
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

		if (!customer_id) {
			return fail(400, { message: 'กรุณาเลือกลูกค้า' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// 1. สร้างเลขที่เอกสาร
			const receipt_number = await generateReceiptNumber(receipt_date);

			// 2. บันทึกหัวเอกสาร (receipts)
			const [result] = await connection.execute<any>(
				`INSERT INTO receipts 
                (receipt_number, receipt_date, customer_id, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, total_amount,
                 status, created_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Issued', ?)`,
				[
					receipt_number,
					receipt_date,
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
					locals.user?.id || null
				]
			);
			const receiptId = result.insertId;

			// 3. บันทึกรายการสินค้า (receipt_items)
			const items = JSON.parse(itemsJson);
			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					await connection.execute(
						`INSERT INTO receipt_items 
                        (receipt_id, product_id, description, quantity, unit_id, unit_price, line_total, item_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							receiptId,
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

			// 4. บันทึกไฟล์แนบ (Attachments)
			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO receipt_attachments 
                        (receipt_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							receiptId,
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
			console.error('Create receipt error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึก: ' + err.message });
		} finally {
			connection.release();
		}

		// บันทึกเสร็จ กลับไปหน้ารายการ
		throw redirect(303, '/receipts');
	}
};
