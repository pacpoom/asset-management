import type { PageServerLoad } from './$types';
import { cymspool } from '$lib/server/database'; // ตรวจสอบ path ให้ตรงกับ project
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	// 1. รับค่าจาก URL Parameters สำหรับ Paging และ Search
	const page = Number(url.searchParams.get('page')) || 1;
	const limit = Number(url.searchParams.get('limit')) || 10;
	const searchQuery = url.searchParams.get('search') || '';

	const offset = (page - 1) * limit;

	try {
		// Base Queries
		let query = `
			SELECT 
				p.id, p.plan_no, p.model, p.type, p.house_bl, 
				p.week_lot, p.eta_date, p.status,
				c.container_no, c.size, c.agent
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

		// 2. จัดการเงื่อนไขการค้นหา (Search)
		if (searchQuery) {
			const searchPattern = `%${searchQuery}%`;
			const whereClause = ` WHERE p.plan_no LIKE ? OR c.container_no LIKE ? OR p.house_bl LIKE ?`;
			
			query += whereClause;
			countQuery += whereClause;
			
			queryParams.push(searchPattern, searchPattern, searchPattern);
			countParams.push(searchPattern, searchPattern, searchPattern);
		}

		// 3. เพิ่มการจัดเรียงและ Pagination (LIMIT / OFFSET)
		query += ` ORDER BY p.id DESC LIMIT ? OFFSET ?`;
		queryParams.push(limit, offset);

		// 4. Query ข้อมูลทั้งหมด (นับจำนวนทั้งหมด และ ดึงข้อมูลตามหน้า)
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