import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

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

async function generateReceiptNumber(dateStr: string) {
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

export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		const [customers] = await pool.query(
			'SELECT id, name, address, tax_id FROM customers ORDER BY name ASC'
		);
		// ใช้ selling_price AS price
		const [products] = await pool.query(
			'SELECT id, name, sku, selling_price AS price, unit_id FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol FROM units ORDER BY symbol ASC');

		let prefilledData = null;
		const fromInvoiceId = url.searchParams.get('from_invoice');
		const fromBillingNoteId = url.searchParams.get('from_billing_note');

		// กรณีที่ 1: มาจาก Invoice (ใบเดียว)
		if (fromInvoiceId) {
			const [invRows] = await pool.query<any[]>('SELECT * FROM invoices WHERE id = ?', [
				fromInvoiceId
			]);
			if (invRows.length > 0) {
				const inv = invRows[0];
				const [invItems] = await pool.query<any[]>(
					'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_order ASC',
					[fromInvoiceId]
				);

				prefilledData = {
					customer_id: inv.customer_id,
					reference_doc: inv.invoice_number,
					notes: inv.notes,
					discount_amount: inv.discount_amount,
					vat_rate: inv.vat_rate,
					withholding_tax_rate: inv.withholding_tax_rate,
					items: invItems.map((item: any) => ({
						product_id: item.product_id,
						description: item.description,
						quantity: item.quantity,
						unit_id: item.unit_id,
						unit_price: item.unit_price,
						line_total: item.line_total
					}))
				};
			}
		}
		// กรณีที่ 2: มาจาก Billing Note (หลายใบ)
		else if (fromBillingNoteId) {
			const [bnRows] = await pool.query<any[]>('SELECT * FROM billing_notes WHERE id = ?', [
				fromBillingNoteId
			]);
			if (bnRows.length > 0) {
				const bn = bnRows[0];
				// ดึงรายการใบแจ้งหนี้ที่อยู่ในใบวางบิลนี้
				const [bnItems] = await pool.query<any[]>(
					`
                    SELECT bni.amount, i.invoice_number 
                    FROM billing_note_invoices bni
                    LEFT JOIN invoices i ON bni.invoice_id = i.id
                    WHERE bni.billing_note_id = ?
                `,
					[fromBillingNoteId]
				);

				prefilledData = {
					customer_id: bn.customer_id,
					reference_doc: bn.billing_note_number, // อ้างอิงเลขใบวางบิล
					notes: bn.notes,
					discount_amount: 0,
					vat_rate: 0, // ปกติใบวางบิลรวมยอดมาแล้ว เราอาจจะไม่คิด VAT ซ้ำ หรือ User ปรับเองได้
					withholding_tax_rate: 0,
					// แปลงรายการใบแจ้งหนี้ เป็น รายการในใบเสร็จ (1 Invoice = 1 บรรทัด)
					items: bnItems.map((item: any) => ({
						product_id: null,
						description: `ชำระค่าใบแจ้งหนี้เลขที่ ${item.invoice_number}`,
						quantity: 1,
						unit_id: null,
						unit_price: item.amount,
						line_total: item.amount
					}))
				};
			}
		}

		return {
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			prefilledData: JSON.parse(JSON.stringify(prefilledData))
		};
	} catch (error: any) {
		console.error('Load error:', error);
		return { customers: [], products: [], units: [], prefilledData: null };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const receipt_date =
			formData.get('receipt_date')?.toString() || new Date().toISOString().split('T')[0];
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

		if (!customer_id) {
			return fail(400, { message: 'กรุณาเลือกลูกค้า' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const receipt_number = await generateReceiptNumber(receipt_date);

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

			// --- Auto Update Status Logic ---
			if (reference_doc) {
				const ref = reference_doc.toString();

				// กรณีที่ 1: อ้างอิง Invoice (INV-...)
				if (ref.startsWith('INV-')) {
					await connection.execute(
						"UPDATE invoices SET status = 'Paid' WHERE invoice_number = ? AND status != 'Paid'",
						[ref]
					);
				}
				// กรณีที่ 2: อ้างอิง Billing Note (BN-...)
				else if (ref.startsWith('BN-')) {
					// 2.1 อัปเดต Billing Note เป็น Paid
					await connection.execute(
						"UPDATE billing_notes SET status = 'Paid' WHERE billing_note_number = ? AND status != 'Paid'",
						[ref]
					);

					// 2.2 หาว่า Billing Note นี้คุม Invoice ใบไหนบ้าง แล้วอัปเดต Invoice เหล่านั้นเป็น Paid ทั้งหมด
					// (Sub-query หา id ของ invoice จาก billing_note_invoices)
					await connection.execute(
						`
                        UPDATE invoices 
                        SET status = 'Paid' 
                        WHERE id IN (
                            SELECT invoice_id 
                            FROM billing_note_invoices 
                            WHERE billing_note_id = (SELECT id FROM billing_notes WHERE billing_note_number = ? LIMIT 1)
                        ) AND status != 'Paid'
                    `,
						[ref]
					);

					console.log(`Auto-updated Billing Note ${ref} and related Invoices to Paid.`);
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

		throw redirect(303, '/receipts');
	}
};
