import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/database';
// import { checkPermission } from '$lib/server/auth';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ url }) => {
	// หากมีระบบตรวจสอบสิทธิ์ ให้เปิดใช้งานบรรทัดล่างนี้
	// checkPermission(locals, 'export sales report');

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	
	const lastMonth = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');
	const lastMonthYear = now.getMonth() === 0 ? year - 1 : year;
	const defaultStartDate = `${lastMonthYear}-${lastMonth}-${day}`;
	const defaultEndDate = `${year}-${month}-${day}`;

	const searchQuery = url.searchParams.get('search') || '';
	const startDateParam = url.searchParams.get('startDate');
	const startDate = startDateParam !== null ? startDateParam : defaultStartDate;
	const endDateParam = url.searchParams.get('endDate');
	const endDate = endDateParam !== null ? endDateParam : defaultEndDate;
	const docTypeFilter = url.searchParams.get('docType') || '';

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                sd.document_number LIKE ? OR
                c.company_name LIKE ? OR
                j.job_number LIKE ? OR
                sdi.description LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND sd.document_date >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND sd.document_date <= ? `;
			params.push(endDate);
		}

		if (docTypeFilter) {
			whereClause += ` AND sd.document_type = ? `;
			params.push(docTypeFilter);
		}

		// ดึงข้อมูลรายการขายสำหรับการ Export Excel
		const dataSql = `
            SELECT 
				sdi.id as item_id,
				sdi.description,
				sdi.quantity,
				sdi.unit_price,
				sdi.line_total,
				sdi.is_vat,
				sdi.wht_rate,
				
				CASE 
					WHEN sdi.is_vat = 0 THEN sdi.line_total 
					WHEN sdi.is_vat = 1 THEN sdi.line_total * 100 / 107
					ELSE 0 
				END as vatable_amt,
				
				CASE 
					WHEN sdi.is_vat = 2 THEN sdi.line_total 
					ELSE 0 
				END as non_vatable_amt,
				
				CASE 
					WHEN sdi.is_vat = 0 THEN sdi.line_total * 0.07
					WHEN sdi.is_vat = 1 THEN sdi.line_total * 7 / 107
					ELSE 0 
				END as vat_amt,
				
				CASE
					WHEN sdi.is_vat = 0 THEN sdi.line_total * sdi.wht_rate / 100
					WHEN sdi.is_vat = 1 THEN (sdi.line_total * 100 / 107) * sdi.wht_rate / 100
					WHEN sdi.is_vat = 2 THEN sdi.line_total * sdi.wht_rate / 100
					ELSE 0
				END as wht_amt,
				
				sd.document_number,
				sd.document_date,
				sd.document_type,
				sd.status,
				c.company_name as customer_name,
				j.job_number
            FROM sales_document_items sdi
            JOIN sales_documents sd ON sdi.document_id = sd.id
			LEFT JOIN customers c ON sd.customer_id = c.id
			LEFT JOIN job_orders j ON sd.job_order_id = j.id
            ${whereClause}
            ORDER BY sd.document_date DESC, sd.document_number DESC, sdi.item_order ASC
        `;

		const [salesRows] = await pool.query<any[]>(dataSql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Sales Report');

		// ตั้งค่าหัวคอลัมน์ (Headers) เพิ่มคอลัมน์ VAT เพื่อความชัดเจน
		worksheet.columns = [
			{ header: 'Doc Date', key: 'document_date', width: 15 },
			{ header: 'Doc No.', key: 'document_number', width: 20 },
			{ header: 'Doc Type', key: 'document_type', width: 15 },
			{ header: 'Customer', key: 'customer_name', width: 35 },
			{ header: 'Job No.', key: 'job_number', width: 20 },
			{ header: 'Item Description', key: 'description', width: 45 },
			{ header: 'Qty', key: 'quantity', width: 10 },
			{ header: 'Unit Price', key: 'unit_price', width: 15 },
			{ header: 'Total', key: 'line_total', width: 15 },
			{ header: 'VAT Status', key: 'vat_status', width: 15 },
			{ header: 'Non-VAT Amt', key: 'non_vat_amt', width: 15 },
			{ header: 'Vatable Amt', key: 'vatable_amt', width: 15 },
			{ header: 'VAT Amt', key: 'vat_amt', width: 15 },
			{ header: 'WHT Amt', key: 'wht_amt', width: 15 },
			{ header: 'Net Total', key: 'net_total', width: 20 },
			{ header: 'Status', key: 'status', width: 15 }
		];

		// ตกแต่งหัวตาราง
		worksheet.getRow(1).font = { bold: true };
		worksheet.getRow(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFD3D3D3' }
		};

		let sumTotal = 0;
		let sumNonVat = 0;
		let sumVatable = 0;
		let sumVat = 0;
		let sumWht = 0;
		let sumNetTotal = 0;

		// ฟังก์ชันช่วยปัดเศษให้เหลือ 2 ตำแหน่งแบบมีนัยสำคัญ
		const round2 = (num: any) => Number(Number(num || 0).toFixed(2));

		// ลูปเขียนข้อมูล
		salesRows.forEach((row) => {
			const isVatType = row.is_vat;
			let vatStatusLabel = 'No VAT';
			if (isVatType == 0) vatStatusLabel = 'Exclude VAT';
			if (isVatType == 1) vatStatusLabel = 'Include VAT';

			// แปลงค่าและปัดเศษทศนิยมให้เป็น 2 ตำแหน่งเป๊ะๆ
			const lineTotal = round2(row.line_total);
			const vatableAmt = round2(row.vatable_amt);
			const nonVatAmt = round2(row.non_vatable_amt);
			const vatAmt = round2(row.vat_amt);
			const whtAmt = round2(row.wht_amt);
			const netTotal = round2(vatableAmt + nonVatAmt + vatAmt - whtAmt);

			// สะสมยอดรวม (ใช้ round2 ครอบอีกทีเพื่อป้องกัน Floating point bug ใน JS)
			sumTotal = round2(sumTotal + lineTotal);
			sumNonVat = round2(sumNonVat + nonVatAmt);
			sumVatable = round2(sumVatable + vatableAmt);
			sumVat = round2(sumVat + vatAmt);
			sumWht = round2(sumWht + whtAmt);
			sumNetTotal = round2(sumNetTotal + netTotal);

			worksheet.addRow({
				document_date: row.document_date ? new Date(row.document_date).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '-',
				document_number: row.document_number || '-',
				document_type: row.document_type || '-',
				customer_name: row.customer_name || '-',
				job_number: row.job_number || '-',
				description: row.description || '-',
				quantity: round2(row.quantity),
				unit_price: round2(row.unit_price),
				line_total: lineTotal,
				vat_status: vatStatusLabel,
				non_vat_amt: nonVatAmt,
				vatable_amt: vatableAmt,
				vat_amt: vatAmt,
				wht_amt: whtAmt,
				net_total: netTotal,
				status: row.status || '-'
			});
		});

		// เพิ่มแถว Grand Total ท้ายสุด
		const totalRow = worksheet.addRow({
			description: 'GRAND TOTAL',
			line_total: sumTotal,
			non_vat_amt: sumNonVat,
			vatable_amt: sumVatable,
			vat_amt: sumVat,
			wht_amt: sumWht,
			net_total: sumNetTotal
		});
		
		totalRow.font = { bold: true };
        totalRow.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFE8F4FF' } // สีฟ้าอ่อนเพื่อเน้นยอดรวม
		};

		// ตั้งค่า Format ตัวเลขทศนิยมให้แสดงแบบบัญชีใน Excel 
		// (แม้ค่าจะถูกปัดเศษเป็น 2 หลักแล้ว แต่ก็ควรจัด format เพื่อให้มีเครื่องหมายคอมม่าและแสดง .00 เสมอ)
		['G', 'H', 'I', 'K', 'L', 'M', 'N', 'O'].forEach(col => {
			worksheet.getColumn(col).numFmt = '#,##0.00';
		});

		const buffer = await workbook.xlsx.writeBuffer();
		const todayStr = new Date().toISOString().split('T')[0];
		const fileName = `sales-report-${todayStr}.xlsx`;

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${fileName}"`
			}
		});
	} catch (err) {
		console.error('Failed to export sales report:', err);
		throw error(500, 'Failed to generate Excel file');
	}
};