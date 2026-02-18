import pool from '$lib/server/database';

export const load = async () => {
	try {
		const [statsRow]: any = await pool.query(`
			SELECT 
				COUNT(*) as total_jobs,
				SUM(CASE WHEN job_status = 'Pending' THEN 1 ELSE 0 END) as pending_jobs,
				SUM(CASE WHEN job_status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_jobs,
				SUM(CASE WHEN job_status = 'Completed' THEN 1 ELSE 0 END) as completed_jobs,
                SUM(CASE WHEN job_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_jobs
			FROM job_orders
		`);

		const [recentJobs]: any = await pool.query(`
			SELECT j.id, j.job_type, j.service_type, j.job_date, j.job_status, j.amount, j.currency, c.company_name, c.name as customer_name
			FROM job_orders j
			LEFT JOIN customers c ON j.customer_id = c.id
			ORDER BY j.created_at DESC
			LIMIT 5
		`);

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
			alerts: JSON.parse(JSON.stringify(alerts))
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
			alerts: []
		};
	}
};
