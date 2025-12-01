import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

// --- INTERFACES ---

interface CompanyData extends RowDataPacket {
	id: number;
	name: string;
	logo_path: string | null;
	address_line_1: string | null;
	address_line_2: string | null;
	city: string | null;
	state_province: string | null;
	postal_code: string | null;
	country: string | null;
	tax_id: string | null;
}

interface InvoiceData extends RowDataPacket {
	id: number;
	invoice_number: string;
	invoice_date: string;
	due_date: string | null;
	reference_doc: string | null;

	// ข้อมูลลูกค้า (Join)
	customer_name: string;
	customer_address: string | null;
	customer_tax_id: string | null;
	created_by_name: string;

	// ตัวเลขการเงิน
	subtotal: number;
	discount_amount: number;
	total_after_discount: number;
	vat_rate: number;
	vat_amount: number;
	withholding_tax_rate: number;
	withholding_tax_amount: number;
	total_amount: number;
}

interface ItemData {
	description: string;
	quantity: number;
	unit_price: number;
	line_total: number;
}

// --- Helper Functions ---

function bahttext(input: number | string): string {
	let num = parseFloat(String(input));
	if (isNaN(num)) {
		num = 0;
	}
	const THAI_NUMBERS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
	const THAI_UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
	const THAI_MILLION = 'ล้าน';

	const numberStr = num.toFixed(2);
	const [integerPart, decimalPart] = numberStr.split('.');

	function convertInteger(numStr: string): string {
		let result = '';
		const len = numStr.length;
		if (len > 7) {
			const millionsPart = numStr.substring(0, len - 6);
			const restPart = numStr.substring(len - 6);
			result = convertInteger(millionsPart) + THAI_MILLION + convertInteger(restPart);
		} else {
			for (let i = 0; i < len; i++) {
				const digit = parseInt(numStr[i]);
				const unitIndex = len - 1 - i;
				if (digit === 0) continue;
				if (digit === 1) {
					if (unitIndex === 1) result += 'สิบ';
					else if (unitIndex === 0 && len > 1) result += 'เอ็ด';
					else result += THAI_NUMBERS[digit] + THAI_UNITS[unitIndex];
				} else if (digit === 2 && unitIndex === 1) {
					result += 'ยี่สิบ';
				} else {
					result += THAI_NUMBERS[digit] + THAI_UNITS[unitIndex];
				}
			}
		}
		return result;
	}

	function convertDecimal(numStr: string): string {
		if (numStr === '00') return '';
		let result = '';
		if (numStr.length === 1) numStr += '0';
		if (numStr[0] === '1') result += numStr.length > 1 && numStr[1] !== '0' ? 'สิบ' : 'สิบ';
		else if (numStr[0] === '2') result += 'ยี่สิบ';
		else if (numStr[0] !== '0') result += THAI_NUMBERS[parseInt(numStr[0])] + 'สิบ';

		if (numStr[1] === '1' && numStr[0] !== '0' && numStr[0] !== '1') result += 'เอ็ด';
		else if (numStr[1] !== '0') result += THAI_NUMBERS[parseInt(numStr[1])];

		return result;
	}

	const integerText = convertInteger(integerPart) || 'ศูนย์';
	const decimalText = convertDecimal(decimalPart);
	return decimalText ? `${integerText}บาท${decimalText}สตางค์` : `${integerText}บาทถ้วน`;
}

function getInvoiceHtml(
	companyData: CompanyData | null,
	invoiceData: InvoiceData,
	itemsData: ItemData[]
): string {
	const subtotal = invoiceData.subtotal || 0;
	const discount = invoiceData.discount_amount || 0;
	const totalAfterDiscount = invoiceData.total_after_discount || 0;
	const vatRate = invoiceData.vat_rate || 0;
	const vatAmt = invoiceData.vat_amount || 0;
	const whtRate = invoiceData.withholding_tax_rate || 0;
	const whtAmt = invoiceData.withholding_tax_amount || 0;
	const netAmount = invoiceData.total_amount || 0;
	const netAmountText = bahttext(netAmount);

	const formatNumber = (num: number | string) => {
		const val = typeof num === 'string' ? parseFloat(num) : num;
		return isNaN(val)
			? '0.00'
			: val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	};

	const formatDateOnly = (isoString: string | null | undefined) => {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString('th-TH', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '-';
		}
	};

	// --- HTML Blocks ---

	const headerContent = `
		<table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
			<tr style="border-bottom: 1px solid #dee2e6;">
				<td style="width: 60%; vertical-align: top; padding-bottom: 1rem;">
					${companyData?.logo_path ? `<img src="http://localhost:5173${companyData.logo_path}" alt="Logo" style="max-height: 64px; margin-bottom: 8px;" />` : `<h2 style="font-size: 1.25rem; font-weight: bold;">${companyData?.name || ''}</h2>`}
					<div style="font-size: 8pt; color: #6B7280; line-height: 1.4;">
						<p style="margin:0;">${companyData?.address_line_1 || ''}</p>
						${companyData?.address_line_2 ? `<p style="margin:0;">${companyData.address_line_2}</p>` : ''}
						<p style="margin:0;">${companyData?.city || ''} ${companyData?.state_province || ''} ${companyData?.postal_code || ''}</p>
						<p style="margin:4px 0 0 0;"><span style="font-weight: 600; color: #374151;">Tax ID:</span> ${companyData?.tax_id || '-'}</p>
					</div>
				</td>
				<td style="width: 40%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
					<h1 style="font-size: 1.5rem; font-weight: bold; text-transform: uppercase; margin: 0;">ใบแจ้งหนี้</h1>
					<p style="font-size: 10pt; color: #666;">INVOICE</p>
					<div style="margin-top: 0.5rem; font-size: 8pt; line-height: 1.5;">
						<p style="margin:0;"><span style="font-weight: 600;">เลขที่ / No.:</span> ${invoiceData.invoice_number}</p>
						<p style="margin:0;"><span style="font-weight: 600;">วันที่ / Date:</span> ${formatDateOnly(invoiceData.invoice_date)}</p>
                        ${invoiceData.due_date ? `<p style="margin:0; color: #b91c1c;"><span style="font-weight: 600;">ครบกำหนด / Due:</span> ${formatDateOnly(invoiceData.due_date)}</p>` : ''}
						<p style="margin:0;"><span style="font-weight: 600;">อ้างอิง / Ref:</span> ${invoiceData.reference_doc || '-'}</p>
					</div>
				</td>
			</tr>
			<tr>
				<td style="padding-top: 1rem; vertical-align: top;">
					<h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ลูกค้า (Customer)</h3>
					<p style="font-weight: bold; margin: 0 0 4px 0;">${invoiceData.customer_name}</p>
					<div style="font-size: 8pt; line-height: 1.4;">
						<p style="margin:0;">${invoiceData.customer_address || '-'}</p>
					</div>
					<p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">Tax ID:</span> ${invoiceData.customer_tax_id || '-'}</p>
				</td>
				<td style="padding-top: 1rem; vertical-align: top; text-align: right;">
					<h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ผู้ออกเอกสาร (Issued By)</h3>
					<p style="font-size: 8pt;">${invoiceData.created_by_name}</p>
				</td>
			</tr>
		</table>
	`;

	const itemTableHead = `
		<thead>
			<tr style="background-color: #ffffff; border-bottom: 1px solid #ccc; border-top: 1px solid #ccc;">
				<th class="p-2 text-center w-12">ลำดับ</th>
				<th class="p-2 text-left">รายการ (Description)</th>
				<th class="p-2 text-right w-20">จำนวน</th>
				<th class="p-2 text-right w-24">ราคา/หน่วย</th>
				<th class="p-2 text-right w-32">จำนวนเงิน</th>
			</tr>
		</thead>
	`;

	const summaryBlock = `
		<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
			<tr>
                <td style="width: 60%; vertical-align: bottom; padding-right: 10px;">
					<div style="background-color: #ffffff; padding: 8px; font-weight: bold; font-size: 9pt; text-align: center; border: 1px solid #e5e7eb; border-radius: 4px; color: #374151;">
						จำนวนเงินสุทธิเป็นตัวอักษร: ${netAmountText}
					</div>
				</td>
                <td style="width: 40%;">
					<table style="width: 100%; font-size: 8pt; border-collapse: collapse;">
						<tr>
							<td class="p-1 text-right font-bold text-gray-700">รวมเป็นเงิน</td>
							<td class="p-1 text-right text-gray-900">${formatNumber(subtotal)}</td>
						</tr>
						${discount > 0 ? `<tr><td class="p-1 text-right text-red-600">ส่วนลด</td><td class="p-1 text-right text-red-600">-${formatNumber(discount)}</td></tr>` : ''}
						<tr>
							<td class="p-1 text-right font-bold text-gray-700">หลังหักส่วนลด</td>
							<td class="p-1 text-right text-gray-900">${formatNumber(totalAfterDiscount)}</td>
						</tr>
						<tr>
							<td class="p-1 text-right text-gray-600">VAT ${vatRate}%</td>
							<td class="p-1 text-right text-gray-900">${formatNumber(vatAmt)}</td>
						</tr>
						${whtAmt > 0 ? `<tr><td class="p-1 text-right text-red-600">หัก ณ ที่จ่าย ${whtRate}%</td><td class="p-1 text-right text-red-600">-${formatNumber(whtAmt)}</td></tr>` : ''}
						<tr style="background-color: #ffffff; font-weight: bold; font-size: 9pt;">
							<td class="p-2 text-right border-t border-gray-300 text-gray-800">จำนวนเงินสุทธิ</td>
							<td class="p-2 text-right border-t border-gray-300 text-blue-600">${formatNumber(netAmount)}</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	`;

	const signatureBlock = `
		<div style="display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px; font-size: 8pt;">
			<div style="text-align: center; width: 30%;">
				<div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
				<p style="margin-top: 5px;">ผู้รับวางบิล (Received by)</p>
				<p>วันที่ ...../...../.....</p>
			</div>
			<div style="text-align: center; width: 30%;">
				<div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
				<p style="margin-top: 5px;">ผู้มีอำนาจลงนาม (Authorized Signature)</p>
				<p>วันที่ ...../...../.....</p>
			</div>
		</div>
	`;

	// --- Pagination Logic (Dynamic) ---
	const MAX_WITH_FOOTER = 10;
	const MAX_WITHOUT_FOOTER = 18;
	const itemPages: ItemData[][] = [];
	let remaining = [...itemsData];

	if (remaining.length === 0) itemPages.push([]);
	else {
		while (remaining.length > 0) {
			if (remaining.length <= MAX_WITH_FOOTER) {
				itemPages.push(remaining);
				remaining = [];
			} else if (remaining.length <= MAX_WITHOUT_FOOTER) {
				itemPages.push(remaining);
				remaining = [];
				itemPages.push([]);
			} else {
				itemPages.push(remaining.slice(0, MAX_WITHOUT_FOOTER));
				remaining = remaining.slice(MAX_WITHOUT_FOOTER);
			}
		}
	}
	const totalPages = itemPages.length;

	const pagesHtml = itemPages
		.map((pageItems, index) => {
			const isLastPage = index === totalPages - 1;
			const pageNum = index + 1;
			let startIndex = 0;
			for (let i = 0; i < index; i++) startIndex += itemPages[i].length;

			const rowsHtml = pageItems
				.map(
					(item, i) => `
			<tr style="border-bottom: 1px solid #eee;">
				<td class="p-2 text-center">${startIndex + i + 1}</td>
				<td class="p-2">${item.description}</td>
				<td class="p-2 text-right">${formatNumber(item.quantity)}</td>
				<td class="p-2 text-right">${formatNumber(item.unit_price)}</td>
				<td class="p-2 text-right">${formatNumber(item.line_total)}</td>
			</tr>
		`
				)
				.join('');

			const tableHtml =
				pageItems.length > 0
					? `
			<table style="width: 100%; border-collapse: collapse; font-size: 8pt;">
				${itemTableHead}
				<tbody>${rowsHtml}</tbody>
			</table>
		`
					: '<div style="border-top: 1px solid #eee; margin-bottom: 20px;"></div>';

			let footerHtml = '';
			if (isLastPage) {
				footerHtml = `
				${summaryBlock}
				${signatureBlock}
				<div style="text-align: right; font-size: 8pt; color: #999; margin-top: 10px;">หน้า ${pageNum} / ${totalPages}</div>
			`;
			} else {
				footerHtml = `
				<div style="text-align: right; font-weight: bold; margin-top: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">-- ยอดยกไป (Carried Forward) --</div>
				<div style="text-align: right; font-size: 8pt; color: #999; margin-top: 10px;">หน้า ${pageNum} / ${totalPages}</div>
			`;
			}

			return `
			<div class="document-page" style="${index > 0 ? 'page-break-before: always;' : ''}">
				${headerContent}
				<div style="min-height: 200px;">${tableHtml}</div>
				<div class="footer-container">${footerHtml}</div>
			</div>
		`;
		})
		.join('');

	return `
		<html>
		<head>
			<meta charset="UTF-8">
			<script src="https://cdn.tailwindcss.com"></script>
			<style>
				@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
				body { font-family: 'Sarabun', sans-serif; font-size: 9pt; color: #333; background: #fff !important; margin: 0; padding: 0; }
				.document-page { padding: 40px; box-sizing: border-box; position: relative; height: 297mm; }
				.footer-container { position: absolute; bottom: 40px; left: 40px; right: 40px; }
				@media print { @page { size: A4; margin: 0; } body { -webkit-print-color-adjust: exact; } }
			</style>
		</head>
		<body>${pagesHtml}</body>
		</html>
	`;
}

// --- Main Handler ---

export const GET = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return json({ message: 'Missing ID' }, { status: 400 });

	let connection;
	try {
		connection = await db.getConnection();

		// ดึง Invoice (แทน Receipt)
		const [rows] = await connection.execute<InvoiceData[]>(
			`
			SELECT i.*, c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id, u.full_name as created_by_name
			FROM invoices i
			LEFT JOIN customers c ON i.customer_id = c.id
			LEFT JOIN users u ON i.created_by_user_id = u.id
			WHERE i.id = ?
		`,
			[id]
		);

		if (rows.length === 0) return json({ message: 'Invoice not found' }, { status: 404 });
		const invoiceData = rows[0];

		//ดึง Items (จาก invoice_items)
		const [items] = await connection.execute<RowDataPacket[]>(
			`
			SELECT description, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id = ? ORDER BY item_order ASC
		`,
			[id]
		);

		//ดึง Company
		const [company] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');

		// สร้าง HTML
		const html = getInvoiceHtml(company[0] || null, invoiceData, items as ItemData[]);

		// สร้าง PDF
		const browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			headless: true
		});
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'networkidle0' });
		const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
		await browser.close();

		const pdfBlob = new Blob([pdfBuffer as any], { type: 'application/pdf' });
		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="Invoice-${invoiceData.invoice_number}.pdf"`
			}
		});
	} catch (err: any) {
		console.error('PDF Error:', err);
		return json({ message: err.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
