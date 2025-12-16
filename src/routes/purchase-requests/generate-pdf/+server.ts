import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';
import type { RequestHandler } from './$types';

// --- 1. INTERFACES ---

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

interface PurchaseRequestData extends RowDataPacket {
	id: number;
	pr_number: string;
	request_date: string;
	department: string | null;
	description: string | null;
	status: string;
	total_amount: number;

	// ข้อมูลผู้ขอ (Requester)
	requester_name: string;
	requester_email: string | null;

	// [เพิ่มใหม่] ข้อมูลผู้ขาย (Vendor)
	vendor_name: string | null;
	vendor_company: string | null;
}

interface PRItem extends RowDataPacket {
	product_name: string;
	quantity: number;
	unit: string | null;
	expected_price: number;
	total_price: number;
}

// --- 2. BAHTTEXT Helper ---
function bahttext(input: number | string): string {
	let num = parseFloat(String(input));
	if (isNaN(num)) num = 0;
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

// --- 3. HTML GENERATOR ---
function getPRHtml(
	companyData: CompanyData | null,
	prData: PurchaseRequestData,
	itemsData: PRItem[]
): string {
	const totalAmount = prData.total_amount || 0;
	const netAmountText = bahttext(totalAmount);

	const formatNumber = (num: number | string): string => {
		const numericValue = typeof num === 'string' ? parseFloat(num) : num;
		return isNaN(numericValue)
			? '0.00'
			: numericValue.toLocaleString('en-US', {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				});
	};

	const formatDateOnly = (isoString: string | null | undefined): string => {
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

	// [แก้ไข] ส่วน Header HTML ให้แสดง Vendor
	const headerContent = `
		<table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; page-break-inside: avoid; font-size: 9pt;">
			<tr style="border-bottom: 1px solid #dee2e6;">
				<td style="width: 60%; vertical-align: top; padding-bottom: 1rem;">
					${
						companyData?.logo_path
							? `<img src="http://localhost:5173${companyData.logo_path}" alt="${companyData?.name}" style="max-height: 64px; margin-bottom: 8px;" />`
							: companyData?.name
								? `<h2 style="font-size: 1.25rem; font-weight: bold; color: #1F2937;">${companyData.name}</h2>`
								: ''
					}
					<div style="font-size: 8pt; color: #6B7280; line-height: 1.4;">
						<p style="margin:0;">${companyData?.address_line_1 || ''}</p>
						${companyData?.address_line_2 ? `<p style="margin:0;">${companyData.address_line_2}</p>` : ''}
						<p style="margin:0;">${companyData?.city || ''} ${companyData?.state_province || ''} ${companyData?.postal_code || ''}</p>
						<p style="margin:4px 0 0 0;"><span style="font-weight: 600; color: #374151;">Tax ID:</span> ${companyData?.tax_id || '-'}</p>
					</div>
				</td>
				<td style="width: 40%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
					<h1 style="font-size: 1.5rem; font-weight: bold; color: #1F2937; text-transform: uppercase; margin: 0;">ใบขอซื้อ</h1>
					<h2 style="font-size: 1rem; font-weight: bold; color: #6B7280; text-transform: uppercase; margin: 0;">Purchase Request</h2>
					<div style="margin-top: 1rem; font-size: 8pt; line-height: 1.5;">
						<p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">เลขที่ / No.:</span> <span style="font-weight: 500; color: #1F2937;">${prData.pr_number}</span></p>
						<p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">วันที่ / Date:</span> <span style="font-weight: 500; color: #1F2937;">${formatDateOnly(prData.request_date)}</span></p>
					</div>
				</td>
			</tr>
			<tr>
				<td style="padding-top: 1rem; vertical-align: top;">
					<h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ผู้ขอซื้อ (Requester)</h3>
					<p style="font-weight: bold; color: #374151; margin: 0 0 4px 0;">${prData.requester_name}</p>
					<div style="font-size: 8pt; color: #374151; line-height: 1.4;">
						<p style="margin:0;"><b>แผนก / Dept:</b> ${prData.department || '-'}</p>
						<p style="margin:0;"><b>Email:</b> ${prData.requester_email || '-'}</p>
					</div>
				</td>
				<td style="padding-top: 1rem; vertical-align: top;">
                    <h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ผู้ขาย / แนะนำ (Vendor)</h3>
					<p style="font-weight: bold; color: #374151; margin: 0 0 4px 0;">${prData.vendor_name || '-'}</p>
                    ${prData.vendor_company ? `<p style="font-size: 8pt; margin:0; color: #374151;">${prData.vendor_company}</p>` : ''}
                    
                    <div style="margin-top: 8px;">
					    <h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">รายละเอียด (Details)</h3>
					    <p style="font-size: 8pt; margin: 4px 0; white-space: pre-wrap;">${prData.description || ''}</p>
                    </div>
				</td>
			</tr>
		</table>
	`;

	const itemTableHeadersHtml = `
		<thead>
			<tr style="background-color: #ffffff !important; border-bottom: 1px solid #D1D5DB !important; border-top: 1px solid #D1D5DB !important;">
				<th class="w-12 text-center p-2" style="font-size: 8pt; font-weight: bold;">ลำดับ</th>
				<th class="text-left p-2" style="font-size: 8pt; font-weight: bold;">รายการสินค้า / บริการ</th>
				<th class="w-24 text-center p-2" style="font-size: 8pt; font-weight: bold;">จำนวน</th>
				<th class="w-20 text-center p-2" style="font-size: 8pt; font-weight: bold;">หน่วย</th>
				<th class="w-32 text-right p-2" style="font-size: 8pt; font-weight: bold;">ราคาประเมิน</th> 
				<th class="w-32 text-right p-2" style="font-size: 8pt; font-weight: bold;">จำนวนเงิน</th> 
			</tr>
		</thead>
    `;

	const financialSummaryBlock = `
        <table class="w-full border-collapse border border-gray-400" style="page-break-inside: avoid !important; table-layout: fixed; margin-top: 1px;">
            <colgroup><col style="width: auto;"><col style="width: auto;"><col style="width: auto;"><col style="width: auto;"><col style="width: 112px;"><col style="width: 128px;"></colgroup>
            <tfoot>
                <tr style="background-color: #ffffff;">
                    <td colspan="4" class="p-2 text-left font-bold" style="font-size: 9pt; vertical-align: bottom; text-align: center;">(จำนวนเงินตัวอักษร: ${netAmountText})</td>
                    <td class="font-bold p-2 text-right border-l border-t border-gray-400" style="font-size: 7pt;">ยอดรวมประมาณการ :</td>
                    <td class="p-2 text-right border-t border-gray-400 text-blue-700" style="font-size: 8pt; font-weight: bold;">${formatNumber(totalAmount)}</td>
                </tr>
            </tfoot>
        </table>
    `;

	const paymentAndSignatureBlock = `
        <div style="page-break-inside: avoid !important;"> 
            <section class="mt-12"> 
                <div class="grid grid-cols-3 gap-8 text-xs"> 
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(${prData.requester_name})</p>
                        <p class="mt-1">ผู้ขอซื้อ (Requester)</p>
                        <p class="mt-0 text-gray-500">วันที่: ...../...../.....</p>
                    </div>
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(..............................)</p>
                        <p class="mt-1">ผู้อนุมัติ (Approver)</p>
                        <p class="mt-0 text-gray-500">วันที่: ...../...../.....</p>
                    </div>
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(..............................)</p>
                        <p class="mt-1">ฝ่ายจัดซื้อ (Purchasing)</p>
                        <p class="mt-0 text-gray-500">วันที่: ...../...../.....</p>
                    </div>
                </div>
            </section>
        </div>
    `;

	// --- Pagination Logic ---
	const MAX_WITH_FOOTER = 10;
	const MAX_WITHOUT_FOOTER = 18;
	const itemPages: PRItem[][] = [];
	let remainingItems = [...itemsData];

	if (remainingItems.length === 0) itemPages.push([]);
	else {
		while (remainingItems.length > 0) {
			if (remainingItems.length <= MAX_WITH_FOOTER) {
				itemPages.push(remainingItems);
				remainingItems = [];
			} else if (remainingItems.length <= MAX_WITHOUT_FOOTER) {
				itemPages.push(remainingItems);
				remainingItems = [];
				itemPages.push([]);
			} else {
				const chunk = remainingItems.slice(0, MAX_WITHOUT_FOOTER);
				itemPages.push(chunk);
				remainingItems = remainingItems.slice(MAX_WITHOUT_FOOTER);
			}
		}
	}

	const totalPages = itemPages.length;
	const pagesHtml = itemPages
		.map((pageItems, pageIndex) => {
			const isLastPage = pageIndex === totalPages - 1;
			const pageNumber = pageIndex + 1;
			let startIndex = 0;
			for (let i = 0; i < pageIndex; i++) startIndex += itemPages[i].length;

			const itemsHtml = pageItems
				.map((item, itemIndex) => {
					const globalIndex = startIndex + itemIndex + 1;
					return `
                <tr class="border-b border-gray-300">
                    <td class="p-2 text-center align-middle h-10" style="font-size: 8pt;">${globalIndex}</td>
                    <td class="p-2 align-middle h-10" style="font-size: 8pt;">${item.product_name}</td>
                    <td class="p-2 text-center align-middle h-10" style="font-size: 8pt;">${formatNumber(item.quantity)}</td> 
                    <td class="p-2 text-center align-middle h-10" style="font-size: 8pt;">${item.unit || '-'}</td> 
                    <td class="p-2 text-right align-middle h-10" style="font-size: 8pt;">${formatNumber(item.expected_price)}</td> 
                    <td class="p-2 text-right align-middle h-10" style="font-size: 8pt;">${formatNumber(item.total_price)}</td> 
                </tr>`;
				})
				.join('');

			const tableContent =
				pageItems.length > 0
					? `<table class="w-full border-collapse items-table" style="table-layout: fixed;">${itemTableHeadersHtml}<tbody>${itemsHtml}</tbody></table>`
					: `<div style="height: 1px; border-top: 1px solid #eee; margin-bottom: 20px;"></div>`;

			const footerContent = isLastPage
				? `${financialSummaryBlock}${paymentAndSignatureBlock}<div style="text-align: right; font-size: 8pt; color: #999; margin-top: 20px;">หน้า ${pageNumber} / ${totalPages}</div>`
				: `<div style="text-align: right; font-weight: bold; margin-top: 20px; padding-bottom: 20px; border-bottom: 1px dashed #ccc;">-- ยอดยกไป (Carried Forward) --</div><div style="text-align: right; font-size: 8pt; color: #999; margin-top: 20px;">หน้า ${pageNumber} / ${totalPages}</div>`;

			return `<div class="document-page" style="${pageIndex > 0 ? 'page-break-before: always;' : ''}">${headerContent} ${tableContent} <div class="footer-container">${footerContent}</div></div>`;
		})
		.join('');

	return `
    <html>
    <head>
    <meta charset="UTF-8">
    <title>Purchase Request - ${prData.pr_number}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Sarabun', 'Arial', sans-serif; margin: 0; padding: 0; font-size: 9pt !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background-color: #FFFFFF; color: #333; }
        .page-container { width: 210mm; margin: auto; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .document-page { padding: 40px; box-sizing: border-box; position: relative; min-height: 297mm; }
        .footer-container { page-break-inside: avoid !important; margin-top: 10px; }
        .items-table thead { display: table-header-group !important; }
        @media print { body { background-color: #FFFFFF !important; } .page-container { width: auto; margin: 0; box-shadow: none; } .document-page { padding: 0; margin: 0; min-height: auto; } @page { size: A4; margin: 40px; } }
    </style>
    </head>
    <body><div class="page-container">${pagesHtml}</div></body>
    </html>`;
}

// --- 4. MAIN HANDLER ---
export const GET: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return json({ success: false, message: 'Missing ID' }, { status: 400 });

	let connection;
	try {
		connection = await db.getConnection();

		// [แก้ไข] เพิ่มการ JOIN ตาราง vendors และดึงข้อมูล vendor
		const [prRows] = await connection.execute<PurchaseRequestData[]>(
			`SELECT pr.*, 
                    u.full_name as requester_name, 
                    u.email as requester_email,
                    v.name as vendor_name,            -- [เพิ่ม]
                    v.company_name as vendor_company  -- [เพิ่ม]
             FROM purchase_requests pr
             LEFT JOIN users u ON pr.requester_id = u.id
             LEFT JOIN vendors v ON pr.vendor_id = v.id  -- [เพิ่ม] JOIN
             WHERE pr.id = ?`,
			[id]
		);

		if (prRows.length === 0)
			return json({ success: false, message: 'PR not found' }, { status: 404 });

		const [itemsRows] = await connection.execute<PRItem[]>(
			`SELECT product_name, quantity, unit, expected_price, total_price FROM purchase_request_items WHERE purchase_request_id = ? ORDER BY id ASC`,
			[id]
		);
		const [cRows] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');

		const htmlContent = getPRHtml(cRows.length > 0 ? cRows[0] : null, prRows[0], itemsRows);

		const browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			headless: true
		});
		const page = await browser.newPage();
		await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
		const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
		await browser.close();

		return new Response(new Blob([pdfBuffer as any], { type: 'application/pdf' }), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="PR-${prRows[0].pr_number}.pdf"`
			}
		});
	} catch (error: any) {
		console.error('PDF Error:', error);
		return json({ success: false, message: 'Failed to generate PDF' }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
