import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const today = new Date();
	const defaultMonth = String(today.getMonth() + 1).padStart(2, '0');
	const defaultYear = today.getFullYear().toString();
	const selectedMonth = url.searchParams.get('month') || defaultMonth;
	const selectedYear = url.searchParams.get('year') || defaultYear;
	const empFilter = url.searchParams.get('emp_id') || 'All';
	const search = url.searchParams.get('search') || '';

	const yearMonthStr = `${selectedYear}-${selectedMonth}`;

	try {
		const [employees]: any = await pool.execute(
			`SELECT emp_id, emp_name FROM employees ORDER BY emp_name ASC`
		);

		let logQuery = `
			SELECT 
				al.*, 
				al.scan_in_time as time_in_raw, 
				IFNULL(e.emp_name, al.emp_name) as name,
				IFNULL(jp.position_name, '-') as position,
				IFNULL(e.section, '-') as section,
				IFNULL(e.division, '-') as dis,
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out
			FROM attendance_logs al
			LEFT JOIN employees e ON al.emp_id = e.emp_id
			LEFT JOIN job_positions jp ON e.position_id = jp.id
			WHERE DATE_FORMAT(al.work_date, '%Y-%m') = ?
		`;
		const params: any[] = [yearMonthStr];

		if (empFilter !== 'All') {
			logQuery += ` AND al.emp_id = ?`;
			params.push(empFilter);
		}

		if (search) {
			logQuery += ` AND (al.emp_id LIKE ? OR e.emp_name LIKE ? OR e.section LIKE ?)`;
			const searchPattern = `%${search.trim().replace(/[\s+]+/g, '%')}%`;
			params.push(searchPattern, searchPattern, searchPattern);
		}

		logQuery += ` ORDER BY al.work_date DESC, al.scan_in_time DESC`;

		const [logs]: any = await pool.execute(logQuery, params);

		let total_days = 0;
		let total_late_mins = 0;
		let total_ot_hours = 0;

		const processedLogs = logs.map((log: any) => {
			let lateMins = 0;
			if (log.status === 'Present') total_days++;
			total_ot_hours += parseFloat(log.ot_hours) || 0;
			if (log.is_late && log.time_in_raw && log.shift_type === 'Day') {
				const d = new Date(log.time_in_raw);
				const totalMins = d.getHours() * 60 + d.getMinutes();
				if (totalMins > 460) {
					lateMins = totalMins - 460;
					total_late_mins += lateMins;
				}
			}

			return log;
		});

		return {
			logs: processedLogs,
			employees: employees,
			selectedMonth,
			selectedYear,
			empFilter,
			searchQuery: search,
			stats: {
				total_days,
				total_late_mins,
				total_ot_hours: Math.round(total_ot_hours * 100) / 100
			}
		};
	} catch (error) {
		console.error('Error fetching attendance history:', error);
		return {
			logs: [],
			employees: [],
			selectedMonth,
			selectedYear,
			empFilter: 'All',
			searchQuery: search,
			stats: { total_days: 0, total_late_mins: 0, total_ot_hours: 0 }
		};
	}
};
