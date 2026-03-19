import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

interface LocationExportData extends RowDataPacket {
	location_code: string;
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
                location_code LIKE ? OR
                zone LIKE ? OR
                area LIKE ? OR
                bin LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const sql = `
            SELECT
                location_code, zone, area, bin,
                min_capacity, max_capacity,
                created_at, updated_at
            FROM locations
            ${whereClause}
            ORDER BY zone ASC, area ASC, bin ASC
        `;

		const [locationRows] = await pool.execute<LocationExportData[]>(sql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Locations');

		worksheet.columns = [
			{ header: 'Location Code', key: 'location_code', width: 20 },
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
            row.getCell('B').value = loc.zone;
            row.getCell('C').value = loc.area;
            row.getCell('D').value = loc.bin;
            row.getCell('E').value = loc.min_capacity;
            row.getCell('F').value = loc.max_capacity;
            row.getCell('G').value = loc.created_at ? new Date(loc.created_at) : null;
            row.getCell('H').value = loc.updated_at ? new Date(loc.updated_at) : null;
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