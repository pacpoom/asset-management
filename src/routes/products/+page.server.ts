import { fail, error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// --- Types ---
// Matches the structure defined in product_system_design.md
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	description: string | null;
	product_type: 'Stock' | 'NonStock' | 'Service';
	category_id: number | null;
	unit_id: number;
	purchase_unit_id: number | null;
	sales_unit_id: number | null;
	preferred_vendor_id: number | null;
	purchase_cost: number | null;
	selling_price: number | null;
	quantity_on_hand: number;
	reorder_level: number | null;
	is_active: boolean;
	image_url: string | null;
	asset_account_id: number | null;
	income_account_id: number | null;
	expense_account_id: number | null;
	created_at: string;
	updated_at: string;
	// Joined fields for display
	category_name?: string | null;
	unit_symbol?: string | null;
	purchase_unit_symbol?: string | null; // Added
	sales_unit_symbol?: string | null; // Added
	vendor_name?: string | null;
	asset_account_code?: string | null; // Added
	asset_account_name?: string | null; // Added
	income_account_code?: string | null; // Added
	income_account_name?: string | null; // Added
	expense_account_code?: string | null; // Added
	expense_account_name?: string | null; // Added
}

interface ProductCategory extends RowDataPacket {
	id: number;
	name: string;
}
interface Unit extends RowDataPacket {
	id: number;
	name: string;
	symbol: string;
}
interface Vendor extends RowDataPacket {
	id: number;
	name: string;
}
interface ChartOfAccount extends RowDataPacket {
	id: number;
	account_code: string;
	account_name: string;
}
interface User {
	id: number;
	full_name: string;
} // For potential assignment later, though not in schema now

// --- File Handling Helpers (Copied from assets) ---
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products'); // Specific directory for products

async function saveImage(imageFile: File): Promise<string | null> {
	if (!imageFile || imageFile.size === 0) return null;
	let uploadPath = '';
	try {
		await fs.mkdir(UPLOADS_DIR, { recursive: true });
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${uniqueSuffix}-${sanitizedOriginalName}`;
		uploadPath = path.join(UPLOADS_DIR, filename);
		await fs.writeFile(uploadPath, Buffer.from(await imageFile.arrayBuffer()));
		const relativePath = `/uploads/products/${filename}`; // Adjusted path
		return relativePath;
	} catch (uploadError: any) {
		console.error(`saveImage Error: ${uploadError.message}`, uploadError.stack);
		if (uploadPath) {
			try {
				if (await fs.stat(uploadPath)) await fs.unlink(uploadPath);
			} catch (e) {}
		}
		throw new Error(
			`Failed to save uploaded file "${imageFile.name}". Reason: ${uploadError.message}`
		);
	}
}

async function deleteImage(imageUrl: string | null | undefined) {
	if (!imageUrl) return;
	try {
		const filename = path.basename(imageUrl);
		const fullPath = path.join(UPLOADS_DIR, filename); // Use correct directory
		await fs.unlink(fullPath);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(`deleteImage Error: ${error.message}`, error.stack);
			// Optional: Don't throw, just log, as DB deletion might be more critical
			// throw new Error(`Failed to delete file "${path.basename(imageUrl)}". Reason: ${error.message}`);
		}
	}
}

// --- NEW: Function to generate a new SKU ---
async function generateSku() {
	const prefix = 'PROD'; // กำหนด prefix สำหรับ SKU
	const today = new Date();
	const year = today.getFullYear().toString().slice(-2); // เอาเลขท้าย 2 ตัวของปี
	const month = (today.getMonth() + 1).toString().padStart(2, '0');
	const datePrefix = `${prefix}${year}${month}`;

	// ค้นหา SKU ล่าสุดที่มี prefix ของวันนี้
	const [rows]: any[] = await pool.execute(
		`SELECT sku FROM products WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1`,
		[`${datePrefix}-%`]
	);

	let nextNumber = 1;
	if (rows.length > 0) {
		const lastSku = rows[0].sku;
		try {
			// ดึงเลขลำดับสุดท้ายออกมา
			const lastNumberStr = lastSku.split('-')[1];
			if (lastNumberStr) {
				const lastNumber = parseInt(lastNumberStr, 10);
				if (!isNaN(lastNumber)) {
					nextNumber = lastNumber + 1;
				}
			}
		} catch (e) {
			console.error('Error parsing last SKU number:', lastSku, e);
			// ถ้า parse ไม่ได้ ให้เริ่มนับ 1 ใหม่ (หรืออาจจะโยน error)
			nextNumber = 1;
		}
	}

	// Format เลขลำดับให้มี 5 หลัก (เช่น 00001)
	const paddedNumber = nextNumber.toString().padStart(5, '0');
	return `${datePrefix}-${paddedNumber}`;
}

// --- Load Function ---
export const load: PageServerLoad = async ({ url, locals }) => {
	// Permission Check: Adjust required permission as needed
	checkPermission(locals, 'view products');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const pageSize = 16; // <<< CHANGED pageSize to 16
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		// ... existing search query logic ...
		if (searchQuery) {
			whereClause += ` AND (
                p.sku LIKE ? OR
                p.name LIKE ? OR
                pc.name LIKE ? OR
                v.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		// Get total count
		const countSql = `
            SELECT COUNT(p.id) as total
            FROM products p
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            LEFT JOIN vendors v ON p.preferred_vendor_id = v.id
            ${whereClause}
        `;
		// ... existing count logic ...
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch products with joins - Added more joins for detail modal
		// *** MODIFIED: Interpolate LIMIT and OFFSET directly ***
		const productsSql = `
            SELECT
                p.*,
                pc.name AS category_name,
                u.symbol AS unit_symbol,
                pu.symbol AS purchase_unit_symbol,
                su.symbol AS sales_unit_symbol,
                v.name AS vendor_name,
                coa_asset.account_code AS asset_account_code,
                coa_asset.account_name AS asset_account_name,
                coa_income.account_code AS income_account_code,
                coa_income.account_name AS income_account_name,
                coa_expense.account_code AS expense_account_code,
                coa_expense.account_name AS expense_account_name
            FROM products p
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            LEFT JOIN units u ON p.unit_id = u.id  
            LEFT JOIN units pu ON p.purchase_unit_id = pu.id
            LEFT JOIN units su ON p.sales_unit_id = su.id
            LEFT JOIN vendors v ON p.preferred_vendor_id = v.id
            LEFT JOIN chart_of_accounts coa_asset ON p.asset_account_id = coa_asset.id
            LEFT JOIN chart_of_accounts coa_income ON p.income_account_id = coa_income.id
            LEFT JOIN chart_of_accounts coa_expense ON p.expense_account_id = coa_expense.id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `; // <-- Interpolated LIMIT/OFFSET
		// ... existing fetch logic ...
		// *** MODIFIED: Pass only search params to execute ***
		const [productRows] = await pool.execute<Product[]>(productsSql, params); // <-- Removed pageSize, offset

		// Fetch related data for dropdowns
		const [categoryRows] = await pool.execute<ProductCategory[]>(
			'SELECT id, name FROM product_categories ORDER BY name'
		);
		// ... existing related data fetch logic ...
		const [unitRows] = await pool.execute<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name'
		);
		const [vendorRows] = await pool.execute<Vendor[]>('SELECT id, name FROM vendors ORDER BY name');
		const [accountRows] = await pool.execute<ChartOfAccount[]>(
			'SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code'
		);

		return {
			products: productRows.map((p) => ({ ...p, is_active: Boolean(p.is_active) })),
			// ... existing return data ...
			categories: categoryRows,
			units: unitRows,
			vendors: vendorRows,
			accounts: accountRows,
			currentPage: page,
			totalPages,
			searchQuery
		};
	} catch (err: any) {
		console.error('Failed to load products data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

// --- Helper: Convert form value to number or null ---
// ... existing helper functions ...
function parseNumberOrNull(value: FormDataEntryValue | null): number | null {
	if (value === null || value === undefined || value === '') return null;
	const num = Number(value);
	return isNaN(num) ? null : num;
}
function parseFloatOrNull(value: FormDataEntryValue | null): number | null {
	if (value === null || value === undefined || value === '') return null;
	const num = parseFloat(value.toString());
	return isNaN(num) ? null : num;
}

// --- Actions ---
export const actions: Actions = {
	saveProduct: async ({ request, locals }) => {
		// ... existing saveProduct action ...
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		// Determine permission based on add/edit
		const requiredPermission = id ? 'edit products' : 'create products';
		checkPermission(locals, requiredPermission);

		// --- Extract and Validate Data ---
		// *** MODIFIED: Remove sku extraction from form ***
		// const sku = formData.get('sku')?.toString()?.trim();
		const name = formData.get('name')?.toString()?.trim();
		const product_type = formData.get('product_type')?.toString() as Product['product_type'] | null;
		const unit_id = parseNumberOrNull(formData.get('unit_id'));

		// *** MODIFIED: Remove sku check from validation ***
		if (!name || !product_type || !unit_id) {
			return fail(400, {
				action: 'saveProduct',
				success: false,
				message: 'Name, Product Type, and Base Unit are required.' // Removed SKU
			});
		}
		if (!['Stock', 'NonStock', 'Service'].includes(product_type)) {
			return fail(400, { action: 'saveProduct', success: false, message: 'Invalid Product Type.' });
		}

		const data = {
			// sku: sku, // Removed sku from here
			name: name,
			description: formData.get('description')?.toString()?.trim() || null,
			product_type: product_type,
			category_id: parseNumberOrNull(formData.get('category_id')),
			unit_id: unit_id,
			purchase_unit_id: parseNumberOrNull(formData.get('purchase_unit_id')),
			sales_unit_id: parseNumberOrNull(formData.get('sales_unit_id')),
			preferred_vendor_id: parseNumberOrNull(formData.get('preferred_vendor_id')),
			purchase_cost: parseFloatOrNull(formData.get('purchase_cost')),
			selling_price: parseFloatOrNull(formData.get('selling_price')),
			quantity_on_hand:
				product_type === 'Stock' ? (parseFloatOrNull(formData.get('quantity_on_hand')) ?? 0) : 0, // Force 0 if not Stock
			reorder_level: parseFloatOrNull(formData.get('reorder_level')),
			is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
			asset_account_id: parseNumberOrNull(formData.get('asset_account_id')),
			income_account_id: parseNumberOrNull(formData.get('income_account_id')),
			expense_account_id: parseNumberOrNull(formData.get('expense_account_id'))
		};

		const imageFile = formData.get('image') as File | null;
		const existingImageUrl = formData.get('existing_image_url')?.toString();
		let imageUrl = existingImageUrl || null; // Start with existing or null
		let savedImagePath: string | null = null; // Track newly saved path for potential rollback

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// Handle image upload/replacement
			if (imageFile && imageFile.size > 0) {
				savedImagePath = await saveImage(imageFile);
				imageUrl = savedImagePath; // Set image URL to the newly saved path
				// Delete old image *after* successful transaction commit
			} else if (!imageFile && id && existingImageUrl && formData.get('remove_image') === 'true') {
				// Handle image removal request
				imageUrl = null;
				// Delete old image *after* successful transaction commit
			}

			// --- Database Operation ---
			if (id) {
				// UPDATE
				// *** MODIFIED: Remove sku = ? from UPDATE statement ***
				const sql = `UPDATE products SET
                    name = ?, description = ?, product_type = ?, category_id = ?, unit_id = ?,
                    purchase_unit_id = ?, sales_unit_id = ?, preferred_vendor_id = ?, purchase_cost = ?, selling_price = ?,
                    quantity_on_hand = ?, reorder_level = ?, is_active = ?, image_url = ?, asset_account_id = ?,
                    income_account_id = ?, expense_account_id = ?
                    WHERE id = ?`;
				await connection.execute(sql, [
					// data.sku, // Removed sku
					data.name,
					data.description,
					data.product_type,
					data.category_id,
					data.unit_id,
					data.purchase_unit_id,
					data.sales_unit_id,
					data.preferred_vendor_id,
					data.purchase_cost,
					data.selling_price,
					data.quantity_on_hand,
					data.reorder_level,
					data.is_active,
					imageUrl,
					data.asset_account_id,
					data.income_account_id,
					data.expense_account_id,
					parseInt(id)
				]);
			} else {
				// INSERT
				// *** MODIFIED: Generate SKU for new products ***
				const newSku = await generateSku();
				const sql = `INSERT INTO products (
                    sku, name, description, product_type, category_id, unit_id, purchase_unit_id, sales_unit_id,
                    preferred_vendor_id, purchase_cost, selling_price, quantity_on_hand, reorder_level, is_active,
                    image_url, asset_account_id, income_account_id, expense_account_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
				await connection.execute(sql, [
					newSku, // Use generated SKU
					data.name,
					data.description,
					data.product_type,
					data.category_id,
					data.unit_id,
					data.purchase_unit_id,
					data.sales_unit_id,
					data.preferred_vendor_id,
					data.purchase_cost,
					data.selling_price,
					data.quantity_on_hand,
					data.reorder_level,
					data.is_active,
					imageUrl,
					data.asset_account_id,
					data.income_account_id,
					data.expense_account_id
				]);
			}

			await connection.commit();

			// Delete old image only after successful commit
			if (id && imageFile && imageFile.size > 0 && existingImageUrl) {
				await deleteImage(existingImageUrl);
			} else if (id && existingImageUrl && formData.get('remove_image') === 'true') {
				await deleteImage(existingImageUrl);
			}

			return {
				action: 'saveProduct',
				success: true,
				message: `Product '${data.name}' saved successfully!`
			};
		} catch (err: any) {
			await connection.rollback();
			// If image was saved but DB failed, delete the newly saved image
			if (savedImagePath) {
				await deleteImage(savedImagePath);
			}
			console.error(
				`Database error on saving product (ID: ${id || 'New'}): ${err.message}`,
				err.stack
			);
			// *** MODIFIED: Check for SKU duplicate error specifically during INSERT ***
			if (!id && err.code === 'ER_DUP_ENTRY' && err.message.includes("'products.sku'")) {
				return fail(409, {
					action: 'saveProduct',
					success: false,
					message: 'Generated SKU already exists. Please try saving again.' // Inform user about potential race condition
				});
			} else if (err.code === 'ER_DUP_ENTRY') {
				// Handle other potential duplicates if needed (though SKU should be unique)
				return fail(409, {
					action: 'saveProduct',
					success: false,
					message: 'A product with this identifier already exists.' // Generic duplicate message
				});
			}
			// Add checks for FK violations if needed (though UI should prevent)
			if (err.code === 'ER_NO_REFERENCED_ROW_2') {
				return fail(400, {
					action: 'saveProduct',
					success: false,
					message: 'Invalid Category, Unit, Vendor, or Account selected.'
				});
			}
			return fail(500, {
				action: 'saveProduct',
				success: false,
				message: `Failed to save product data. Error: ${err.message}`
			});
		} finally {
			connection.release();
		}
	},
	deleteProduct: async ({ request, locals }) => {
		// ... existing deleteProduct action ...
		checkPermission(locals, 'delete products');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { action: 'deleteProduct', success: false, message: 'Invalid product ID.' });
		}
		const productId = parseInt(id);
		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// 1. Get image URL before deleting DB record
			const [productRows] = await connection.execute<Product[]>(
				'SELECT image_url FROM products WHERE id = ?',
				[productId]
			);
			const imageUrlToDelete = productRows.length > 0 ? productRows[0].image_url : null;

			// 2. Check for related records (e.g., inventory transactions, sales lines, purchase lines)
			//    This is crucial to prevent orphaned data. Add checks as needed. Example:
			// const [transactions] = await connection.execute('SELECT id FROM inventory_transactions WHERE product_id = ? LIMIT 1', [productId]);
			// if (transactions.length > 0) {
			//     throw new Error('Cannot delete product. It has associated inventory transactions.');
			// }

			// 3. Delete the product record
			const [deleteResult] = await connection.execute('DELETE FROM products WHERE id = ?', [
				productId
			]);

			if ((deleteResult as any).affectedRows === 0) {
				await connection.rollback();
				connection.release();
				return fail(404, {
					action: 'deleteProduct',
					success: false,
					message: 'Product not found.'
				});
			}

			await connection.commit();
			connection.release();

			// 4. Delete the image file *after* successful commit
			await deleteImage(imageUrlToDelete);

			// Redirect or return success for invalidateAll
			// throw redirect(303, '/products'); // Option 1: Redirect
			return { action: 'deleteProduct', success: true, message: 'Product deleted successfully.' }; // Option 2: Let invalidateAll handle refresh
		} catch (error: any) {
			await connection.rollback();
			connection.release();
			if (error.status === 303) throw error; // Handle redirect correctly

			console.error(`Error deleting product ID ${productId}: ${error.message}`, error.stack);
			if (error.message.startsWith('Cannot delete product')) {
				// Catch custom error from checks
				return fail(409, { action: 'deleteProduct', success: false, message: error.message });
			}
			if (error.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteProduct',
					success: false,
					message: 'Cannot delete product. It is referenced in other records.'
				});
			}
			return fail(500, {
				action: 'deleteProduct',
				success: false,
				message: `Failed to delete product. Error: ${error.message}`
			});
		}
	}
};
