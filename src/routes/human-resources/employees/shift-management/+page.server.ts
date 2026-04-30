import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	// รับค่าเดือนและปีจาก URL (ถ้าไม่มีใช้เดือน/ปี ปัจจุบัน)
	const now = new Date();
	const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1));
	const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()));
    const search = url.searchParams.get('search') || '';

	try {
		// 1. ดึงข้อมูลพนักงานที่ยัง Active
        let empQuery = `
            SELECT emp_id, emp_name, default_shift, position_name, division
            FROM employees e
            LEFT JOIN job_positions jp ON e.position_id = jp.id
            WHERE e.status = 'Active'
        `;
        const empParams: any[] = [];
        if (search) {
			empQuery += ` AND (e.emp_id LIKE ? OR e.emp_name LIKE ?)`;
			const searchPattern = `%${search.trim()}%`;
			empParams.push(searchPattern, searchPattern);
		}
        empQuery += ` ORDER BY e.emp_id ASC`;
		const [employees]: any = await pool.execute(empQuery, empParams);

		// 2. ดึงรูปแบบกะทั้งหมดมาทำเครื่องมือ
		const [shifts]: any = await pool.execute("SELECT * FROM shift_master WHERE status = 'Active'");

		// 3. ดึงข้อมูลกะที่จัดไว้แล้วในเดือนที่เลือก
		const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
		const endDate = new Date(year, month, 0); // วันสุดท้ายของเดือน
		const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

		const [schedules]: any = await pool.execute(
			`SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date_str, shift_code 
             FROM employee_shifts 
             WHERE work_date BETWEEN ? AND ?`,
			[startDate, endDateStr]
		);

		return {
			employees,
			shifts,
			schedules,
			currentMonth: month,
			currentYear: year,
            searchQuery: search
		};
	} catch (error) {
		console.error('Error loading shift management:', error);
		return { employees: [], shifts: [], schedules: [], currentMonth: month, currentYear: year, searchQuery: search };
	}
};

export const actions: Actions = {
	saveShifts: async ({ request }) => {
		const data = await request.formData();
		const changesJson = data.get('changes')?.toString();

		if (!changesJson) {
			return fail(400, { success: false, message: 'ไม่มีข้อมูลการเปลี่ยนแปลง' });
		}

		try {
			const changes: Record<string, string> = JSON.parse(changesJson);
			const values: any[] = [];
			const placeholders: string[] = [];

            // แปลง Object ให้เป็น Array สำหรับทำ Bulk Insert/Update
			for (const key in changes) {
				const [emp_id, work_date] = key.split('|');
				const shift_code = changes[key];

                if (shift_code === 'DELETE') {
                    // หากต้องการลบกะในวันนั้น
                    await pool.execute('DELETE FROM employee_shifts WHERE emp_id = ? AND work_date = ?', [emp_id, work_date]);
                } else {
                    // เพิ่มหรืออัปเดต
                    values.push(emp_id, work_date, shift_code);
                    placeholders.push('(?, ?, ?)');
                }
			}

			if (placeholders.length > 0) {
				const query = `
					INSERT INTO employee_shifts (emp_id, work_date, shift_code) 
					VALUES ${placeholders.join(',')} 
					ON DUPLICATE KEY UPDATE shift_code = VALUES(shift_code)
				`;
				await pool.execute(query, values);
			}

			return { success: true, message: 'บันทึกตารางการทำงานสำเร็จ!' };
		} catch (error) {
			console.error('Save Shifts Error:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	}
};