import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface ItemExportData extends RowDataPacket {
	item_code: string;
	item_name: string;
	item_name_eng: string | null;
	unit_name: string | null;
	min_stock: number;
	max_stock: number;
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
                i.item_code LIKE ? OR
                i.item_name LIKE ? OR
                i.item_name_eng LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm);
		}

		const sql = `
            SELECT
                i.item_code, i.item_name, i.item_name_eng,
                u.name AS unit_name,
                i.min_stock, i.max_stock,
                i.created_at, i.updated_at
            FROM items i
            LEFT JOIN units u ON i.unit_id = u.id
            ${whereClause}
            ORDER BY i.item_code ASC
        `;

		const [itemRows] = await pool.execute<ItemExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Items');

		worksheet.columns = [
			{ header: 'Item Code', key: 'item_code', width: 20 },
			{ header: 'Item Name', key: 'item_name', width: 40 },
			{ header: 'Item Name (Eng)', key: 'item_name_eng', width: 40 },
			{ header: 'Unit', key: 'unit_name', width: 15 },
			{ header: 'Min Stock', key: 'min_stock', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Max Stock', key: 'max_stock', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Created At', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Updated At', key: 'updated_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } }
		];

        worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

		for (const [index, item] of itemRows.entries()) {
			const rowNumber = index + 2;
            const row = worksheet.getRow(rowNumber);

            row.getCell('A').value = item.item_code;
            row.getCell('B').value = item.item_name;
            row.getCell('C').value = item.item_name_eng;
            row.getCell('D').value = item.unit_name;
            row.getCell('E').value = item.min_stock;
            row.getCell('F').value = item.max_stock;
            row.getCell('G').value = item.created_at ? new Date(item.created_at) : null;
            row.getCell('H').value = item.updated_at ? new Date(item.updated_at) : null;
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="items_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) {
		console.error('Failed to export items to Excel:', error);
		return new Response(`Failed to export items due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

export const prerender = false;