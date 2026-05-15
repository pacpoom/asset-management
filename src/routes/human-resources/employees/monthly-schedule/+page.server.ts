import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';

interface LocalUser {
	id?: number;
	role?: string;
	username?: string;
	email?: string;
	department_id?: number | null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const user = locals.user as LocalUser;

	if (!user) {
		throw redirect(302, '/login');
	}

	const userDepartmentId = user.department_id ?? null;
	const now = new Date();
	const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
	const monthQuery = url.searchParams.get('month');

	let targetYear = bkkNow.getUTCFullYear();
	let targetMonth = bkkNow.getUTCMonth() + 1;

	if (monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)) {
		const parts = monthQuery.split('-');
		targetYear = parseInt(parts[0]);
		targetMonth = parseInt(parts[1]);
	}

	const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
	const lastDay = new Date(targetYear, targetMonth, 0).getDate();
	const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

	try {
		const [shifts]: any = await pool.query(
			`SELECT shift_code, shift_name, start_time, end_time, ot_start_time, color_theme FROM shift_master WHERE status = 'Active'`
		);

		const shiftDataMap: Record<string, any> = {};
		if (Array.isArray(shifts)) {
			for (const s of shifts) {
				shiftDataMap[s.shift_code] = {
					color: s.color_theme,
					start_time: s.start_time,
					ot_start_time: s.ot_start_time
				};
			}
		}

		let empQuery = `
            SELECT 
                e.emp_id, 
                e.emp_name, 
                e.department_id, 
                e.default_shift,
                e.division,
                e.section,
                e.emp_group,
                jp.position_name
            FROM employees e
            LEFT JOIN job_positions jp ON e.position_id = jp.id
            WHERE e.status = 'Active'
        `;
		const empParams: any[] = [];

		if (userDepartmentId) {
			empQuery += ` AND e.department_id = ?`;
			empParams.push(userDepartmentId);
		}

		const [employees]: any = await pool.query(empQuery, empParams);

		const scheduleMap: Record<string, Record<string, any>> = {};
		if (Array.isArray(employees)) {
			for (const emp of employees) {
				scheduleMap[emp.emp_id] = {};
			}
		}

		const [plannedShifts]: any = await pool.query(
			`SELECT 
                emp_id, 
                DATE_FORMAT(work_date, '%Y-%m-%d') as work_date_str, 
                shift_code 
            FROM employee_shifts 
            WHERE work_date BETWEEN ? AND ?`,
			[startDate, endDate]
		);

		if (Array.isArray(plannedShifts)) {
			for (const plan of plannedShifts) {
				if (scheduleMap[plan.emp_id]) {
					const shiftData = shiftDataMap[plan.shift_code] || { color: 'gray' };
					scheduleMap[plan.emp_id][plan.work_date_str] = {
						shift: plan.shift_code,
						color: shiftData.color,
						timeIn: null,
						timeOut: null,
						otHours: 0
					};
				}
			}
		}

		const [logs]: any = await pool.query(
			`SELECT 
                emp_id, 
                DATE_FORMAT(work_date, '%Y-%m-%d') as work_date_str, 
                shift_type, 
                DATE_FORMAT(scan_in_time, '%Y-%m-%d %H:%i:%s') as scan_in_time, 
                DATE_FORMAT(scan_out_time, '%Y-%m-%d %H:%i:%s') as scan_out_time, 
                ot_hours 
            FROM attendance_logs 
            WHERE work_date BETWEEN ? AND ?`,
			[startDate, endDate]
		);

		if (Array.isArray(logs)) {
			for (const log of logs) {
				if (scheduleMap[log.emp_id]) {
					const existingPlan = scheduleMap[log.emp_id][log.work_date_str];

					const shiftCode = log.shift_type || existingPlan?.shift || 'Unknown';
					const shiftData = shiftDataMap[shiftCode] || { color: 'gray' };

					let calculatedOtHours = Number(log.ot_hours) || 0;

					if (
						calculatedOtHours === 0 &&
						log.scan_out_time &&
						shiftData.ot_start_time &&
						shiftData.start_time
					) {
						try {
							const [wYear, wMonth, wDay] = log.work_date_str.split('-').map(Number);
							const scanOutDate = new Date(log.scan_out_time);

							const [startH, startM] = shiftData.start_time.split(':').map(Number);
							const [otH, otM] = shiftData.ot_start_time.split(':').map(Number);

							const isNextDay = otH < startH;
							const targetOtStart = new Date(
								wYear,
								wMonth - 1,
								isNextDay ? wDay + 1 : wDay,
								otH,
								otM,
								0
							);

							if (scanOutDate >= targetOtStart) {
								const diffMs = scanOutDate.getTime() - targetOtStart.getTime();
								const diffMins = Math.floor(diffMs / 60000);
								const calculated = Math.floor(diffMins / 30) * 0.5;
								if (calculated > 0) {
									calculatedOtHours = calculated;
								}
							}
						} catch (e) {
							console.error(`Error calculating OT for ${log.emp_id} on ${log.work_date_str}:`, e);
						}
					}

					if (existingPlan) {
						existingPlan.shift = shiftCode;
						existingPlan.color = shiftData.color;
						existingPlan.timeIn = log.scan_in_time;
						existingPlan.timeOut = log.scan_out_time;
						existingPlan.otHours = calculatedOtHours;
					} else {
						scheduleMap[log.emp_id][log.work_date_str] = {
							shift: shiftCode,
							color: shiftData.color,
							timeIn: log.scan_in_time,
							timeOut: log.scan_out_time,
							otHours: calculatedOtHours
						};
					}
				}
			}
		}

		return {
			currentMonth: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
			daysInMonth: lastDay,
			targetYear,
			targetMonth,
			shifts: shifts as any[],
			employees: employees,
			scheduleMap
		};
	} catch (error) {
		console.error('Error fetching monthly schedule:', error);

		return {
			currentMonth: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
			daysInMonth: lastDay,
			targetYear,
			targetMonth,
			shifts: [],
			employees: [],
			scheduleMap: {}
		};
	}
};
