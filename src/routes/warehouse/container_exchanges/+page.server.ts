import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { cymspool } from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

export const load: PageServerLoad = async ({ url, locals }) => {
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

	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) limit = 10;

	const offset = (page - 1) * limit;

	try {
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

		const countSql = `
            SELECT COUNT(ce.id) as total 
            FROM container_exchanges ce
            LEFT JOIN containers c1 ON ce.source_container_id = c1.id
            LEFT JOIN containers c2 ON ce.destination_container_id = c2.id
            ${whereClause}
        `;
		const [countResult] = await cymspool.query<any[]>(countSql, params);
		const totalCount = countResult[0].total;
		const totalPages = Math.ceil(totalCount / limit);

		const dataSql = `
            SELECT 
                ce.*, 
                c1.container_no AS source_container_no,
                c2.container_no AS dest_container_no,
                u.name AS user_name
            FROM container_exchanges ce
            LEFT JOIN containers c1 ON ce.source_container_id = c1.id
            LEFT JOIN containers c2 ON ce.destination_container_id = c2.id
            LEFT JOIN users u ON ce.user_id = u.id
            ${whereClause}
            ORDER BY ce.exchange_date DESC, ce.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

		const [exchangeRows] = await cymspool.query<any[]>(dataSql, params);

		return {
			exchanges: exchangeRows,
			totalCount,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			startDate,
			endDate
		};
	} catch (err) {
		console.error('Failed to load container exchanges:', err);
		throw error(500, 'Failed to load container exchange data.');
	}
};
