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
        // 1. ดึง Master Data (กะการทำงานทั้งหมด)
        const [shifts] = await pool.execute('SELECT shift_code, shift_name, color_theme FROM shift_master WHERE status = ?', ['Active']);

        // 2. ดึงรายชื่อพนักงาน
        let employees: any[] = [];
        
        // ถ้าไม่มี department_id (null) ให้ดึงพนักงานทั้งหมดที่ Active มาแสดง
        if (userDepartmentId === null) {
            const [allEmps] = await pool.execute(
                'SELECT emp_id, emp_name FROM employees WHERE status = ?',
                ['Active']
            );
            employees = allEmps as any[];
        } else {
            // ถ้ามีแผนก ให้ดึงเฉพาะพนักงานในแผนกนั้น
            const [deptEmps] = await pool.execute(
                'SELECT emp_id, emp_name FROM employees WHERE department_id = ? AND status = ?',
                [userDepartmentId, 'Active']
            );
            employees = deptEmps as any[];
        }

        let attendanceLogs: any[] = [];
        const empIds = (employees as any[]).map(e => e.emp_id);
        
        // 3. ดึงข้อมูลการเข้างาน เพิ่มเวลา In, Out และ OT
        if (empIds.length > 0) {
            const placeholders = empIds.map(() => '?').join(',');
            const [logs] = await pool.execute(
                `SELECT a.emp_id, DATE_FORMAT(a.work_date, '%Y-%m-%d') as work_date, a.shift_type, s.color_theme,
                        DATE_FORMAT(a.scan_in_time, '%H:%i') as time_in,
                        DATE_FORMAT(a.scan_out_time, '%H:%i') as time_out,
                        a.ot_hours
                 FROM attendance_logs a
                 LEFT JOIN shift_master s ON a.shift_type = s.shift_code
                 WHERE a.emp_id IN (${placeholders}) 
                   AND a.work_date BETWEEN ? AND ?`,
                [...empIds, startDate, endDate]
            );
            attendanceLogs = logs as any[];
        }

        // 4. จัดเตรียมข้อมูลให้อยู่ในรูปแบบที่ Frontend นำไปวนลูปตารางได้ง่าย
        const scheduleMap: Record<string, Record<string, any>> = {};
        
        employees.forEach(emp => {
            scheduleMap[emp.emp_id] = {};
        });

        attendanceLogs.forEach(log => {
            if (scheduleMap[log.emp_id]) {
                scheduleMap[log.emp_id][log.work_date] = {
                    shift: log.shift_type,
                    color: log.color_theme || 'gray',
                    timeIn: log.time_in,   // แนบเวลาเข้างาน
                    timeOut: log.time_out, // แนบเวลาออกงาน
                    otHours: log.ot_hours  // แนบชั่วโมง OT
                };
            }
        });

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