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
		// กรอง Stats ด้วยช่วงเดือนที่เลือก
		const [statsRow]: any = await pool.query(`
			SELECT 
				COUNT(*) as total_jobs,
				SUM(CASE WHEN job_status = 'Pending' THEN 1 ELSE 0 END) as pending_jobs,
				SUM(CASE WHEN job_status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_jobs,
				SUM(CASE WHEN job_status = 'Completed' THEN 1 ELSE 0 END) as completed_jobs,
                SUM(CASE WHEN job_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_jobs
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
		`, [startDate, endDate]);

		// กรอง Recent Jobs ด้วยช่วงเดือนที่เลือก
		const [recentJobs]: any = await pool.query(`
			SELECT j.id, j.job_type, j.service_type, j.job_date, j.job_status, j.amount, j.currency, c.company_name, c.name as customer_name
			FROM job_orders j
			LEFT JOIN customers c ON j.customer_id = c.id
			WHERE j.job_date BETWEEN ? AND ?
			ORDER BY j.job_date DESC, j.id DESC
			LIMIT 5
		`, [startDate, endDate]);

		// Alerts ดึงจากปัจจุบันไปอีก 30 วัน (ไม่ถูกกรองด้วยตัวเลือกเดือนเพราะเป็นข้อมูลที่กำลังจะหมดอายุ)
		const [alerts]: any = await pool.query(`
			SELECT id, job_type, job_date, expire_date, job_status 
			FROM job_orders 
			WHERE expire_date IS NOT NULL 
			  AND expire_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
			  AND job_status NOT IN ('Completed', 'Cancelled')
			ORDER BY expire_date ASC
			LIMIT 10
		`);

		return {
			stats: statsRow[0] || {
				total_jobs: 0,
				pending_jobs: 0,
				in_progress_jobs: 0,
				completed_jobs: 0,
				cancelled_jobs: 0
			},
			recentJobs: JSON.parse(JSON.stringify(recentJobs)),
			alerts: JSON.parse(JSON.stringify(alerts)),
			filters: { month: selectedMonth }
		};
	} catch (error) {
		console.error('Dashboard Data Error:', error);
		return {
			stats: {
				total_jobs: 0,
				pending_jobs: 0,
				in_progress_jobs: 0,
				completed_jobs: 0,
				cancelled_jobs: 0
			},
			recentJobs: [],
			alerts: [],
			filters: { month: selectedMonth }
		};
	}
};