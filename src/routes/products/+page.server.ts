import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';

// --- Types ---
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	barcode: string | null;
	name: string;
	description: string | null;
	product_type: 'Stock' | 'NonStock' | 'Service';
	category_id: number | null;
	unit_id: number;
	purchase_unit_id: number | null;
	sales_unit_id: number | null;
	preferred_vendor_id: number | null;
	preferred_customer_id: number | null;
	purchase_cost: number | null;
	selling_price: number | null;
	tax_rate: number | null;
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
	purchase_unit_symbol?: string | null;
	sales_unit_symbol?: string | null;
	vendor_name?: string | null;
	customer_name?: string | null;
	asset_account_code?: string | null;
	asset_account_name?: string | null;
	income_account_code?: string | null;
	income_account_name?: string | null;
	expense_account_code?: string | null;
	expense_account_name?: string | null;
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
interface Customer extends RowDataPacket {
	id: number;
	name: string;
	company_name: string | null;
}
interface ChartOfAccount extends RowDataPacket {
	id: number;
	account_code: string;
	account_name: string;
}

// --- File Handling Helpers ---
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');

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
		return `/uploads/products/${filename}`;
	} catch (uploadError: any) {
		console.error(`saveImage Error: ${uploadError.message}`, uploadError.stack);
		if (uploadPath) {
			try {
				if (await fs.stat(uploadPath)) await fs.unlink(uploadPath);
			} catch {}
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
		const fullPath = path.join(UPLOADS_DIR, filename);
		await fs.unlink(fullPath);
	} catch (err: any) {
		if (err.code !== 'ENOENT') {
			console.error(`deleteImage Error: ${err.message}`, err.stack);
		}
	}
}

// Generate next SKU like PROD2605-00001
async function generateSku() {
	const prefix = 'PROD';
	const today = new Date();
	const year = today.getFullYear().toString().slice(-2);
	const month = (today.getMonth() + 1).toString().padStart(2, '0');
	const datePrefix = `${prefix}${year}${month}`;

	const [rows]: any[] = await pool.execute(
		`SELECT sku FROM products WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1`,
		[`${datePrefix}-%`]
	);

	let nextNumber = 1;
	if (rows.length > 0) {
		const lastSku = rows[0].sku;
		const lastNumberStr = lastSku.split('-')[1];
		if (lastNumberStr) {
			const lastNumber = parseInt(lastNumberStr, 10);
			if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
		}
	}

	const paddedNumber = nextNumber.toString().padStart(5, '0');
	return `${datePrefix}-${paddedNumber}`;
}

// Whitelist of sortable columns -> ORDER BY expression
const SORT_MAP: Record<string, string> = {
	sku: 'p.sku',
	name: 'p.name',
	product_type: 'p.product_type',
	category_name: 'pc.name',
	quantity_on_hand: 'p.quantity_on_hand',
	purchase_cost: 'p.purchase_cost',
	selling_price: 'p.selling_price',
	is_active: 'p.is_active',
	created_at: 'p.created_at',
	updated_at: 'p.updated_at'
};

// --- Load Function ---
export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view products');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';

	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) limit = 10;
	const offset = (page - 1) * limit;

	// Filters
	const filterType = url.searchParams.get('type') || '';            // Stock | NonStock | Service
	const filterCategoryRaw = url.searchParams.get('category') || ''; // category_id (or 'none')
	const filterActive = url.searchParams.get('active') || '';        // '1' | '0'
	const filterStockStatus = url.searchParams.get('stock') || '';    // 'low' | 'out' | 'in'

	// Sort
	const sortByParam = url.searchParams.get('sort_by') || 'created_at';
	const sortDirParam = (url.searchParams.get('sort_dir') || 'desc').toLowerCase();
	const sortBy = SORT_MAP[sortByParam] ? sortByParam : 'created_at';
	const sortDir = sortDirParam === 'asc' ? 'ASC' : 'DESC';
	const orderBy = `${SORT_MAP[sortBy]} ${sortDir}`;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
				p.sku LIKE ? OR
				p.barcode LIKE ? OR
				p.name LIKE ? OR
				p.description LIKE ? OR
				pc.name LIKE ? OR
				v.name LIKE ? OR
				c.name LIKE ?
			) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (filterType && ['Stock', 'NonStock', 'Service'].includes(filterType)) {
			whereClause += ' AND p.product_type = ? ';
			params.push(filterType);
		}

		if (filterCategoryRaw) {
			if (filterCategoryRaw === 'none') {
				whereClause += ' AND p.category_id IS NULL ';
			} else {
				const catId = parseInt(filterCategoryRaw, 10);
				if (!isNaN(catId)) {
					whereClause += ' AND p.category_id = ? ';
					params.push(catId);
				}
			}
		}

		if (filterActive === '1' || filterActive === '0') {
			whereClause += ' AND p.is_active = ? ';
			params.push(filterActive === '1' ? 1 : 0);
		}

		if (filterStockStatus === 'low') {
			whereClause +=
				' AND p.product_type = "Stock" AND p.reorder_level IS NOT NULL AND p.quantity_on_hand <= p.reorder_level AND p.quantity_on_hand > 0 ';
		} else if (filterStockStatus === 'out') {
			whereClause += ' AND p.product_type = "Stock" AND p.quantity_on_hand <= 0 ';
		} else if (filterStockStatus === 'in') {
			whereClause +=
				' AND p.product_type = "Stock" AND (p.reorder_level IS NULL OR p.quantity_on_hand > p.reorder_level) ';
		}

		const countSql = `
			SELECT COUNT(p.id) as total
			FROM products p
			LEFT JOIN product_categories pc ON p.category_id = pc.id
			LEFT JOIN vendors v ON p.preferred_vendor_id = v.id
			LEFT JOIN customers c ON p.preferred_customer_id = c.id
			${whereClause}
		`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		// Aggregate counts for filter chips
		const [statsRows] = await pool.execute<any[]>(
			`SELECT
				SUM(CASE WHEN product_type='Stock' AND quantity_on_hand <= 0 THEN 1 ELSE 0 END) AS out_stock,
				SUM(CASE WHEN product_type='Stock' AND reorder_level IS NOT NULL AND quantity_on_hand > 0 AND quantity_on_hand <= reorder_level THEN 1 ELSE 0 END) AS low_stock,
				SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_count,
				COUNT(*) AS total_count
			 FROM products`
		);
		const stats = statsRows[0] || { out_stock: 0, low_stock: 0, inactive_count: 0, total_count: 0 };

		const productsSql = `
			SELECT
				p.*,
				pc.name AS category_name,
				u.symbol AS unit_symbol,
				pu.symbol AS purchase_unit_symbol,
				su.symbol AS sales_unit_symbol,
				v.name AS vendor_name,
				c.name AS customer_name,
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
			LEFT JOIN customers c ON p.preferred_customer_id = c.id
			LEFT JOIN chart_of_accounts coa_asset ON p.asset_account_id = coa_asset.id
			LEFT JOIN chart_of_accounts coa_income ON p.income_account_id = coa_income.id
			LEFT JOIN chart_of_accounts coa_expense ON p.expense_account_id = coa_expense.id
			${whereClause}
			ORDER BY ${orderBy}
			LIMIT ${limit} OFFSET ${offset}
		`;

		const [productRows] = await pool.execute<Product[]>(productsSql, params);

		const [categoryRows] = await pool.execute<ProductCategory[]>(
			'SELECT id, name FROM product_categories ORDER BY name'
		);
		const [unitRows] = await pool.execute<Unit[]>('SELECT id, name, symbol FROM units ORDER BY name');
		const [vendorRows] = await pool.execute<Vendor[]>('SELECT id, name FROM vendors ORDER BY name');
		const [customerRows] = await pool.execute<Customer[]>(
			'SELECT id, name, company_name FROM customers ORDER BY name'
		);
		const [accountRows] = await pool.execute<ChartOfAccount[]>(
			'SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code'
		);

		return {
			products: productRows.map((p) => ({ ...p, is_active: Boolean(p.is_active) })),
			categories: categoryRows,
			units: unitRows,
			vendors: vendorRows,
			customers: customerRows,
			accounts: accountRows,
			currentPage: page,
			totalPages,
			total,
			limit,
			searchQuery,
			filters: {
				type: filterType,
				category: filterCategoryRaw,
				active: filterActive,
				stock: filterStockStatus
			},
			sort: { by: sortBy, dir: sortDir.toLowerCase() },
			stats: {
				out_stock: Number(stats.out_stock || 0),
				low_stock: Number(stats.low_stock || 0),
				inactive_count: Number(stats.inactive_count || 0),
				total_count: Number(stats.total_count || 0)
			},
			can: {
				import: !!locals.user?.permissions?.includes('import products'),
				adjustStock: !!locals.user?.permissions?.includes('adjust product stock'),
				viewHistory: !!locals.user?.permissions?.includes('view product stock history')
			}
		};
	} catch (err: any) {
		console.error('Failed to load products data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

// --- Helpers ---
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

async function recordStockMovement(
	connection: PoolConnection,
	args: {
		productId: number;
		qtyBefore: number;
		qtyAfter: number;
		movementType: string;
		notes?: string | null;
		referenceType?: string | null;
		referenceId?: number | null;
		userId?: number | null;
	}
) {
	const qtyChange = args.qtyAfter - args.qtyBefore;
	if (qtyChange === 0) return;
	await connection.execute(
		`INSERT INTO product_stock_movements
			(product_id, movement_type, qty_change, qty_before, qty_after, reference_type, reference_id, notes, user_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			args.productId,
			args.movementType,
			qtyChange,
			args.qtyBefore,
			args.qtyAfter,
			args.referenceType ?? null,
			args.referenceId ?? null,
			args.notes ?? null,
			args.userId ?? null
		]
	);
}

// --- Actions ---
export const actions: Actions = {
	saveProduct: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		const requiredPermission = id ? 'edit products' : 'create products';
		checkPermission(locals, requiredPermission);

		const name = formData.get('name')?.toString()?.trim();
		const product_type = formData.get('product_type')?.toString() as Product['product_type'] | null;
		const unit_id = parseNumberOrNull(formData.get('unit_id'));

		if (!name || !product_type || !unit_id) {
			return fail(400, {
				action: 'saveProduct',
				success: false,
				message: 'Name, Product Type, and Base Unit are required.'
			});
		}
		if (!['Stock', 'NonStock', 'Service'].includes(product_type)) {
			return fail(400, {
				action: 'saveProduct',
				success: false,
				message: 'Invalid Product Type.'
			});
		}

		const data = {
			name: name,
			barcode: formData.get('barcode')?.toString()?.trim() || null,
			description: formData.get('description')?.toString()?.trim() || null,
			product_type: product_type,
			category_id: parseNumberOrNull(formData.get('category_id')),
			unit_id: unit_id,
			purchase_unit_id: parseNumberOrNull(formData.get('purchase_unit_id')),
			sales_unit_id: parseNumberOrNull(formData.get('sales_unit_id')),
			preferred_vendor_id: parseNumberOrNull(formData.get('preferred_vendor_id')),
			preferred_customer_id: parseNumberOrNull(formData.get('preferred_customer_id')),
			purchase_cost: parseFloatOrNull(formData.get('purchase_cost')),
			selling_price: parseFloatOrNull(formData.get('selling_price')),
			tax_rate: parseFloatOrNull(formData.get('tax_rate')),
			quantity_on_hand:
				product_type === 'Stock'
					? (parseFloatOrNull(formData.get('quantity_on_hand')) ?? 0)
					: 0,
			reorder_level: parseFloatOrNull(formData.get('reorder_level')),
			is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
			asset_account_id: parseNumberOrNull(formData.get('asset_account_id')),
			income_account_id: parseNumberOrNull(formData.get('income_account_id')),
			expense_account_id: parseNumberOrNull(formData.get('expense_account_id'))
		};

		const imageFile = formData.get('image') as File | null;
		const existingImageUrl = formData.get('existing_image_url')?.toString();
		let imageUrl = existingImageUrl || null;
		let savedImagePath: string | null = null;

		const connection = await pool.getConnection();

		try {
			// Check duplicate name
			let nameCheckSql = 'SELECT id FROM products WHERE name = ?';
			const nameCheckParams: (string | number)[] = [data.name];
			if (id) {
				nameCheckSql += ' AND id != ?';
				nameCheckParams.push(parseInt(id));
			}
			const [existingProducts] = await connection.execute<any[]>(nameCheckSql, nameCheckParams);
			if (existingProducts.length > 0) {
				connection.release();
				return fail(400, {
					action: 'saveProduct',
					success: false,
					message: `The product name "${data.name}" already exists. Please use a different name.`
				});
			}

			await connection.beginTransaction();

			if (imageFile && imageFile.size > 0) {
				savedImagePath = await saveImage(imageFile);
				imageUrl = savedImagePath;
			} else if (!imageFile && id && existingImageUrl && formData.get('remove_image') === 'true') {
				imageUrl = null;
			}

			if (id) {
				// Get qty_before for stock movement audit
				const [existing] = await connection.execute<Product[]>(
					'SELECT quantity_on_hand FROM products WHERE id = ?',
					[parseInt(id)]
				);
				const qtyBefore = Number(existing[0]?.quantity_on_hand ?? 0);

				const sql = `UPDATE products SET
					name = ?, barcode = ?, description = ?, product_type = ?, category_id = ?, unit_id = ?,
					purchase_unit_id = ?, sales_unit_id = ?, preferred_vendor_id = ?, preferred_customer_id = ?,
					purchase_cost = ?, selling_price = ?, tax_rate = ?,
					quantity_on_hand = ?, reorder_level = ?, is_active = ?, image_url = ?, asset_account_id = ?,
					income_account_id = ?, expense_account_id = ?
					WHERE id = ?`;
				await connection.execute(sql, [
					data.name,
					data.barcode,
					data.description,
					data.product_type,
					data.category_id,
					data.unit_id,
					data.purchase_unit_id,
					data.sales_unit_id,
					data.preferred_vendor_id,
					data.preferred_customer_id,
					data.purchase_cost,
					data.selling_price,
					data.tax_rate,
					data.quantity_on_hand,
					data.reorder_level,
					data.is_active,
					imageUrl,
					data.asset_account_id,
					data.income_account_id,
					data.expense_account_id,
					parseInt(id)
				]);

				// Log stock change if Stock type and qty changed
				if (data.product_type === 'Stock' && qtyBefore !== data.quantity_on_hand) {
					await recordStockMovement(connection, {
						productId: parseInt(id),
						qtyBefore,
						qtyAfter: data.quantity_on_hand,
						movementType: 'adjustment',
						notes: 'Edited via product form',
						userId: locals.user?.id ?? null
					});
				}
			} else {
				const newSku = await generateSku();
				const sql = `INSERT INTO products (
					sku, barcode, name, description, product_type, category_id, unit_id, purchase_unit_id, sales_unit_id,
					preferred_vendor_id, preferred_customer_id, purchase_cost, selling_price, tax_rate,
					quantity_on_hand, reorder_level, is_active,
					image_url, asset_account_id, income_account_id, expense_account_id
				 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
				const [insertResult]: any = await connection.execute(sql, [
					newSku,
					data.barcode,
					data.name,
					data.description,
					data.product_type,
					data.category_id,
					data.unit_id,
					data.purchase_unit_id,
					data.sales_unit_id,
					data.preferred_vendor_id,
					data.preferred_customer_id,
					data.purchase_cost,
					data.selling_price,
					data.tax_rate,
					data.quantity_on_hand,
					data.reorder_level,
					data.is_active,
					imageUrl,
					data.asset_account_id,
					data.income_account_id,
					data.expense_account_id
				]);

				const newProductId = insertResult.insertId;
				if (data.product_type === 'Stock' && data.quantity_on_hand > 0 && newProductId) {
					await recordStockMovement(connection, {
						productId: newProductId,
						qtyBefore: 0,
						qtyAfter: data.quantity_on_hand,
						movementType: 'opening',
						notes: 'Opening balance on create',
						userId: locals.user?.id ?? null
					});
				}
			}

			await connection.commit();

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
			if (savedImagePath) await deleteImage(savedImagePath);
			console.error(
				`Database error on saving product (ID: ${id || 'New'}): ${err.message}`,
				err.stack
			);
			if (!id && err.code === 'ER_DUP_ENTRY' && err.message.includes("'products.sku'")) {
				return fail(409, {
					action: 'saveProduct',
					success: false,
					message: 'Generated SKU already exists. Please try saving again.'
				});
			}
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveProduct',
					success: false,
					message: 'A product with this identifier already exists.'
				});
			}
			if (err.code === 'ER_NO_REFERENCED_ROW_2') {
				return fail(400, {
					action: 'saveProduct',
					success: false,
					message: 'Invalid Category, Unit, Vendor, Customer or Account selected.'
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
		checkPermission(locals, 'delete products');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) {
			return fail(400, {
				action: 'deleteProduct',
				success: false,
				message: 'Invalid product ID.'
			});
		}
		const productId = parseInt(id);
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			const [productRows] = await connection.execute<Product[]>(
				'SELECT image_url FROM products WHERE id = ?',
				[productId]
			);
			const imageUrlToDelete = productRows.length > 0 ? productRows[0].image_url : null;
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
			await deleteImage(imageUrlToDelete);
			return {
				action: 'deleteProduct',
				success: true,
				message: 'Product deleted successfully.'
			};
		} catch (err: any) {
			await connection.rollback();
			connection.release();
			console.error(`Error deleting product ID ${productId}: ${err.message}`, err.stack);
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteProduct',
					success: false,
					message: 'Cannot delete product. It is referenced in other records.'
				});
			}
			return fail(500, {
				action: 'deleteProduct',
				success: false,
				message: `Failed to delete product. Error: ${err.message}`
			});
		}
	},

	// Clone a product (new SKU, copies all fields except qty/image_url)
	duplicateProduct: async ({ request, locals }) => {
		checkPermission(locals, 'create products');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) {
			return fail(400, {
				action: 'duplicateProduct',
				success: false,
				message: 'Invalid product ID.'
			});
		}
		const productId = parseInt(id);
		try {
			const [rows] = await pool.execute<Product[]>('SELECT * FROM products WHERE id = ?', [
				productId
			]);
			if (rows.length === 0) {
				return fail(404, {
					action: 'duplicateProduct',
					success: false,
					message: 'Product not found.'
				});
			}
			const src = rows[0];
			const newSku = await generateSku();

			// Find a unique name: "<original> (Copy)" / " (Copy 2)" etc.
			let candidate = `${src.name} (Copy)`;
			let counter = 2;
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const [exists] = await pool.execute<any[]>('SELECT id FROM products WHERE name = ?', [
					candidate
				]);
				if (exists.length === 0) break;
				candidate = `${src.name} (Copy ${counter++})`;
				if (counter > 100) break;
			}

			await pool.execute(
				`INSERT INTO products (
					sku, barcode, name, description, product_type, category_id, unit_id, purchase_unit_id, sales_unit_id,
					preferred_vendor_id, preferred_customer_id, purchase_cost, selling_price, tax_rate,
					quantity_on_hand, reorder_level, is_active,
					image_url, asset_account_id, income_account_id, expense_account_id
				 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					newSku,
					null, // do not copy barcode (unique-ish)
					candidate,
					src.description,
					src.product_type,
					src.category_id,
					src.unit_id,
					src.purchase_unit_id,
					src.sales_unit_id,
					src.preferred_vendor_id,
					src.preferred_customer_id,
					src.purchase_cost,
					src.selling_price,
					src.tax_rate,
					0, // start with zero stock
					src.reorder_level,
					src.is_active ? 1 : 0,
					null, // do not copy image
					src.asset_account_id,
					src.income_account_id,
					src.expense_account_id
				]
			);
			return {
				action: 'duplicateProduct',
				success: true,
				message: `Product duplicated as "${candidate}".`
			};
		} catch (err: any) {
			console.error(`Error duplicating product ${productId}: ${err.message}`, err.stack);
			return fail(500, {
				action: 'duplicateProduct',
				success: false,
				message: `Failed to duplicate product. Error: ${err.message}`
			});
		}
	},

	// Bulk activate / deactivate / delete
	bulkAction: async ({ request, locals }) => {
		const data = await request.formData();
		const op = data.get('op')?.toString();          // 'delete' | 'activate' | 'deactivate'
		const idsRaw = data.get('ids')?.toString() || '';
		const ids = idsRaw
			.split(',')
			.map((s) => parseInt(s.trim(), 10))
			.filter((n) => !isNaN(n) && n > 0);

		if (!op || ids.length === 0) {
			return fail(400, {
				action: 'bulkAction',
				success: false,
				message: 'No products selected or invalid operation.'
			});
		}
		if (!['delete', 'activate', 'deactivate'].includes(op)) {
			return fail(400, {
				action: 'bulkAction',
				success: false,
				message: 'Invalid operation.'
			});
		}

		if (op === 'delete') checkPermission(locals, 'delete products');
		else checkPermission(locals, 'edit products');

		const placeholders = ids.map(() => '?').join(', ');
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			if (op === 'delete') {
				// fetch image_urls for cleanup
				const [rows] = await connection.execute<Product[]>(
					`SELECT id, image_url FROM products WHERE id IN (${placeholders})`,
					ids
				);
				const imageUrls = rows.map((r) => r.image_url).filter(Boolean) as string[];
				const [result]: any = await connection.execute(
					`DELETE FROM products WHERE id IN (${placeholders})`,
					ids
				);
				await connection.commit();
				connection.release();
				for (const url of imageUrls) await deleteImage(url);
				return {
					action: 'bulkAction',
					success: true,
					message: `Deleted ${result.affectedRows} product(s).`
				};
			} else {
				const flag = op === 'activate' ? 1 : 0;
				const [result]: any = await connection.execute(
					`UPDATE products SET is_active = ? WHERE id IN (${placeholders})`,
					[flag, ...ids]
				);
				await connection.commit();
				connection.release();
				return {
					action: 'bulkAction',
					success: true,
					message: `${op === 'activate' ? 'Activated' : 'Deactivated'} ${result.affectedRows} product(s).`
				};
			}
		} catch (err: any) {
			await connection.rollback();
			connection.release();
			console.error(`Error in bulkAction (${op}):`, err.message, err.stack);
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'bulkAction',
					success: false,
					message: 'Cannot delete: some products are referenced by other records.'
				});
			}
			return fail(500, {
				action: 'bulkAction',
				success: false,
				message: `Bulk operation failed. Error: ${err.message}`
			});
		}
	},

	// Manual stock adjustment for a single product
	adjustStock: async ({ request, locals }) => {
		checkPermission(locals, 'adjust product stock');
		const data = await request.formData();
		const id = parseInt(data.get('id')?.toString() || '', 10);
		const mode = data.get('mode')?.toString() || 'set'; // 'set' | 'delta'
		const value = parseFloatOrNull(data.get('value'));
		const notes = data.get('notes')?.toString()?.trim() || null;
		const movementType = data.get('movement_type')?.toString() || 'adjustment';

		if (!id || value === null) {
			return fail(400, {
				action: 'adjustStock',
				success: false,
				message: 'Product ID and value required.'
			});
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			const [rows] = await connection.execute<Product[]>(
				'SELECT id, product_type, quantity_on_hand FROM products WHERE id = ?',
				[id]
			);
			if (rows.length === 0) {
				await connection.rollback();
				connection.release();
				return fail(404, {
					action: 'adjustStock',
					success: false,
					message: 'Product not found.'
				});
			}
			if (rows[0].product_type !== 'Stock') {
				await connection.rollback();
				connection.release();
				return fail(400, {
					action: 'adjustStock',
					success: false,
					message: 'Only Stock-type products can be adjusted.'
				});
			}
			const qtyBefore = Number(rows[0].quantity_on_hand);
			const qtyAfter = mode === 'delta' ? qtyBefore + value : value;
			if (qtyAfter < 0) {
				await connection.rollback();
				connection.release();
				return fail(400, {
					action: 'adjustStock',
					success: false,
					message: 'Resulting stock cannot be negative.'
				});
			}

			await connection.execute('UPDATE products SET quantity_on_hand = ? WHERE id = ?', [
				qtyAfter,
				id
			]);
			await recordStockMovement(connection, {
				productId: id,
				qtyBefore,
				qtyAfter,
				movementType,
				notes,
				userId: locals.user?.id ?? null
			});

			await connection.commit();
			connection.release();
			return {
				action: 'adjustStock',
				success: true,
				message: `Stock adjusted: ${qtyBefore} → ${qtyAfter}.`
			};
		} catch (err: any) {
			await connection.rollback();
			connection.release();
			console.error('adjustStock error:', err.message, err.stack);
			return fail(500, {
				action: 'adjustStock',
				success: false,
				message: `Failed to adjust stock. Error: ${err.message}`
			});
		}
	}
};
