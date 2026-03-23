import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ url }: RequestEvent) => {
	// 1. จัดการวันที่และ Locale จาก URL
	const locale = url.searchParams.get('locale') || 'en';
	const dateFormatStr = locale === 'th' ? 'th-TH' : 'en-US';

	// ฟังก์ชันช่วยแปลภาษา
	const t = (key: string) => {
		const dict: Record<string, Record<string, string>> = {
			th: {
				'Job No.': 'เลขที่ใบงาน',
				'Date': 'วันที่',
				'Customer': 'ลูกค้า',
				'Total Expense': 'รวมค่าใช้จ่าย',
				'Job Expense Summary': 'สรุปค่าใช้จ่ายใบงาน'
			}
		};
		return dict[locale]?.[key] || key;
	};

	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	const formatYMD = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	};

	const startDate = url.searchParams.get('startDate') || formatYMD(firstDay);
	const endDate = url.searchParams.get('endDate') || formatYMD(lastDay);

	// 2. ดึงหมวดหมู่ค่าใช้จ่ายทั้งหมดมาทำเป็นคอลัมน์ (Columns)
	const [categoryRows] = await pool.query(
		'SELECT id, category_name FROM expense_categories ORDER BY id ASC'
	);
	const categories = categoryRows as any[];

	// 3. ดึงข้อมูลค่าใช้จ่าย
	const sql = `
		SELECT 
			j.id AS job_id, 
			j.job_number, 
			j.job_date, 
			c.company_name, 
			c.name AS customer_name,
			ec.id AS category_id, 
			SUM(je.total_amount) AS total_amount
		FROM job_expenses je
		INNER JOIN job_orders j ON je.job_order_id = j.id
		LEFT JOIN customers c ON j.customer_id = c.id
		INNER JOIN expense_items ei ON je.expense_item_id = ei.id
		INNER JOIN expense_categories ec ON ei.expense_category_id = ec.id
		WHERE j.job_date >= ? AND j.job_date <= ?
		GROUP BY j.id, ec.id
		ORDER BY j.job_date DESC, j.id DESC
	`;

	const [expenseRows] = await pool.query(sql, [startDate, endDate]);

	// 4. แปลงข้อมูลเป็น Pivot Map
	const pivotMap = new Map();

	for (const row of (expenseRows as any[])) {
		if (!pivotMap.has(row.job_id)) {
			pivotMap.set(row.job_id, {
				job_number: row.job_number || `JOB-${row.job_id}`,
				job_date: row.job_date,
				customer: row.company_name || row.customer_name || '-',
				expenses: {}, // เก็บแยกตาม category_id
				total: 0
			});
		}

		const jobData = pivotMap.get(row.job_id);
		const amount = Number(row.total_amount);

		jobData.expenses[row.category_id] = amount;
		jobData.total += amount;
	}

	const pivotData = Array.from(pivotMap.values());

	// 5. สร้าง Workbook & Worksheet สำหรับ Excel
	const workbook = new ExcelJS.Workbook();
	// ชื่อ Worksheet ห้ามเกิน 31 ตัวอักษร
	const worksheet = workbook.addWorksheet(t('Job Expense Summary').substring(0, 31)); 

	// กำหนดโครงสร้างคอลัมน์แบบ Fixed ทางซ้าย พร้อมแปลภาษา
	const columns = [
		{ header: t('Job No.'), key: 'job_number', width: 18 },
		{ header: t('Date'), key: 'job_date', width: 15 },
		{ header: t('Customer'), key: 'customer', width: 35 }
	];

	// เพิ่มคอลัมน์แบบ Dynamic ตามจำนวน Category ที่มี
	categories.forEach((cat) => {
		columns.push({ header: cat.category_name, key: `cat_${cat.id}`, width: 18 });
	});

	// เพิ่มคอลัมน์ผลรวมตอนท้ายสุด
	columns.push({ header: t('Total Expense'), key: 'total', width: 20 });
	
	worksheet.columns = columns;

	// จัดรูปแบบของ Header (ทำตัวหนาและมีสีพื้นหลัง)
	worksheet.getRow(1).font = { bold: true };
	worksheet.getRow(1).fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFEFEFEF' }
	};
    // จัดให้ Header อยู่ตรงกลางทั้งแนวตั้งและแนวนอน
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

	// เพิ่มข้อมูล Pivot Data ลงไปใน Worksheet ทีละแถว
	pivotData.forEach((job) => {
		const rowData: any = {
			job_number: job.job_number,
			// จัดรูปแบบวันที่ตามภาษาที่เลือก
			job_date: job.job_date ? new Date(job.job_date).toLocaleDateString(dateFormatStr) : '',
			customer: job.customer,
			total: job.total
		};

		// วนเอาค่าใช้จ่ายแต่ละ Category ใส่ลงไปในช่องที่ตรงกัน
		categories.forEach((cat) => {
			rowData[`cat_${cat.id}`] = job.expenses[cat.id] || 0;
		});

		worksheet.addRow(rowData);
	});

	// จัด Format ตัวเลข (ให้แสดง 2 ตำแหน่งและมีลูกน้ำ)
	categories.forEach((cat) => {
		worksheet.getColumn(`cat_${cat.id}`).numFmt = '#,##0.00';
	});
	worksheet.getColumn('total').numFmt = '#,##0.00';
    worksheet.getColumn('total').font = { bold: true, color: { argb: 'FF990000' } }; // เน้นสีแดงเข้มในช่องรวม

	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer as BlobPart, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Job_Expense_Summary_${locale}.xlsx"`
		}
	});
};