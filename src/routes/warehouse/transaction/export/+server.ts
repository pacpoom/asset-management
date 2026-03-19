import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface LogExportData extends RowDataPacket {
	transaction_type: string;
	item_code: string;
	item_name: string;
	location_code: string;
	serial_number: string | null;
	unit_name: string | null;
	unit_symbol: string | null;
	qty_change: number;
	notes: string | null;
	created_at: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const searchQuery = formData.get('search')?.toString() || '';
	const startDate = formData.get('startDate')?.toString() || '';
	const endDate = formData.get('endDate')?.toString() || '';

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: string[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                t.serial_number LIKE ? OR
                i.item_code LIKE ? OR
                i.item_name LIKE ? OR
                l.location_code LIKE ? OR
                t.transaction_type LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND DATE(t.created_at) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(t.created_at) <= ? `;
			params.push(endDate);
		}

		const sql = `
            SELECT
                t.transaction_type, t.serial_number, t.qty_change, t.notes, t.created_at,
                i.item_code, i.item_name,
                u.name AS unit_name, u.symbol AS unit_symbol,
                l.location_code
            FROM transaction_logs t
            LEFT JOIN items i ON t.item_id = i.id
            LEFT JOIN units u ON i.unit_id = u.id
            LEFT JOIN locations l ON t.location_id = l.id
            ${whereClause}
            ORDER BY t.created_at DESC, t.id DESC
        `;

		const [logRows] = await pool.execute<LogExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Transaction Logs');

		worksheet.columns = [
			{ header: 'Date / Time', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Transaction Type', key: 'transaction_type', width: 25 },
			{ header: 'Item Code', key: 'item_code', width: 20 },
			{ header: 'Item Name', key: 'item_name', width: 40 },
			{ header: 'Location Code', key: 'location_code', width: 20 },
			{ header: 'Serial Number', key: 'serial_number', width: 25 },
			{ header: 'Unit', key: 'unit', width: 15 },
			{ header: 'Qty Change', key: 'qty_change', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Notes', key: 'notes', width: 50 }
		];

        worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

		for (const [index, log] of logRows.entries()) {
			const rowNumber = index + 2;
            const row = worksheet.getRow(rowNumber);

            row.getCell('A').value = log.created_at ? new Date(log.created_at) : null;
            row.getCell('B').value = log.transaction_type;
            row.getCell('C').value = log.item_code;
            row.getCell('D').value = log.item_name;
            row.getCell('E').value = log.location_code;
            row.getCell('F').value = log.serial_number;
            row.getCell('G').value = log.unit_symbol || log.unit_name || '-';
            row.getCell('H').value = log.qty_change;
            row.getCell('I').value = log.notes;
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="transaction_logs_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) {
		console.error('Failed to export transaction logs to Excel:', error);
		return new Response(`Failed to export logs due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

export const prerender = false;