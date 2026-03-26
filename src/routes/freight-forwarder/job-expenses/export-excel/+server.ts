import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ url }: RequestEvent) => {
	// 1. จัดการวันที่, View By และ Locale จาก URL
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
				'Job Expense Summary': 'สรุปค่าใช้จ่ายใบงาน',
				'Uncategorized': 'ไม่ระบุหมวดหมู่'
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
	const viewBy = url.searchParams.get('viewBy') || 'category';

	// 2. ดึงหมวดหมู่หรือรายการมาทำเป็นคอลัมน์ (Columns) ตามที่เลือก
	let columnsData = [];
	if (viewBy === 'item') {
		// ดึง category_name มาด้วยเพื่อทำ Grouping Header และเรียงลำดับตาม Category -> Item
		const [itemRows] = await pool.query(
			`SELECT ei.id, ei.item_name as name, ec.category_name 
			 FROM expense_items ei
			 LEFT JOIN expense_categories ec ON ei.expense_category_id = ec.id
			 ORDER BY ec.category_name ASC, ei.item_name ASC`
		);
		columnsData = itemRows as any[];
	} else {
		const [categoryRows] = await pool.query(
			'SELECT id, category_name as name FROM expense_categories ORDER BY id ASC'
		);
		columnsData = categoryRows as any[];
	}

	// 3. ดึงข้อมูลค่าใช้จ่าย
	const groupByCol = viewBy === 'item' ? 'ei.id' : 'ec.id';
	const sql = `
		SELECT 
			j.id AS job_id, 
			j.job_number, 
			j.job_date, 
			c.company_name, 
			c.name AS customer_name,
			${groupByCol} AS col_id, 
			SUM(je.total_amount) AS total_amount
		FROM job_expenses je
		INNER JOIN job_orders j ON je.job_order_id = j.id
		LEFT JOIN customers c ON j.customer_id = c.id
		INNER JOIN expense_items ei ON je.expense_item_id = ei.id
		INNER JOIN expense_categories ec ON ei.expense_category_id = ec.id
		WHERE j.job_date >= ? AND j.job_date <= ?
		GROUP BY j.id, ${groupByCol}
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
				expenses: {}, // เก็บแยกตาม col_id (category_id หรือ item_id)
				total: 0
			});
		}

		const jobData = pivotMap.get(row.job_id);
		const amount = Number(row.total_amount);

		jobData.expenses[row.col_id] = amount;
		jobData.total += amount;
	}

	const pivotData = Array.from(pivotMap.values());

	// 5. สร้าง Workbook & Worksheet สำหรับ Excel
	const workbook = new ExcelJS.Workbook();
	const worksheetName = `${t('Job Expense Summary')} (${viewBy})`.substring(0, 31); 
	const worksheet = workbook.addWorksheet(worksheetName); 

	// 5.1 กำหนดโครงสร้างคอลัมน์แบบ Fixed (กำหนดแค่ key และความกว้าง ยังไม่ใส่ header)
	const columnsConfig: Partial<ExcelJS.Column>[] = [
		{ key: 'job_number', width: 18 },
		{ key: 'job_date', width: 15 },
		{ key: 'customer', width: 35 }
	];

	// เพิ่มคอลัมน์แบบ Dynamic
	columnsData.forEach((col) => {
		columnsConfig.push({ key: `col_${col.id}`, width: 18 });
	});

	// เพิ่มคอลัมน์ผลรวม
	columnsConfig.push({ key: 'total', width: 20 });
	worksheet.columns = columnsConfig;

	// 5.2 สร้าง Custom Header (รองรับแบบ 2 ชั้นสำหรับ Item)
	if (viewBy === 'item') {
		// แถวที่ 1 (ชื่อ Category)
		const headerRow1 = [t('Job No.'), t('Date'), t('Customer')];
		columnsData.forEach(col => {
			headerRow1.push(col.category_name || t('Uncategorized'));
		});
		headerRow1.push(t('Total Expense'));
		worksheet.addRow(headerRow1);

		// แถวที่ 2 (ชื่อ Item)
		const headerRow2 = ['', '', '']; // ปล่อยว่างสำหรับคอลัมน์ที่จะ Merge
		columnsData.forEach(col => {
			headerRow2.push(col.name);
		});
		headerRow2.push('');
		worksheet.addRow(headerRow2);

		// --- ตกแต่งและรวมเซลล์ (Merge Cells) ---
		
		// 1. Merge คอลัมน์พื้นฐาน (Job No., Date, Customer, Total Expense) แนวตั้ง
		worksheet.mergeCells('A1:A2');
		worksheet.mergeCells('B1:B2');
		worksheet.mergeCells('C1:C2');
		
		const totalColLetter = worksheet.getColumn(columnsConfig.length).letter;
		worksheet.mergeCells(`${totalColLetter}1:${totalColLetter}2`);

		// 2. Merge หมวดหมู่ (Category) แนวนอน
		let startMergeCol = 4; // ข้อมูลเริ่มที่คอลัมน์ D (index 4)
		for (let i = 4; i <= columnsData.length + 3; i++) {
			const currentCategory = headerRow1[i - 1]; // Array index starts from 0
			const nextCategory = i <= columnsData.length + 2 ? headerRow1[i] : null;

			// ถ้ารายการถัดไปไม่ใช่ Category เดิม หรือเป็นรายการสุดท้าย ให้ทำการ Merge
			if (currentCategory !== nextCategory) {
				if (startMergeCol < i) {
					worksheet.mergeCells(1, startMergeCol, 1, i);
				}
				startMergeCol = i + 1; // เริ่ม Group ถัดไป
			}
		}

		// กำหนดสไตล์ให้ Header ทั้ง 2 แถว
		[1, 2].forEach(rowNum => {
			const row = worksheet.getRow(rowNum);
			row.font = { bold: true };
			row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
			row.alignment = { vertical: 'middle', horizontal: 'center' };
		});

	} else {
		// มุมมอง Category แบบปกติ (Header ชั้นเดียว)
		const headerRow1 = [t('Job No.'), t('Date'), t('Customer')];
		columnsData.forEach(col => {
			headerRow1.push(col.name);
		});
		headerRow1.push(t('Total Expense'));
		
		worksheet.addRow(headerRow1);

		const row = worksheet.getRow(1);
		row.font = { bold: true };
		row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
		row.alignment = { vertical: 'middle', horizontal: 'center' };
	}

	// 5.3 เพิ่มข้อมูล Pivot Data ลงไปใน Worksheet ทีละแถว
	pivotData.forEach((job) => {
		const rowData: any = {
			job_number: job.job_number,
			job_date: job.job_date ? new Date(job.job_date).toLocaleDateString(dateFormatStr) : '',
			customer: job.customer,
			total: job.total
		};

		// หยอดค่าใช้จ่าย
		columnsData.forEach((col) => {
			rowData[`col_${col.id}`] = job.expenses[col.id] || 0;
		});

		worksheet.addRow(rowData);
	});

	// จัด Format ตัวเลข
	columnsData.forEach((col) => {
		worksheet.getColumn(`col_${col.id}`).numFmt = '#,##0.00';
	});
	worksheet.getColumn('total').numFmt = '#,##0.00';
	worksheet.getColumn('total').font = { bold: true, color: { argb: 'FF990000' } }; 

	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer as BlobPart, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Job_Expense_Summary_${viewBy}_${locale}.xlsx"`
		}
	});
};