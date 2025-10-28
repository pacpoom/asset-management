import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs'; // *** Import exceljs ***
import fs from 'fs/promises'; // *** Import fs promises ***
import path from 'path'; // *** Import path ***

// Define the directory where product images are stored
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');

// Minimal type definition for the data used in this endpoint
// Adjust based on the actual fields you want to export
interface ProductExportData extends RowDataPacket {
	sku: string;
	name: string;
	description: string | null;
	product_type: string;
	category_name?: string | null;
	unit_symbol?: string | null;
	purchase_unit_symbol?: string | null;
	sales_unit_symbol?: string | null;
	vendor_name?: string | null;
	purchase_cost: number | null;
	selling_price: number | null;
	quantity_on_hand: number | null; // Nullable if not always applicable
	reorder_level: number | null;
	is_active: boolean;
	image_url: string | null;
	asset_account_code?: string | null;
	income_account_code?: string | null;
	expense_account_code?: string | null;
	created_at: string;
	updated_at: string;
}

// Helper to format date strings for Excel (YYYY-MM-DD HH:MM:SS) - Optional
const formatDateTimeForExcel = (isoString: string | null | undefined): string => {
	if (!isoString) return '';
	try {
		const date = new Date(isoString);
		// Format as YYYY-MM-DD HH:MM:SS which Excel usually recognizes
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');
		const seconds = date.getSeconds().toString().padStart(2, '0');
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	} catch (e) {
		console.warn("Invalid date for Excel formatting:", isoString);
		return isoString || ''; // Return original string if formatting fails
	}
};


/**
 * Handle POST request for exporting filtered products to Excel (.xlsx).
 */
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const searchQuery = formData.get('search')?.toString() || '';

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: string[] = [];

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

		// Query to fetch all products matching the filter, with necessary joins
		const sql = `
            SELECT
                p.sku, p.name, p.description, p.product_type,
                pc.name AS category_name,
                u.symbol AS unit_symbol,
                pu.symbol AS purchase_unit_symbol,
                su.symbol AS sales_unit_symbol,
                v.name AS vendor_name,
                p.purchase_cost, p.selling_price, p.quantity_on_hand, p.reorder_level,
                p.is_active, p.image_url,
                coa_asset.account_code AS asset_account_code,
                coa_income.account_code AS income_account_code,
                coa_expense.account_code AS expense_account_code,
                p.created_at, p.updated_at
            FROM products p
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            JOIN units u ON p.unit_id = u.id
            LEFT JOIN units pu ON p.purchase_unit_id = pu.id
            LEFT JOIN units su ON p.sales_unit_id = su.id
            LEFT JOIN vendors v ON p.preferred_vendor_id = v.id
            LEFT JOIN chart_of_accounts coa_asset ON p.asset_account_id = coa_asset.id
            LEFT JOIN chart_of_accounts coa_income ON p.income_account_id = coa_income.id
            LEFT JOIN chart_of_accounts coa_expense ON p.expense_account_id = coa_expense.id
            ${whereClause}
            ORDER BY p.sku ASC
            `;

		const [productRows] = await pool.execute<ProductExportData[]>(sql, params);

		// *** Create Excel Workbook using exceljs ***
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Products');

		// Define Columns with headers
        // Added 'Image' column, adjusted keys slightly
		worksheet.columns = [
			{ header: 'Image', key: 'image', width: 15 }, // Column for image
			{ header: 'SKU', key: 'sku', width: 20 },
			{ header: 'Name', key: 'name', width: 35 },
			{ header: 'Description', key: 'description', width: 40, style: { alignment: { wrapText: true } } }, // Wrap text
			{ header: 'Product Type', key: 'product_type', width: 15 },
			{ header: 'Category', key: 'category_name', width: 20 },
			{ header: 'Base Unit', key: 'unit_symbol', width: 10 },
			{ header: 'Purchase Unit', key: 'purchase_unit_symbol', width: 12 },
			{ header: 'Sales Unit', key: 'sales_unit_symbol', width: 10 },
			{ header: 'Preferred Vendor', key: 'vendor_name', width: 25 },
			{ header: 'Purchase Cost', key: 'purchase_cost', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Selling Price', key: 'selling_price', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Quantity on Hand', key: 'quantity_on_hand', width: 15, style: { numFmt: '#,##0' } },
			{ header: 'Reorder Level', key: 'reorder_level', width: 15, style: { numFmt: '#,##0' } },
			{ header: 'Is Active', key: 'is_active', width: 10 },
			// { header: 'Image URL', key: 'image_url', width: 40 }, // Keep URL if needed, or remove if embedding image
			{ header: 'Asset Account', key: 'asset_account_code', width: 15 },
			{ header: 'Income Account', key: 'income_account_code', width: 15 },
			{ header: 'Expense/COGS Account', key: 'expense_account_code', width: 20 },
			{ header: 'Created At', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Updated At', key: 'updated_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } }
		];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

		// Add data rows and images
		for (const [index, product] of productRows.entries()) {
			const rowNumber = index + 2; // Excel rows are 1-based, +1 for header
            const row = worksheet.getRow(rowNumber); // *** Get the row object ***

            // *** Assign values cell by cell ***
            row.getCell('B').value = product.sku; // Column B for SKU
            row.getCell('C').value = product.name; // Column C for Name
            row.getCell('D').value = product.description;
            row.getCell('E').value = product.product_type;
            row.getCell('F').value = product.category_name;
            row.getCell('G').value = product.unit_symbol;
            row.getCell('H').value = product.purchase_unit_symbol;
            row.getCell('I').value = product.sales_unit_symbol;
            row.getCell('J').value = product.vendor_name;
            row.getCell('K').value = product.purchase_cost;
            row.getCell('L').value = product.selling_price;
            row.getCell('M').value = product.product_type === 'Stock' ? product.quantity_on_hand : null;
            row.getCell('N').value = product.reorder_level;
            row.getCell('O').value = product.is_active ? 'Yes' : 'No';
            // row.getCell('P').value = product.image_url; // If keeping URL
            row.getCell('P').value = product.asset_account_code; // Adjusted column based on removal of image_url
            row.getCell('Q').value = product.income_account_code;
            row.getCell('R').value = product.expense_account_code;
            row.getCell('S').value = product.created_at ? new Date(product.created_at) : null;
            row.getCell('T').value = product.updated_at ? new Date(product.updated_at) : null;


            // Set row height for image
            row.height = 60; // Adjust height as needed (in points)
            row.alignment = { vertical: 'middle' }; // Center align vertically

            // *** Add Image if URL exists and file is accessible ***
			if (product.image_url) {
                const imageName = path.basename(product.image_url);
				const imagePath = path.join(UPLOADS_DIR, imageName);
				try {
					const imageBuffer = await fs.readFile(imagePath);
                    let imageFormat: 'png' | 'jpeg' | 'gif' = 'png'; // Default or detect from extension
                    const ext = path.extname(imageName).toLowerCase();
                    if (ext === '.jpg' || ext === '.jpeg') imageFormat = 'jpeg';
                    else if (ext === '.gif') imageFormat = 'gif';

					const imageId = workbook.addImage({
						buffer: imageBuffer,
						extension: imageFormat,
					});

                    // Add image to the worksheet in the 'Image' column (column A, index 0)
                    // Use ext for size, place slightly inside the cell with margins
					worksheet.addImage(imageId, {
						tl: { col: 0.1, row: rowNumber - 0.9 }, // Top-left corner with margin (0-based index)
						ext: { width: 75, height: 75 }       // Define image size in pixels
                        // br: { col: 1, row: rowNumber }, // Remove br if using ext
					});

				} catch (imgErr: any) {
					// Log error if image file cannot be read, but continue exporting text data
					console.warn(`Could not read image file ${imagePath} for product ${product.sku}: ${imgErr.message}`);
                    // Optionally add a note in the image cell
                    row.getCell('A').value = '(Image not found)'; // Set value for Image cell
				}
			} else {
                 row.getCell('A').value = ''; // Ensure image cell is blank if no image
            }
		}

		// *** Generate Excel file buffer ***
		const buffer = await workbook.xlsx.writeBuffer();

		// Return the file download Response
		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="products_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) { // Catch any error, including potential exceljs errors
		console.error('Failed to export products to Excel:', error);
		return new Response(`Failed to export products due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

// Disable prerendering for this dynamic route
export const prerender = false;