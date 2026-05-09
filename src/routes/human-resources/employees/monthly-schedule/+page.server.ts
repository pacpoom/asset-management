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
	const today = new Date();
	const monthQuery = url.searchParams.get('month');

	let targetYear = today.getFullYear();
	let targetMonth = today.getMonth() + 1;

	if (monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)) {
		const parts = monthQuery.split('-');
		targetYear = parseInt(parts[0]);
		targetMonth = parseInt(parts[1]);
	}

	const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
	const lastDay = new Date(targetYear, targetMonth, 0).getDate();
	const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

	try {
		const [shifts] = await pool.execute(
			'SELECT shift_code, shift_name, color_theme FROM shift_master WHERE status = ?',
			['Active']
		);
		const shiftColorMap: Record<string, string> = {};
		for (const s of shifts as any[]) {
			shiftColorMap[s.shift_code] = s.color_theme;
		}

		let employees: any[] = [];
		if (userDepartmentId === null) {
			const [allEmps] = await pool.execute(
				'SELECT emp_id, emp_name FROM employees WHERE status = ?',
				['Active']
			);
			employees = allEmps as any[];
		} else {
			const [deptEmps] = await pool.execute(
				'SELECT emp_id, emp_name FROM employees WHERE department_id = ? AND status = ?',
				[userDepartmentId, 'Active']
			);
			employees = deptEmps as any[];
		}

		const scheduleMap: Record<string, Record<string, any>> = {};
		for (const emp of employees) {
			scheduleMap[emp.emp_id] = {};
		}

		const empIds = employees.map((e) => e.emp_id);

		if (empIds.length > 0) {
			const placeholders = empIds.map(() => '?').join(',');

			const [plannedShifts] = await pool.execute(
				`SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date, shift_code
                 FROM employee_shifts WHERE emp_id IN (${placeholders}) AND work_date BETWEEN ? AND ?`,
				[...empIds, startDate, endDate]
			);

			const [logs] = await pool.execute(
				`SELECT 
                    al.emp_id, 
                    DATE_FORMAT(al.work_date, '%Y-%m-%d') as work_date, 
                    COALESCE(es.shift_code, al.shift_type) as shift_type,
                    DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
                    DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
                    
                    /* คำนวณ OT สดๆ ตามตั้งค่าใน Shift Master */
                    CASE 
                        /* กะดึก (N) - ot_start_time น้อยกว่า start_time (เช่นเข้าดึก เลิกเช้า) */
                        WHEN sm.ot_start_time IS NOT NULL AND sm.ot_start_time <= sm.start_time THEN
                            IF(al.scan_out_time IS NOT NULL AND TIME(al.scan_out_time) > sm.ot_start_time,
                                FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(TIME(al.scan_out_time), sm.ot_start_time)) / 60) / 30) * 0.5,
                                0
                            )
                            
                        /* กะเช้า (D) - คำนวณ OT หลังเลิกงาน + OT เช้ามืด */
                        ELSE
                            (
                                IF(al.scan_out_time IS NOT NULL,
                                    FLOOR(GREATEST(0, 
                                        (
                                            TIME_TO_SEC(TIME(al.scan_out_time)) 
                                            + IF(TIME(al.scan_out_time) < sm.start_time AND TIME(al.scan_out_time) < '12:00:00', 86400, 0)
                                            - TIME_TO_SEC(IFNULL(sm.ot_start_time, '17:10:00'))
                                        ) / 60
                                    ) / 30) * 0.5,
                                    0
                                )
                            )
                            +
                            (
                                IF(al.scan_in_time IS NOT NULL AND TIME(al.scan_in_time) >= '04:00:00' AND TIME(al.scan_in_time) < IFNULL(sm.start_time, '07:30:00'),
                                    FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(IFNULL(sm.start_time, '07:30:00'), GREATEST(TIME(al.scan_in_time), '05:30:00'))) / 60) / 30) * 0.5,
                                    0
                                )
                            )
                    END as ot_hours

                 FROM attendance_logs al
                 LEFT JOIN employee_shifts es ON al.emp_id = es.emp_id AND al.work_date = es.work_date
                 LEFT JOIN shift_master sm ON COALESCE(es.shift_code, al.shift_type) = sm.shift_code
                 WHERE al.emp_id IN (${placeholders}) 
                   AND al.work_date BETWEEN ? AND ?`,
				[...empIds, startDate, endDate]
			);

			for (const plan of plannedShifts as any[]) {
				if (scheduleMap[plan.emp_id]) {
					scheduleMap[plan.emp_id][plan.work_date] = {
						shift: plan.shift_code,
						color: shiftColorMap[plan.shift_code] || 'gray',
						timeIn: null,
						timeOut: null,
						otHours: 0
					};
				}
			}

			for (const log of logs as any[]) {
				if (scheduleMap[log.emp_id]) {
					const existingPlan = scheduleMap[log.emp_id][log.work_date];
					if (existingPlan) {
						existingPlan.shift = log.shift_type || existingPlan.shift;
						existingPlan.color = shiftColorMap[existingPlan.shift] || existingPlan.color;
						existingPlan.timeIn = log.time_in;
						existingPlan.timeOut = log.time_out;

						existingPlan.otHours = Number(log.ot_hours);
					} else {
						scheduleMap[log.emp_id][log.work_date] = {
							shift: log.shift_type || 'Unknown',
							color: shiftColorMap[log.shift_type] || 'gray',
							timeIn: log.time_in,
							timeOut: log.time_out,
							otHours: Number(log.ot_hours)
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
		throw error;
	}
};
