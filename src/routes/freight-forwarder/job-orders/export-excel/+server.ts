import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ url }: RequestEvent) => {
	const search = url.searchParams.get('search') || '';
	
	// คำนวณวันที่เริ่มต้นและสิ้นสุดของเดือนปัจจุบันเป็น Default
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	const formatYMD = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	};

	const defaultStart = formatYMD(firstDay);
	const defaultEnd = formatYMD(lastDay);

	const startDate = url.searchParams.get('startDate') || defaultStart;
	const endDate = url.searchParams.get('endDate') || defaultEnd;

	let whereClause = 'WHERE j.job_date >= ? AND j.job_date <= ?';
	let queryParams: any[] = [startDate, endDate];

	// ใช้เงื่อนไขการค้นหาแบบเดียวกับในหน้า Job Order List
	if (search) {
		whereClause += ` AND (
			j.job_number LIKE ? 
			OR c.name LIKE ? 
			OR c.company_name LIKE ? 
			OR v.name LIKE ? 
			OR v.company_name LIKE ?
		)`;
		const searchParam = `%${search}%`;
		queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
	}

	const sql = `
		SELECT j.*, 
		       c.name as customer_name, c.company_name, c.phone as customer_phone,
		       v.name as vendor_name, v.company_name as vendor_company_name, v.phone as vendor_phone,
		       u.full_name as created_by_name
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
		LEFT JOIN users u ON j.created_by = u.id
		${whereClause}
		ORDER BY j.job_date DESC, j.id DESC
	`;

	const [rows] = await pool.query(sql, queryParams);
	const jobs = rows as any[];

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Job Orders');

	// กำหนดคอลัมน์ให้ตรงกับข้อมูลที่แสดงในหน้าตาราง
	worksheet.columns = [
		{ header: 'Job No.', key: 'job_number', width: 20 },
		{ header: 'Job Date', key: 'job_date', width: 15 },
		{ header: 'Type', key: 'job_type', width: 10 },
		{ header: 'Service', key: 'service_type', width: 15 },
		{ header: 'Customer', key: 'customer', width: 40 },
		{ header: 'Vendor', key: 'vendor', width: 40 },
		{ header: 'B/L Number', key: 'bl_number', width: 25 },
		{ header: 'Liner / Carrier', key: 'liner_name', width: 30 },
		{ header: 'Status', key: 'job_status', width: 15 },
		{ header: 'Amount', key: 'amount', width: 15 },
		{ header: 'Currency', key: 'currency', width: 10 },
		{ header: 'Created By', key: 'created_by_name', width: 25 }
	];

	// ตกแต่งส่วนหัว (Header Row)
	worksheet.getRow(1).font = { bold: true };
	worksheet.getRow(1).fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFE0E0E0' }
	};

	// นำข้อมูลเข้า Worksheet
	jobs.forEach((job) => {
		const displayJobNumber = job.job_number || `JOB-${job.id}`;
		const jobDate = job.job_date ? new Date(job.job_date).toLocaleDateString('th-TH') : '';
		const customer = job.company_name || job.customer_name || '-';
		const vendor = job.vendor_company_name || job.vendor_name || '-';

		worksheet.addRow({
			job_number: displayJobNumber,
			job_date: jobDate,
			job_type: job.job_type || '-',
			service_type: job.service_type || '-',
			customer: customer,
			vendor: vendor,
			bl_number: job.bl_number || '-',
			liner_name: job.liner_name || '-',
			job_status: job.job_status || '-',
			amount: Number(job.amount || 0),
			currency: job.currency || 'THB',
			created_by_name: job.created_by_name || '-'
		});
	});

	// จัด Format ของช่อง Amount ให้แสดงผลเป็นตัวเลขแบบมีลูกน้ำและทศนิยม
	worksheet.getColumn('amount').numFmt = '#,##0.00';

	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer as BlobPart, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="Job_Orders_Export.xlsx"'
		}
	});
};