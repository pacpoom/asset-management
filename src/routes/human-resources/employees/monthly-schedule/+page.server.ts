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
        // 1. ดึง Master Data (กะการทำงานทั้งหมด) พร้อมทำ Lookup สำหรับสี
        const [shifts] = await pool.execute('SELECT shift_code, shift_name, color_theme FROM shift_master WHERE status = ?', ['Active']);
        const shiftColorMap: Record<string, string> = {};
        
        // ใช้ for...of แทน .forEach ป้องกันปัญหา ASI (Automatic Semicolon Insertion) ตอนที่ Svelte/Vite Compile
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

            // 3. ดึงข้อมูล "แผนการจัดกะ" จาก employee_shifts (เป็นโครงตารางหลัก ทำให้รู้วัน Day Off)
            const [plannedShifts] = await pool.execute(
                `SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date, shift_code
                 FROM employee_shifts
                 WHERE emp_id IN (${placeholders}) 
                   AND work_date BETWEEN ? AND ?`,
                [...empIds, startDate, endDate]
            );

            // 4. ดึงข้อมูล "การเข้างานจริง" จาก attendance_logs (ดึงเวลาเข้า-ออก และชั่วโมง OT)
            const [logs] = await pool.execute(
                `SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date, shift_type,
                        DATE_FORMAT(scan_in_time, '%H:%i') as time_in,
                        DATE_FORMAT(scan_out_time, '%H:%i') as time_out,
                        ot_hours
                 FROM attendance_logs
                 WHERE emp_id IN (${placeholders}) 
                   AND work_date BETWEEN ? AND ?`,
                [...empIds, startDate, endDate]
            );

            // 5. รวม (Merge) ข้อมูลแผนกะการทำงาน กับ การเข้างานจริง เข้าด้วยกัน
            
            // Step 5.1: วางแผนกะ (DAY OFF และกะล่วงหน้า) ลงใน Map ก่อน
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

            // Step 5.2: นำข้อมูลการสแกนนิ้วจริง (IN/OUT/OT) มาอัปเดตทับลงไป
            for (const log of logs as any[]) {
                if (scheduleMap[log.emp_id]) {
                    const existingPlan = scheduleMap[log.emp_id][log.work_date];
                    
                    if (existingPlan) {
                        // ถ้ามีในแผนอยู่แล้ว ให้อัปเดตเวลาเข้าออก และ OT
                        // (ถ้ามีการสลับกะหน้างาน จะใช้กะจากระบบสแกนนิ้วเป็นหลัก)
                        existingPlan.shift = log.shift_type || existingPlan.shift;
                        existingPlan.color = shiftColorMap[existingPlan.shift] || existingPlan.color;
                        existingPlan.timeIn = log.time_in;
                        existingPlan.timeOut = log.time_out;
                        existingPlan.otHours = log.ot_hours;
                    } else {
                        // กรณีไม่ได้ถูกจัดกะในแผน แต่พนักงานมาสแกนทำงานจริง
                        scheduleMap[log.emp_id][log.work_date] = {
                            shift: log.shift_type || 'Unknown',
                            color: shiftColorMap[log.shift_type] || 'gray',
                            timeIn: log.time_in,
                            timeOut: log.time_out,
                            otHours: log.ot_hours
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
