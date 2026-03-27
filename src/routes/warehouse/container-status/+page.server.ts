import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
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

export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view container status');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const startDate = url.searchParams.get('startDate') || '';
	const endDate = url.searchParams.get('endDate') || '';

	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) limit = 10;
	
	const offset = (page - 1) * limit;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		// ค้นหาตามเลขตู้ (Container No), Plan No, หรือ House BL
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

		// ค้นหาตามช่วงวันที่ (อ้างอิงจาก checkin_date เป็นหลัก สามารถเปลี่ยนเป็น ata_date ได้)
		if (startDate) {
			whereClause += ` AND DATE(checkin_date) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(checkin_date) <= ? `;
			params.push(endDate);
		}

		// นับจำนวนทั้งหมด (แสดงจำนวนตู้)
		const countSql = `SELECT COUNT(id) as total FROM container_status ${whereClause}`;
		const [countResult] = await pool.execute<RowDataPacket[]>(countSql, params);
		const totalCount = countResult[0].total;
		const totalPages = Math.ceil(totalCount / limit);

		// ดึงข้อมูล
		const dataSql = `
            SELECT *
            FROM container_status
            ${whereClause}
            ORDER BY checkin_date DESC, id DESC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [containerRows] = await pool.execute<ContainerData[]>(dataSql, params);

		return {
			containers: containerRows,
			totalCount,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			startDate,
			endDate
		};
	} catch (err) {
		console.error('Failed to load container status:', err);
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to load data. Error: ${errorMessage}`);
	}
};