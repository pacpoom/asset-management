import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url, locals }) => {
    // ตรวจสอบการ Login และดึง department_id ของ User
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/login');
    }

    const userDepartmentId = user.department_id ?? null;

    // รับค่าเดือนและปีจาก URL query (ถ้าไม่มีให้ใช้เดือนปัจจุบัน)
    const today = new Date();
    const monthQuery = url.searchParams.get('month');
    
    let targetYear = today.getFullYear();
    let targetMonth = today.getMonth() + 1;

    if (monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)) {
        const parts = monthQuery.split('-');
        targetYear = parseInt(parts[0]);
        targetMonth = parseInt(parts[1]);
    }

    // หาวันแรกและวันสุดท้ายของเดือน
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

    try {
        // 1. ดึง Master Data (กะการทำงานทั้งหมด) พร้อมทำ Lookup สำหรับสี
        const [shifts] = await pool.execute('SELECT shift_code, shift_name, color_theme FROM shift_master WHERE status = ?', ['Active']);
        const shiftColorMap: Record<string, string> = {};
        
        for (const s of shifts as any[]) {
            shiftColorMap[s.shift_code] = s.color_theme;
        }

        // 2. ดึงรายชื่อพนักงาน
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

        const empIds = employees.map(e => e.emp_id);
        
        if (empIds.length > 0) {
            const placeholders = empIds.map(() => '?').join(',');

            // 3. ดึงข้อมูล "แผนการจัดกะ"
            const [plannedShifts] = await pool.execute(
                `SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date, shift_code
                 FROM employee_shifts
                 WHERE emp_id IN (${placeholders}) 
                   AND work_date BETWEEN ? AND ?`,
                [...empIds, startDate, endDate]
            );

            // 4. ดึงข้อมูล "การเข้างานจริง" พร้อม Join เอา ot_start_time มาจาก shift_master
            // เพื่อใช้คำนวณ OT ในกรณีที่ฟิลด์ ot_hours ในฐานข้อมูลมีค่าเป็น 0
            const [logs] = await pool.execute(
                `SELECT a.emp_id, DATE_FORMAT(a.work_date, '%Y-%m-%d') as work_date, a.shift_type,
                        DATE_FORMAT(a.scan_in_time, '%H:%i') as time_in,
                        DATE_FORMAT(a.scan_out_time, '%H:%i') as time_out,
                        a.scan_out_time as raw_scan_out,
                        a.ot_hours as db_ot_hours,
                        s.ot_start_time
                 FROM attendance_logs a
                 LEFT JOIN shift_master s ON a.shift_type = s.shift_code
                 WHERE a.emp_id IN (${placeholders}) 
                   AND a.work_date BETWEEN ? AND ?`,
                [...empIds, startDate, endDate]
            );

            // 5. รวมข้อมูล
            
            // Step 5.1: วางแผนกะ
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

            // Step 5.2: นำข้อมูลการสแกนนิ้วมาอัปเดตทับ พร้อมคำนวณ OT
            for (const log of logs as any[]) {
                if (scheduleMap[log.emp_id]) {
                    let finalOtHours = Number(log.db_ot_hours || 0);

                    // ==========================================
                    // ระบบคำนวณ OT อัตโนมัติ (Dynamic OT Calculation)
                    // ทำงานเมื่อ DB เป็น 0 และ พนักงานมีการสแกนออก
                    // ==========================================
                    if (finalOtHours === 0 && log.raw_scan_out && log.ot_start_time) {
                        try {
                            // แปลงเวลาให้เป็น Object Date ของ Javascript เพื่อให้คำนวณง่าย
                            const scanOutDate = log.raw_scan_out instanceof Date ? log.raw_scan_out : new Date(log.raw_scan_out);
                            const otStartDate = new Date(`${log.work_date}T${log.ot_start_time}`);

                            // ถ้าเวลาออกงาน มากกว่า เวลาเริ่มนับ OT ให้คำนวณ
                            if (scanOutDate > otStartDate) {
                                const diffMs = scanOutDate.getTime() - otStartDate.getTime();
                                const diffHours = diffMs / (1000 * 60 * 60);

                                // ปัดเศษลงทีละครึ่งชั่วโมง (0.5) ตามมาตรฐานโรงงานทั่วไป
                                // เช่น คำนวณได้ 3.1 ชม. -> จะเหลือ 3.0 ชม.
                                finalOtHours = Math.floor(diffHours * 2) / 2;
                            }
                        } catch (e) {
                            console.error("Error calculating OT for", log.emp_id, e);
                        }
                    }

                    const existingPlan = scheduleMap[log.emp_id][log.work_date];
                    
                    if (existingPlan) {
                        existingPlan.shift = log.shift_type || existingPlan.shift;
                        existingPlan.color = shiftColorMap[existingPlan.shift] || existingPlan.color;
                        existingPlan.timeIn = log.time_in;
                        existingPlan.timeOut = log.time_out;
                        existingPlan.otHours = finalOtHours;
                    } else {
                        scheduleMap[log.emp_id][log.work_date] = {
                            shift: log.shift_type || 'Unknown',
                            color: shiftColorMap[log.shift_type] || 'gray',
                            timeIn: log.time_in,
                            timeOut: log.time_out,
                            otHours: finalOtHours
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