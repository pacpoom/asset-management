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
	customer_company_name: string | null;
	customer_address: string | null;
	customer_tax_id: string | null;
	created_by_name: string;

	contact_name: string | null;
	contact_phone: string | null;
	contact_email: string | null;

	job_number: string | null;
	jo_job_type: string | null;
	jo_bl_number: string | null;
	jo_etd: string | null;
	jo_eta: string | null;
	jo_quantity: number | null;
	jo_mbl: string | null;
	jo_location: string | null;
	jo_weight: number | null;
	jo_kgs_volume: number | null;
	jo_liner_name: string | null;
	jo_ccl: string | null;
	jo_invoice_note: string | null;

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
	th: {
		No: 'เลขที่ / No.',
		Date: 'วันที่ / Date',
		Term: 'เครดิต / Term',
		Due: 'ครบกำหนด / Due',
		Ref: 'อ้างอิง / Ref',
		Customer: 'ลูกค้า (Customer)',
		'Issued By': 'ผู้ออกเอกสาร (Issued By)',
		Seq: 'ลำดับ',
		Description: 'รายการ (Description)',
		Qty: 'จำนวน',
		UnitPrice: 'ราคา/หน่วย',
		Amount: 'จำนวนเงิน',
		Notes: 'หมายเหตุ (Notes):',
		NetText: 'จำนวนเงินสุทธิเป็นตัวอักษร',
		Subtotal: 'รวมเป็นเงิน',
		Discount: 'ส่วนลด',
		AfterDiscount: 'หลังหักส่วนลด',
		VAT: 'VAT ชื้อ',
		WHT: 'หัก ณ ที่จ่ายรวม',
		GrandTotal: 'จำนวนเงินสุทธิ',
		ReceivedBy: 'ผู้รับเอกสาร (Received by)',
		Auth: 'ผู้มีอำนาจลงนาม (Authorized Signature)',
		Page: 'หน้า',
		Carry: '-- ยอดยกไป (Carried Forward) --',
		Days: 'วัน (Days)',
		Cash: 'เงินสด (Cash)',
		Attn: 'เรียน (Attn)',
		// Job specific translations
		ETD: 'ETD',
		ETA: 'ETA',
		Quantity: 'จำนวน',
		HBL: 'HBL',
		MBL: 'MB/L',
		Port: 'ท่าเรือ / สถานที่',
		Weight: 'น้ำหนัก (KGS)',
		Vol: 'ปริมาตร (CBM)',
		Liner: 'สายเรือ',
		CCL: 'CCL',
		InvoiceNote: 'หมายเหตุใบแจ้งหนี้',
		JobRef: 'รายละเอียดใบสั่งงานขนส่ง (Job Reference)'
	},
	en: {
		No: 'No.',
		Date: 'Date',
		Term: 'Term',
		Due: 'Due Date',
		Ref: 'Reference',
		Customer: 'Customer',
		'Issued By': 'Issued By',
		Seq: 'Item',
		Description: 'Description',
		Qty: 'Qty',
		UnitPrice: 'Unit Price',
		Amount: 'Amount',
		Notes: 'Notes:',
		NetText: 'Net Amount in Words',
		Subtotal: 'Subtotal',
		Discount: 'Discount',
		AfterDiscount: 'Total After Discount',
		VAT: 'VAT',
		WHT: 'Total WHT',
		GrandTotal: 'Grand Total',
		ReceivedBy: 'Received by',
		Auth: 'Authorized Signature',
		Page: 'Page',
		Carry: '-- Carried Forward --',
		Days: 'Days',
		Cash: 'Cash',
		Attn: 'Attn',
		// Job specific translations
		ETD: 'ETD',
		ETA: 'ETA',
		Quantity: 'Quantity',
		HBL: 'HBL Number',
		MBL: 'MB/L',
		Port: 'Port / Location',
		Weight: 'Weight',
		Vol: 'Volume',
		Liner: 'Liner / Carrier',
		CCL: 'CCL',
		InvoiceNote: 'Invoice Note',
		JobRef: 'Job Reference Details'
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
		case 'QT':
			return { th: 'ใบเสนอราคา', en: 'QUOTATION' };
		case 'BN':
			return { th: 'ใบวางบิล', en: 'BILLING NOTE' };
		case 'INV':
			return { th: 'ใบแจ้งหนี้', en: 'INVOICE' };
		case 'RE':
			return { th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE' };
		default:
			return { th: 'เอกสาร', en: 'DOCUMENT' };
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
	const whtRateText =
		ratesArray.length > 0 ? ratesArray.join('%, ') : Number(docData.withholding_tax_rate || 0);

	const whtAmt =
		calculatedWhtAmt > 0
			? calculatedWhtAmt
			: Number(docData.wht_amount || docData.withholding_tax_amount || 0);

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
		? `<img src="${logoBase64}" alt="Logo" style="max-height: 120px; margin-bottom: 8px;" />`
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
                    <p style="font-weight: bold; margin: 0 0 4px 0;">${docData.customer_company_name || docData.customer_name}</p>
                    <div style="font-size: 8pt; line-height: 1.4;">
                        <p style="margin:0; white-space: pre-wrap;">${docData.customer_address || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">Tax ID:</span> ${docData.customer_tax_id || '-'}</p>
                    ${docData.contact_name ? `<p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">${tPdf('Attn', lang)}:</span> ${docData.contact_name} ${docData.contact_phone ? `(Tel: ${docData.contact_phone})` : ''}</p>` : ''}
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

	// สร้าง HTML แสดงรายละเอียด Job หรือ Note อย่างใดอย่างหนึ่ง
	let notesOrJobHtml = '';
	if (docData.job_order_id) {
		notesOrJobHtml = `
		<div>
			<div style="font-weight: bold; text-decoration: underline; margin-bottom: 4px; font-size: 8pt;">${tPdf('JobRef', lang)}:</div>
			<table style="width: 100%; font-size: 7.5pt; color: #374151; border-collapse: collapse;">
				<tr>
					<td style="width: 33.33%; padding: 2px 0;"><b>${tPdf('HBL', lang)}:</b> <span style="font-family: monospace;">${docData.jo_bl_number || '-'}</span></td>
					<td style="width: 33.33%; padding: 2px 0;"><b>${tPdf('MBL', lang)}:</b> <span style="font-family: monospace;">${docData.jo_mbl || '-'}</span></td>
					<td style="width: 33.33%; padding: 2px 0;"><b>${tPdf('Port', lang)}:</b> ${docData.jo_location || '-'}</td>
				</tr>
				<tr>
					<td style="padding: 2px 0;"><b>${tPdf('ETD', lang)}:</b> ${formatDateOnly(docData.jo_etd)}</td>
					<td style="padding: 2px 0;"><b>${tPdf('ETA', lang)}:</b> ${formatDateOnly(docData.jo_eta)}</td>
					<td style="padding: 2px 0;"><b>${tPdf('Liner', lang)}:</b> ${docData.jo_liner_name || '-'}</td>
				</tr>
				<tr>
					<td style="padding: 2px 0;"><b>${tPdf('Quantity', lang)}:</b> ${docData.jo_quantity || '0'}</td>
					<td style="padding: 2px 0;"><b>${tPdf('Weight', lang)}:</b> ${docData.jo_weight || '0.00'}</td>
					<td style="padding: 2px 0;"><b>${tPdf('Vol', lang)}:</b> ${docData.jo_kgs_volume || '0.00'}</td>
				</tr>
				<tr>
					<td style="padding: 2px 0;"><b>${tPdf('CCL', lang)}:</b> ${docData.jo_ccl || '-'}</td>
					<td style="padding: 2px 0;"colspan="2"><b>${tPdf('InvoiceNote', lang)}:</b> ${docData.jo_invoice_note || '-'}</td>
				</tr>
			</table>
		</div>
		`;
	} else {
		notesOrJobHtml = `
			<span style="font-weight: bold; text-decoration: underline; font-size: 10pt;">${tPdf('Notes', lang)}</span>
			<div style="margin-top: 4px; white-space: pre-wrap; color: #000; font-weight: bold; font-size: 10pt;">${docData.notes || '-'}</div>
		`;
	}

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
							${notesOrJobHtml}
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

	// --- LOGIC ตัดคำนวณแบ่งหน้าโดยใช้บรรทัดเป็นตัวอ้างอิง ---
	function countLines(text: string | null | undefined): number {
		if (!text) return 1;
		const lines = text.split('\n');
		let total = 0;
		for (const line of lines) {
			// ให้ 1 บรรทัด หรือถ้าตัวอักษรยาวเกิน 50 ตัว ให้ตีเป็นหลายบรรทัด
			total += Math.max(1, Math.ceil(line.length / 50));
		}
		return total;
	}

	const MAX_LINES_PER_PAGE = 22; // จำนวนบรรทัดสูงสุดต่อหน้าเนื้อหาปกติ
	const MAX_LINES_LAST_PAGE = 12; // จำนวนบรรทัดสูงสุดสำหรับหน้าที่มีสรุปยอด (Summary) เพื่อเผื่อพื้นที่

	interface PageInfo {
		items: ItemData[];
		startIndex: number;
	}

	const pages: PageInfo[] = [];
	let currentPageItems: ItemData[] = [];
	let currentLineCount = 0;
	let currentItemIndex = 0;
	let pageStartIndex = 0;

	for (const item of itemsData) {
		const itemLines = countLines(item.description);

		// ถ้าเพิ่ม item นี้แล้วบรรทัดจะเกินหน้า ให้ดันขึ้นหน้าใหม่
		if (currentLineCount + itemLines > MAX_LINES_PER_PAGE && currentPageItems.length > 0) {
			pages.push({ items: currentPageItems, startIndex: pageStartIndex });
			currentPageItems = [];
			currentLineCount = 0;
			pageStartIndex = currentItemIndex;
		}

		currentPageItems.push(item);
		currentLineCount += itemLines;
		currentItemIndex++;
	}

	// จัดการหน้าสุดท้าย (เหลือเศษมาในลูป)
	if (currentPageItems.length > 0) {
		// ตรวจสอบว่าหน้าสุดท้ายมีพื้นที่เหลือพอสำหรับ Summary หรือไม่
		if (currentLineCount > MAX_LINES_LAST_PAGE) {
			// พื้นที่ไม่พอ ใส่ items ในหน้าปัจจุบันให้หมด แล้วสร้างหน้าว่าง 1 หน้าสำหรับ Summary Block
			pages.push({ items: currentPageItems, startIndex: pageStartIndex });
			pages.push({ items: [], startIndex: currentItemIndex });
		} else {
			// พื้นที่พอ วางลงหน้าปัจจุบันได้เลย
			pages.push({ items: currentPageItems, startIndex: pageStartIndex });
		}
	} else if (pages.length === 0) {
		pages.push({ items: [], startIndex: 0 }); // กรณีไม่มี Item เลย
	}

	const totalPages = pages.length;

	const pagesHtml = pages
		.map((pageInfo, index) => {
			const isLastPage = index === totalPages - 1;
			const pageNum = index + 1;

			const rowsHtml = pageInfo.items
				.map(
					(item, i) => `
    <tr style="border-bottom: 1px solid #eee;">
        <td class="p-2 text-center" style="vertical-align: top;">${pageInfo.startIndex + i + 1}</td>
        <td class="p-2" style="white-space: pre-wrap; word-break: break-word;">${item.description}</td>
        <td class="p-2 text-right" style="vertical-align: top;">${formatNumber(item.quantity)}</td>
        <td class="p-2 text-right" style="vertical-align: top;">${formatNumber(item.unit_price)}</td>
        <td class="p-2 text-center" style="color: #2563eb; font-weight: 500; vertical-align: top;">
            ${item.is_vat ? '7%' : '-'}
        </td>
        <td class="p-2 text-center" style="color: #ef4444; font-weight: 500; vertical-align: top;">
            ${Number(item.wht_rate) > 0 ? Number(item.wht_rate) + '%' : '-'}
        </td>
        <td class="p-2 text-right" style="vertical-align: top;">${formatNumber(item.line_total)}</td>
    </tr>
`
				)
				.join('');

			const tableHtml =
				pageInfo.items.length > 0
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
                <div style="width: 100%;">
                    ${summaryBlock}
                    ${signatureBlock}
                    <div style="text-align: right; font-size: 8pt; color: #999; margin-top: 10px;">${tPdf('Page', lang)} ${pageNum} / ${totalPages}</div>
                </div>
            `;
			} else {
				footerHtml = `
                <div style="width: 100%;">
                    <div style="text-align: right; font-weight: bold; margin-top: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">${tPdf('Carry', lang)}</div>
                    <div style="text-align: right; font-size: 8pt; color: #999; margin-top: 10px;">${tPdf('Page', lang)} ${pageNum} / ${totalPages}</div>
                </div>
            `;
			}

			// ใส่ page-break ให้ถูกต้อง และครอบเนื้อหาให้อยู่ในหน้าเดียวเสมอ
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
                
				/* ปรับปรุงโครงสร้าง document-page ให้อิงความสูงชัดเจนเพื่อป้องกัน footer ทับ */
				.document-page { 
					padding: 40px; 
					box-sizing: border-box; 
					position: relative; 
					height: 297mm; 
					overflow: hidden; 
				}
                
				.footer-container { 
					position: absolute; 
					bottom: 40px; 
					left: 40px; 
					right: 40px; 
				}
                
				@media print { 
					@page { size: A4; margin: 0; } 
					body { -webkit-print-color-adjust: exact; } 
				}
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
                   c.name as customer_name, c.company_name as customer_company_name, c.address as customer_address, c.tax_id as customer_tax_id, 
                   u.full_name as created_by_name,
                   cc.name as contact_name, cc.phone as contact_phone, cc.email as contact_email,
                   jo.job_type as jo_job_type, jo.bl_number as jo_bl_number , jo.job_number as job_number,
                   jo.etd as jo_etd, jo.eta as jo_eta, jo.quantity as jo_quantity, jo.mbl as jo_mbl,
                   jo.location as jo_location, jo.weight as jo_weight, jo.kgs_volume as jo_kgs_volume,
                   jo.liner_name as jo_liner_name, jo.ccl as jo_ccl , jo.invoice_no as jo_invoice_note
            FROM sales_documents sd
            LEFT JOIN customers c ON sd.customer_id = c.id
            LEFT JOIN customer_contacts cc ON sd.customer_contact_id = cc.id
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