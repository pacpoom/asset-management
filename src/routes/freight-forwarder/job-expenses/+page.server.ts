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
	// รับค่า viewBy ว่าจะดูตามหมวดหมู่ หรือ รายการย่อย
	const viewBy = url.searchParams.get('viewBy') || 'category'; 

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

	// 3. ดึงข้อมูลค่าใช้จ่ายและ Join กับ Job, Items, Categories
	const groupByCol = viewBy === 'item' ? 'ei.id' : 'ec.id';
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
		WHERE j.job_date >= ? AND j.job_date <= ?
		GROUP BY j.id, ${groupByCol}
		ORDER BY j.job_date DESC, j.id DESC
	`;

	const [expenseRows] = await pool.query(sql, [startDate, endDate]);

	// 4. ทำการแปลงข้อมูลให้อยู่ในรูปแบบ Pivot (1 Job = 1 Row, Columns ตามที่เลือก)
	const pivotMap = new Map();

	for (const row of (expenseRows as any[])) {
		if (!pivotMap.has(row.job_id)) {
			pivotMap.set(row.job_id, {
				job_id: row.job_id,
				job_number: row.job_number || `JOB-${row.job_id}`,
				job_date: row.job_date,
				customer: row.company_name || row.customer_name || 'ไม่ระบุ',
				expenses: {}, // เก็บแยกตาม col_id (category_id หรือ item_id)
				total: 0 // ยอดรวมของ Job นั้น
			});
		}

		const jobData = pivotMap.get(row.job_id);
		const amount = Number(row.total_amount);

		jobData.expenses[row.col_id] = amount;
		jobData.total += amount;
	}

	return {
		columns: JSON.parse(JSON.stringify(columnsData)),
		pivotData: JSON.parse(JSON.stringify(Array.from(pivotMap.values()))),
		filters: { startDate, endDate, viewBy }
	};
};