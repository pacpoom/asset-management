import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { cymspool } from '$lib/server/database';
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

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const defaultDate = `${year}-${month}-${day}`;

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';

	const startDateParam = url.searchParams.get('startDate');
	const startDate = startDateParam !== null ? startDateParam : defaultDate;

	const endDateParam = url.searchParams.get('endDate');
	const endDate = endDateParam !== null ? endDateParam : defaultDate;
	const ownerFilter = url.searchParams.get('owner') || '';

	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) limit = 10;

	const offset = (page - 1) * limit;

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

		// ใช้การนับจำนวนปกติ ลบการ join กับ container_stocks ออก พร้อมนับยอด LCB (status=1), Total Received (status>=2) และ Total Returned (status=4)
		const countSql = `
			SELECT 
				COUNT(*) as total,
				SUM(CASE WHEN p.status = 1 THEN 1 ELSE 0 END) as total_lcb,
				SUM(CASE WHEN p.status >= 2 THEN 1 ELSE 0 END) as total_received,
				SUM(CASE WHEN p.status = 4 THEN 1 ELSE 0 END) as total_returned
            FROM container_order_plans p
            LEFT JOIN containers c ON p.container_id = c.id 
            ${whereClause}
		`;

		const [countResult] = await cymspool.query<any[]>(countSql, params);

		const totalCount = countResult[0].total || 0;
		const totalLCB = Number(countResult[0].total_lcb) || 0;
		const totalReceived = Number(countResult[0].total_received) || 0;
		const totalReturned = Number(countResult[0].total_returned) || 0;
		const totalPages = Math.ceil(totalCount / limit);

		// ลบการ join กับ container_stocks และ GROUP BY ออก
		const dataSql = `
            SELECT p.*, c.container_no, c.size, c.agent,
                   c.container_owner
            FROM container_order_plans p
            LEFT JOIN containers c ON p.container_id = c.id
            ${whereClause}
            ORDER BY p.checkin_date ASC, p.id ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

		const [containerRows] = await cymspool.query<any[]>(dataSql, params);
		const [ownerRows]: any[] = await cymspool.execute(
			`SELECT DISTINCT container_owner FROM containers WHERE container_owner IS NOT NULL AND container_owner != '' ORDER BY container_owner ASC`
		);
		const owners = ownerRows.map((r: any) => r.container_owner);

		return {
			containers: containerRows,
			totalCount,
			totalLCB,
			totalReceived,
			totalReturned,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			startDate,
			endDate,
			ownerFilter,
			owners
		};
	} catch (err) {
		console.error('Failed to load container status:', err);
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to load data. Error: ${errorMessage}`);
	}
};