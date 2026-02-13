import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

// กำหนด Path หลักที่คาดว่าจะเก็บรูป
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');
// กำหนด Path สำรอง (กรณีเก็บใน static)
const STATIC_UPLOADS_DIR = path.join(process.cwd(), 'static', 'uploads', 'products');

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
	customer_name?: string | null; // Added
	purchase_cost: number | null;
	selling_price: number | null;
	quantity_on_hand: number | null;
	reorder_level: number | null;
	is_active: boolean;
	image_url: string | null;
	asset_account_code?: string | null;
	income_account_code?: string | null;
	expense_account_code?: string | null;
	created_at: string;
	updated_at: string;
}

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
                v.name LIKE ? OR
				c.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const sql = `
            SELECT
                p.sku, p.name, p.description, p.product_type,
                pc.name AS category_name,
                u.symbol AS unit_symbol,
                pu.symbol AS purchase_unit_symbol,
                su.symbol AS sales_unit_symbol,
                v.name AS vendor_name,
				c.name AS customer_name,
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
			LEFT JOIN customers c ON p.preferred_customer_id = c.id
            LEFT JOIN chart_of_accounts coa_asset ON p.asset_account_id = coa_asset.id
            LEFT JOIN chart_of_accounts coa_income ON p.income_account_id = coa_income.id
            LEFT JOIN chart_of_accounts coa_expense ON p.expense_account_id = coa_expense.id
            ${whereClause}
            ORDER BY p.sku ASC
            `;

		const [productRows] = await pool.execute<ProductExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Products');

		worksheet.columns = [
			{ header: 'Image', key: 'image', width: 15 }, // ลดความกว้างคอลัมน์ (เดิม 20 -> 15)
			{ header: 'SKU', key: 'sku', width: 20 },
			{ header: 'Name', key: 'name', width: 35 },
			{ header: 'Description', key: 'description', width: 40, style: { alignment: { wrapText: true } } },
			{ header: 'Product Type', key: 'product_type', width: 15 },
			{ header: 'Category', key: 'category_name', width: 20 },
			{ header: 'Base Unit', key: 'unit_symbol', width: 10 },
			{ header: 'Purchase Unit', key: 'purchase_unit_symbol', width: 12 },
			{ header: 'Sales Unit', key: 'sales_unit_symbol', width: 10 },
			{ header: 'Preferred Vendor', key: 'vendor_name', width: 25 },
			{ header: 'Preferred Customer', key: 'customer_name', width: 25 }, // Added
			{ header: 'Purchase Cost', key: 'purchase_cost', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Selling Price', key: 'selling_price', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Quantity on Hand', key: 'quantity_on_hand', width: 15, style: { numFmt: '#,##0' } },
			{ header: 'Reorder Level', key: 'reorder_level', width: 15, style: { numFmt: '#,##0' } },
			{ header: 'Is Active', key: 'is_active', width: 10 },
			{ header: 'Asset Account', key: 'asset_account_code', width: 15 },
			{ header: 'Income Account', key: 'income_account_code', width: 15 },
			{ header: 'Expense/COGS Account', key: 'expense_account_code', width: 20 },
			{ header: 'Created At', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Updated At', key: 'updated_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } }
		];

        worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

		for (const [index, product] of productRows.entries()) {
			const rowNumber = index + 2; // Excel rows are 1-based, +1 for header
            const row = worksheet.getRow(rowNumber);

            row.getCell('B').value = product.sku;
            row.getCell('C').value = product.name;
            row.getCell('D').value = product.description;
            row.getCell('E').value = product.product_type;
            row.getCell('F').value = product.category_name;
            row.getCell('G').value = product.unit_symbol;
            row.getCell('H').value = product.purchase_unit_symbol;
            row.getCell('I').value = product.sales_unit_symbol;
            row.getCell('J').value = product.vendor_name;
			row.getCell('K').value = product.customer_name;
            row.getCell('L').value = product.purchase_cost;
            row.getCell('M').value = product.selling_price;
            row.getCell('N').value = product.product_type === 'Stock' ? product.quantity_on_hand : null;
            row.getCell('O').value = product.reorder_level;
            row.getCell('P').value = product.is_active ? 'Yes' : 'No';
            row.getCell('Q').value = product.asset_account_code;
            row.getCell('R').value = product.income_account_code;
            row.getCell('S').value = product.expense_account_code;
            row.getCell('T').value = product.created_at ? new Date(product.created_at) : null;
            row.getCell('U').value = product.updated_at ? new Date(product.updated_at) : null;


            // ปรับความสูงของแถวให้พอดีกับรูปภาพขนาดเล็กลง
            row.height = 100; // ลดความสูงแถว (ประมาณ 80px)
			row.alignment = { vertical: 'middle', horizontal: 'left' };

			// *** Image Handling Logic ***
			if (product.image_url) {
                const imageName = path.basename(product.image_url);
				
				// ตรวจสอบไฟล์ที่ path หลักก่อน
				let imagePath = path.join(UPLOADS_DIR, imageName);
				let fileExists = false;

				// เช็คว่าไฟล์มีจริงไหม
				try {
					await fs.access(imagePath);
					fileExists = true;
				} catch {
					// ถ้าไม่เจอ ให้ลองหาที่ static path (เผื่อเป็นโครงสร้างแบบ SvelteKit static)
					const fallbackPath = path.join(STATIC_UPLOADS_DIR, imageName);
					try {
						await fs.access(fallbackPath);
						imagePath = fallbackPath;
						fileExists = true;
						console.log(`Found image at fallback path: ${fallbackPath}`);
					} catch (e) {
						// ไม่เจอทั้งสองที่
						console.warn(`Export Warning: Image not found for SKU ${product.sku}. Searched in:\n 1. ${imagePath}\n 2. ${fallbackPath}`);
					}
				}

				if (fileExists) {
					try {
						const imageBuffer = await fs.readFile(imagePath);
						let imageFormat: 'png' | 'jpeg' | 'gif' = 'png';
						
						const ext = path.extname(imageName).toLowerCase();
						if (ext === '.jpg' || ext === '.jpeg') imageFormat = 'jpeg';
						else if (ext === '.gif') imageFormat = 'gif';

						const imageId = workbook.addImage({
							buffer: imageBuffer,
							extension: imageFormat,
						});

						worksheet.addImage(imageId, {
							// col: 0.2 หมายถึงขยับจากซ้ายมา 20% ของความกว้างคอลัมน์
                            // row: rowNumber - 1 + 0.15 หมายถึงขยับจากขอบบนลงมา 15% เพื่อให้อยู่กึ่งกลาง
							tl: { col: 0.2, row: rowNumber - 1 + 0.03 }, 
							ext: { width: 100, height: 100 }, // ลดขนาดรูปภาพเหลือ 50x50px
                            editAs: 'oneCell' // ให้รูปภาพขยับตามเซลล์
						});

					} catch (imgErr: any) {
						console.error(`Error reading/adding image ${imagePath}: ${imgErr.message}`);
						row.getCell('A').value = '(Error)';
					}
				} else {
					row.getCell('A').value = '(Missing)';
				}
			} else {
                 row.getCell('A').value = '';
            }
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="products_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) {
		console.error('Failed to export products to Excel:', error);
		return new Response(`Failed to export products due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

export const prerender = false;