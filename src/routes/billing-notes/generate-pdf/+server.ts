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

// [แก้ไข] เพิ่ม Field ที่จำเป็นสำหรับการคำนวณเงิน
interface BillingNoteData extends RowDataPacket {
	id: number;
	billing_note_number: string;
	billing_date: string;
	due_date: string | null;
	customer_name: string;
	customer_address: string | null;
	customer_tax_id: string | null;
	created_by_name: string;
	notes: string | null;

	// Financial Fields
	subtotal: number;
	discount_amount: number;
	vat_rate: number;
	vat_amount: number;
	withholding_tax_rate: number;
	withholding_tax_amount: number;
	total_amount: number;
}

// [แก้ไข] เปลี่ยน item_name เป็น description ให้ตรงกับ Database
interface BillingItemData extends RowDataPacket {
	description: string;
	quantity: number;
	unit_price: number;
	amount: number;
}

// --- HELPER FUNCTIONS ---

function getLogoBase64(logoPath: string | null): string | null {
	if (!logoPath) return null;
	const tryPaths = [
		path.resolve(process.cwd(), logoPath.startsWith('/') ? logoPath.slice(1) : logoPath),
		path.resolve(process.cwd(), 'static', logoPath.startsWith('/') ? logoPath.slice(1) : logoPath),
		path.resolve(process.cwd(), 'uploads/company/Logo.png'),
		path.resolve(process.cwd(), 'uploads/company/logo.png'),
		path.resolve(process.cwd(), 'static/logo.png')
	];

	for (const p of tryPaths) {
		try {
			if (fs.existsSync(p)) {
				const fileData = fs.readFileSync(p);
				const ext = path.extname(p).replace('.', '');
				return `data:image/${ext};base64,${fileData.toString('base64')}`;
			}
		} catch (e) {
			continue;
		}
	}
	return null;
}

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

function getBillingNoteHtml(
	companyData: CompanyData | null,
	noteData: BillingNoteData,
	itemsData: BillingItemData[],
	logoBase64: string | null
): string {
	// [แก้ไข] ดึงค่าคำนวณจริงจาก Database แทนการ Hardcode
	const subtotal = Number(noteData.subtotal) || 0;
	const discountAmount = Number(noteData.discount_amount) || 0;
	const afterDiscount = subtotal - discountAmount;

	const vatRate = Number(noteData.vat_rate) || 0;
	const vatAmount = Number(noteData.vat_amount) || 0;

	const whtRate = Number(noteData.withholding_tax_rate) || 0;
	const whtAmount = Number(noteData.withholding_tax_amount) || 0;

	const netAmount = Number(noteData.total_amount) || 0;
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

	const logoHtml = logoBase64
		? `<img src="${logoBase64}" alt="Logo" style="max-height: 64px; margin-bottom: 8px;" />`
		: `<h2 style="font-size: 1.25rem; font-weight: bold; color: #1F2937;">${companyData?.name || ''}</h2>`;

	const headerContent = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
            <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="width: 60%; vertical-align: top; padding-bottom: 1rem;">
                    ${logoHtml}
                    <div style="font-size: 8pt; color: #6B7280; line-height: 1.4;">
                        <p style="margin:0;">${companyData?.address_line_1 || ''}</p>
                        ${companyData?.address_line_2 ? `<p style="margin:0;">${companyData.address_line_2}</p>` : ''}
                        <p style="margin:0;">${companyData?.city || ''} ${companyData?.state_province || ''} ${companyData?.postal_code || ''}</p>
                        <p style="margin:4px 0 0 0;"><span style="font-weight: 600; color: #374151;">Tax ID:</span> ${companyData?.tax_id || '-'}</p>
                    </div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
                    <h1 style="font-size: 1.5rem; font-weight: bold; color: #1F2937; text-transform: uppercase; margin: 0;">ใบวางบิล</h1>
                    <p style="font-size: 10pt; color: #666;">BILLING NOTE</p>
                    <div style="margin-top: 1rem; font-size: 8pt; line-height: 1.5;">
                        <p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">เลขที่ / No.:</span> <span style="font-weight: 500; color: #1F2937;">${noteData.billing_note_number}</span></p>
                        <p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">วันที่ / Date:</span> <span style="font-weight: 500; color: #1F2937;">${formatDateOnly(noteData.billing_date)}</span></p>
                        <p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">ครบกำหนด / Due:</span> <span style="font-weight: 500; color: #1F2937;">${formatDateOnly(noteData.due_date)}</span></p>
                    </div>
                </td>
            </tr>
            <tr>
                <td style="padding-top: 1rem; vertical-align: top;">
                    <h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ลูกค้า (Customer)</h3>
                    <p style="font-weight: bold; color: #374151; margin: 0 0 4px 0;">${noteData.customer_name || '-'}</p>
                    <div style="font-size: 8pt; color: #374151; line-height: 1.4;">
                        <p style="margin:0;">${noteData.customer_address || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600; color: #374151;">Tax ID:</span> ${noteData.customer_tax_id || '-'}</p>
                </td>
                <td style="padding-top: 1rem; vertical-align: top;">
                    <h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ผู้ออกเอกสาร (Issued By)</h3>
                    <p style="font-size: 8pt; margin: 4px 0;">${noteData.created_by_name || '-'}</p>
                </td>
            </tr>
        </table>
    `;

	const itemTableHeadersHtml = `
		<thead>
			<tr class="items-header-row" style="background-color: #ffffff !important; border-bottom: 1px solid #D1D5DB !important; border-top: 1px solid #D1D5DB !important;">
				<th class="w-12 text-center p-2" style="font-size: 8pt; font-weight: bold;">ลำดับ</th>
				<th class="text-left p-2" style="font-size: 8pt; font-weight: bold;">รายการ (Description)</th>
				<th class="w-20 text-center p-2" style="font-size: 8pt; font-weight: bold;">จำนวน</th>
				<th class="w-28 text-center p-2" style="font-size: 8pt; font-weight: bold;">ราคา/หน่วย</th> 
				<th class="w-32 text-right p-2" style="font-size: 8pt; font-weight: bold;">จำนวนเงิน</th> 
			</tr>
		</thead>
    `;

	// [แก้ไข] ส่วนสรุปยอดเงิน แสดง Discount, VAT, WHT ให้ถูกต้อง
	const financialSummaryBlock = `
        <table class="w-full border-collapse border border-gray-400" style="page-break-inside: avoid !important; table-layout: fixed; margin-top: 1px; width: 100%; font-size: 8pt;">
            <colgroup>
                <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;">
                <col style="width: 112px;"> <col style="width: 128px;">
            </colgroup>
            <tfoot class="bill-summary-footer">
                <tr>
                    <td colspan="4" rowspan="${3 + (discountAmount > 0 ? 1 : 0) + (vatRate > 0 ? 1 : 0) + (whtRate > 0 ? 1 : 0)}" class="p-2 border-l border-t border-r border-gray-400" style="vertical-align: top; position: relative; padding-bottom: 30px;">
                         
                        <div>
                            <span style="font-weight: bold; text-decoration: underline;">หมายเหตุ (Notes):</span>
                            <div style="margin-top: 4px; white-space: pre-wrap; color: #374151;">${noteData.notes || '-'}</div>
                        </div>
                        
                        <div style="position: absolute; bottom: 8px; left: 0; width: 100%; text-align: center; font-weight: bold;">
                            (จำนวนเงินสุทธิเป็นตัวอักษร: ${netAmountText})
                        </div>

                    </td>
                    <td class="font-bold p-2 text-right border-t border-gray-400">รวมเป็นเงิน</td>
                    <td class="p-2 text-right border-t border-gray-400">${formatNumber(subtotal)}</td>
                </tr>
                
                ${
									discountAmount > 0
										? `
                <tr>
                    <td class="font-bold p-2 text-right border-l border-gray-400">ส่วนลด</td>
                    <td class="p-2 text-right text-red-600">-${formatNumber(discountAmount)}</td>
                </tr>
                <tr>
                    <td class="font-bold p-2 text-right border-l border-gray-400">หลังหักส่วนลด</td>
                    <td class="p-2 text-right">${formatNumber(afterDiscount)}</td>
                </tr>
                `
										: ''
								}

                ${
									vatRate > 0
										? `
                <tr>
					<td class="font-bold p-2 text-right border-l border-gray-400">ภาษีมูลค่าเพิ่ม (${vatRate}%)</td>
					<td class="p-2 text-right">${formatNumber(vatAmount)}</td>
				</tr>`
										: ''
								}

                ${
									whtRate > 0
										? `
                <tr>
					<td class="font-bold p-2 text-right border-l border-gray-400">หัก ณ ที่จ่าย (${whtRate}%)</td>
					<td class="p-2 text-right text-red-600">-${formatNumber(whtAmount)}</td>
				</tr>`
										: ''
								}

                <tr style="background-color: #ffffff;">
                    <td class="font-bold p-2 text-right border-l border-t border-gray-400" style="font-size: 9pt;">จำนวนเงินสุทธิ</td>
                    <td class="p-2 text-right border-t border-gray-400 text-blue-700" style="font-size: 9pt; font-weight: bold;">${formatNumber(netAmount)}</td>
                </tr>
            </tfoot>
        </table>
    `;

	const signatureBlock = `
        <div class="payment-and-signature-block" style="page-break-inside: avoid !important;"> 
            <section class="document-footer mt-8"> 
                <div class="flex justify-between" style="font-size: 8pt;"> 
                    <div class="text-center" style="width: 30%;">
                        <p class="border-b border-dotted border-gray-500 pb-8"></p>
                        <p class="mt-2 font-bold">ผู้รับวางบิล (Received by)</p>
                        <p class="mt-1 text-gray-500">วันที่: ......../......../........</p>
                    </div>
                    <div class="text-center" style="width: 30%;">
                        <p class="border-b border-dotted border-gray-500 pb-8"></p>
                        <p class="mt-2 font-bold">ผู้มีอำนาจลงนาม (Authorized Signature)</p>
                        <p class="mt-1 text-gray-500">วันที่: ......../......../........</p>
                    </div>
                </div>
            </section>
        </div>
    `;

	const MAX_WITH_FOOTER = 10;
	const MAX_WITHOUT_FOOTER = 18;
	const itemPages: BillingItemData[][] = [];
	let remainingItems = [...itemsData];

	if (remainingItems.length === 0) {
		itemPages.push([]);
	} else {
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
                        <td class="p-2 text-center align-middle h-8" style="font-size: 8pt;">${globalIndex}</td>
						<td class="p-2 align-middle h-8" style="font-size: 8pt;">${item.description || '-'}</td>
                        <td class="p-2 text-center align-middle h-8" style="font-size: 8pt;">${formatNumber(item.quantity)}</td> 
                        <td class="p-2 text-center align-middle h-8" style="font-size: 8pt;">${formatNumber(item.unit_price)}</td> 
                        <td class="p-2 text-right align-middle h-8" style="font-size: 8pt;">${formatNumber(item.amount)}</td> 
                    </tr>
                `;
				})
				.join('');

			const tableContent =
				pageItems.length > 0
					? `
                <table class="w-full border-collapse items-table" style="table-layout: fixed;">
                    ${itemTableHeadersHtml}
                    <tbody>${itemsHtml}</tbody>
                </table>
            `
					: `<div style="height: 1px; border-top: 1px solid #eee; margin-bottom: 20px;"></div>`;

			let footerContent = '';
			if (isLastPage) {
				footerContent = `
                    ${financialSummaryBlock}
                    ${signatureBlock}
                    <div style="text-align: right; font-size: 8pt; color: #999; margin-top: 20px;">
                        หน้า ${pageNumber} / ${totalPages}
                    </div>
                `;
			} else {
				footerContent = `
                    <div style="text-align: right; font-weight: bold; margin-top: 20px; padding-bottom: 20px; border-bottom: 1px dashed #ccc;">
                        -- ยอดยกไป (Carried Forward) --
                    </div>
                    <div style="text-align: right; font-size: 8pt; color: #999; margin-top: 20px;">
                        หน้า ${pageNumber} / ${totalPages}
                    </div>
                `;
			}

			return `
            <div class="document-page" style="${pageIndex > 0 ? 'page-break-before: always;' : ''}">
                ${headerContent} 
                <div style="min-height: 200px;">
                    ${tableContent}
                </div>
                
                <div class="footer-container">
                    ${footerContent}
                </div>
            </div>
        `;
		})
		.join('');

	return `
    <html>
    <head>
    <meta charset="UTF-8">
    <title>Billing Note - ${noteData.billing_note_number}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        body { 
            font-family: 'Sarabun', sans-serif; 
            margin: 0; padding: 0;
            font-size: 9pt !important; 
            background-color: #FFFFFF; 
            color: #333;
        }
        
        .document-page { 
            padding: 40px; 
            box-sizing: border-box; 
            position: relative; 
            height: 297mm; 
        }
        
        .footer-container { 
            position: absolute; 
            bottom: 40px; 
            left: 40px; 
            right: 40px; 
            page-break-inside: avoid;
        }

        .items-table thead { display: table-header-group !important; }
        
        @media print {
            @page { size: A4; margin: 0; }
            body { -webkit-print-color-adjust: exact !important; }
        }
    </style>
    </head>
    <body>
        ${pagesHtml}
    </body>
    </html>
    `;
}

export const GET = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return json({ message: 'Missing ID' }, { status: 400 });

	let connection;
	try {
		connection = await db.getConnection();

		// ดึงข้อมูล Header ปกติ (เพิ่ม select * ก็จะมาครบทุก field)
		const [rows] = await connection.execute<any[]>(`SELECT * FROM billing_notes WHERE id = ?`, [
			id
		]);
		if (rows.length === 0) return json({ message: 'Billing Note not found' }, { status: 404 });
		const noteData = rows[0];

		let customer = { name: '-', address: '-', tax_id: '-' };
		if (noteData.customer_id) {
			const [cRows] = await connection.execute<any[]>(`SELECT * FROM customers WHERE id = ?`, [
				noteData.customer_id
			]);
			if (cRows.length > 0) customer = cRows[0];
		}
		noteData.customer_name = customer.name;
		noteData.customer_address = customer.address;
		noteData.customer_tax_id = customer.tax_id;

		let createdByName = '-';
		if (noteData.created_by_user_id) {
			const [uRows] = await connection.execute<any[]>(`SELECT full_name FROM users WHERE id = ?`, [
				noteData.created_by_user_id
			]);
			if (uRows.length > 0) createdByName = uRows[0].full_name;
		}
		noteData.created_by_name = createdByName;

		// [แก้ไข] SQL เปลี่ยนจาก select item_name เป็น description
		const [items] = await connection.execute<BillingItemData[]>(
			`SELECT description, quantity, unit_price, amount 
             FROM billing_note_items 
             WHERE billing_note_id = ? 
             ORDER BY id ASC`,
			[id]
		);

		const [company] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
		const companyData = company[0] || null;

		const logoBase64 = getLogoBase64(companyData?.logo_path);

		const html = getBillingNoteHtml(companyData, noteData, items, logoBase64);

		const browser = await puppeteer.launch({
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu'
			],
			headless: true
		});
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'domcontentloaded' });
		const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
		await browser.close();

		const pdfBlob = new Blob([pdfBuffer as any], { type: 'application/pdf' });
		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="BillingNote-${noteData.billing_note_number}.pdf"`
			}
		});
	} catch (err: any) {
		console.error('PDF Error:', err);
		return json({ message: err.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
