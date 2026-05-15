import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	let displayDate = url.searchParams.get('date');
	if (!displayDate) {
		const todayObj = new Date();
		const offset = todayObj.getTimezoneOffset() * 60000;
		displayDate = new Date(todayObj.getTime() - offset).toISOString().split('T')[0];
	}

	const sectionFilter = url.searchParams.get('section') || 'All';
	const groupFilter = url.searchParams.get('group') || 'All';

	const userDeptId = locals.user?.department_id;

	try {
		let empWhere = '';
		const params: any[] = [displayDate];

		if (userDeptId) {
			empWhere += ` AND e.department_id = ?`;
			params.push(userDeptId);
		}

		if (sectionFilter !== 'All') {
			empWhere += ` AND e.section = ?`;
			params.push(sectionFilter);
		}
		if (groupFilter !== 'All') {
			empWhere += ` AND e.emp_group = ?`;
			params.push(groupFilter);
		}

		const summaryQuery = `
			SELECT 
				IFNULL(e.division, '-') as division,
				IFNULL(e.section, '-') as section,
				IFNULL(e.emp_group, '-') as emp_group,
				COUNT(e.emp_id) as total_plan,
				SUM(CASE WHEN al.status IN ('Present', 'Late') OR al.scan_in_time IS NOT NULL THEN 1 ELSE 0 END) as attendance
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			WHERE 1=1 ${empWhere}
			GROUP BY e.division, e.section, e.emp_group
			ORDER BY e.section ASC, e.emp_group ASC
		`;
		const [summaryData]: any = await pool.execute(summaryQuery, params);

		const groups: Record<string, any> = {};
		const costPlusGroups = [
			'Parts Reflash',
			'Parts Rework',
			'New Model',
			'KD-MJV',
			'Container Exchange',
			'Maid'
		];

		for (const row of summaryData) {
			let cardName = row.division;
			if (
				row.emp_group &&
				(costPlusGroups.includes(row.emp_group) || row.emp_group.includes('Cost Plus'))
			) {
				cardName = 'Cost Plus';
			} else if (!cardName || cardName === '-') {
				cardName = 'ไม่ระบุ Division';
			}

			if (!groups[cardName]) {
				groups[cardName] = { sections: [], totalPlan: 0, totalAtt: 0, percent: 0 };
			}

			groups[cardName].sections.push(row);
			groups[cardName].totalPlan += Number(row.total_plan || 0);
			groups[cardName].totalAtt += Number(row.attendance || 0);
		}

		for (const key in groups) {
			groups[key].percent =
				groups[key].totalPlan > 0
					? Math.round((groups[key].totalAtt / groups[key].totalPlan) * 100)
					: 0;
		}

		const query = `
			SELECT 
				e.emp_id, 
				e.emp_name, 
				IFNULL(e.emp_group, '-') as emp_group,
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
				IFNULL(al.status, 'Pending') as status,
				COALESCE(
					al.shift_type, 
					(SELECT shift_code FROM employee_shifts WHERE emp_id = e.emp_id AND work_date = ? LIMIT 1),
					e.default_shift, 
					'D'
				) as shift_type,
				al.remark,
				lt.leave_name_th 
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			LEFT JOIN leave_types lt ON al.remark = lt.leave_name_en 
			WHERE 1=1 ${empWhere}
			ORDER BY e.emp_group ASC, e.emp_name ASC
		`;

		const [employeeList]: any = await pool.execute(query, [displayDate, ...params]);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Leader Verification');

		worksheet.getColumn(1).width = 15;
		worksheet.getColumn(2).width = 15;
		worksheet.getColumn(3).width = 30;
		worksheet.getColumn(4).width = 15;
		worksheet.getColumn(5).width = 15;
		worksheet.getColumn(6).width = 15;
		worksheet.getColumn(7).width = 20;
		worksheet.getColumn(8).width = 35;

		let currentRow = 1;

		worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
		worksheet.getCell(`A${currentRow}`).value = `สรุปยอดพนักงานประจำวัน (Summary) - ${displayDate}`;
		worksheet.getCell(`A${currentRow}`).font = {
			bold: true,
			size: 14,
			color: { argb: 'FF1F2937' }
		};
		currentRow += 2;

		const sortedDivNames = Object.keys(groups).sort((a, b) => {
			const order = ['MH-1', 'MH-2', 'Cost Plus'];
			const indexA = order.indexOf(a);
			const indexB = order.indexOf(b);

			if (indexA !== -1 && indexB !== -1) return indexA - indexB;
			if (indexA !== -1) return -1;
			if (indexB !== -1) return 1;

			return a.localeCompare(b);
		});

		for (const divName of sortedDivNames) {
			const divData = groups[divName];

			worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
			worksheet.getCell(`A${currentRow}`).value =
				`${divName}   |   Plan: ${divData.totalPlan}   |   Actual (Att.): ${divData.totalAtt}   |   ${divData.percent}%`;
			worksheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
			worksheet.getCell(`A${currentRow}`).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FF1E3A8A' }
			};
			worksheet.getCell(`A${currentRow}`).alignment = {
				vertical: 'middle',
				horizontal: 'left',
				indent: 1
			};
			currentRow++;

			worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
			worksheet.getCell(`A${currentRow}`).value = 'Group (Section)';
			worksheet.getCell(`C${currentRow}`).value = 'Plan';
			worksheet.getCell(`D${currentRow}`).value = 'Att.';
			worksheet.getCell(`E${currentRow}`).value = '%';

			[1, 3, 4, 5].forEach((c) => {
				let cell = worksheet.getCell(currentRow, c);
				if (c === 1) cell = worksheet.getCell(`A${currentRow}`);
				cell.font = { bold: true };
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
				cell.border = {
					top: { style: 'thin' },
					bottom: { style: 'thin' },
					left: { style: 'thin' },
					right: { style: 'thin' }
				};
				cell.alignment = { vertical: 'middle', horizontal: 'center' };
			});
			currentRow++;

			for (const sec of divData.sections) {
				const secPercent =
					sec.total_plan > 0 ? Math.round((sec.attendance / sec.total_plan) * 100) : 0;

				let secName = sec.emp_group !== '-' && sec.emp_group ? sec.emp_group : 'ไม่ระบุ Group';
				if (sec.section && sec.section !== '-') secName += `\n(${sec.section})`;

				worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
				worksheet.getCell(`A${currentRow}`).value = secName;
				worksheet.getCell(`C${currentRow}`).value = sec.total_plan;
				worksheet.getCell(`D${currentRow}`).value = sec.attendance;
				worksheet.getCell(`E${currentRow}`).value = `${secPercent}%`;

				[1, 3, 4, 5].forEach((c) => {
					let cell = worksheet.getCell(currentRow, c);
					if (c === 1) cell = worksheet.getCell(`A${currentRow}`);
					cell.border = {
						top: { style: 'thin' },
						bottom: { style: 'thin' },
						left: { style: 'thin' },
						right: { style: 'thin' }
					};
					cell.alignment = {
						vertical: 'middle',
						horizontal: c === 1 ? 'left' : 'center',
						wrapText: true
					};
				});
				currentRow++;
			}
			currentRow++;
		}

		currentRow += 1;

		const mainHeaderRow = worksheet.getRow(currentRow);
		mainHeaderRow.values = [
			'Group',
			'รหัสพนักงาน',
			'ชื่อ-นามสกุล',
			'กะทำงาน',
			'เวลาเข้า',
			'เวลาออก',
			'สถานะ (Status)',
			'หมายเหตุ / การลา'
		];
		mainHeaderRow.height = 25;
		mainHeaderRow.eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F4F4F' } };
			cell.alignment = { vertical: 'middle', horizontal: 'center' };
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});
		currentRow++;

		const statusMap: Record<string, string> = {
			Pending: 'รอระบุสถานะ',
			Present: 'มาปกติ',
			Late: 'มาสาย',
			'Leave Morning': 'ลาครึ่งวันเช้า',
			'Leave Afternoon': 'ลาครึ่งวันบ่าย',
			'Leave Full Day': 'ลาเต็มวัน',
			Absent: 'ขาดงาน'
		};

		employeeList.forEach((emp: any) => {
			const row = worksheet.getRow(currentRow);
			row.values = [
				emp.emp_group,
				emp.emp_id,
				emp.emp_name,
				emp.shift_type === 'D' || emp.shift_type === 'Day' ? 'กะเช้า' : 'กะดึก',
				emp.time_in || '-',
				emp.time_out || '-',
				statusMap[emp.status] || emp.status,
				emp.leave_name_th ? `${emp.leave_name_th} (${emp.remark})` : emp.remark || '-'
			];

			row.eachCell((cell, colNumber) => {
				if (colNumber === 3 || colNumber === 8) {
					cell.alignment = { vertical: 'middle', horizontal: 'left' };
				} else {
					cell.alignment = { vertical: 'middle', horizontal: 'center' };
				}
				cell.border = {
					top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
					left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
					bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
					right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
				};
			});
			currentRow++;
		});

		const buffer = await workbook.xlsx.writeBuffer();
		const filename = `Verification_${displayDate}.xlsx`;

		return new Response(buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		console.error('Export Verification Error:', error);
		return new Response('เกิดข้อผิดพลาดในการสร้างไฟล์ Excel', { status: 500 });
	}
};
