import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	let displayDate = url.searchParams.get('date');
	if (!displayDate) {
		const todayObj = new Date();
		const offset = todayObj.getTimezoneOffset() * 60000;
		displayDate = new Date(todayObj.getTime() - offset).toISOString().split('T')[0];
	}

	const sectionFilter = url.searchParams.get('section') || 'All';
	const groupFilter = url.searchParams.get('group') || 'All';

	try {
		let empWhere = '';
		const params: any[] = [displayDate];

		if (sectionFilter !== 'All') {
			empWhere += ` AND e.section = ?`;
			params.push(sectionFilter);
		}
		if (groupFilter !== 'All') {
			empWhere += ` AND e.emp_group = ?`;
			params.push(groupFilter);
		}

		const query = `
			SELECT 
				e.emp_id, 
				e.emp_name, 
				IFNULL(e.emp_group, '-') as emp_group,
				DATE_FORMAT(al.scan_in_time, '%H:%i') as time_in,
				DATE_FORMAT(al.scan_out_time, '%H:%i') as time_out,
				IFNULL(al.status, 'Pending') as status,
				IFNULL(al.shift_type, 'Day') as shift_type,
				al.remark
			FROM employees e
			LEFT JOIN attendance_logs al ON e.emp_id = al.emp_id AND al.work_date = ?
			WHERE 1=1 ${empWhere}
			ORDER BY e.emp_group ASC, e.emp_name ASC
		`;

		const [employeeList]: any = await pool.execute(query, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Leader Verification');

		worksheet.columns = [
			{ header: 'Group', key: 'emp_group', width: 15 },
			{ header: 'รหัสพนักงาน', key: 'emp_id', width: 15 },
			{ header: 'ชื่อ-นามสกุล', key: 'emp_name', width: 30 },
			{ header: 'กะทำงาน', key: 'shift_type', width: 15 },
			{ header: 'เวลาเข้า', key: 'time_in', width: 15 },
			{ header: 'เวลาออก', key: 'time_out', width: 15 },
			{ header: 'สถานะ (Status)', key: 'status', width: 20 },
			{ header: 'หมายเหตุ / การลา', key: 'remark', width: 35 }
		];

		worksheet.getRow(1).eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FF4F4F4F' }
			};
			cell.alignment = { vertical: 'middle', horizontal: 'center' };
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});

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
			const row = worksheet.addRow({
				emp_group: emp.emp_group,
				emp_id: emp.emp_id,
				emp_name: emp.emp_name,
				shift_type: emp.shift_type === 'Day' ? 'กะเช้า' : 'กะดึก',
				time_in: emp.time_in || '-',
				time_out: emp.time_out || '-',
				status: statusMap[emp.status] || emp.status,
				remark: emp.remark || '-'
			});

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
