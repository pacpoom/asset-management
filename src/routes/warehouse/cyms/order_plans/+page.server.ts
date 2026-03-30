import type { PageServerLoad } from './$types';
import { cymspool } from '$lib/server/database';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	const page = Number(url.searchParams.get('page')) || 1;
	const limit = Number(url.searchParams.get('limit')) || 10;
	const searchQuery = url.searchParams.get('search') || '';

	const offset = (page - 1) * limit;

	try {
		let query = `
        SELECT 
            p.*, 
            c.container_no, 
            c.size, 
            c.agent
        FROM container_order_plans p
        LEFT JOIN containers c ON p.container_id = c.id
    `;

		let countQuery = `
        SELECT COUNT(p.id) as total 
        FROM container_order_plans p
        LEFT JOIN containers c ON p.container_id = c.id
    `;

		const queryParams: any[] = [];
		const countParams: any[] = [];

		if (searchQuery) {
			const searchPattern = `%${searchQuery}%`;
			const whereClause = ` WHERE p.plan_no LIKE ? OR c.container_no LIKE ? OR p.house_bl LIKE ?`;

			query += whereClause;
			countQuery += whereClause;

			queryParams.push(searchPattern, searchPattern, searchPattern);
			countParams.push(searchPattern, searchPattern, searchPattern);
		}

		query += ` ORDER BY c.container_no ASC LIMIT ? OFFSET ?`;
		queryParams.push(limit, offset);

		const [countResult] = await cymspool.query<any[]>(countQuery, countParams);
		const [plans] = await cymspool.query<any[]>(query, queryParams);

		const total = countResult[0].total;

		return {
			plans,
			pagination: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit)
			},
			searchQuery
		};
	} catch (err) {
		console.error('Error fetching container plans:', err);
		throw error(500, 'เกิดข้อผิดพลาดในการดึงข้อมูล Container Plans');
	}
};
