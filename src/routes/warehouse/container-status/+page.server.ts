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
	const statusFilter = url.searchParams.get('status') || '';

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

		const countSql = `
			SELECT 
                COUNT(p.id) as total,
                SUM(CASE WHEN cs.status = 1 THEN 1 ELSE 0 END) as fullCount,
                SUM(CASE WHEN cs.status = 3 THEN 1 ELSE 0 END) as emptyCount,
                SUM(CASE WHEN cs.status = 1 OR cs.status = 3 THEN 0 ELSE 1 END) as partialCount
			FROM container_order_plans p
			LEFT JOIN containers c ON p.container_id = c.id 
            LEFT JOIN container_stocks cs ON p.id = cs.container_order_plan_id
			${whereClause}
		`;

		const [countResult] = await cymspool.query<any[]>(countSql, params);

		const totalCount = countResult[0].total || 0;
		const fullCount = countResult[0].fullCount || 0;
		const partialCount = countResult[0].partialCount || 0;
		const emptyCount = countResult[0].emptyCount || 0;
		const totalPages = Math.ceil(totalCount / limit);

		const dataSql = `
            SELECT p.*, c.container_no, c.size, c.agent,
            cs.status AS stock_status 
            FROM container_order_plans p
            LEFT JOIN containers c ON p.container_id = c.id
            LEFT JOIN container_stocks cs ON p.id = cs.container_order_plan_id 
            ${whereClause}
            ORDER BY p.checkin_date DESC, p.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

		const [containerRows] = await cymspool.query<any[]>(dataSql, params);

		return {
			containers: containerRows,
			totalCount,
			fullCount,
			partialCount,
			emptyCount,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			startDate,
			endDate,
			statusFilter
		};
	} catch (err) {
		console.error('Failed to load container status:', err);
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to load data. Error: ${errorMessage}`);
	}
};
