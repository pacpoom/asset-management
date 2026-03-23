import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface LocationExportData extends RowDataPacket {
	location_code: string;
	sub_warehouse_name: string | null;
	zone: string;
	area: string;
	bin: string;
	min_capacity: number;
	max_capacity: number;
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
                l.location_code LIKE ? OR
                l.zone LIKE ? OR
                l.area LIKE ? OR
                l.bin LIKE ? OR
                sw.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const sql = `
            SELECT
                l.location_code, 
                sw.name as sub_warehouse_name,
                l.zone, l.area, l.bin,
                l.min_capacity, l.max_capacity,
                l.created_at, l.updated_at
            FROM locations l
            LEFT JOIN sub_warehouses sw ON l.sub_warehouse_id = sw.id
            ${whereClause}
            ORDER BY l.zone ASC, l.area ASC, l.bin ASC
        `;

		const [locationRows] = await pool.execute<LocationExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Locations');

		worksheet.columns = [
			{ header: 'Location Code', key: 'location_code', width: 20 },
			{ header: 'Sub Warehouse', key: 'sub_warehouse_name', width: 25 },
			{ header: 'Zone', key: 'zone', width: 15 },
			{ header: 'Area', key: 'area', width: 15 },
			{ header: 'Bin', key: 'bin', width: 15 },
			{ header: 'Min Capacity', key: 'min_capacity', width: 20, style: { numFmt: '#,##0.00' } },
			{ header: 'Max Capacity', key: 'max_capacity', width: 20, style: { numFmt: '#,##0.00' } },
			{ header: 'Created At', key: 'created_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
			{ header: 'Updated At', key: 'updated_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } }
		];

        worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

		for (const [index, loc] of locationRows.entries()) {
			const rowNumber = index + 2;
            const row = worksheet.getRow(rowNumber);

            row.getCell('A').value = loc.location_code;
            row.getCell('B').value = loc.sub_warehouse_name || '-';
            row.getCell('C').value = loc.zone;
            row.getCell('D').value = loc.area;
            row.getCell('E').value = loc.bin;
            row.getCell('F').value = loc.min_capacity;
            row.getCell('G').value = loc.max_capacity;
            row.getCell('H').value = loc.created_at ? new Date(loc.created_at) : null;
            row.getCell('I').value = loc.updated_at ? new Date(loc.updated_at) : null;
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="locations_export_${new Date().toISOString().slice(0, 10)}.xlsx"`
			}
		});

	} catch (error: any) {
		console.error('Failed to export locations to Excel:', error);
		return new Response(`Failed to export locations due to a server error: ${error.message}`, {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};

export const prerender = false;