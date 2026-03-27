import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
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

	// สร้างตัวแปรเก็บวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const defaultDate = `${year}-${month}-${day}`;

	const searchQuery = url.searchParams.get('search') || '';
	
	// ลอจิกเดียวกันกับหน้าแสดงผล เพื่อให้ไฟล์ Export ตรงกับสิ่งที่เห็น
	const startDateParam = url.searchParams.get('startDate');
	const startDate = startDateParam !== null ? startDateParam : defaultDate;

	const endDateParam = url.searchParams.get('endDate');
	const endDate = endDateParam !== null ? endDateParam : defaultDate;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		// กรองข้อมูลตามเงื่อนไขเดียวกับหน้าตาราง
		if (searchQuery) {
			whereClause += ` AND (
                container_no LIKE ? OR
                plan_no LIKE ? OR
                house_bl LIKE ? OR
                model LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND DATE(checkin_date) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(checkin_date) <= ? `;
			params.push(endDate);
		}

		// ดึงข้อมูลทั้งหมดโดยไม่จำกัด LIMIT เพื่อนำมาออกรายงาน Excel
		const dataSql = `
            SELECT *
            FROM container_status
            ${whereClause}
            ORDER BY checkin_date DESC, id DESC
        `; 
		
		const [containerRows] = await pool.execute<ContainerData[]>(dataSql, params);

		// สร้าง Workbook และ Worksheet ด้วย exceljs
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Container Status');

		// กำหนดหัวคอลัมน์ (Header)
		worksheet.columns = [
			{ header: 'Container No', key: 'container_no', width: 20 },
			{ header: 'Plan No', key: 'plan_no', width: 20 },
			{ header: 'Model', key: 'model', width: 25 },
			{ header: 'Type', key: 'type', width: 15 },
			{ header: 'House BL', key: 'house_bl', width: 20 },
			{ header: 'ETD Date', key: 'etd_date', width: 15 },
			{ header: 'ATA Date', key: 'ata_date', width: 15 },
			{ header: 'Check-in Date', key: 'checkin_date', width: 20 }
		];

		// ตกแต่งหัวตารางให้เป็นตัวหนาและมีสีพื้นหลัง
		worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFD3D3D3' } // สีเทาอ่อน
		};

		// วนลูปเพื่อใส่ข้อมูลลงไปในแต่ละแถว
		containerRows.forEach(row => {
			worksheet.addRow({
				container_no: row.container_no,
				plan_no: row.plan_no || '-',
				model: row.model || '-',
				type: row.type || '-',
				house_bl: row.house_bl || '-',
				etd_date: row.etd_date ? new Date(row.etd_date).toLocaleDateString('en-GB') : '-',
				ata_date: row.ata_date ? new Date(row.ata_date).toLocaleDateString('en-GB') : '-',
				checkin_date: row.checkin_date ? new Date(row.checkin_date).toLocaleString('en-GB', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '-'
			});
		});

		// แปลงไฟล์เป็น Buffer เพื่อเตรียมส่งให้ Client ดาวน์โหลด
		const buffer = await workbook.xlsx.writeBuffer();

		// สร้างชื่อไฟล์แนบวันที่
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