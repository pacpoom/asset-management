import { fail, redirect, error } from '@sveltejs/kit';
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
		const [docRows] = await pool.query<any[]>('SELECT * FROM purchase_documents WHERE id = ?', [
			documentId
		]);
		if (docRows.length === 0) throw error(404, 'Purchase Document not found');
		const document = docRows[0];

		const [itemRows] = await pool.query<any[]>(
			'SELECT * FROM purchase_document_items WHERE document_id = ? ORDER BY item_order ASC',
			[documentId]
		);

		const [attachmentRows] = await pool.query<any[]>(
			'SELECT * FROM purchase_document_attachments WHERE document_id = ?',
			[documentId]
		);
		const attachments = attachmentRows.map((f: any) => ({
			...f,
			url: `/uploads/purchase_documents/${f.file_system_name}`
		}));

		const [vendors] = await pool.query('SELECT id, COALESCE(company_name, name) AS name FROM vendors ORDER BY COALESCE(company_name, name) ASC');
		
		// 🌟 ดึงข้อมูล Vendor Contacts มาด้วยเหมือนหน้า New
		const [vendorContacts] = await pool.query('SELECT id, vendor_id, name, position, email, phone FROM vendor_contacts ORDER BY name ASC');

		// 🌟 ดึงข้อมูลสัญญา Vendor Contracts
		const [vendorContractsData] = await pool.query('SELECT id, vendor_id, title, contract_number FROM vendor_contracts WHERE status = "Active" ORDER BY title ASC');

		const [products] = await pool.query(
			'SELECT id, name, sku, purchase_cost AS price, unit_id, default_wht_rate FROM products WHERE is_active = 1 ORDER BY name ASC'
		);
		const [units] = await pool.query('SELECT id, symbol FROM units ORDER BY symbol ASC');
		
		const [deliveryAddresses] = await pool.query('SELECT * FROM delivery_addresses WHERE is_active = 1 ORDER BY id ASC');

		// 🌟 ดึงข้อมูล Job Orders โดยดึง vendor_id ด้วยเพื่อนำไป filter
		const [jobOrders] = await pool.query('SELECT id, job_number, vendor_id, bl_number FROM job_orders ORDER BY id DESC');

		return {
			document: JSON.parse(JSON.stringify(document)),
			existingItems: JSON.parse(JSON.stringify(itemRows)),
			existingAttachments: JSON.parse(JSON.stringify(attachments)),
			vendors: JSON.parse(JSON.stringify(vendors)),
			vendorContacts: JSON.parse(JSON.stringify(vendorContacts)),
			vendorContractsData: JSON.parse(JSON.stringify(vendorContractsData)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			deliveryAddresses: JSON.parse(JSON.stringify(deliveryAddresses)),
			jobOrders: JSON.parse(JSON.stringify(jobOrders))
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

		const vendor_id = formData.get('vendor_id');
		const vendor_contact_id = formData.get('vendor_contact_id')?.toString() || null; // 🌟 เพิ่มมารับค่า contact
		const contract_id = formData.get('contract_id')?.toString() || null;
		const delivery_address_id = formData.get('delivery_address_id')?.toString() || null;
		
		const job_id = formData.get('job_id')?.toString() || null;
		
		const document_date = formData.get('document_date')?.toString();
		const credit_term = parseInt(formData.get('credit_term')?.toString() || '0', 10);
		const due_date = formData.get('due_date')?.toString() || null;
		const delivery_date = formData.get('delivery_date')?.toString() || null;
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

		if (!vendor_id) return fail(400, { message: 'กรุณาเลือกผู้จำหน่าย' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// 🌟 อัพเดท vendor_contact_id, contract_id และ delivery_date เข้าไปใน Database
			await connection.execute(
				`UPDATE purchase_documents SET 
                 document_date = ?, credit_term = ?, due_date = ?, delivery_date = ?, vendor_id = ?, vendor_contact_id = ?, contract_id = ?, delivery_address_id = ?, job_id = ?, reference_doc = ?, notes = ?,
                 subtotal = ?, discount_amount = ?, total_after_discount = ?,
                 vat_rate = ?, vat_amount = ?, withholding_tax_rate = ?, withholding_tax_amount = ?, wht_amount = ?, total_amount = ?
                 WHERE id = ?`,
				[
					document_date,
					credit_term,
					due_date,
					delivery_date,
					vendor_id,
					vendor_contact_id,
					contract_id,
					delivery_address_id,
					job_id,
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

			await connection.execute('DELETE FROM purchase_document_items WHERE document_id = ?', [
				documentId
			]);

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
		} catch (err: any) {
			await connection.rollback();
			console.error('Update purchase document error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไข: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, `/purchase-documents/${documentId}`);
	},

	deleteAttachment: async ({ request }) => {
		const formData = await request.formData();
		const attachmentId = formData.get('attachment_id');

		try {
			const [rows] = await pool.query<any[]>(
				'SELECT file_system_name FROM purchase_document_attachments WHERE id = ?',
				[attachmentId]
			);
			if (rows.length > 0) {
				await deleteFile(rows[0].file_system_name);
				await pool.execute('DELETE FROM purchase_document_attachments WHERE id = ?', [attachmentId]);
				return { success: true };
			}
			return fail(404, { message: 'File not found' });
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	},

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

	deleteAddress: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสที่อยู่จัดส่ง' });

		try {
			await pool.execute(`UPDATE delivery_addresses SET is_active = 0 WHERE id = ?`, [id]);
			return { success: true, deletedId: Number(id) };
		} catch (err: any) {
			console.error('Delete address error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบที่อยู่: ' + err.message });
		}
	}
};