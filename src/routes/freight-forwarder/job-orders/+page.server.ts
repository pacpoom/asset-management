import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async ({ url, locals }) => {
	// รับค่าจาก URL params
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';
	const offset = (page - 1) * limit;

	// คำนวณวันที่เริ่มต้น (ย้อนหลัง 1 เดือน) และสิ้นสุดของเดือนปัจจุบันเป็น Default
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	// แปลงเป็น YYYY-MM-DD โดยคำนึงถึง Timezone
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

	// ตรวจสอบสิทธิ์: admin เห็นทุก job, user ทั่วไปเห็นเฉพาะของตัวเอง
	const currentUser = locals.user;
	const isAdmin = currentUser?.role === 'admin_freight';

	// บังคับกรองด้วยวันที่เสมอ
	let whereClause = 'WHERE j.job_date >= ? AND j.job_date <= ?';
	const queryParams: (string | number)[] = [startDate, endDate];

	// กรองเฉพาะ job ของตัวเองถ้าไม่ใช่ admin
	if (!isAdmin && currentUser?.id) {
		whereClause += ' AND j.created_by = ?';
		queryParams.push(currentUser.id);
	}

	// ถ้ามีการค้นหา ให้เพิ่มเงื่อนไข AND
	if (search) {
		whereClause += ` AND (
			j.job_number LIKE ? 
			OR c.name LIKE ? 
			OR c.company_name LIKE ? 
			OR v.name LIKE ? 
			OR v.company_name LIKE ?
			OR j.invoice_no LIKE ?
			OR j.ccl LIKE ?
		)`;
		const searchParam = `%${search}%`;
		queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
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
	const totalJobs = (countRows as { total: number }[])[0].total;

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

	// Alert: ดึงรายการ Job ที่มีตู้ยังไม่ checkout และ ETA ใกล้ถึง/เลยแล้ว
	// admin_freight เห็นทั้งหมด, user ทั่วไปเห็นเฉพาะ job ของตัวเอง
	// ใช้ try/catch เผื่อกรณียังไม่ได้รัน migration เพิ่มคอลัมน์ status
	let alertRows: unknown[] = [];
	try {
		const alertParams: (string | number)[] = [];
		let alertWhere = `WHERE j.eta IS NOT NULL
			  AND (
			    (j.demurrage_days IS NULL AND j.storage_days IS NULL AND j.detention_days IS NULL
			     AND DATEDIFF(CURDATE(), j.eta) >= -3)
			    OR (j.demurrage_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.demurrage_days DAY)) >= -3)
			    OR (j.storage_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.storage_days DAY)) >= -3)
			    OR (j.detention_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.detention_days DAY)) >= -3)
			  )
			  AND j.job_status NOT IN ('Cancelled', 'Completed')`;

		if (!isAdmin && currentUser?.id) {
			alertWhere += ' AND j.created_by = ?';
			alertParams.push(currentUser.id);
		}

		const alertSql = `
			SELECT j.id, j.job_number, j.eta, j.expire_date,
			       j.demurrage_days, j.storage_days, j.detention_days,
			       COALESCE(c.company_name, c.name) as customer_name,
			       COUNT(jc.id) as pending_count,
			       DATEDIFF(CURDATE(), j.eta) as days_since_eta,
			       IF(j.demurrage_days IS NOT NULL, DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.demurrage_days DAY)), NULL) as days_overdue_demurrage,
			       IF(j.storage_days IS NOT NULL, DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.storage_days DAY)), NULL) as days_overdue_storage,
			       IF(j.detention_days IS NOT NULL, DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.detention_days DAY)), NULL) as days_overdue_detention
			FROM job_orders j
			JOIN job_containers jc ON jc.job_order_id = j.id AND jc.status = 'pending'
			LEFT JOIN customers c ON j.customer_id = c.id
			${alertWhere}
			GROUP BY j.id, j.job_number, j.eta, j.expire_date, j.demurrage_days, j.storage_days, j.detention_days, c.company_name, c.name
			ORDER BY days_since_eta DESC
		`;
		const [_alertRows] = await pool.query(alertSql, alertParams);
		alertRows = _alertRows as unknown[];
	} catch {
		// คอลัมน์ status ยังไม่มีในตาราง — รอ migration ก่อน
	}

	return {
		job_orders: JSON.parse(JSON.stringify(rows)),
		containerAlerts: JSON.parse(JSON.stringify(alertRows)),
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
	},

	bulkUpdateStatus: async ({ request }) => {
		const formData = await request.formData();
		const ids = formData.getAll('ids[]');
		const status = formData.get('status') as string;

		if (!ids.length) {
			return fail(400, { message: 'ไม่พบรายการที่ต้องการอัปเดต' });
		}

		const validStatuses = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
		if (!status || !validStatuses.includes(status)) {
			return fail(400, { message: 'Status ไม่ถูกต้อง' });
		}

		try {
			const placeholders = ids.map(() => '?').join(', ');
			await pool.query(
				`UPDATE job_orders SET job_status = ? WHERE id IN (${placeholders})`,
				[status, ...ids]
			);
			return { success: true, updatedCount: ids.length };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ' });
		}
	}
};