import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cymspool } from '$lib/server/database';
// import { checkPermission } from '$lib/server/auth';
import ExcelJS from 'exceljs';
import type { RowDataPacket } from 'mysql2';

interface ContainerData extends RowDataPacket {
	id: number;
	plan_no: string | null;
	container_no: string;
	model: string | null;
	type: string | null;
	house_bl: string | null;
	etd_date: string | null;
	ata_date: string | null;
	checkin_date: string | null;
	created_at: string;
}

export const GET: RequestHandler = async ({ url }) => {
	// หากมีระบบตรวจสอบสิทธิ์ ให้เปิดใช้งานบรรทัดล่างนี้
	// checkPermission(locals, 'export container status');

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const defaultDate = `${year}-${month}-${day}`;

	const searchQuery = url.searchParams.get('search') || '';

	const startDateParam = url.searchParams.get('startDate');
	const startDate = startDateParam !== null ? startDateParam : defaultDate;

	const endDateParam = url.searchParams.get('endDate');
	const endDate = endDateParam !== null ? endDateParam : defaultDate;
	const statusFilter = url.searchParams.get('status') || '';

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                c.container_no LIKE ? OR
                p.plan_no LIKE ? OR
                p.house_bl LIKE ? OR
                p.model LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND DATE(p.checkin_date) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(p.checkin_date) <= ? `;
			params.push(endDate);
		}

		if (statusFilter) {
			if (statusFilter === '3') {
				whereClause += ` AND (p.status = 3 OR p.status NOT IN (2, 4)) `;
			} else {
				whereClause += ` AND p.status = ? `;
				params.push(statusFilter);
			}
		}

		// เพิ่ม GROUP BY p.id เพื่อป้องกันข้อมูลซ้ำตอนดึงออก Excel
		const dataSql = `
            SELECT p.*, c.container_no, c.size, c.agent,
                   c.container_owner, 
                   MAX(cs.status) AS stock_status,
                   ct.latest_transaction_date
            FROM container_order_plans p
            LEFT JOIN containers c ON p.container_id = c.id
            LEFT JOIN container_stocks cs ON p.id = cs.container_order_plan_id 
            LEFT JOIN (
                SELECT container_order_plan_id, MAX(transaction_date) as latest_transaction_date
                FROM container_transactions
                WHERE activity_type = 'Receive' 
                GROUP BY container_order_plan_id
            ) ct ON p.id = ct.container_order_plan_id
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.checkin_date ASC, p.id ASC
        `;

		const [containerRows] = await cymspool.query<any[]>(dataSql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Container Status');

		worksheet.columns = [
			{ header: 'Container No', key: 'container_no', width: 20 },
			{ header: 'Plan No', key: 'plan_no', width: 20 },
			{ header: 'Model', key: 'model', width: 25 },
			{ header: 'Type', key: 'type', width: 15 },
			{ header: 'Owner', key: 'owner', width: 15 },
			{ header: 'House BL', key: 'house_bl', width: 20 },
			{ header: 'ETD Date', key: 'etd_date', width: 15 },
			{ header: 'ATA Date', key: 'ata_date', width: 15 },
			{ header: 'Check-in Date', key: 'checkin_date', width: 20 },
			{ header: 'Transaction Date', key: 'transaction_date', width: 20 },
			{ header: 'Status', key: 'status', width: 15 },
			{ header: 'Stock Status', key: 'stock_status', width: 15 }
		];

		worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFD3D3D3' }
		};

		containerRows.forEach((row) => {
			let statusText = 'Shipped Out';
			if (row.status == 2) statusText = 'Received';
			else if (row.status == 4) statusText = 'Returned';

			let stockStatusText = 'Partial';
			if (row.stock_status == 1) stockStatusText = 'Full';
			else if (row.stock_status == 3) stockStatusText = 'Empty';

			let ownerText = '-';
			if (row.container_owner === 'Owner') {
				ownerText = 'Owner';
			} else if (row.container_owner === 'Rental') {
				ownerText = 'Rental';
			} else if (row.container_owner === 'LOG') {
				ownerText = 'LOG';
			} else if (row.container_owner) {
				ownerText = row.container_owner;
			}

			worksheet.addRow({
				container_no: row.container_no || '-',
				plan_no: row.plan_no || '-',
				model: row.model || '-',
				type: row.type || '-',
				owner: ownerText,
				house_bl: row.house_bl || '-',
				etd_date: row.etd_date ? new Date(row.etd_date).toLocaleDateString('en-GB') : '-',
				ata_date: row.ata_date ? new Date(row.ata_date).toLocaleDateString('en-GB') : '-',
				checkin_date: row.checkin_date
					? new Date(row.checkin_date).toLocaleString('en-GB', {
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit'
						})
					: '-',
				transaction_date: row.latest_transaction_date
					? new Date(row.latest_transaction_date).toLocaleString('en-GB', {
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit'
						})
					: '-',
				status: statusText,
				stock_status: stockStatusText
			});
		});

		const buffer = await workbook.xlsx.writeBuffer();

		const today = new Date().toISOString().split('T')[0];
		const fileName = `container-status-${today}.xlsx`;

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${fileName}"`
			}
		});
	} catch (err) {
		console.error('Failed to export container status:', err);
		throw error(500, 'Failed to generate Excel file');
	}
};
