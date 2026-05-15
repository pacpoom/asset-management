import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
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
		const [shifts]: any = await pool.query(
			`SELECT shift_code, shift_name, start_time, end_time, ot_start_time, color_theme FROM shift_master WHERE status = 'Active'`
		);

		const shiftDataMap: Record<string, any> = {};
		if (Array.isArray(shifts)) {
			for (const s of shifts) {
				shiftDataMap[s.shift_code] = {
					name: s.shift_name,
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
                e.division,
                e.section,
                e.emp_group,
                jp.position_name
            FROM employees e
            LEFT JOIN job_positions jp ON e.position_id = jp.id
            WHERE e.status = 'Active'
        `;
		const empParams: any[] = [];
		if (!isSuperAdmin && userDepartmentId !== null) {
			empQuery += ' AND e.department_id = ?';
			empParams.push(userDepartmentId);
		}
		const [employees]: any = await pool.query(empQuery, empParams);

		if (!Array.isArray(employees) || employees.length === 0) {
			return new Response('No data', { status: 404 });
		}

		const scheduleMap: Record<string, Record<string, any>> = {};
		const empIds = employees.map((e) => e.emp_id);
		for (const emp of employees) {
			scheduleMap[emp.emp_id] = {};
		}

		const placeholders = empIds.map(() => '?').join(',');

		const [plannedShifts]: any = await pool.query(
			`SELECT emp_id, DATE_FORMAT(work_date, '%Y-%m-%d') as work_date_str, shift_code 
             FROM employee_shifts WHERE emp_id IN (${placeholders}) AND work_date BETWEEN ? AND ?`,
			[...empIds, startDate, endDate]
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
                scan_in_time, 
                scan_out_time, 
                ot_hours 
             FROM attendance_logs 
             WHERE emp_id IN (${placeholders}) AND work_date BETWEEN ? AND ?`,
			[...empIds, startDate, endDate]
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
								if (calculated > 0) calculatedOtHours = calculated;
							}
						} catch (e) {}
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

		const formatTime = (dateTimeStr: any) => {
			if (!dateTimeStr) return null;
			let d: Date;
			if (dateTimeStr instanceof Date) {
				d = dateTimeStr;
			} else {
				const normalizedStr =
					typeof dateTimeStr === 'string' ? dateTimeStr.replace(' ', 'T') : String(dateTimeStr);
				d = new Date(normalizedStr);
			}
			if (isNaN(d.getTime())) return null;
			return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
		};

		const excelColors: Record<string, { bg: string; fg: string }> = {
			orange: { bg: 'FFFFEDD5', fg: 'FF9A3412' },
			red: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
			blue: { bg: 'FFDBEAFE', fg: 'FF1E40AF' },
			gray: { bg: 'FFF3F4F6', fg: 'FF4B5563' },
			green: { bg: 'FFDCFCE7', fg: 'FF166534' }
		};

		const workbook = new Workbook();
		const worksheet = workbook.addWorksheet(
			`Schedule ${targetYear}-${String(targetMonth).padStart(2, '0')}`
		);

		worksheet.mergeCells('A1:B1');
		worksheet.getCell('A1').value = 'Shift Legend (คำอธิบายสัญลักษณ์)';
		worksheet.getCell('A1').font = { bold: true, size: 12 };

		let rowIdx = 2;
		for (const [code, data] of Object.entries(shiftDataMap)) {
			// 🌟 ซ่อน L = Leave
			if (code === 'L') continue;

			let displayCode = code;
			let displayName = data.name;

			// 🌟 เปลี่ยน O เป็น H = Holiday
			if (code === 'O') {
				displayCode = 'H';
				displayName = 'Holiday';
			}

			const color = excelColors[data.color] || excelColors['gray'];
			const codeCell = worksheet.getCell(`A${rowIdx}`);
			const nameCell = worksheet.getCell(`B${rowIdx}`);
			codeCell.value = displayCode;
			nameCell.value = `= ${displayName}`;
			codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.bg } };
			codeCell.font = { bold: true, color: { argb: color.fg } };
			codeCell.alignment = { horizontal: 'center' };
			rowIdx++;
		}

		const tableStartRow = rowIdx + 1;
		worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: tableStartRow }];

		// 🌟 แยกคอลัมน์ OT ออกมาต่างหาก (1 ช่องเวลา, 1 ช่อง OT)
		const headerRowValues = ['ข้อมูลพนักงาน'];
		for (let d = 1; d <= lastDay; d++) {
			headerRowValues.push(`${d}`);
			headerRowValues.push(`OT`);
		}

		const headerRow = worksheet.getRow(tableStartRow);
		headerRow.values = headerRowValues;
		headerRow.height = 30;

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
			let empInfo = `${emp.emp_name}  (${emp.emp_id})`;
			if (emp.division || emp.section)
				empInfo += `\nDiv/Sec:  ${emp.division || '-'} / ${emp.section || '-'}`;
			if (emp.emp_group) empInfo += `\nGroup:  ${emp.emp_group}`;
			if (emp.position_name) empInfo += `\nPosition:  ${emp.position_name}`;

			const rowData: any[] = [empInfo];

			for (let d = 1; d <= lastDay; d++) {
				const dateKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				const dayData = scheduleMap[emp.emp_id][dateKey];

				if (dayData) {
					const tIn = formatTime(dayData.timeIn);
					const tOut = formatTime(dayData.timeOut);

					// 🌟 เปลี่ยน O เป็น H
					let displayShift = dayData.shift === 'O' ? 'H' : dayData.shift;
					let cellVal = `${displayShift}`;

					if (tIn || tOut) {
						cellVal += `\n${tIn || '--:--'} | ${tOut || '--:--'}`;
					} else {
						cellVal += `\nไม่มีสแกน`;
					}
					rowData.push(cellVal); // ช่องที่ 1: เวลาเข้า-ออก

					// 🌟 ช่องที่ 2: OT แยกคอลัมน์มาเลย
					if (dayData.otHours > 0) {
						rowData.push(`${dayData.otHours}h`);
					} else {
						rowData.push('-');
					}
				} else {
					rowData.push('-'); // ช่องเวลา
					rowData.push('-'); // ช่อง OT
				}
			}

			const row = worksheet.addRow(rowData);
			row.height = 75;

			row.eachCell((cell, colNumber) => {
				cell.border = {
					top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
					left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
					bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
					right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
				};

				cell.alignment = {
					wrapText: true,
					vertical: 'middle',
					horizontal: colNumber === 1 ? 'left' : 'center'
				};

				if (colNumber > 1) {
					// 🌟 จัดสีสลับช่อง (ช่องเวลาเป็นสีตามกะ, ช่อง OT เป็นสีชมพูอ่อนตัวแดง)
					const isOTColumn = colNumber % 2 === 1; // คอลัมน์เลขคี่คือ OT
					const d = Math.floor(colNumber / 2);
					const dateKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
					const dayData = scheduleMap[emp.emp_id]?.[dateKey];

					if (dayData && cell.value !== '-') {
						if (isOTColumn) {
							// สีช่อง OT
							cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F5' } };
							cell.font = { color: { argb: 'FFDC2626' }, bold: true };
						} else {
							// สีช่องเวลา
							const color = excelColors[dayData.color] || excelColors['gray'];
							cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.bg } };

							if (dayData.color === 'gray' || dayData.shift === 'O' || dayData.shift === '0') {
								cell.font = { color: { argb: 'FF9CA3AF' }, bold: true };
							} else {
								cell.font = { color: { argb: color.fg }, bold: true };
							}
						}
					} else {
						cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
						cell.font = { color: { argb: 'FF9CA3AF' } };
					}
				}
			});
		});

		worksheet.getColumn(1).width = 45;
		// 🌟 ปรับขนาดความกว้างคอลัมน์ (เวลาให้กว้างหน่อย, OT ให้แคบหน่อย)
		for (let i = 2; i <= lastDay * 2 + 1; i++) {
			if (i % 2 === 0) {
				worksheet.getColumn(i).width = 16;
			} else {
				worksheet.getColumn(i).width = 8;
			}
		}

		const buffer = await workbook.xlsx.writeBuffer();
		return new Response(buffer as BodyInit, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="Schedule_${monthQuery || targetYear + '-' + targetMonth}.xlsx"`
			}
		});
	} catch (error) {
		console.error('Export Error:', error);
		return new Response('Error Server Internal', { status: 500 });
	}
};
