import pool from '$lib/server/database';

export const load = async ({ url }) => {
	// 1. จัดการวันที่ (Default เป็นเดือนปัจจุบัน)
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	const formatYMD = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	};

	const startDate = url.searchParams.get('startDate') || formatYMD(firstDay);
	const endDate = url.searchParams.get('endDate') || formatYMD(lastDay);
	const viewBy = url.searchParams.get('viewBy') || 'category'; 

	// --- Pagination Setup ---
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) {
		limit = 10;
	}
	const offset = (page - 1) * limit;

	// 2. ดึงหมวดหมู่หรือรายการมาทำเป็นคอลัมน์ (Columns)
	let columnsData = [];
	if (viewBy === 'item') {
		const [itemRows] = await pool.query(
			'SELECT id, item_name as name FROM expense_items ORDER BY item_name ASC'
		);
		columnsData = itemRows as any[];
	} else {
		const [categoryRows] = await pool.query(
			'SELECT id, category_name as name FROM expense_categories ORDER BY id ASC'
		);
		columnsData = categoryRows as any[];
	}

	const groupByCol = viewBy === 'item' ? 'ei.id' : 'ec.id';

	// 3. นับจำนวน Job ทั้งหมดที่มีค่าใช้จ่ายในช่วงเวลานั้น (เพื่อทำ Paging)
	const countSql = `
		SELECT COUNT(DISTINCT j.id) as total
		FROM job_expenses je
		INNER JOIN job_orders j ON je.job_order_id = j.id
		WHERE j.job_date >= ? AND j.job_date <= ?
	`;
	const [countResult] = await pool.query(countSql, [startDate, endDate]);
	const totalJobs = (countResult as any[])[0].total;
	const totalPages = Math.ceil(totalJobs / limit);

	// 4. ดึงเฉพาะ Job ID สำหรับหน้าปัจจุบัน (Limit & Offset)
	const jobIdsSql = `
		SELECT j.id
		FROM job_orders j
		INNER JOIN job_expenses je ON je.job_order_id = j.id
		WHERE j.job_date >= ? AND j.job_date <= ?
		GROUP BY j.id, j.job_date
		ORDER BY j.job_date DESC, j.id DESC
		LIMIT ${limit} OFFSET ${offset}
	`;
	const [jobIdRows] = await pool.query(jobIdsSql, [startDate, endDate]);
	const jobIds = (jobIdRows as any[]).map(row => row.id);

	let finalPivotData = [];

	// 5. ดึงข้อมูลค่าใช้จ่ายเฉพาะ Job IDs ที่อยู่ในหน้านี้
	if (jobIds.length > 0) {
		const placeholders = jobIds.map(() => '?').join(',');
		const sql = `
			SELECT 
				j.id AS job_id, 
				j.job_number, 
				j.job_date, 
				c.company_name, 
				c.name AS customer_name,
				${groupByCol} AS col_id, 
				SUM(je.total_amount) AS total_amount
			FROM job_expenses je
			INNER JOIN job_orders j ON je.job_order_id = j.id
			LEFT JOIN customers c ON j.customer_id = c.id
			INNER JOIN expense_items ei ON je.expense_item_id = ei.id
			INNER JOIN expense_categories ec ON ei.expense_category_id = ec.id
			WHERE j.id IN (${placeholders})
			GROUP BY j.id, ${groupByCol}
			ORDER BY j.job_date DESC, j.id DESC
		`;

		const [expenseRows] = await pool.query(sql, jobIds);

		// ทำการแปลงข้อมูลให้อยู่ในรูปแบบ Pivot (1 Job = 1 Row)
		const pivotMap = new Map();
		for (const row of (expenseRows as any[])) {
			if (!pivotMap.has(row.job_id)) {
				pivotMap.set(row.job_id, {
					job_id: row.job_id,
					job_number: row.job_number || `JOB-${row.job_id}`,
					job_date: row.job_date,
					customer: row.company_name || row.customer_name || 'ไม่ระบุ',
					expenses: {}, 
					total: 0 
				});
			}
			const jobData = pivotMap.get(row.job_id);
			const amount = Number(row.total_amount);
			jobData.expenses[row.col_id] = amount;
			jobData.total += amount;
		}
		
		// แปลง Map เป็น Array เพื่อเรียงลำดับให้ตรงกับ Job IDs ต้นฉบับ
		finalPivotData = jobIds.map(id => pivotMap.get(id)).filter(Boolean);
	}

	// 6. คำนวณยอดรวมทั้งหมดของทุกหน้า (Grand Totals) จากฝั่ง Server
	const overallTotals = { cols: {} as Record<number, number>, grand: 0 };
	const totalSql = `
		SELECT ${groupByCol} AS col_id, SUM(je.total_amount) AS total_amount
		FROM job_expenses je
		INNER JOIN job_orders j ON je.job_order_id = j.id
		INNER JOIN expense_items ei ON je.expense_item_id = ei.id
		INNER JOIN expense_categories ec ON ei.expense_category_id = ec.id
		WHERE j.job_date >= ? AND j.job_date <= ?
		GROUP BY ${groupByCol}
	`;
	const [totalRows] = await pool.query(totalSql, [startDate, endDate]);
	for (const row of (totalRows as any[])) {
		const amt = Number(row.total_amount);
		overallTotals.cols[row.col_id] = amt;
		overallTotals.grand += amt;
	}

	return {
		columns: columnsData,
		pivotData: finalPivotData,
		overallTotals: overallTotals,
		pagination: {
			currentPage: page,
			totalPages,
			limit,
			totalItems: totalJobs
		},
		filters: { startDate, endDate, viewBy }
	};
};