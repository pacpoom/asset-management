import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async ({ url }) => {
	// รับค่าจาก URL params
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';
	const offset = (page - 1) * limit;

	// คำนวณวันที่เริ่มต้นและสิ้นสุดของเดือนปัจจุบันเป็น Default
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	// แปลงเป็น YYYY-MM-DD โดยคำนึงถึง Timezone (ใช้ Timezone ปัจจุบันเพื่อหลีกเลี่ยงวันที่เลื่อน)
	const formatYMD = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	};

	const defaultStart = formatYMD(firstDay);
	const defaultEnd = formatYMD(lastDay);

	const startDate = url.searchParams.get('startDate') || defaultStart;
	const endDate = url.searchParams.get('endDate') || defaultEnd;

	// บังคับกรองด้วยวันที่เสมอ
	let whereClause = 'WHERE j.job_date >= ? AND j.job_date <= ?';
	let queryParams: any[] = [startDate, endDate];

	// ถ้ามีการค้นหา ให้เพิ่มเงื่อนไข AND
	if (search) {
		whereClause += ` AND (
			j.job_number LIKE ? 
			OR c.name LIKE ? 
			OR c.company_name LIKE ? 
			OR v.name LIKE ? 
			OR v.company_name LIKE ?
		)`;
		const searchParam = `%${search}%`;
		queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
	}

	// Query สำหรับนับจำนวนข้อมูลทั้งหมดตามคำค้นหาและช่วงเวลา
	const countSql = `
		SELECT COUNT(j.id) as total 
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
		${whereClause}
	`;
	const [countRows] = await pool.query(countSql, queryParams);
	const totalJobs = (countRows as any[])[0].total;

	// Query ดึงข้อมูลจริง 
	const sql = `
		SELECT j.*, 
		       c.name as customer_name, c.company_name, c.phone as customer_phone,
		       v.name as vendor_name, v.company_name as vendor_company_name, v.phone as vendor_phone,
               u.full_name as created_by_name
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
        LEFT JOIN users u ON j.created_by = u.id
		${whereClause}
		ORDER BY j.job_date DESC, j.id DESC
		LIMIT ${Number(limit)} OFFSET ${Number(offset)}
	`;
	
	const [rows] = await pool.query(sql, queryParams);
	
	return { 
		job_orders: JSON.parse(JSON.stringify(rows)),
		pagination: {
			total: totalJobs,
			page,
			limit,
			search,
			startDate,
			endDate
		}
	};
};

export const actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) {
			return fail(400, { message: 'ไม่พบ ID ของรายการที่ต้องการลบ' });
		}

		try {
			await pool.query('DELETE FROM job_orders WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
		}
	}
};