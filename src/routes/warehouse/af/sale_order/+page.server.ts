import type { PageServerLoad } from './$types';
import { afpool } from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

function toBangkokDateString(offsetDays = 0): string {
	const now = new Date();
	const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
	return bkk.toISOString().split('T')[0];
}

// แปลง YYYY-MM-DD → YYYYMMDD สำหรับ filter Delivery_Date (varchar)
function toCompactDate(dateStr: string): string {
	return dateStr.replace(/-/g, '');
}

export const load: PageServerLoad = async ({ url }) => {
	const today = toBangkokDateString(0);
	const yesterday = toBangkokDateString(-1);

	const createDateStart = url.searchParams.get('create_date_start')?.trim() || yesterday;
	const createDateEnd = url.searchParams.get('create_date_end')?.trim() || today;
	const saleOrder = url.searchParams.get('sale_order')?.trim() || '';
	const deliveryNo = url.searchParams.get('delivery_no')?.trim() || '';
	const materialNumber = url.searchParams.get('material_number')?.trim() || '';
	const deliveryDateStart = url.searchParams.get('delivery_date_start')?.trim() || '';
	const deliveryDateEnd = url.searchParams.get('delivery_date_end')?.trim() || '';

	// รับค่า Paging
	const pageParam = url.searchParams.get('page');
	const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;

	// รับค่า limit สำหรับทำ Paging และ Validate
	const limitParam = url.searchParams.get('limit');
	const allowedLimits = [10, 20, 50, 200];
	const limit = limitParam && allowedLimits.includes(Number(limitParam)) ? Number(limitParam) : 10;

	// คำนวณ Offset
	const offset = (page - 1) * limit;

	const queryData = { createDateStart, createDateEnd, saleOrder, deliveryNo, materialNumber, deliveryDateStart, deliveryDateEnd, limit };

	try {
		// สร้างเงื่อนไข WHERE Clause แบบ Dynamic
		let whereClause = 'WHERE 1=1';
		const values: any[] = [];

		whereClause += ' AND DATE(so.Create_date) >= ? AND DATE(so.Create_date) <= ?';
		values.push(createDateStart, createDateEnd);

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
		// Delivery_Date เก็บเป็น varchar YYYYMMDD จึง filter ด้วย string comparison
		if (deliveryDateStart) {
			whereClause += ' AND so.Delivery_Date >= ?';
			values.push(toCompactDate(deliveryDateStart));
		}
		if (deliveryDateEnd) {
			whereClause += ' AND so.Delivery_Date <= ?';
			values.push(toCompactDate(deliveryDateEnd));
		}

		// Summary สำหรับ Dashboard Cards
		const summarySql = `
			SELECT
				COUNT(*) as total,
				SUM(CASE WHEN (COALESCE(so.Planed_quantity, 0) - COALESCE(so.Ship_Qty, 0)) = 0 THEN 1 ELSE 0 END) as complete_count,
				SUM(CASE WHEN (COALESCE(so.Planed_quantity, 0) - COALESCE(so.Ship_Qty, 0)) > 0 THEN 1 ELSE 0 END) as pending_count,
				SUM(COALESCE(so.Planed_quantity, 0)) as total_planed_qty,
				SUM(COALESCE(so.Ship_Qty, 0)) as total_ship_qty,
				SUM(COALESCE(so.Planed_quantity, 0) - COALESCE(so.Ship_Qty, 0)) as total_balance
			FROM sale_order so
			LEFT JOIN customer_masters cm ON so.Customer_code = cm.customer_code
			${whereClause}
		`;
		const [summaryResult] = await afpool.execute<RowDataPacket[]>(summarySql, values);
		const summary = {
			total: summaryResult[0].total || 0,
			completeCount: summaryResult[0].complete_count || 0,
			pendingCount: summaryResult[0].pending_count || 0,
			totalPlanedQty: summaryResult[0].total_planed_qty || 0,
			totalShipQty: summaryResult[0].total_ship_qty || 0,
			totalBalance: summaryResult[0].total_balance || 0
		};

		const total = summary.total;
		const totalPages = Math.ceil(total / limit);

		let rows: any[] = [];

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
			total,
			summary
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
			total: 0,
			summary: { total: 0, completeCount: 0, pendingCount: 0, totalPlanedQty: 0, totalShipQty: 0, totalBalance: 0 }
		};
	}
};
