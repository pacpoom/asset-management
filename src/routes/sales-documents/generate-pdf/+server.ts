import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

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

interface DocumentData extends RowDataPacket {
	id: number;
	document_type: string;
	document_number: string;
	document_date: string;
	credit_term: number | null;
	due_date: string | null;
	job_order_id: number | null;
	reference_doc: string | null;
	notes: string | null;

	customer_name: string;
	customer_address: string | null;
	customer_tax_id: string | null;
	created_by_name: string;

	jo_job_type: string | null;
	jo_bl_number: string | null;

	subtotal: number;
	discount_amount: number;
	total_after_discount: number;
	vat_rate: number;
	vat_amount: number;
	withholding_tax_rate: number;
	withholding_tax_amount: number;
	wht_amount: number;
	total_amount: number;
}

interface ItemData {
	description: string;
	quantity: number;
	unit_price: number;
	line_total: number;
	wht_rate?: number;
	is_vat?: number | boolean;
}

const pdfSpecificDict: Record<string, Record<string, string>> = {
	'th': {
		'No': 'เลขที่ / No.', 'Date': 'วันที่ / Date', 'Term': 'เครดิต / Term', 'Due': 'ครบกำหนด / Due',
		'Ref': 'อ้างอิง / Ref', 'Customer': 'ลูกค้า (Customer)', 'Issued By': 'ผู้ออกเอกสาร (Issued By)',
		'Seq': 'ลำดับ', 'Description': 'รายการ (Description)', 'Qty': 'จำนวน', 'UnitPrice': 'ราคา/หน่วย', 'Amount': 'จำนวนเงิน',
		'Notes': 'หมายเหตุ (Notes):', 'NetText': 'จำนวนเงินสุทธิเป็นตัวอักษร',
		'Subtotal': 'รวมเป็นเงิน', 'Discount': 'ส่วนลด', 'AfterDiscount': 'หลังหักส่วนลด',
		'VAT': 'VAT ชื้อ', 'WHT': 'หัก ณ ที่จ่ายรวม', 'GrandTotal': 'จำนวนเงินสุทธิ',
		'ReceivedBy': 'ผู้รับเอกสาร (Received by)', 'Auth': 'ผู้มีอำนาจลงนาม (Authorized Signature)',
		'Page': 'หน้า', 'Carry': '-- ยอดยกไป (Carried Forward) --',
		'Days': 'วัน (Days)', 'Cash': 'เงินสด (Cash)'
	},
	'en': {
		'No': 'No.', 'Date': 'Date', 'Term': 'Term', 'Due': 'Due Date',
		'Ref': 'Reference', 'Customer': 'Customer', 'Issued By': 'Issued By',
		'Seq': 'Item', 'Description': 'Description', 'Qty': 'Qty', 'UnitPrice': 'Unit Price', 'Amount': 'Amount',
		'Notes': 'Notes:', 'NetText': 'Net Amount in Words',
		'Subtotal': 'Subtotal', 'Discount': 'Discount', 'AfterDiscount': 'Total After Discount',
		'VAT': 'VAT', 'WHT': 'Total WHT', 'GrandTotal': 'Grand Total',
		'ReceivedBy': 'Received by', 'Auth': 'Authorized Signature',
		'Page': 'Page', 'Carry': '-- Carried Forward --',
		'Days': 'Days', 'Cash': 'Cash'
	}
};

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

function getDocumentTitle(type: string): { th: string; en: string } {
	switch (type) {
		case 'QT': return { th: 'ใบเสนอราคา', en: 'QUOTATION' };
		case 'BN': return { th: 'ใบวางบิล', en: 'BILLING NOTE' };
		case 'INV': return { th: 'ใบแจ้งหนี้', en: 'INVOICE' };
		case 'RE': return { th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE' };
		default: return { th: 'เอกสาร', en: 'DOCUMENT' };
	}
}

function getInvoiceHtml(
	companyData: CompanyData | null,
	docData: DocumentData,
	itemsData: ItemData[],
	logoBase64: string | null,
	lang: string, 
	dbDict: { en: Record<string, string>; th: Record<string, string> } 
): string {

	
	function tPdf(key: string, currentLang: string): string {
		return dbDict[currentLang as 'en' | 'th']?.[key] || pdfSpecificDict[currentLang]?.[key] || key;
	}

	const subtotal = Number(docData.subtotal || 0);
	const discount = Number(docData.discount_amount || 0);
	const totalAfterDiscount = Number(docData.total_after_discount || 0);

	const vatRate = Number(docData.vat_rate || 0);
	const vatAmt = Number(docData.vat_amount || 0);

	let calculatedWhtAmt = 0;
	const activeRates = new Set<number>();

	itemsData.forEach((item) => {
		const rate = Number(item.wht_rate || 0);
		if (rate > 0) {
			activeRates.add(rate);
			calculatedWhtAmt += (Number(item.line_total) * rate) / 100;
		}
	});

	const ratesArray = Array.from(activeRates);
	const whtRateText = ratesArray.length > 0 ? ratesArray.join('%, ') : Number(docData.withholding_tax_rate || 0);

	const whtAmt = calculatedWhtAmt > 0 ? calculatedWhtAmt : Number(docData.wht_amount || docData.withholding_tax_amount || 0);

	const netAmount = totalAfterDiscount + vatAmt - whtAmt;
	const netAmountText = bahttext(netAmount);

	const docTitle = getDocumentTitle(docData.document_type);

	const formatNumber = (num: number | string) => {
		const val = typeof num === 'string' ? parseFloat(num) : num;
		return isNaN(val)
			? '0.00'
			: val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	};

	const formatDateOnly = (isoString: string | null | undefined) => {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
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
		: `<h2 style="font-size: 1.25rem; font-weight: bold;">${companyData?.name || ''}</h2>`;

	const creditTermDisplay =
		docData.credit_term && docData.credit_term > 0
			? `${docData.credit_term} ${tPdf('Days', lang)}`
			: tPdf('Cash', lang);

	let jobOrderDisplay = '';
	if (docData.job_order_id) {
		const blPart = docData.job_number;
		jobOrderDisplay = `<p style="margin:0;"><span style="font-weight: 600;">Job Order:</span> ${blPart}</p>`;
	}

	const headerContent = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
            <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="width: 55%; vertical-align: top; padding-bottom: 1rem;">
                    ${logoHtml}
                    <div style="font-size: 8pt; color: #6B7280; line-height: 1.4;">
                        <p style="margin:0;">${companyData?.address_line_1 || ''}</p>
                        ${companyData?.address_line_2 ? `<p style="margin:0;">${companyData.address_line_2}</p>` : ''}
                        <p style="margin:0;">${companyData?.city || ''} ${companyData?.state_province || ''} ${companyData?.postal_code || ''}</p>
                        <p style="margin:4px 0 0 0;"><span style="font-weight: 600; color: #374151;">Tax ID:</span> ${companyData?.tax_id || '-'}</p>
                    </div>
                </td>
                <td style="width: 45%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
                    <h1 style="font-size: 1.5rem; font-weight: bold; text-transform: uppercase; margin: 0; color: #1e3a8a;">${lang === 'en' ? docTitle.en : docTitle.th}</h1>
                    <p style="font-size: 10pt; color: #666;">${lang === 'en' ? docTitle.th : docTitle.en}</p>
                    <div style="margin-top: 0.5rem; font-size: 8pt; line-height: 1.5;">
                        <p style="margin:0;"><span style="font-weight: 600;">${tPdf('No', lang)}:</span> ${docData.document_number}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">${tPdf('Date', lang)}:</span> ${formatDateOnly(docData.document_date)}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">${tPdf('Term', lang)}:</span> ${creditTermDisplay}</p>
                        ${docData.due_date ? `<p style="margin:0; color: #b91c1c;"><span style="font-weight: 600;">${tPdf('Due', lang)}:</span> ${formatDateOnly(docData.due_date)}</p>` : ''}
                        ${jobOrderDisplay}
                        ${docData.reference_doc ? `<p style="margin:0;"><span style="font-weight: 600;">${tPdf('Ref', lang)}:</span> ${docData.reference_doc}</p>` : ''}
                    </div>
                </td>
            </tr>
            <tr>
                <td style="padding-top: 1rem; vertical-align: top;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">${tPdf('Customer', lang)}</h3>
                    <p style="font-weight: bold; margin: 0 0 4px 0;">${docData.customer_name}</p>
                    <div style="font-size: 8pt; line-height: 1.4;">
                        <p style="margin:0; white-space: pre-wrap;">${docData.customer_address || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">Tax ID:</span> ${docData.customer_tax_id || '-'}</p>
                </td>
                <td style="padding-top: 1rem; vertical-align: top; text-align: right;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">${tPdf('Issued By', lang)}</h3>
                    <p style="font-size: 8pt;">${docData.created_by_name}</p>
                </td>
            </tr>
        </table>
    `;

	
	const itemTableHead = `
    <thead>
        <tr style="background-color: #ffffff; border-bottom: 1px solid #ccc; border-top: 1px solid #ccc;">
            <th class="p-2 text-center w-12">${tPdf('Seq', lang)}</th>
            <th class="p-2 text-left">${tPdf('Description', lang)}</th>
            <th class="p-2 text-right w-16">${tPdf('Qty', lang)}</th>
            <th class="p-2 text-right w-24">${tPdf('UnitPrice', lang)}</th>
            <th class="p-2 text-center w-16" style="color: #2563eb;">${tPdf('VAT', lang)}</th>
            <th class="p-2 text-center w-24 whitespace-nowrap" style="color: #ef4444;">${tPdf('WHT', lang)}</th>
            <th class="p-2 text-right w-28">${tPdf('Amount', lang)}</th>
        </tr>
    </thead>
`;

	
	const summaryBlock = `
        <table class="w-full border-collapse border border-gray-400" style="page-break-inside: avoid !important; table-layout: fixed; margin-top: 10px; width: 100%; font-size: 8pt;">
            <colgroup>
                <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;">
                <col style="width: 140px;"> <col style="width: 110px;">
            </colgroup>
            <tfoot class="bill-summary-footer">
                <tr>
                    <td colspan="5" rowspan="6" class="p-2 border-l border-t border-r border-gray-400" style="vertical-align: top; position: relative; padding-bottom: 30px;">
                        <div>
                            <span style="font-weight: bold; text-decoration: underline;">${tPdf('Notes', lang)}</span>
                            <div style="margin-top: 4px; white-space: pre-wrap; color: #374151;">${docData.notes || '-'}</div>
                        </div>
                        <div style="position: absolute; bottom: 8px; left: 0; width: 100%; text-align: center; font-weight: bold;">
                            (${tPdf('NetText', lang)}: ${netAmountText})
                        </div>
                    </td> 
                    
                    <td class="font-bold p-2 text-right border-t border-gray-400 whitespace-nowrap">${tPdf('Subtotal', lang)}</td>
                    <td class="p-2 text-right border-t border-gray-400">${formatNumber(subtotal)}</td>
                </tr>
                
                <tr>
                    <td class="font-bold p-2 text-right border-l border-gray-400 whitespace-nowrap">${tPdf('Discount', lang)}</td>
                    <td class="p-2 text-right">${formatNumber(discount)}</td>
                </tr>
                
                <tr>
                    <td class="font-bold p-2 text-right border-l border-gray-400 whitespace-nowrap">${tPdf('AfterDiscount', lang)}</td>
                    <td class="p-2 text-right">${formatNumber(totalAfterDiscount)}</td>
                </tr>

                <tr>
                    <td class="font-bold p-2 text-right border-l border-gray-400 whitespace-nowrap">${tPdf('VAT', lang)} (${vatRate}%)</td>
                    <td class="p-2 text-right">${formatNumber(vatAmt)}</td>
                </tr>

                <tr>
                    <td class="font-bold p-2 text-right border-l border-gray-400 text-red-600 whitespace-nowrap" style="font-size: 7.5pt;">${tPdf('WHT', lang)} (${whtRateText}%)</td>
                    <td class="p-2 text-right text-red-600" style="font-size: 7.5pt;">${formatNumber(whtAmt)}</td>
                </tr>

                <tr style="background-color: #ffffff;">
                    <td class="font-bold p-2 text-right border-l border-t border-gray-400 whitespace-nowrap" style="font-size: 9pt;">${tPdf('GrandTotal', lang)}</td>
                    <td class="p-2 text-right border-t border-gray-400 text-blue-700" style="font-size: 9pt; font-weight: bold;">${formatNumber(netAmount)}</td>
                </tr>
            </tfoot>
        </table>
    `;

	const signatureBlock = `
        <div style="display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px; font-size: 8pt;">
            <div style="text-align: center; width: 30%;">
                <div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
                <p style="margin-top: 5px;">${tPdf('ReceivedBy', lang)}</p>
                <p>${tPdf('Date', lang)} ...../...../.....</p>
            </div>
            <div style="text-align: center; width: 30%;">
                <div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
                <p style="margin-top: 5px;">${tPdf('Auth', lang)}</p>
                <p>${tPdf('Date', lang)} ...../...../.....</p>
            </div>
        </div>
    `;

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
        <td class="p-2 text-center" style="color: #2563eb; font-weight: 500;">
            ${item.is_vat ? '7%' : '-'}
        </td>
        <td class="p-2 text-center" style="color: #ef4444; font-weight: 500;">
            ${Number(item.wht_rate) > 0 ? Number(item.wht_rate) + '%' : '-'}
        </td>
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
                <div style="text-align: right; font-size: 8pt; color: #999; margin-top: 10px;">${tPdf('Page', lang)} ${pageNum} / ${totalPages}</div>
            `;
			} else {
				footerHtml = `
                <div style="text-align: right; font-weight: bold; margin-top: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">${tPdf('Carry', lang)}</div>
                <div style="text-align: right; font-size: 8pt; color: #999; margin-top: 10px;">${tPdf('Page', lang)} ${pageNum} / ${totalPages}</div>
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


export const GET = async ({ url, fetch }) => {
	const id = url.searchParams.get('id');
	const lang = url.searchParams.get('lang') || 'th'; 

	if (!id) return json({ message: 'Missing ID' }, { status: 400 });

	
	let dbDict = { en: {} as Record<string, string>, th: {} as Record<string, string> };
	try {
		const res = await fetch('/api/translations');
		if (res.ok) {
			const data = await res.json();
			data.forEach((item: any) => {
				dbDict.en[item.translation_key] = item.en_text;
				dbDict.th[item.translation_key] = item.th_text;
			});
		}
	} catch (e) {
		console.error('Failed to fetch translations:', e);
	}

	let connection;
	try {
		connection = await db.getConnection();

		const [rows] = await connection.execute<DocumentData[]>(
			`
            SELECT sd.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id, 
                   u.full_name as created_by_name,
                   jo.job_type as jo_job_type, jo.bl_number as jo_bl_number , jo.job_number as job_number
            FROM sales_documents sd
            LEFT JOIN customers c ON sd.customer_id = c.id
            LEFT JOIN users u ON sd.created_by_user_id = u.id
            LEFT JOIN job_orders jo ON sd.job_order_id = jo.id
            WHERE sd.id = ?
        `,
			[id]
		);

		if (rows.length === 0) return json({ message: 'Document not found' }, { status: 404 });
		const docData = rows[0];

		const [items] = await connection.execute<RowDataPacket[]>(
			`
            SELECT description, quantity, unit_price, line_total, wht_rate, is_vat
            FROM sales_document_items 
            WHERE document_id = ? 
            ORDER BY item_order ASC
        `,
			[id]
		);

		const [company] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
		const companyData = company[0] || null;

		const logoBase64 = getLogoBase64(companyData?.logo_path);

		
		const html = getInvoiceHtml(companyData, docData, items as ItemData[], logoBase64, lang, dbDict);

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
				'Content-Disposition': `inline; filename="${docData.document_type}-${docData.document_number}.pdf"`
			}
		});
	} catch (err: any) {
		console.error('PDF Error:', err);
		return json({ message: err.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};