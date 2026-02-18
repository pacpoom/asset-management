import pool from '$lib/server/database';

export const load = async ({ url }) => {
	// รับค่า Filter จาก URL (ถ้าไม่มีให้ใช้เดือนปัจจุบัน)
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

	const startDate = url.searchParams.get('start_date') || firstDay;
	const endDate = url.searchParams.get('end_date') || lastDay;

	try {
		// 1. สรุปยอดเงินรวม (แยกตามสกุลเงิน)
		const [revenueStats]: any = await pool.query(
			`
			SELECT currency, SUM(amount) as total_amount, COUNT(*) as job_count
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
			GROUP BY currency
		`,
			[startDate, endDate]
		);

		// 2. สรุปจำนวนงานแยกตาม Job Type (สำหรับกราฟวงกลม)
		const [jobTypeStats]: any = await pool.query(
			`
			SELECT job_type, COUNT(*) as count
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
			GROUP BY job_type
		`,
			[startDate, endDate]
		);

		// 3. สรุปจำนวนงานแยกตาม Service Type (Import/Export)
		const [serviceTypeStats]: any = await pool.query(
			`
			SELECT service_type, COUNT(*) as count
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
			GROUP BY service_type
		`,
			[startDate, endDate]
		);

		// 4. จัดอันดับลูกค้า Top 5 (เรียงตามจำนวนงาน)
		const [topCustomers]: any = await pool.query(
			`
			SELECT c.company_name, COUNT(j.id) as job_count, SUM(j.amount) as total_amount, j.currency
			FROM job_orders j
			JOIN customers c ON j.customer_id = c.id
			WHERE j.job_date BETWEEN ? AND ?
			GROUP BY c.id, j.currency
			ORDER BY job_count DESC
			LIMIT 5
		`,
			[startDate, endDate]
		);

		// 5. กราฟแนวโน้มรายเดือน (ย้อนหลัง 6 เดือน ไม่สนใจ Filter วันที่)
		const [monthlyTrend]: any = await pool.query(`
			SELECT DATE_FORMAT(job_date, '%Y-%m') as month_year, COUNT(*) as count
			FROM job_orders
			WHERE job_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
			GROUP BY month_year
			ORDER BY month_year ASC
		`);

		return {
			revenueStats: JSON.parse(JSON.stringify(revenueStats)),
			jobTypeStats: JSON.parse(JSON.stringify(jobTypeStats)),
			serviceTypeStats: JSON.parse(JSON.stringify(serviceTypeStats)),
			topCustomers: JSON.parse(JSON.stringify(topCustomers)),
			monthlyTrend: JSON.parse(JSON.stringify(monthlyTrend)),
			filters: { startDate, endDate }
		};
	} catch (error) {
		console.error('Reports Error:', error);
		return {
			revenueStats: [],
			jobTypeStats: [],
			serviceTypeStats: [],
			topCustomers: [],
			monthlyTrend: [],
			filters: { startDate, endDate }
		};
	}
};
