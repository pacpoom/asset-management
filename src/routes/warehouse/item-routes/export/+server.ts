import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface RouteExportData extends RowDataPacket {
	route_no: string;
	route_name: string;
	item_code: string | null;
	item_name: string | null;
	min: number;
	max: number;
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
                r.route_no LIKE ? OR
                rm.name LIKE ? OR
                i.item_code LIKE ? OR
                i.item_name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const sql = `
            SELECT
                r.route_no, rm.name as route_name,
                i.item_code, i.item_name,
                r.min, r.max,
                r.created_at, r.updated_at
            FROM item_routes r
            LEFT JOIN items i ON r.item_id = i.id
            LEFT JOIN route_masters rm ON r.route_name_id = rm.id
            ${whereClause}
            ORDER BY r.route_no ASC
        `;

		const [routeRows] = await pool.execute<RouteExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Item Routes');

		worksheet.columns = [
			{ header: 'Route No', key: 'route_no', width: 20 },
			{ header: 'Route Name', key: 'route_name', width: 35 },
			{ header: 'Item Code', key: 'item_code', width: 20 },
			{ header: 'Item Name', key: 'item_name', width: 40 },
			{ header: 'Min Level', key: 'min', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Max Level', key: 'max', width: 15, style: { numFmt: '#,##0.00' } },
			{ header: 'Created At', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Updated At', key: 'updated_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } }
		];

        worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

		for (const [index, route] of routeRows.entries()) {
			const rowNumber = index + 2;
            const row = worksheet.getRow(rowNumber);

            row.getCell('A').value = route.route_no;
            row.getCell('B').value = route.route_name; // ดึงมาจาก rm.name ตาม alias ข้างบน
            row.getCell('C').value = route.item_code;
            row.getCell('D').value = route.item_name;
            row.getCell('E').value = route.min;
            row.getCell('F').value = route.max;
            row.getCell('G').value = route.created_at ? new Date(route.created_at) : null;
            row.getCell('H').value = route.updated_at ? new Date(route.updated_at) : null;
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="item_routes_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) {
		console.error('Failed to export routes to Excel:', error);
		return new Response(`Failed to export routes due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

export const prerender = false;