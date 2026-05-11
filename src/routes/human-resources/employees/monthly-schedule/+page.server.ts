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
        // 1. ดึง Master Data (กะการทำงาน) และข้อมูลเวลาเพื่อคำนวณ OT
        const [shifts]: any = await pool.query(
            `SELECT shift_code, shift_name, start_time, end_time, ot_start_time, color_theme FROM shift_master WHERE status = 'Active'`
        );

        // เปลี่ยนจากการเก็บแค่สี เป็นเก็บข้อมูลเวลาเข้างานและเริ่ม OT ด้วย
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

        // 2. ดึงข้อมูลพนักงาน (Active) พร้อมข้อมูลแผนก ตำแหน่ง และกลุ่มงาน
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

        const [employees]: any = await pool.query(empQuery, empParams);

        // 3. เตรียม Map โครงสร้างตาราง
        const scheduleMap: Record<string, Record<string, any>> = {};
        if (Array.isArray(employees)) {
            for (const emp of employees) {
                scheduleMap[emp.emp_id] = {};
            }
        }

        // 3.5 ดึงข้อมูลการจัดกะล่วงหน้า (Planned Shifts) จากตาราง employee_shifts
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
                    // ใส่ข้อมูลกะที่จัดไว้ลงใน Map ล่วงหน้า
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

        // 4. ดึงข้อมูลบันทึกเวลาเข้า-ออกงาน (Attendance Logs) จากฐานข้อมูล
        const [logs]: any = await pool.query(
            `SELECT 
                emp_id, 
                DATE_FORMAT(work_date, '%Y-%m-%d') as work_date_str, 
                shift_type, 
                scan_in_time, 
                scan_out_time, 
                ot_hours 
            FROM attendance_logs 
            WHERE work_date BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        if (Array.isArray(logs)) {
            for (const log of logs) {
                if (scheduleMap[log.emp_id]) {
                    const existingPlan = scheduleMap[log.emp_id][log.work_date_str];
                    
                    // ใช้กะจาก log สแกนนิ้วก่อน (เผื่อมาทำกะอื่นนอกเหนือแผน) หากไม่มีให้ใช้กะที่จัดไว้ใน employee_shifts
                    const shiftCode = log.shift_type || existingPlan?.shift || 'Unknown';
                    const shiftData = shiftDataMap[shiftCode] || { color: 'gray' };
                    
                    // Logic การคำนวณ OT ฝั่ง Backend
                    let calculatedOtHours = Number(log.ot_hours) || 0;

                    // ถ้า Database ยังไม่คำนวณมาให้ (เป็น 0) และมีการสแกนออก ให้คำนวณสด
                    if (calculatedOtHours === 0 && log.scan_out_time && shiftData.ot_start_time && shiftData.start_time) {
                        try {
                            const [wYear, wMonth, wDay] = log.work_date_str.split('-').map(Number);
                            // รองรับ Date object หรือ String จาก DB
                            const scanOutDate = new Date(log.scan_out_time);
                            
                            const [startH, startM] = shiftData.start_time.split(':').map(Number);
                            const [otH, otM] = shiftData.ot_start_time.split(':').map(Number);

                            // ตรวจสอบกะดึก (เวลา OT ข้ามไปอีกวันหรือไม่)
                            const isNextDay = otH < startH;
                            const targetOtStart = new Date(wYear, wMonth - 1, isNextDay ? wDay + 1 : wDay, otH, otM, 0);

                            if (scanOutDate >= targetOtStart) {
                                const diffMs = scanOutDate.getTime() - targetOtStart.getTime();
                                const diffMins = Math.floor(diffMs / 60000);
                                // ปัดเศษลงทุกๆ 30 นาที เป็น 0.5 ชม.
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
                        existingPlan.otHours = calculatedOtHours; // ใช้ค่า OT ที่ผ่านการตรวจสอบหรือคำนวณแล้ว
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