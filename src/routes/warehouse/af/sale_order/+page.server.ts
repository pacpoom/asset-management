import type { PageServerLoad } from './$types';
import { afpool } from '$lib/server/database'; 
import type { RowDataPacket } from 'mysql2';

export const load: PageServerLoad = async ({ url }) => {
	// 1. รับค่าจาก URL Query Parameters
	const createDate = url.searchParams.get('create_date')?.trim() || '';
	const saleOrder = url.searchParams.get('sale_order')?.trim() || '';
	const deliveryNo = url.searchParams.get('delivery_no')?.trim() || '';
	const materialNumber = url.searchParams.get('material_number')?.trim() || '';

	// รับค่า limit สำหรับทำ Paging และ Validate ให้อยู่ในค่าที่กำหนดเท่านั้น
	const limitParam = url.searchParams.get('limit');
	const allowedLimits = [10, 20, 50, 200];
	const limit = limitParam && allowedLimits.includes(Number(limitParam)) ? Number(limitParam) : 50;

	const hasSearch = createDate || saleOrder || deliveryNo || materialNumber;
	const queryData = { createDate, saleOrder, deliveryNo, materialNumber, limit };

	if (!hasSearch) {
		return {
			orders: [],
			searched: false,
			limit,
			query: queryData
		};
	}

	try {
		// 2. สร้าง SQL Query แบบ Dynamic 
		let sql = 'SELECT * FROM sale_order WHERE 1=1';
		const values: any[] = [];

		if (createDate) {
			sql += ' AND Create_date = ?';
			values.push(createDate);
		}
		if (saleOrder) {
			sql += ' AND Sale_order LIKE ?';
			values.push(`%${saleOrder}%`);
		}
		if (deliveryNo) {
			sql += ' AND Delivery_no LIKE ?';
			values.push(`%${deliveryNo}%`);
		}
		if (materialNumber) {
			sql += ' AND Material_number LIKE ?';
			values.push(`%${materialNumber}%`);
		}

		// ⭐️ แก้ไขตรงนี้: นำ ? ออกแล้วฝังตัวเลข limit เข้าไปใน String SQL ตรงๆ
		// (ปลอดภัยเพราะตรวจสอบด้วย array allowedLimits แล้ว)
		sql += ` ORDER BY SEQ DESC LIMIT ${limit}`;

		// 3. เรียกใช้ Database Pool
		const [rows] = await afpool.execute<RowDataPacket[]>(sql, values);

		return {
			orders: rows,
			searched: true,
			limit,
			query: queryData
		};

	} catch (error: any) {
		console.error('Failed to fetch sale orders:', error);
		return {
			orders: [],
			searched: true,
			limit,
			query: queryData,
			error: 'เกิดข้อผิดพลาดในการดึงข้อมูลจากฐานข้อมูล: ' + (error.message || error)
		};
	}
};
