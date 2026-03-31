import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cymspool } from '$lib/server/database';
import * as XLSX from 'xlsx';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const searchQuery = url.searchParams.get('search') || '';
		const startDate = url.searchParams.get('startDate') || '';
		const endDate = url.searchParams.get('endDate') || '';

		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                c1.container_no LIKE ? OR
                c2.container_no LIKE ? OR
                ce.remarks LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND DATE(ce.exchange_date) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(ce.exchange_date) <= ? `;
			params.push(endDate);
		}

		// ดึงข้อมูลทั้งหมดที่ตรงกับเงื่อนไขการค้นหา (ไม่มี Limit เพื่อ Export ออกมาให้หมด)
		const dataSql = `
            SELECT 
                ce.exchange_date,
                c1.container_no AS source_container_no,
                c2.container_no AS dest_container_no,
                u.name AS user_name,
                ce.remarks
            FROM container_exchanges ce
            LEFT JOIN containers c1 ON ce.source_container_id = c1.id
            LEFT JOIN containers c2 ON ce.destination_container_id = c2.id
            LEFT JOIN users u ON ce.user_id = u.id
            ${whereClause}
            ORDER BY ce.exchange_date DESC, ce.id DESC
        `;

		const [rows] = await cymspool.query<any[]>(dataSql, params);

		if (!rows || rows.length === 0) {
			throw error(404, 'No data found for the selected criteria');
		}

		// เตรียมข้อมูลสำหรับเขียนลง Excel
		const excelData = rows.map((row, index) => {
			// แปลงวันที่ให้อ่านง่าย
			let formattedDate = '-';
			if (row.exchange_date) {
				const d = new Date(row.exchange_date);
				if (!isNaN(d.getTime())) {
					formattedDate = d.toLocaleString('en-GB', {
						year: 'numeric',
						month: '2-digit',
						day: '2-digit',
						hour: '2-digit',
						minute: '2-digit'
					});
				}
			}

			return {
				'No.': index + 1,
				'Exchange Date': formattedDate,
				'Source Container': row.source_container_no || '-',
				'Destination Container': row.dest_container_no || '-',
				User: row.user_name || '-',
				Remarks: row.remarks || '-'
			};
		});

		const worksheet = XLSX.utils.json_to_sheet(excelData);
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, 'Container Exchanges');

		const columnWidths = [
			{ wch: 8 },
			{ wch: 20 },
			{ wch: 20 },
			{ wch: 25 },
			{ wch: 15 },
			{ wch: 30 }
		];
		worksheet['!cols'] = columnWidths;

		const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

		const nowStr = new Date().toISOString().slice(0, 10);
		const filename = `Container_Exchanges_Report_${nowStr}.xlsx`;

		return new Response(excelBuffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (err: any) {
		console.error('Export Error:', err);
		return new Response(String(err.message || 'Export failed'), { status: 500 });
	}
};
