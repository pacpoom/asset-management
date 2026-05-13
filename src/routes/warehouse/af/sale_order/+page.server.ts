import type { PageServerLoad } from './$types';
import { afpool } from '$lib/server/database'; 
import type { RowDataPacket } from 'mysql2';

export const load: PageServerLoad = async ({ url }) => {
	// 1. รับค่าจาก URL Query Parameters
	const createDateStart = url.searchParams.get('create_date_start')?.trim() || '';
	const createDateEnd = url.searchParams.get('create_date_end')?.trim() || '';
	const saleOrder = url.searchParams.get('sale_order')?.trim() || '';
	const deliveryNo = url.searchParams.get('delivery_no')?.trim() || '';
	const materialNumber = url.searchParams.get('material_number')?.trim() || '';

	// รับค่า Paging
	const pageParam = url.searchParams.get('page');
	const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;

	// รับค่า limit สำหรับทำ Paging และ Validate
	const limitParam = url.searchParams.get('limit');
	const allowedLimits = [10, 20, 50, 200];
	const limit = limitParam && allowedLimits.includes(Number(limitParam)) ? Number(limitParam) : 50;

	// คำนวณ Offset
	const offset = (page - 1) * limit;

	const hasSearch = createDateStart || createDateEnd || saleOrder || deliveryNo || materialNumber;
	const queryData = { createDateStart, createDateEnd, saleOrder, deliveryNo, materialNumber, limit };

	// ถ้าไม่มีการค้นหา ให้ส่งค่าว่างกลับไป
	if (!hasSearch) {
		return {
			orders: [],
			searched: false,
			limit,
			query: queryData,
			currentPage: 1,
			totalPages: 0,
			total: 0
		};
	}

	try {
		// 2. สร้างเงื่อนไข WHERE Clause แบบ Dynamic
		let whereClause = 'WHERE 1=1';
		const values: any[] = [];

		// จัดการเงื่อนไขค้นหาช่วงเวลา
		if (createDateStart && createDateEnd) {
			whereClause += ' AND so.Create_date >= ? AND so.Create_date <= ?';
			values.push(createDateStart, createDateEnd);
		} else if (createDateStart) {
			whereClause += ' AND so.Create_date >= ?';
			values.push(createDateStart);
		} else if (createDateEnd) {
			whereClause += ' AND so.Create_date <= ?';
			values.push(createDateEnd);
		}

		if (saleOrder) {
			whereClause += ' AND so.Sale_order LIKE ?';
			values.push(`%${saleOrder}%`);
		}
		if (deliveryNo) {
			whereClause += ' AND so.Delivery_no LIKE ?';
			values.push(`%${deliveryNo}%`);
		}
		if (materialNumber) {
			whereClause += ' AND so.Material_number LIKE ?';
			values.push(`%${materialNumber}%`);
		}

		// 3. นับจำนวนข้อมูลทั้งหมด (Count) ก่อน เพื่อหา Total Pages
		const countSql = `
			SELECT COUNT(*) as total 
			FROM sale_order so
			LEFT JOIN customer_masters cm ON so.Customer_code = cm.customer_code
			${whereClause}
		`;
		const [countResult] = await afpool.execute<RowDataPacket[]>(countSql, values);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		let rows: any[] = [];

		// 4. ดึงข้อมูลจริง (ต่อเมื่อมีข้อมูลมากกว่า 0)
		if (total > 0) {
			const dataSql = `
				SELECT 
					so.*, 
					cm.customer_name 
				FROM sale_order so
				LEFT JOIN customer_masters cm ON so.Customer_code = cm.customer_code
				${whereClause}
				ORDER BY so.SEQ DESC 
				LIMIT ${limit} OFFSET ${offset}
			`;
			const [dataResult] = await afpool.execute<RowDataPacket[]>(dataSql, values);
			rows = dataResult as any[];
		}

		return {
			orders: rows,
			searched: true,
			limit,
			query: queryData,
			currentPage: page,
			totalPages,
			total
		};

	} catch (error) {
		console.error('Database Error:', error);
		return {
			orders: [],
			searched: true,
			error: 'เกิดข้อผิดพลาดในการค้นหาข้อมูลจากฐานข้อมูล',
			limit,
			query: queryData,
			currentPage: 1,
			totalPages: 0,
			total: 0
		};
	}
};