import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface StockExportData extends RowDataPacket {
	item_code: string;
	item_name: string;
	location_code: string;
	serial_number: string | null;
	unit_name: string | null;
	unit_symbol: string | null;
	qty: number;
	actual_qty: number;
	inbound_date: string;
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
                inv.serial_number LIKE ? OR
                i.item_code LIKE ? OR
                i.item_name LIKE ? OR
                l.location_code LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const sql = `
            SELECT
                i.item_code, i.item_name,
                u.name AS unit_name, u.symbol AS unit_symbol,
                l.location_code,
                inv.serial_number, inv.qty, inv.actual_qty,
                inv.inbound_date, inv.created_at, inv.updated_at
            FROM inventory_stock inv
            LEFT JOIN items i ON inv.item_id = i.id
            LEFT JOIN units u ON i.unit_id = u.id
            LEFT JOIN locations l ON inv.location_id = l.id
            ${whereClause}
            ORDER BY inv.created_at DESC, inv.id DESC
        `;

		const [stockRows] = await pool.execute<StockExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Inventory Stock');

		worksheet.columns = [
			{ header: 'Item Code', key: 'item_code', width: 20 },
			{ header: 'Item Name', key: 'item_name', width: 40 },
			{ header: 'Location Code', key: 'location_code', width: 20 },
			{ header: 'Serial Number', key: 'serial_number', width: 25 },
			{ header: 'Unit', key: 'unit', width: 15 },
			{ header: 'System Qty', key: 'qty', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Actual Qty', key: 'actual_qty', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Inbound Date', key: 'inbound_date', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
			{ header: 'Create Date Time', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Updated At', key: 'updated_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } }
		];

        worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

		for (const [index, stock] of stockRows.entries()) {
			const rowNumber = index + 2;
            const row = worksheet.getRow(rowNumber);

            row.getCell('A').value = stock.item_code;
            row.getCell('B').value = stock.item_name;
            row.getCell('C').value = stock.location_code;
            row.getCell('D').value = stock.serial_number;
            row.getCell('E').value = stock.unit_symbol || stock.unit_name || '-';
            row.getCell('F').value = stock.qty;
            row.getCell('G').value = stock.actual_qty;
            row.getCell('H').value = stock.inbound_date ? new Date(stock.inbound_date) : null;
            row.getCell('I').value = stock.created_at ? new Date(stock.created_at) : null;
            row.getCell('J').value = stock.updated_at ? new Date(stock.updated_at) : null;
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="inventory_stock_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) {
		console.error('Failed to export stock to Excel:', error);
		return new Response(`Failed to export stock due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

export const prerender = false;