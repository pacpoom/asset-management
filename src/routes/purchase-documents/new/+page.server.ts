import { fail, redirect, error, isHttpError } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

import { allocateMonthlyDocumentNumber } from '$lib/server/monthlyDocumentSequence';
import { userCanIssuePurchaseOrderFromPr } from '$lib/userRole';
import { normalizePurchaseDocumentDateInput } from '$lib/purchaseDocumentDateFormat';
import { normalizePurchaseDocumentCurrency } from '$lib/purchaseDocumentCurrency';
import { pickDefaultDeliveryAddressId, type DeliveryAddressPickRow } from '$lib/purchaseDocumentDeliveryAddress';

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

function resolvePurchasePrefix(docType: string): string {
	switch (docType) {
		case 'PR':
			return 'PR-';
		case 'PO':
			return 'PO-';
		case 'GR':
			return 'GR-';
		case 'AP':
			return 'AP-';
		case 'PV':
			return 'PV-';
		default:
			return 'DOC-';
	}
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const sourceId = url.searchParams.get('source_id');
	const targetType = url.searchParams.get('target_type') || 'PR';
	let prefillData = null;

	try {
		if (sourceId) {
			const [docs] = await pool.query<any[]>('SELECT * FROM purchase_documents WHERE id = ?', [sourceId]);
			const [items] = await pool.query<any[]>('SELECT * FROM purchase_document_items WHERE document_id = ? ORDER BY item_order ASC', [sourceId]);
			const [attachments] = await pool.query<any[]>(
				`SELECT id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id
				 FROM purchase_document_attachments
				 WHERE document_id = ?
				 ORDER BY id ASC`,
				[sourceId]
			);
			
			if (docs.length > 0) {
				prefillData = {
					document: docs[0],
					items: items,
					attachments: attachments,
					targetType: targetType
				};
			}
		}

		if (
			prefillData &&
			String(prefillData.document.document_type || '').toUpperCase() === 'PR' &&
			String(targetType).toUpperCase() === 'PO'
		) {
			if (!userCanIssuePurchaseOrderFromPr(locals.user)) {
				throw error(403, 'ไม่มีสิทธิ์ออก PO จาก PR');
			}
		}

		const [vendors] = await pool.query('SELECT id, COALESCE(company_name, name) AS name FROM vendors ORDER BY COALESCE(company_name, name) ASC');
		const [vendorContacts] = await pool.query('SELECT id, vendor_id, name, position, email, phone FROM vendor_contacts ORDER BY name ASC');
		const [products] = await pool.query(`
			SELECT
				p.id,
				p.name,
				p.sku,
				p.purchase_cost,
				p.unit_id,
				p.default_wht_rate,
				p.asset_account_id,
				coa.account_type AS asset_account_type
			FROM products p
			LEFT JOIN chart_of_accounts coa ON p.asset_account_id = coa.id
			WHERE p.is_active = 1 AND p.category_id = 26
			ORDER BY p.name ASC
		`);
		const [units] = await pool.query('SELECT id, symbol, name FROM units ORDER BY symbol ASC');
		const [jobOrders] = await pool.query('SELECT id, job_number, customer_id, vendor_id, job_type, bl_number, invoice_no, job_status FROM job_orders WHERE job_status != "Cancelled" ORDER BY id DESC');
		const [categories] = await pool.query('SELECT id, name FROM product_categories ORDER BY name');
		const [accounts] = await pool.query('SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code');
		const [deliveryAddresses] = await pool.query(
			'SELECT * FROM delivery_addresses WHERE is_active = 1 ORDER BY name ASC, contact_name ASC, id ASC'
		);
		const [vendorContractsData] = await pool.query('SELECT id, vendor_id, title, contract_number FROM vendor_contracts WHERE status = "Active" ORDER BY title ASC');
		const [departments] = await pool.query<any[]>('SELECT id, name FROM departments ORDER BY name ASC');

		const addrRows = JSON.parse(JSON.stringify(deliveryAddresses)) as DeliveryAddressPickRow[];
		const defaultDeliveryAddressId = pickDefaultDeliveryAddressId(addrRows, {
			creatorFullName: locals.user?.full_name,
			creatorDepartmentId:
				locals.user?.department_id != null && !Number.isNaN(Number(locals.user.department_id))
					? Number(locals.user.department_id)
					: null
		});

		return {
			vendors: JSON.parse(JSON.stringify(vendors)),
			vendorContacts: JSON.parse(JSON.stringify(vendorContacts)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			jobOrders: JSON.parse(JSON.stringify(jobOrders)),
			categories: JSON.parse(JSON.stringify(categories)),
			accounts: JSON.parse(JSON.stringify(accounts)),
			deliveryAddresses: JSON.parse(JSON.stringify(deliveryAddresses)),
			departments: JSON.parse(JSON.stringify(departments)),
			defaultDeliveryAddressId,
			vendorContractsData: JSON.parse(JSON.stringify(vendorContractsData)),
			prefillData: prefillData ? JSON.parse(JSON.stringify(prefillData)) : null 
		};
	} catch (err: unknown) {
		if (isHttpError(err)) throw err;
		console.error('Load data error:', err);
		return {
			vendors: [],
			vendorContacts: [],
			products: [],
			units: [],
			jobOrders: [],
			categories: [],
			accounts: [],
			deliveryAddresses: [],
			departments: [],
			defaultDeliveryAddressId: null,
			vendorContractsData: [],
			prefillData: null
		};
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const document_type = formData.get('document_type')?.toString() || 'PR';
		const vendor_id = formData.get('vendor_id');
		const vendor_contact_id = formData.get('vendor_contact_id')?.toString() || null;
		const contract_id = formData.get('contract_id')?.toString() || null;
		const delivery_address_id = formData.get('delivery_address_id')?.toString() || null;
		const job_id = formData.get('job_id')?.toString() || null;

		const document_date =
			normalizePurchaseDocumentDateInput(formData.get('document_date')?.toString()) ||
			new Date().toISOString().split('T')[0];
		const credit_term = parseInt(formData.get('credit_term')?.toString() || '0', 10);
		const due_date = normalizePurchaseDocumentDateInput(formData.get('due_date')?.toString());
		const delivery_date = normalizePurchaseDocumentDateInput(formData.get('delivery_date')?.toString());

		const reference_doc = formData.get('reference_doc')?.toString() || '';
		const currency = normalizePurchaseDocumentCurrency(formData.get('currency')?.toString());
		const delivery_receiver_name =
			formData.get('delivery_receiver_name')?.toString().trim() || null;
		const delivery_receiver_phone =
			formData.get('delivery_receiver_phone')?.toString().trim() || null;
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
		const source_document_id = formData.get('source_document_id')?.toString() || '';

		if (!vendor_id) return fail(400, { message: 'กรุณาเลือกผู้จำหน่าย (Vendor)' });

		if (String(document_type).toUpperCase() === 'PO') {
			const srcId = parseInt(source_document_id, 10);
			if (Number.isInteger(srcId) && srcId > 0) {
				const [srcRows] = await pool.query<any[]>(
					'SELECT document_type FROM purchase_documents WHERE id = ?',
					[srcId]
				);
				if (srcRows[0] && String(srcRows[0].document_type || '').toUpperCase() === 'PR') {
					if (!userCanIssuePurchaseOrderFromPr(locals.user)) {
						return fail(403, { message: 'ไม่มีสิทธิ์ออก PO จาก PR' });
					}
				}
			}
		}

		// PR ต้องมีไฟล์แนบอย่างน้อย 1 ไฟล์ (อัปโหลดใหม่ หรือสืบทอดจากเอกสารต้นทางที่มีแนบไว้)
		if (String(document_type).toUpperCase() === 'PR') {
			const files = formData.getAll('attachments') as File[];
			const hasUpload = files.some((f) => f instanceof File && f.size > 0);
			const srcId = parseInt(source_document_id, 10);
			let sourceAttachmentCount = 0;
			if (Number.isInteger(srcId) && srcId > 0) {
				const [cntRows] = await pool.execute<any[]>(
					`SELECT COUNT(*) AS c FROM purchase_document_attachments WHERE document_id = ?`,
					[srcId]
				);
				sourceAttachmentCount = Number(cntRows[0]?.c ?? 0);
			}
			if (!hasUpload && sourceAttachmentCount === 0) {
				return fail(400, { message: 'กรุณาแนบไฟล์อย่างน้อย 1 ไฟล์ (PR บังคับ)' });
			}
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const document_number = await allocateMonthlyDocumentNumber(
				connection,
				document_type,
				document_date,
				resolvePurchasePrefix
			);

			const [result] = await connection.execute<any>(
				`INSERT INTO purchase_documents 
                (document_type, document_number, currency, document_date, credit_term, due_date, delivery_date, vendor_id, vendor_contact_id, contract_id, delivery_address_id, delivery_receiver_name, delivery_receiver_phone, reference_doc, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 vat_rate, vat_amount, withholding_tax_rate, withholding_tax_amount, wht_amount, total_amount,
                 status, created_by_user_id, job_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
				[
					document_type,
					document_number,
					currency,
					document_date,
					credit_term,
					due_date,
					delivery_date,
					vendor_id,
					vendor_contact_id,
					contract_id,
					delivery_address_id,
					delivery_receiver_name,
					delivery_receiver_phone,
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
					locals.user?.id || null,
					job_id
				]
			);
			const documentId = result.insertId;

			const items = JSON.parse(itemsJson);
			const subtotalNum = subtotal;
			const discountRatio = subtotalNum > 0 ? (discount_amount / subtotalNum) : 0;

			if (items.length > 0) {
				for (const [index, item] of items.entries()) {
					const lineWhtRate = parseFloat(item.wht_rate || '0');
					const lineTotal = parseFloat(item.line_total || '0');
					const vatType = parseInt(item.vat_type || '2'); // 1=Inc, 2=Exc, 3=Non

					// คำนวณฐาน WHT ฝั่ง Backend ให้ตรงกับ Frontend
					let baseForWht = lineTotal * (1 - discountRatio);
					if (vatType === 1) { // ถ้าเป็น Inc Vat ให้ถอด VAT ออกก่อน
						baseForWht = baseForWht * 100 / (100 + vat_rate);
					}
					const lineWhtAmount = baseForWht * (lineWhtRate / 100);

					await connection.execute(
						`INSERT INTO purchase_document_items 
                        (document_id, product_id, description, quantity, unit_id, unit_price, line_total, wht_rate, wht_amount, item_order, vat_type) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							documentId, item.product_id || null, item.description, item.quantity, item.unit_id || null,
							item.unit_price, lineTotal, lineWhtRate, lineWhtAmount, index, vatType
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

			// When converting from an existing document, reference the same attachment rows (no file copy on disk).
			if (source_document_id) {
				const sourceDocumentIdNum = parseInt(source_document_id, 10);
				if (Number.isInteger(sourceDocumentIdNum) && sourceDocumentIdNum > 0) {
					const [sourceAttachments] = await connection.execute<any[]>(
						`SELECT file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id
						 FROM purchase_document_attachments
						 WHERE document_id = ?`,
						[sourceDocumentIdNum]
					);
					for (const att of sourceAttachments) {
						await connection.execute(
							`INSERT INTO purchase_document_attachments
								(document_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
							 VALUES (?, ?, ?, ?, ?, ?)`,
							[
								documentId,
								att.file_original_name,
								att.file_system_name,
								att.file_mime_type,
								att.file_size_bytes,
								att.uploaded_by_user_id
							]
						);
					}
				}
			}

			// สร้าง PO จาก PR → ปิดงาน PR อัตโนมัติ (สถานะ Complete)
			if (String(document_type).toUpperCase() === 'PO') {
				const srcId = parseInt(source_document_id, 10);
				if (Number.isInteger(srcId) && srcId > 0) {
					await connection.execute(
						`UPDATE purchase_documents SET status = 'Complete' WHERE id = ? AND document_type = 'PR'`,
						[srcId]
					);
				}
			}

			await connection.commit();
			throw redirect(303, `/purchase-documents/${documentId}`);
		} catch (err: any) {
			await connection.rollback();
			if (err.status === 303) throw err;
			console.error('Create document error:', err);
			let message = err?.message || 'Unknown error';
			if (
				typeof message === 'string' &&
				message.includes("Data truncated for column 'status'")
			) {
				message +=
					" — DB column purchase_documents.status likely cannot store 'Complete' (PR auto-close after PO). Run sql/purchase_documents_status_column_fix.sql on the database.";
			}
			return fail(500, { message: 'Error: ' + message });
		} finally {
			connection.release();
		}
	},

	createAddress: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const address_line = formData.get('address_line')?.toString()?.trim();
		const contact_name = formData.get('contact_name')?.toString()?.trim();
		const contact_phone = formData.get('contact_phone')?.toString()?.trim();
		const department_id_raw = formData.get('department_id')?.toString()?.trim();
		const department_id =
			department_id_raw && !Number.isNaN(Number(department_id_raw))
				? Number(department_id_raw)
				: null;

		if (!name || !address_line) {
			return fail(400, { message: 'กรุณากรอกชื่อสถานที่และรายละเอียดที่อยู่' });
		}

		try {
			const [result] = await pool.execute<any>(
				`INSERT INTO delivery_addresses (name, address_line, contact_name, contact_phone, department_id, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
				[name, address_line, contact_name || null, contact_phone || null, department_id]
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
		const department_id_raw = formData.get('department_id')?.toString()?.trim();
		const department_id =
			department_id_raw && !Number.isNaN(Number(department_id_raw))
				? Number(department_id_raw)
				: null;

		if (!id || !name || !address_line) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		try {
			await pool.execute(
				`UPDATE delivery_addresses SET name = ?, address_line = ?, contact_name = ?, contact_phone = ?, department_id = ? WHERE id = ?`,
				[name, address_line, contact_name || null, contact_phone || null, department_id, id]
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