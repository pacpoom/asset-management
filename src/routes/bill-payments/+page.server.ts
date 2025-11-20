import { fail, error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

// --- Types ---
interface Vendor extends RowDataPacket {
	id: number;
	name: string;
}
interface User extends RowDataPacket {
	id: number;
	full_name: string;
}
interface Unit extends RowDataPacket {
	id: number;
	name: string;
	symbol: string;
}
interface VendorContract extends RowDataPacket {
	id: number;
	title: string;
	vendor_id: number;
	contract_number: string;
}
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	unit_id: number;
	purchase_cost: number | null;
}

// NEW TYPES for existing payments
interface BillPaymentHeader extends RowDataPacket {
	id: number;
	payment_reference: string | null;
	payment_date: string;
	total_amount: number;
	status: 'Draft' | 'Submitted' | 'Paid' | 'Void';
	vendor_name: string;
	prepared_by_user_name: string;
	attachment_count: number;
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

// --- File Handling (Retained only helpers used by savePayment and deletePayment action) ---
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

// *** ADDED deleteFile helper for deletePayment action ***
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

// --- Load Function (MODIFIED) ---
export const load: PageServerLoad = async ({ locals, url }) => {
	checkPermission(locals, 'view bill payments');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterVendor = url.searchParams.get('vendor') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		// --- Fetch List of Payments (Headers only) ---
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		// Apply Search/Filter
		if (searchQuery) {
			whereClause += ` AND (
                bp.payment_reference LIKE ? OR
                v.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}
		if (filterVendor) {
			whereClause += ` AND bp.vendor_id = ? `;
			params.push(parseInt(filterVendor));
		}
		if (filterStatus) {
			whereClause += ` AND bp.status = ? `;
			params.push(filterStatus);
		}

		// Get total count
		const countSql = `
            SELECT COUNT(bp.id) as total
            FROM bill_payments bp
            LEFT JOIN vendors v ON bp.vendor_id = v.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch headers with joins and attachment count
		const fetchSql = `
            SELECT
                bp.id, bp.payment_reference, bp.payment_date, bp.total_amount, bp.status,
                v.name as vendor_name,
                u.full_name as prepared_by_user_name,
                (SELECT COUNT(bpa.id) FROM bill_payment_attachments bpa WHERE bpa.bill_payment_id = bp.id) as attachment_count
            FROM bill_payments bp
            JOIN vendors v ON bp.vendor_id = v.id
            JOIN users u ON bp.prepared_by_user_id = u.id
            ${whereClause}
            ORDER BY bp.payment_date DESC, bp.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [paymentRows] = await pool.query<BillPaymentHeader[]>(fetchSql, fetchParams);

		// ---  Fetch Supporting Data for Dropdowns/Modals (Existing logic) ---
		const [vendorRows] = await pool.execute<Vendor[]>(
			'SELECT id, name FROM vendors ORDER BY name ASC'
		);
		const [unitRows] = await pool.execute<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);
		const [productRows] = await pool.execute<Product[]>(
			`SELECT id, sku, name, unit_id, purchase_cost
              FROM products
              WHERE is_active = 1
              ORDER BY sku ASC`
		);
		const [contractRows] = await pool.execute<VendorContract[]>(
			`SELECT id, title, vendor_id, contract_number
              FROM vendor_contracts
              WHERE status = 'Active'
              ORDER BY title ASC`
		);

		// Convert to JSON and back for safe serialization (deep copy)
		const payments = JSON.parse(JSON.stringify(paymentRows));

		// --- Return Combined Data ---
		return {
			// Data for list
			payments,
			currentPage: page,
			totalPages,
			searchQuery,
			filters: { vendor: filterVendor, status: filterStatus },
			vendors: vendorRows,
			units: unitRows,
			products: productRows,
			contracts: contractRows,
			currentUser: locals.user,

			// New Array of possible statuses
			availableStatuses: ['Draft', 'Submitted', 'Paid', 'Void']
		};
	} catch (err: any) {
		console.error('Failed to load data for bill payment page:', err.message, err.stack);
		if (err.status) throw err;
		throw error(500, `Failed to load required data. Error: ${err.message}`);
	}
};

// --- Actions (MODIFIED: Added deletePayment action back) ---
export const actions: Actions = {
	/**
	 * Save Bill Payment (Header, Items, Attachments)
	 */
	savePayment: async ({ request, locals }) => {
		checkPermission(locals, 'create bill payments');
		const formData = await request.formData();
		const files = formData.getAll('attachments') as File[];
		const userId = locals.user?.id;

		if (!userId) {
			throw error(401, 'Unauthorized');
		}

		// --- Extract Header Data ---
		const vendor_id = formData.get('vendor_id')?.toString();
		const vendor_contract_id = formData.get('vendor_contract_id')?.toString() || null; // Added
		const payment_date = formData.get('payment_date')?.toString();
		const payment_reference = formData.get('payment_reference')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		// --- Extract Calculation Data ---
		const discountAmount = parseFloat(formData.get('discountAmount')?.toString() || '0');
		const calculateWithholdingTax = formData.get('calculateWithholdingTax')?.toString() === 'true';
		const withholdingTaxRate = parseFloat(formData.get('withholdingTaxRate')?.toString() || '7.00'); // Allow overriding the default rate

		// --- Extract and Parse Line Items ---
		const itemsJson = formData.get('itemsJson')?.toString();
		let items: BillPaymentItemData[] = [];
		try {
			items = JSON.parse(itemsJson || '[]');
			if (!Array.isArray(items)) throw new Error('Items data is not an array.');
		} catch (e: any) {
			console.error('Failed to parse items JSON:', e.message);
			return fail(400, {
				action: 'savePayment',
				success: false,
				message: `Invalid line item data format: ${e.message}`
			});
		}

		// --- Validation ---
		if (!vendor_id || !payment_date) {
			return fail(400, {
				action: 'savePayment',
				success: false,
				message: 'Vendor and Payment Date are required.'
			});
		}
		if (items.length === 0) {
			return fail(400, {
				action: 'savePayment',
				success: false,
				message: 'At least one line item is required.'
			});
		}
		// Validate each item (FIX 4)
		for (const item of items) {
			// Product must be selected and be a valid number
			if (
				item.product_id === null ||
				typeof item.product_id !== 'number' ||
				isNaN(item.product_id)
			) {
				return fail(400, {
					action: 'savePayment',
					success: false,
					message: 'Product is required for all line items.'
				});
			}

			if (isNaN(item.quantity) || item.quantity < 0) {
				return fail(400, {
					action: 'savePayment',
					success: false,
					message: 'Quantity must be a valid non-negative number.'
				});
			}

			// Unit Price must be a valid number (>= 0)
			if (isNaN(item.unit_price) || item.unit_price < 0) {
				return fail(400, {
					action: 'savePayment',
					success: false,
					message: 'Unit Price must be a valid non-negative number.'
				});
			}
		}

		// --- Server-side Calculations ---
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
		let paymentId: number | null = null;

		try {
			await connection.beginTransaction();

			// Insert Header
			const headerSql = `INSERT INTO bill_payments
                (vendor_id, vendor_contract_id, payment_date, payment_reference, notes, 
                 subtotal, discount_amount, total_after_discount, 
                 withholding_tax_rate, withholding_tax_amount, total_amount, 
                 status, prepared_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
			const [headerResult] = await connection.execute<any>(headerSql, [
				parseInt(vendor_id),
				vendor_contract_id ? parseInt(vendor_contract_id) : null,
				payment_date,
				payment_reference,
				notes,
				subTotal,
				discountAmount,
				totalAfterDiscount,
				actualWhtRate, // Use actual rate or null
				withholdingTaxAmount,
				grandTotal,
				'Draft',
				userId
			]);
			paymentId = headerResult.insertId;

			if (!paymentId) throw new Error('Failed to create bill payment header.');

			// Insert Line Items
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

			// Handle File Uploads
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
				action: 'savePayment',
				success: true,
				message: `Bill payment #${paymentId} saved successfully!`,
				paymentId: paymentId
			};
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error saving bill payment: ${err.message}`, err.stack);
			for (const fileInfo of savedFileInfos) {
				await deleteFile(fileInfo.systemName);
			}
			if (err.code === 'ER_NO_REFERENCED_ROW_2') {
				return fail(400, {
					action: 'savePayment',
					success: false,
					message: 'Invalid Vendor, Product, or Unit selected.'
				});
			}
			if (err.status) throw err;
			return fail(500, {
				action: 'savePayment',
				success: false,
				message: err.message || 'Failed to save bill payment.'
			});
		} finally {
			connection.release();
		}
	},

	// *** ADDED Action: Delete Payment (from [id] page) ***
	deletePayment: async ({ request, locals }) => {
		checkPermission(locals, 'delete bill payments');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { action: 'deletePayment', success: false, message: 'Invalid payment ID.' });
		}
		const paymentId = parseInt(id);
		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// Get files for cleanup
			const [docsToDelete] = await connection.query<BillPaymentAttachmentRow[]>(
				'SELECT file_system_name FROM bill_payment_attachments WHERE bill_payment_id = ?',
				[paymentId]
			);

			// Delete main record (assuming ON DELETE CASCADE)
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

			// Delete files from disk AFTER DB commit
			for (const doc of docsToDelete) {
				await deleteFile(doc.file_system_name);
			}

			// Return success with deleted ID for client-side update (no redirect from List Page delete)
			return {
				action: 'deletePayment',
				success: true,
				message: `Payment #${paymentId} deleted successfully.`,
				deletedId: paymentId
			};
		} catch (error: any) {
			await connection.rollback();
			console.error(`Error deleting payment ID ${paymentId}: ${error.message}`, error.stack);
			if (error.status) throw error;
			return fail(500, {
				action: 'deletePayment',
				success: false,
				message: `Failed to delete payment: ${error.message}`
			});
		} finally {
			connection.release();
		}
	}
};
