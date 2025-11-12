import { fail, error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

// --- File Handling Helpers ---
const UPLOAD_DIR = path.resolve('uploads', 'bill_payments');

async function ensureUploadDir() {
	try {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
	} catch (e) {
		console.error('Failed to create upload directory:', UPLOAD_DIR, e);
		throw new Error('Failed to create upload directory');
	}
}

async function saveFile(file: File): Promise<{
	systemName: string;
	originalName: string;
	mimeType: string | null;
	size: number;
} | null> {
	if (!file || file.size === 0) return null;
	let uploadPath = '';
	try {
		await ensureUploadDir();
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
		uploadPath = path.join(UPLOAD_DIR, systemName);

		console.log(`saveFile (Bill Payment): Attempting write to ${uploadPath}`);
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
		console.log(`saveFile (Bill Payment): Successfully wrote ${uploadPath}`);

		const mimeType = mime.lookup(file.name) || file.type || 'application/octet-stream';
		return { systemName, originalName: file.name, mimeType, size: file.size };
	} catch (uploadError: any) {
		console.error(
			`saveFile (Bill Payment): Error saving ${uploadPath}. ${uploadError.message}`,
			uploadError.stack
		);
		if (uploadPath) {
			try {
				if (await fs.stat(uploadPath)) await fs.unlink(uploadPath);
			} catch (e) {}
		}
		throw new Error(`Failed to save uploaded file "${file.name}". Reason: ${uploadError.message}`);
	}
}

async function deleteFile(systemName: string | null | undefined) {
	if (!systemName) return;
	try {
		const fullPath = path.join(UPLOAD_DIR, path.basename(systemName));
		console.log(`deleteFile (Bill Payment): Attempting delete ${fullPath}`);
		await fs.unlink(fullPath);
		console.log(`deleteFile (Bill Payment): Successfully deleted ${fullPath}`);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(
				`deleteFile (Bill Payment): Failed ${systemName}. ${error.message}`,
				error.stack
			);
		} else {
			console.log(`deleteFile (Bill Payment): Not found, skipping ${systemName}`);
		}
	}
}
// --- (จบส่วน helpers) ---

// --- Types ---

interface CompanyData extends RowDataPacket {
	id: number;
	name: string;
	logo_path: string | null;
	address_line_1: string | null;
	address_line_2: string | null;
	city: string | null;
	state_province: string | null;
	postal_code: string | null;
	country: string | null;
	phone: string | null;
	email: string | null;
	website: string | null;
	tax_id: string | null;
}

// ===== START: EDIT 1 (Fix BillPaymentDetailHeader Interface) =====
interface BillPaymentDetailHeader extends RowDataPacket {
	id: number;
	payment_reference: string | null;
	payment_date: string;
	total_amount: number;
	status: 'Draft' | 'Submitted' | 'Paid' | 'Void';
	vendor_id: number;
	vendor_name: string;
	vendor_address: string | null; // <--- CHANGED (กลับไปใช้ address ช่องเดียว)
	prepared_by_user_name: string;
	vendor_contract_id: number | null;
	vendor_contract_number: string | null;
	notes: string | null;
	subtotal: number;
	discount_amount: number;
	total_after_discount: number;
	withholding_tax_rate: number | null;
	withholding_tax_amount: number;
	vendor_tax_id: string | null;
}
// ===== END: EDIT 1 =====

interface BillPaymentItemRow extends RowDataPacket {
	id: number;
	product_name: string;
	product_sku: string;
	unit_symbol: string;
	description: string | null;
	quantity: number;
	unit_price: number;
	line_total: number;
	product_id: number;
	unit_id: number;
}
interface BillPaymentItemData {
	product_id: number | null;
	description: string;
	quantity: number;
	unit_id: number | null;
	unit_price: number;
	line_total: number;
}
interface BillPaymentAttachmentRow extends RowDataPacket {
	id: number;
	file_original_name: string;
	file_system_name: string;
	file_path: string;
	uploaded_at: string;
}
interface Vendor extends RowDataPacket {
	id: number;
	name: string;
}
interface Unit extends RowDataPacket {
	id: number;
	name: string;
	symbol: string;
}
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	unit_id: number;
	purchase_cost: number | null;
}
interface VendorContract extends RowDataPacket {
	id: number;
	title: string;
	vendor_id: number;
	contract_number: string;
}

// --- Load Function (Fetch full details) ---
export const load: PageServerLoad = async ({ locals, params }) => {
	checkPermission(locals, 'view bill payments');
	const paymentId = parseInt(params.id);

	if (isNaN(paymentId)) {
		throw error(400, 'Invalid Payment ID.');
	}

	try {
		// ===== START: EDIT 2 (Fix Header Query) =====
		// 1. Fetch Header Details (with Vendor Address)
		const [headerRows] = await pool.execute<BillPaymentDetailHeader[]>(
			`SELECT
                bp.*,
                v.name as vendor_name,
                v.address as vendor_address, 
				v.tax_id as vendor_tax_id,
                u.full_name as prepared_by_user_name,
                vc.contract_number as vendor_contract_number
            FROM bill_payments bp
            JOIN vendors v ON bp.vendor_id = v.id
            JOIN users u ON bp.prepared_by_user_id = u.id
            LEFT JOIN vendor_contracts vc ON bp.vendor_contract_id = vc.id
            WHERE bp.id = ? LIMIT 1`,
			[paymentId]
		);
		// ===== END: EDIT 2 =====

		const header = headerRows[0];
		if (!header) {
			throw error(404, `Bill Payment ID ${paymentId} not found.`);
		}

		// 2. Fetch Line Items
		const [itemRows] = await pool.execute<BillPaymentItemRow[]>(
			`SELECT
                bpi.id, bpi.description, bpi.quantity, bpi.unit_price, bpi.line_total,
                p.name as product_name, p.sku as product_sku, bpi.product_id,
                u.symbol as unit_symbol, bpi.unit_id
            FROM bill_payment_items bpi
            JOIN products p ON bpi.product_id = p.id
            LEFT JOIN units u ON bpi.unit_id = u.id
            WHERE bpi.bill_payment_id = ?
            ORDER BY bpi.item_order ASC`,
			[paymentId]
		);

		// 3. Fetch Attachments
		const [attachmentRows] = await pool.execute<BillPaymentAttachmentRow[]>(
			`SELECT id, file_original_name, file_system_name, uploaded_at
             FROM bill_payment_attachments
             WHERE bill_payment_id = ?
             ORDER BY uploaded_at DESC`,
			[paymentId]
		);
		const attachments = attachmentRows.map((att) => ({
			...att,
			file_path: `/uploads/bill_payments/${att.file_system_name}`
		}));

		// 4. Fetch Company Data
		const [companyRows] = await pool.execute<CompanyData[]>(
			`SELECT * FROM company WHERE id = ? LIMIT 1`,
			[1]
		);

		// 5. Fetch Supporting Data
		const [vendorRows] = await pool.execute<Vendor[]>(
			'SELECT id, name FROM vendors ORDER BY name ASC'
		);
		const [unitRows] = await pool.execute<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);
		const [productRows] = await pool.execute<Product[]>(
			`SELECT id, sku, name, unit_id, purchase_cost FROM products WHERE is_active = 1 ORDER BY sku ASC`
		);
		const [contractRows] = await pool.execute<VendorContract[]>(
			`SELECT id, title, vendor_id, contract_number FROM vendor_contracts WHERE status = 'Active' ORDER BY title ASC`
		);

		// --- Return Combined Data ---
		return {
			payment: JSON.parse(JSON.stringify(header)),
			items: JSON.parse(JSON.stringify(itemRows)),
			attachments: JSON.parse(JSON.stringify(attachments)),
			company: JSON.parse(JSON.stringify(companyRows[0] || null)),
			vendors: vendorRows,
			units: unitRows,
			products: productRows,
			contracts: contractRows,
			availableStatuses: ['Draft', 'Submitted', 'Paid', 'Void']
		};
	} catch (err: any) {
		console.error(`Failed to load bill payment detail ${paymentId}: ${err.message}`, err.stack);
		if (err.status) throw err;
		throw error(500, `Failed to load payment detail. Error: ${err.message}`);
	}
};

// --- Actions (ไม่เปลี่ยนแปลง) ---
export const actions: Actions = {
	updatePayment: async ({ request, locals, params }) => {
		checkPermission(locals, 'manage bill payments');
		const formData = await request.formData();
		const files = formData.getAll('attachments') as File[];
		const userId = locals.user?.id;

		const paymentIdStr = formData.get('payment_id')?.toString();

		if (!userId) {
			throw error(401, 'Unauthorized');
		}
		if (!paymentIdStr) {
			return fail(400, {
				action: 'updatePayment',
				success: false,
				message: 'Payment ID is missing.'
			});
		}
		const paymentId = parseInt(paymentIdStr);

		const vendor_id = formData.get('vendor_id')?.toString();
		const vendor_contract_id = formData.get('vendor_contract_id')?.toString() || null;
		const payment_date = formData.get('payment_date')?.toString();
		const payment_reference = formData.get('payment_reference')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		const discountAmount = parseFloat(formData.get('discountAmount')?.toString() || '0');
		const calculateWithholdingTax = formData.get('calculateWithholdingTax')?.toString() === 'true';
		const withholdingTaxRate = parseFloat(formData.get('withholdingTaxRate')?.toString() || '7.00');

		const itemsJson = formData.get('itemsJson')?.toString();
		let items: BillPaymentItemData[] = [];
		try {
			items = JSON.parse(itemsJson || '[]');
			if (!Array.isArray(items)) throw new Error('Items data is not an array.');
		} catch (e: any) {
			console.error('Failed to parse items JSON:', e.message);
			return fail(400, {
				action: 'updatePayment',
				success: false,
				message: `Invalid line item data format: ${e.message}`
			});
		}

		if (!vendor_id || !payment_date) {
			return fail(400, {
				action: 'updatePayment',
				success: false,
				message: 'Vendor and Payment Date are required.'
			});
		}
		if (items.length === 0) {
			return fail(400, {
				action: 'updatePayment',
				success: false,
				message: 'At least one line item is required.'
			});
		}
		for (const item of items) {
			if (
				item.product_id === null ||
				typeof item.product_id !== 'number' ||
				isNaN(item.product_id)
			) {
				return fail(400, {
					action: 'updatePayment',
					success: false,
					message: 'Product is required for all line items.'
				});
			}
			if (isNaN(item.quantity) || item.quantity < 0) {
				return fail(400, {
					action: 'updatePayment',
					success: false,
					message: 'Quantity must be a valid non-negative number.'
				});
			}
			if (isNaN(item.unit_price) || item.unit_price < 0) {
				return fail(400, {
					action: 'updatePayment',
					success: false,
					message: 'Unit Price must be a valid non-negative number.'
				});
			}
		}

		const subTotal = items.reduce(
			(sum, item) => sum + parseFloat(String(item.line_total) || '0'),
			0
		);
		const totalAfterDiscount = subTotal - discountAmount;

		const actualWhtRate = calculateWithholdingTax ? withholdingTaxRate : null;
		const withholdingTaxAmount = calculateWithholdingTax
			? parseFloat((totalAfterDiscount * (actualWhtRate! / 100)).toFixed(2))
			: 0.0;
		const grandTotal = totalAfterDiscount - withholdingTaxAmount;

		const connection = await pool.getConnection();
		const savedFileInfos: {
			systemName: string;
			originalName: string;
			mimeType: string | null;
			size: number;
		}[] = [];

		try {
			await connection.beginTransaction();

			const headerSql = `UPDATE bill_payments SET
                vendor_id = ?, vendor_contract_id = ?, payment_date = ?, payment_reference = ?, notes = ?, 
                 subtotal = ?, discount_amount = ?, total_after_discount = ?, 
                 withholding_tax_rate = ?, withholding_tax_amount = ?, total_amount = ?, 
                 prepared_by_user_id = ?
                WHERE id = ?`;
			await connection.execute<any>(headerSql, [
				parseInt(vendor_id),
				vendor_contract_id ? parseInt(vendor_contract_id) : null,
				payment_date,
				payment_reference,
				notes,
				subTotal,
				discountAmount,
				totalAfterDiscount,
				actualWhtRate,
				withholdingTaxAmount,
				grandTotal,
				userId,
				paymentId
			]);

			await connection.execute('DELETE FROM bill_payment_items WHERE bill_payment_id = ?', [
				paymentId
			]);

			if (items.length > 0) {
				const itemSql = `INSERT INTO bill_payment_items
                    (bill_payment_id, product_id, description, quantity, unit_id, unit_price, line_total, item_order)
                    VALUES ?`;

				const itemValues = items.map((item, index) => [
					paymentId,
					item.product_id,
					item.description || null,
					item.quantity,
					item.unit_id || null,
					item.unit_price,
					item.line_total,
					index
				]);
				await connection.query(itemSql, [itemValues]);
			}

			const validFiles = files.filter((f) => f && f.size > 0);
			if (validFiles.length > 0) {
				const attachmentSql = `INSERT INTO bill_payment_attachments
                    (bill_payment_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                    VALUES (?, ?, ?, ?, ?, ?)`;

				for (const file of validFiles) {
					const fileInfo = await saveFile(file);
					if (fileInfo) {
						savedFileInfos.push(fileInfo);
						await connection.execute(attachmentSql, [
							paymentId,
							fileInfo.originalName,
							fileInfo.systemName,
							fileInfo.mimeType,
							fileInfo.size,
							userId
						]);
					}
				}
			}

			await connection.commit();

			return {
				action: 'updatePayment',
				success: true,
				message: `Bill payment #${paymentId} updated successfully!`
			};
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error updating bill payment ${paymentId}: ${err.message}`, err.stack);
			for (const fileInfo of savedFileInfos) {
				await deleteFile(fileInfo.systemName);
			}
			if (err.code === 'ER_NO_REFERENCED_ROW_2') {
				return fail(400, {
					action: 'updatePayment',
					success: false,
					message: 'Invalid Vendor, Product, or Unit selected.'
				});
			}
			if (err.message.includes('Incorrect decimal value')) {
				return fail(400, {
					action: 'updatePayment',
					success: false,
					message: `Data Error: ${err.message}. Please check all numeric fields for valid values.`
				});
			}
			if (err.status) throw err;
			return fail(500, {
				action: 'updatePayment',
				success: false,
				message: err.message || 'Failed to update bill payment.'
			});
		} finally {
			connection.release();
		}
	},

	updatePaymentStatus: async ({ request, locals, params }) => {
		checkPermission(locals, 'manage bill payments');
		const paymentId = parseInt(params.id);
		const data = await request.formData();
		const status = data.get('status')?.toString() as BillPaymentDetailHeader['status'];

		if (isNaN(paymentId) || !status || !['Draft', 'Submitted', 'Paid', 'Void'].includes(status)) {
			return fail(400, { success: false, message: 'Invalid ID or status.' });
		}

		try {
			await pool.execute('UPDATE bill_payments SET status = ? WHERE id = ?', [status, paymentId]);
			return {
				action: 'updatePaymentStatus',
				success: true,
				message: `Payment #${paymentId} status updated to ${status}.`,
				newStatus: status
			};
		} catch (err: any) {
			console.error(`Error updating payment status ${paymentId}: ${err.message}`, err.stack);
			return fail(500, { success: false, message: 'Failed to update payment status.' });
		}
	},

	deletePayment: async ({ locals, params }) => {
		checkPermission(locals, 'delete bill payments');
		const paymentId = parseInt(params.id);

		if (isNaN(paymentId)) {
			return fail(400, { action: 'deletePayment', success: false, message: 'Invalid payment ID.' });
		}
		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			const [docsToDelete] = await connection.query<BillPaymentAttachmentRow[]>(
				'SELECT file_system_name FROM bill_payment_attachments WHERE bill_payment_id = ?',
				[paymentId]
			);

			const [deleteResult] = await connection.execute('DELETE FROM bill_payments WHERE id = ?', [
				paymentId
			]);

			if ((deleteResult as any).affectedRows === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'deletePayment',
					success: false,
					message: 'Payment not found.'
				});
			}

			await connection.commit();

			for (const doc of docsToDelete) {
				await deleteFile(doc.file_system_name);
			}

			throw redirect(303, '/bill-payments');
		} catch (error: any) {
			await connection.rollback();
			if (error.status === 303) throw error;
			console.error(`Error deleting payment ID ${paymentId}: ${error.message}`, error.stack);
			return fail(500, {
				action: 'deletePayment',
				success: false,
				message: `Failed to delete payment: ${error.message}`
			});
		} finally {
			connection.release();
		}
	},

	deleteAttachment: async ({ request, locals }) => {
		checkPermission(locals, 'manage bill payments');
		const data = await request.formData();
		const attachmentId = data.get('attachment_id')?.toString();

		if (!attachmentId) {
			return fail(400, {
				action: 'deleteAttachment',
				success: false,
				message: 'Attachment ID is required.'
			});
		}
		const id = parseInt(attachmentId);
		let fileSystemNameToDelete: string | null = null;

		try {
			const connection = await pool.getConnection();
			await connection.beginTransaction();

			const [docRows] = await connection.query<BillPaymentAttachmentRow[]>(
				'SELECT file_system_name FROM bill_payment_attachments WHERE id = ?',
				[id]
			);
			if (docRows.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'deleteAttachment',
					success: false,
					message: 'Attachment not found.'
				});
			}
			fileSystemNameToDelete = docRows[0].file_system_name;

			await connection.execute('DELETE FROM bill_payment_attachments WHERE id = ?', [id]);

			await connection.commit();

			await deleteFile(fileSystemNameToDelete);

			return {
				action: 'deleteAttachment',
				success: true,
				message: 'Attachment deleted successfully.',
				deletedAttachmentId: id
			};
		} catch (err: any) {
			console.error(`Error deleting attachment ${id}: ${err.message}`, err.stack);
			return fail(500, {
				action: 'deleteAttachment',
				success: false,
				message: `Failed to delete attachment: ${err.message}`
			});
		}
	}
};
