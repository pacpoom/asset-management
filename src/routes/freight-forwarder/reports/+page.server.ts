import pool from '$lib/server/database';

export const load = async ({ url }) => {
	// 1. จัดการ Default เป็นเดือนปัจจุบัน (YYYY-MM)
	const now = new Date();
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	const selectedMonth = url.searchParams.get('month') || currentMonth;

	// คำนวณ startDate และ endDate จากเดือนที่เลือก
	const [year, month] = selectedMonth.split('-');
	const startDate = `${year}-${month}-01`;
	const lastDay = new Date(Number(year), Number(month), 0).getDate();
	const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

	try {
		const [financialStats]: any = await pool.query(
			`
			SELECT 
				j.currency,
				COUNT(j.id) as job_count,
				SUM(
					COALESCE(
						(SELECT SUM(total_amount) FROM sales_documents s WHERE s.job_order_id = j.id AND s.status != 'Void'),
						j.amount, 0
					)
				) as total_revenue,
				SUM(
					COALESCE(
						(SELECT SUM(total_amount) FROM job_expenses e WHERE e.job_order_id = j.id),
						0
					)
				) as total_expense
			FROM job_orders j
			WHERE j.job_date BETWEEN ? AND ?
			GROUP BY j.currency
		`,
			[startDate, endDate]
		);

		const [jobTypeStats]: any = await pool.query(
			`
			SELECT job_type, COUNT(*) as count
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
			GROUP BY job_type
		`,
			[startDate, endDate]
		);

		const [serviceTypeStats]: any = await pool.query(
			`
			SELECT service_type, COUNT(*) as count
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
			GROUP BY service_type
		`,
			[startDate, endDate]
		);

		const [topCustomers]: any = await pool.query(
			`
			SELECT 
				c.company_name, 
				COUNT(j.id) as job_count, 
				SUM(
					COALESCE(
						(SELECT SUM(total_amount) FROM sales_documents s WHERE s.job_order_id = j.id AND s.status != 'Void'),
						j.amount, 0
					)
				) as total_amount, 
				j.currency
			FROM job_orders j
			JOIN customers c ON j.customer_id = c.id
			WHERE j.job_date BETWEEN ? AND ?
			GROUP BY c.id, j.currency
			ORDER BY total_amount DESC
			LIMIT 5
		`,
			[startDate, endDate]
		);

		const [monthlyTrend]: any = await pool.query(`
			SELECT DATE_FORMAT(job_date, '%Y-%m') as month_year, COUNT(*) as count
			FROM job_orders
			WHERE job_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
			GROUP BY month_year
			ORDER BY month_year ASC
		`);

		return {
			financialStats: JSON.parse(JSON.stringify(financialStats)),
			jobTypeStats: JSON.parse(JSON.stringify(jobTypeStats)),
			serviceTypeStats: JSON.parse(JSON.stringify(serviceTypeStats)),
			topCustomers: JSON.parse(JSON.stringify(topCustomers)),
			monthlyTrend: JSON.parse(JSON.stringify(monthlyTrend)),
			filters: { month: selectedMonth }
		};
	} catch (error) {
		console.error('Reports Error:', error);
		return {
			financialStats: [],
			jobTypeStats: [],
			serviceTypeStats: [],
			topCustomers: [],
			monthlyTrend: [],
			filters: { month: selectedMonth }
		};
	}
};