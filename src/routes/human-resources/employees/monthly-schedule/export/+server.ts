import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
// 1. แก้ไขวิธีการ Import ExcelJS ให้รองรับ ES Modules ของ SvelteKit
import pkg from 'exceljs';
const { Workbook } = pkg;

interface LocalUser {
	id?: number;
	role?: string;
	username?: string;
	email?: string;
	department_id?: number | null;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user as LocalUser;
	if (!user) return new Response('Unauthorized', { status: 401 });

	const userDepartmentId = user.department_id ?? null;
	const isSuperAdmin =
		user.role === 'admin' && (user.username === 'admin' || user.id === 1 || user.id === 2);

	const monthQuery = url.searchParams.get('month');
	const today = new Date();
	let targetYear = today.getFullYear();
	let targetMonth = today.getMonth() + 1;

	if (monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)) {
		const [y, m] = monthQuery.split('-').map(Number);
		targetYear = y;
		targetMonth = m;
	}

	const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
	const lastDay = new Date(targetYear, targetMonth, 0).getDate();
	const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

	try {
        // 2. เปลี่ยน "Active" เป็น 'Active' (Single Quote)
		let empQuery = `
            SELECT 
                e.emp_id, 
                e.emp_name,
                e.division,
                e.section,
                e.emp_group,
                jp.position_name
            FROM employees e
            LEFT JOIN job_positions jp ON e.position_id = jp.id
            WHERE e.status = 'Active' 
        `;
		let empParams: any[] = [];
		if (!isSuperAdmin && userDepartmentId !== null) {
			empQuery += ' AND e.department_id = ?';
			empParams.push(userDepartmentId);
		}
        
        // 3. เปลี่ยน execute เป็น query ป้องกันปัญหา Prepared Statement เต็ม
		const [employees]: any = await pool.query(empQuery, empParams);
		const empIds = employees.map((e: any) => e.emp_id);

		if (empIds.length === 0) return new Response('No data', { status: 404 });

		const placeholders = empIds.map(() => '?').join(',');
		
        // เปลี่ยน execute เป็น query 
		const [plannedShifts]: any = await pool.query(
			`SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date_str, shift_code FROM employee_shifts WHERE emp_id IN (${placeholders}) AND work_date BETWEEN ? AND ?`,
			[...empIds, startDate, endDate]
		);

        // เปลี่ยน execute เป็น query และดึงข้อมูลเวลาเพื่อคำนวณ OT เหมือนในหน้าเว็บ
		const [logs]: any = await pool.query(
			`SELECT 
                al.emp_id, 
                DATE_FORMAT(al.work_date, '%Y-%m-%d') as work_date_str, 
                COALESCE(es.shift_code, al.shift_type) as shift_type,
                al.scan_in_time, 
                al.scan_out_time, 
                al.ot_hours,
                sm.start_time,
                sm.ot_start_time
             FROM attendance_logs al
             LEFT JOIN employee_shifts es ON al.emp_id = es.emp_id AND al.work_date = es.work_date
             LEFT JOIN shift_master sm ON COALESCE(es.shift_code, al.shift_type) = sm.shift_code
             WHERE al.emp_id IN (${placeholders}) 
               AND al.work_date BETWEEN ? AND ?`,
			[...empIds, startDate, endDate]
		);

        // 4. สร้าง Workbook ด้วยคลาสที่ Destructure มา
		const workbook = new Workbook();
		const worksheet = workbook.addWorksheet(
			`Schedule ${targetYear}-${String(targetMonth).padStart(2, '0')}`
		);

		worksheet.mergeCells('A1:F1');
		worksheet.getCell('A1').value = 'Shift Legend (คำอธิบายสัญลักษณ์)';
		worksheet.getCell('A1').font = { bold: true, size: 12 };

		const legends = [
			{ code: 'D', name: 'Day Shift (กะเช้า)', bg: 'FFFFEDD5', fg: 'FF9A3412' },
			{ code: 'N', name: 'Night Shift (กะดึก)', bg: 'FF2563EB', fg: 'FFFFFFFF' },
			{ code: 'L', name: 'Leave (ลา)', bg: 'FFDC2626', fg: 'FFFFFFFF' },
			{ code: 'O', name: 'Day Off (วันหยุด)', bg: 'FFF3F4F6', fg: 'FF4B5563' },
			{ code: 'DAY OFF', name: 'Day Off (วันหยุด)', bg: 'FFF3F4F6', fg: 'FF4B5563' }
		];

		legends.forEach((l, i) => {
			const rowIdx = i + 2;
			const codeCell = worksheet.getCell(`A${rowIdx}`);
			const nameCell = worksheet.getCell(`B${rowIdx}`);
			codeCell.value = l.code;
			nameCell.value = `= ${l.name}`;

			codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.bg } };
			codeCell.font = { bold: true, color: { argb: l.fg } };
			codeCell.alignment = { horizontal: 'center' };
			codeCell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});

		const tableStartRow = 8;
		worksheet.views = [{ state: 'frozen', xSplit: 6, ySplit: tableStartRow }];

		const headerRowValues = ['รหัสพนักงาน', 'ชื่อ-นามสกุล', 'Division', 'Section', 'Group', 'Position'];
		for (let d = 1; d <= lastDay; d++) headerRowValues.push(`วันที่ ${d}`);
		const headerRow = worksheet.getRow(tableStartRow);
		headerRow.values = headerRowValues;
		headerRow.height = 25;

		headerRow.eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
			cell.alignment = { vertical: 'middle', horizontal: 'center' };
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});

		employees.forEach((emp: any) => {
			const rowData: any[] = [
				emp.emp_id, 
				emp.emp_name,
				emp.division || '-',
				emp.section || '-',
				emp.emp_group || '-',
				emp.position_name || '-'
			];
			for (let d = 1; d <= lastDay; d++) {
				const dateKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				const plan = plannedShifts.find(
					(p: any) => p.emp_id === emp.emp_id && p.work_date_str === dateKey
				);
				const log = logs.find((l: any) => l.emp_id === emp.emp_id && l.work_date_str === dateKey);

				let shiftCode = plan ? plan.shift_code : (log && log.shift_type ? log.shift_type : '-');
				let cellValue = shiftCode !== '-' ? `[${shiftCode}]` : '-';

				if (log) {
                    // คำนวณ OT เหมือนหน้าเว็บ
                    let calculatedOtHours = Number(log.ot_hours) || 0;

                    if (calculatedOtHours === 0 && log.scan_out_time && log.ot_start_time && log.start_time) {
                        try {
                            const [wYear, wMonth, wDay] = log.work_date_str.split('-').map(Number);
                            const scanOutDate = new Date(log.scan_out_time);
                            
                            const [startH, startM] = log.start_time.split(':').map(Number);
                            const [otH, otM] = log.ot_start_time.split(':').map(Number);

                            const isNextDay = otH < startH;
                            const targetOtStart = new Date(wYear, wMonth - 1, isNextDay ? wDay + 1 : wDay, otH, otM, 0);

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

                    const formatTime = (dateTimeStr: any) => {
                        if (!dateTimeStr) return '-';
                        let d: Date;
                        if (dateTimeStr instanceof Date) {
                            d = dateTimeStr;
                        } else {
                            const normalizedStr = typeof dateTimeStr === 'string' ? dateTimeStr.replace(' ', 'T') : String(dateTimeStr);
                            d = new Date(normalizedStr);
                        }
                        if (isNaN(d.getTime())) return '-';
                        return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    };

					const inTime = formatTime(log.scan_in_time);
					const outTime = formatTime(log.scan_out_time);
					const ot = calculatedOtHours > 0 ? `\nOT: ${calculatedOtHours}` : '';

					if (inTime !== '-' || outTime !== '-') {
                        if (cellValue === '-') cellValue = '';
                        else cellValue += '\n';
                        
                        cellValue += `${inTime} - ${outTime}${ot}`;
                    }
				}
				rowData.push(cellValue);
			}

			const row = worksheet.addRow(rowData);
			row.height = 45;

			row.eachCell((cell, colNumber) => {
				cell.border = {
					top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
					left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
					bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
					right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
				};

				if (colNumber <= 6) {
					cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
				} else {
					cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
					const val = cell.value ? cell.value.toString() : '';

					if (val.includes('[D]')) {
						cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
						cell.font = { color: { argb: 'FF9A3412' } };
					} else if (val.includes('[N]')) {
						cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
						cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
					} else if (val.includes('[L]')) {
						cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
						cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
					} else if (val.includes('[O]') || val.includes('[DAY OFF]') || val === '-') {
						cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
						cell.font = { color: { argb: 'FF9CA3AF' } };
					} else if (val.includes('OT:')) {
						cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
						cell.font = { color: { argb: 'FF166534' } };
					}
				}
			});
		});

		worksheet.getColumn(1).width = 18; 
		worksheet.getColumn(2).width = 25; 
		worksheet.getColumn(3).width = 15; 
		worksheet.getColumn(4).width = 20; 
		worksheet.getColumn(5).width = 20; 
		worksheet.getColumn(6).width = 18; 
		for (let i = 7; i <= lastDay + 6; i++) worksheet.getColumn(i).width = 14;

		const buffer = await workbook.xlsx.writeBuffer();
		return new Response(buffer as BodyInit, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="Schedule_${monthQuery || targetYear + '-' + targetMonth}.xlsx"`
			}
		});
	} catch (error) {
		console.error("Export Error:", error);
		return new Response('Error Server Internal', { status: 500 });
	}
};