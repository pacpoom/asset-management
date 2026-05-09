import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import ExcelJS from 'exceljs';

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
		let empQuery = 'SELECT emp_id, emp_name FROM employees WHERE status = "Active"';
		let empParams: any[] = [];
		if (!isSuperAdmin && userDepartmentId !== null) {
			empQuery += ' AND department_id = ?';
			empParams.push(userDepartmentId);
		}
		const [employees]: any = await pool.execute(empQuery, empParams);
		const empIds = employees.map((e: any) => e.emp_id);

		if (empIds.length === 0) return new Response('No data', { status: 404 });

		const placeholders = empIds.map(() => '?').join(',');
		const [plannedShifts]: any = await pool.execute(
			`SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date, shift_code FROM employee_shifts WHERE emp_id IN (${placeholders}) AND work_date BETWEEN ? AND ?`,
			[...empIds, startDate, endDate]
		);

		const [logs]: any = await pool.execute(
			`SELECT 
                al.emp_id, 
                DATE_FORMAT(al.work_date, '%Y-%m-%d') as work_date, 
                COALESCE(es.shift_code, al.shift_type) as shift_type,
                DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
                DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
                
                CASE 
                    WHEN sm.ot_start_time IS NOT NULL AND sm.ot_start_time <= sm.start_time THEN
                        IF(al.scan_out_time IS NOT NULL AND TIME(al.scan_out_time) > sm.ot_start_time,
                            FLOOR(GREATEST(0, TIME_TO_SEC(TIMEDIFF(TIME(al.scan_out_time), sm.ot_start_time)) / 60) / 30) * 0.5,
                            0
                        )
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

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet(
			`Schedule ${targetYear}-${String(targetMonth).padStart(2, '0')}`
		);

		worksheet.mergeCells('A1:B1');
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
		worksheet.views = [{ state: 'frozen', xSplit: 2, ySplit: tableStartRow }];

		const headerRowValues = ['รหัสพนักงาน', 'ชื่อ-นามสกุล'];
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
			const rowData: any[] = [emp.emp_id, emp.emp_name];
			for (let d = 1; d <= lastDay; d++) {
				const dateKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				const plan = plannedShifts.find(
					(p: any) => p.emp_id === emp.emp_id && p.work_date === dateKey
				);
				const log = logs.find((l: any) => l.emp_id === emp.emp_id && l.work_date === dateKey);

				let cellValue = plan ? `[${plan.shift_code}]` : '-';
				if (log) {
					const inTime = log.time_in || '-';
					const outTime = log.time_out || '-';
					const otHoursNum = Number(log.ot_hours);
					const ot = otHoursNum > 0 ? `\nOT: ${otHoursNum}` : '';

					if (inTime !== '-' || outTime !== '-') cellValue += `\n${inTime} - ${outTime}${ot}`;
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

				if (colNumber <= 2) {
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
		worksheet.getColumn(2).width = 28;
		for (let i = 3; i <= lastDay + 2; i++) worksheet.getColumn(i).width = 14;

		const buffer = await workbook.xlsx.writeBuffer();
		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename=Schedule_${monthQuery || targetYear + '-' + targetMonth}.xlsx`
			}
		});
	} catch (error) {
		console.error(error);
		return new Response('Error', { status: 500 });
	}
};
