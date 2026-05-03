import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ url,locals }) => {
	// หากมีระบบตรวจสอบสิทธิ์ ให้เปิดใช้งานบรรทัดล่างนี้
	checkPermission(locals, 'export purchase report');

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
                pd.document_number LIKE ? OR
                v.company_name LIKE ? OR
                v.name LIKE ? OR
                j.job_number LIKE ? OR
                pdi.description LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND pd.document_date >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND pd.document_date <= ? `;
			params.push(endDate);
		}

		if (docTypeFilter) {
			whereClause += ` AND pd.document_type = ? `;
			params.push(docTypeFilter);
		}

		// ดึงข้อมูลรายการซื้อสำหรับการ Export Excel (VAT Type: 1=Inc, 2=Exc, 3=Non)
		const dataSql = `
            SELECT 
				pdi.id as item_id,
				pdi.description,
				pdi.quantity,
				pdi.unit_price,
				pdi.line_total,
				pdi.vat_type,
				pdi.wht_rate,
				
				CASE 
					WHEN pdi.vat_type = 2 THEN pdi.line_total 
					WHEN pdi.vat_type = 1 THEN pdi.line_total * 100 / (100 + COALESCE(pd.vat_rate, 7))
					ELSE 0 
				END as vatable_amt,
				
				CASE 
					WHEN pdi.vat_type = 3 THEN pdi.line_total 
					ELSE 0 
				END as non_vatable_amt,
				
				CASE 
					WHEN pdi.vat_type = 2 THEN pdi.line_total * COALESCE(pd.vat_rate, 7) / 100
					WHEN pdi.vat_type = 1 THEN pdi.line_total * COALESCE(pd.vat_rate, 7) / (100 + COALESCE(pd.vat_rate, 7))
					ELSE 0 
				END as vat_amt,
				
				COALESCE(pdi.wht_amount, 0) as wht_amt,
				
				pd.document_number,
				pd.document_date,
				pd.document_type,
				pd.status,
				COALESCE(v.company_name, v.name) as vendor_name,
				j.job_number
            FROM purchase_document_items pdi
            JOIN purchase_documents pd ON pdi.document_id = pd.id
			LEFT JOIN vendors v ON pd.vendor_id = v.id
			LEFT JOIN job_orders j ON pd.job_id = j.id
            ${whereClause}
            ORDER BY pd.document_date DESC, pd.document_number DESC, pdi.item_order ASC
        `;

		const [purchaseRows] = await pool.query<any[]>(dataSql, params);

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Purchase Report');

		worksheet.columns = [
			{ header: 'Doc Date', key: 'document_date', width: 15 },
			{ header: 'Doc No.', key: 'document_number', width: 20 },
			{ header: 'Doc Type', key: 'document_type', width: 15 },
			{ header: 'Vendor', key: 'vendor_name', width: 35 },
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

		// ฟังก์ชันช่วยปัดเศษให้เหลือ 2 ตำแหน่ง
		const round2 = (num: any) => Number(Number(num || 0).toFixed(2));

		// ลูปเขียนข้อมูล
		purchaseRows.forEach((row) => {
			const vatType = row.vat_type;
			let vatStatusLabel = 'No VAT';
			if (vatType == 2) vatStatusLabel = 'Exclude VAT';
			if (vatType == 1) vatStatusLabel = 'Include VAT';

			const lineTotal = round2(row.line_total);
			const vatableAmt = round2(row.vatable_amt);
			const nonVatAmt = round2(row.non_vatable_amt);
			const vatAmt = round2(row.vat_amt);
			const whtAmt = round2(row.wht_amt);
			const netTotal = round2(vatableAmt + nonVatAmt + vatAmt - whtAmt);

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
				vendor_name: row.vendor_name || '-',
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

		// เพิ่มแถว Grand Total
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
			fgColor: { argb: 'FFE8EAF6' } // สีม่วงอมน้ำเงินอ่อนๆ สำหรับ Purchase
		};

		// ตั้งค่า Format ตัวเลขทศนิยม
		['G', 'H', 'I', 'K', 'L', 'M', 'N', 'O'].forEach(col => {
			worksheet.getColumn(col).numFmt = '#,##0.00';
		});

		const buffer = await workbook.xlsx.writeBuffer();
		const todayStr = new Date().toISOString().split('T')[0];
		const fileName = `purchase-report-${todayStr}.xlsx`;

		return new Response(buffer as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${fileName}"`
			}
		});
	} catch (err) {
		console.error('Failed to export purchase report:', err);
		throw error(500, 'Failed to generate Excel file');
	}
};