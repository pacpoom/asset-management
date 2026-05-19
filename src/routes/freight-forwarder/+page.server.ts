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

		// ดึงข้อมูล Status แยกตาม Owner (created_by)
		const [ownerStats]: any = await pool.query(`
			SELECT 
				u.id as user_id,
				u.full_name as owner_name,
				COUNT(j.id) as total,
				SUM(CASE WHEN j.job_status = 'Pending' THEN 1 ELSE 0 END) as pending,
				SUM(CASE WHEN j.job_status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
				SUM(CASE WHEN j.job_status = 'Completed' THEN 1 ELSE 0 END) as completed,
				SUM(CASE WHEN j.job_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
			FROM job_orders j
			LEFT JOIN users u ON j.created_by = u.id
			WHERE j.job_date BETWEEN ? AND ?
			GROUP BY u.id, u.full_name
			ORDER BY total DESC
		`, [startDate, endDate]);

		// Job type breakdown (Import/Export/Air)
		const [jobTypeStats]: any = await pool.query(`
			SELECT 
				job_type,
				COUNT(*) as total,
				SUM(CASE WHEN job_status = 'Pending' THEN 1 ELSE 0 END) as pending,
				SUM(CASE WHEN job_status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
				SUM(CASE WHEN job_status = 'Completed' THEN 1 ELSE 0 END) as completed,
				SUM(CASE WHEN job_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
			FROM job_orders
			WHERE job_date BETWEEN ? AND ?
			GROUP BY job_type
			ORDER BY total DESC
		`, [startDate, endDate]);

		// ดึงข้อมูล Status แยกตาม Customer
		const [customerStats]: any = await pool.query(`
			SELECT 
				c.id as customer_id,
				COALESCE(c.company_name, c.name) as customer_name,
				COUNT(j.id) as total,
				SUM(CASE WHEN j.job_status = 'Pending' THEN 1 ELSE 0 END) as pending,
				SUM(CASE WHEN j.job_status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
				SUM(CASE WHEN j.job_status = 'Completed' THEN 1 ELSE 0 END) as completed,
				SUM(CASE WHEN j.job_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
			FROM job_orders j
			LEFT JOIN customers c ON j.customer_id = c.id
			WHERE j.job_date BETWEEN ? AND ?
			GROUP BY c.id, c.company_name, c.name
			ORDER BY total DESC
			LIMIT 15
		`, [startDate, endDate]);

		// กรอง Recent Jobs ด้วยช่วงเดือนที่เลือก
		const [recentJobs]: any = await pool.query(`
			SELECT j.id, j.job_type, j.service_type, j.job_date, j.job_status, j.amount, j.currency, 
				   c.company_name, c.name as customer_name,
				   u.full_name as owner_name
			FROM job_orders j
			LEFT JOIN customers c ON j.customer_id = c.id
			LEFT JOIN users u ON j.created_by = u.id
			WHERE j.job_date BETWEEN ? AND ?
			ORDER BY j.job_date DESC, j.id DESC
			LIMIT 5
		`, [startDate, endDate]);

		// Alerts ดึงจากปัจจุบันไปอีก 30 วัน
		const [alerts]: any = await pool.query(`
			SELECT id, job_type, job_date, expire_date, job_status
			FROM job_orders
			WHERE expire_date IS NOT NULL
			  AND expire_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
			  AND job_status NOT IN ('Completed', 'Cancelled')
			ORDER BY expire_date ASC
			LIMIT 10
		`);

		// Container Alerts: ตู้ที่ยังไม่ checkout และ ETA ใกล้ถึง/เลยแล้ว (แสดงทุก user)
		let containerAlerts: any[] = [];
		try {
			const [containerAlertRows]: any = await pool.query(`
				SELECT j.id, j.job_number, j.job_type, j.job_date, j.eta, j.expire_date,
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
				WHERE j.eta IS NOT NULL
				  AND (
				    (j.demurrage_days IS NULL AND j.storage_days IS NULL AND j.detention_days IS NULL
				     AND DATEDIFF(CURDATE(), j.eta) >= -3)
				    OR (j.demurrage_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.demurrage_days DAY)) >= -3)
				    OR (j.storage_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.storage_days DAY)) >= -3)
				    OR (j.detention_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.detention_days DAY)) >= -3)
				  )
				  AND j.job_status NOT IN ('Cancelled', 'Completed')
				GROUP BY j.id, j.job_number, j.job_type, j.job_date, j.eta, j.expire_date, j.demurrage_days, j.storage_days, j.detention_days, c.company_name, c.name
				ORDER BY days_since_eta DESC
				LIMIT 15
			`);
			containerAlerts = containerAlertRows;
		} catch {
			// คอลัมน์ status ยังไม่มีในตาราง — รอ migration ก่อน
		}

		return {
			stats: statsRow[0] || {
				total_jobs: 0,
				pending_jobs: 0,
				in_progress_jobs: 0,
				completed_jobs: 0,
				cancelled_jobs: 0
			},
			ownerStats: JSON.parse(JSON.stringify(ownerStats)),
			customerStats: JSON.parse(JSON.stringify(customerStats)),
			jobTypeStats: JSON.parse(JSON.stringify(jobTypeStats)),
			recentJobs: JSON.parse(JSON.stringify(recentJobs)),
			alerts: JSON.parse(JSON.stringify(alerts)),
			containerAlerts: JSON.parse(JSON.stringify(containerAlerts)),
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
			ownerStats: [],
			customerStats: [],
			jobTypeStats: [],
			recentJobs: [],
			alerts: [],
			containerAlerts: [],
			filters: { month: selectedMonth }
		};
	}
};