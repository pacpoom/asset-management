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
	const ownerFilter = url.searchParams.get('owner') || '';

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                c.container_no LIKE ? OR
                p.plan_no LIKE ? OR
                p.house_bl LIKE ? OR
                p.model LIKE ? OR
                p.vessel LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND DATE(p.checkin_date) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(p.checkin_date) <= ? `;
			params.push(endDate);
		}

		if (ownerFilter) {
			whereClause += ` AND c.container_owner = ? `;
			params.push(ownerFilter);
		}

		// ลบการ join กับ container_stocks และ GROUP BY ออก
		const dataSql = `
            SELECT p.*, c.container_no, c.size, c.agent,
                   c.container_owner
            FROM container_order_plans p
            LEFT JOIN containers c ON p.container_id = c.id
            ${whereClause}
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
			{ header: 'Vessel', key: 'vessel', width: 25 },
			{ header: 'ETD Date', key: 'etd_date', width: 15 },
			{ header: 'ATA Date', key: 'ata_date', width: 15 },
			{ header: 'Check-in Date/Time', key: 'checkin_date', width: 22 },
			{ header: 'Status', key: 'status', width: 15 }
		];

		worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFD3D3D3' }
		};

		containerRows.forEach((row) => {
			let statusText = 'Shipped Out';
			if (row.status == 1) statusText = 'LCB';
			else if (row.status == 2) statusText = 'Received';
			else if (row.status == 4) statusText = 'Returned';

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

			// จัดรูปแบบ Check-in Date ให้มีเวลาที่ชัดเจน ไม่มี comma ขั้นกลาง
			let formattedCheckin = '-';
			if (row.checkin_date) {
				const dateObj = new Date(row.checkin_date);
				if (!isNaN(dateObj.getTime())) {
					const formattedDate = dateObj.toLocaleDateString('en-GB', {
						timeZone: 'UTC',
						year: 'numeric',
						month: '2-digit',
						day: '2-digit'
					});
					const formattedTime = dateObj.toLocaleTimeString('en-GB', {
						timeZone: 'UTC',
						hour: '2-digit',
						minute: '2-digit'
					});
					formattedCheckin = `${formattedDate} ${formattedTime}`;
				}
			}

			worksheet.addRow({
				container_no: row.container_no || '-',
				plan_no: row.plan_no || '-',
				model: row.model || '-',
				type: row.type || '-',
				owner: ownerText,
				house_bl: row.house_bl || '-',
				vessel: row.vessel || '-',
				// ใช้ timeZone: 'UTC' เพื่อไม่ให้ถูกบวก 7 วัน/เวลาจะตรงกับค่าใน DB
				etd_date: row.etd_date ? new Date(row.etd_date).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '-',
				ata_date: row.ata_date ? new Date(row.ata_date).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '-',
				checkin_date: formattedCheckin,
				status: statusText
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