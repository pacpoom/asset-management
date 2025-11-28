import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

// --- 1. INTERFACES ---
interface CompanyData extends RowDataPacket {
	name: string;
	logo_path: string | null;
	address_line_1: string | null;
	address_line_2: string | null;
	city: string | null;
	state_province: string | null;
	postal_code: string | null;
	tax_id: string | null;
}

interface VoucherData extends RowDataPacket {
	id: number;
	voucher_type: 'RV' | 'PV';
	voucher_number: string;
	voucher_date: string;
	contact_name: string;
	description: string | null;
	subtotal: number;
	vat_rate: number;
	vat_amount: number;
	wht_rate: number;
	wht_amount: number;
	total_amount: number;
	created_by_name: string;
}

// --- 2. Helper Functions (BahtText & Format) ---
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

function getVoucherHtml(company: CompanyData | null, voucher: VoucherData): string {
	const subtotal = Number(voucher.subtotal || 0);
	const vatRate = Number(voucher.vat_rate || 0);
	const vatAmount = Number(voucher.vat_amount || 0);
	const whtRate = Number(voucher.wht_rate || 0);
	const whtAmount = Number(voucher.wht_amount || 0);
	const totalAmount = Number(voucher.total_amount || 0);

	const totalText = bahttext(totalAmount);
	const titleTH = voucher.voucher_type === 'RV' ? 'ใบสำคัญรับ' : 'ใบสำคัญจ่าย';
	const titleEN = voucher.voucher_type === 'RV' ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER';
	const colorClass = voucher.voucher_type === 'RV' ? 'text-green-700' : 'text-red-700';
	const contactLabel =
		voucher.voucher_type === 'RV' ? 'รับเงินจาก (Received From)' : 'จ่ายให้แก่ (Paid To)';
	const netTotalLabel = voucher.voucher_type === 'RV' ? 'ยอดรายรับสุทธิ' : 'ยอดชำระสุทธิ';

	const formatNumber = (num: number) =>
		num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	const formatDate = (isoString: string) => {
		if (!isoString) return '-';
		return new Date(isoString).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	};

	return `
    <html>
    <head>
        <meta charset="UTF-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
            body { font-family: 'Sarabun', sans-serif; font-size: 10pt; color: #333; margin: 0; padding: 0; }
            .page { padding: 40px; height: 297mm; position: relative; box-sizing: border-box; }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .content-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .content-table th, .content-table td { border: 1px solid #ccc; padding: 8px; }
            .content-table th { background-color: #f3f4f6; text-align: center; }
            .footer-section { position: absolute; bottom: 40px; left: 40px; right: 40px; }
            .summary-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .summary-table td { padding: 4px 8px; }
        </style>
    </head>
    <body>
        <div class="page">
            <table class="header-table">
                <tr>
                    <td style="width: 60%; vertical-align: top;">
                         ${
														company?.logo_path
															? `<img src="http://localhost:5173${company.logo_path}" alt="Logo" style="max-height: 60px; margin-bottom: 5px;" />`
															: `<h2 style="font-size: 16pt; font-weight: bold;">${company?.name || 'My Company'}</h2>`
													}
                        <p style="font-size: 9pt; margin: 0;">${company?.address_line_1 || ''} ${company?.address_line_2 || ''}</p>
                        <p style="font-size: 9pt; margin: 0;">${company?.city || ''} ${company?.state_province || ''} ${company?.postal_code || ''}</p>
                        <p style="font-size: 9pt; margin: 0;"><b>Tax ID:</b> ${company?.tax_id || '-'}</p>
                    </td>
                    <td style="width: 40%; vertical-align: top; text-align: right;">
                        <h1 class="${colorClass} text-2xl font-bold uppercase" style="margin: 0;">${titleTH}</h1>
                        <p style="font-size: 10pt; font-weight: bold; color: #666; margin: 0;">${titleEN}</p>
                        <div style="margin-top: 10px; font-size: 9pt;">
                            <p style="margin: 2px 0;"><b>เลขที่ (No.):</b> ${voucher.voucher_number}</p>
                            <p style="margin: 2px 0;"><b>วันที่ (Date):</b> ${formatDate(voucher.voucher_date)}</p>
                        </div>
                    </td>
                </tr>
            </table>

            <div style="margin-bottom: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
                <p style="font-size: 11pt;"><b>${contactLabel}:</b> ${voucher.contact_name}</p>
            </div>

            <table class="content-table">
                <thead>
                    <tr>
                        <th style="width: 70%;">รายการ (Description)</th>
                        <th style="width: 30%;">จำนวนเงิน (Amount)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="height: 200px; vertical-align: top;">
                            ${voucher.description || '-'}
                        </td>
                        <td style="vertical-align: top; text-align: center;">
                            ${formatNumber(subtotal)}
                        </td>
                    </tr>
                </tbody>
            </table>

            <table class="summary-table">
                <tr>
                    <td style="width: 60%; vertical-align: bottom; padding-right: 10px;">
                        <div style="border: 1px solid #ccc; background-color: #f9fafb; font-weight: bold; text-align: center; padding: 8px;">
                            จำนวนเงินสุทธิเป็นตัวอักษร (${totalText})
                        </div>
                    </td>
                    
                    <td style="width: 40%; padding: 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="text-align: right; border-bottom: 1px solid #eee;">ยอดรวม (Subtotal)</td>
                                <td style="text-align: right; font-weight: bold; border-bottom: 1px solid #eee;">${formatNumber(subtotal)}</td>
                            </tr>
                            ${
															vatAmount > 0
																? `
                            <tr>
                                <td style="text-align: right; border-bottom: 1px solid #eee;">VAT ${vatRate}%</td>
                                <td style="text-align: right; border-bottom: 1px solid #eee;">${formatNumber(vatAmount)}</td>
                            </tr>`
																: ''
														}
                            ${
															whtAmount > 0
																? `
                            <tr>
                                <td style="text-align: right; border-bottom: 1px solid #eee; color: #dc2626;">หัก ณ ที่จ่าย ${whtRate}%</td>
                                <td style="text-align: right; border-bottom: 1px solid #eee; color: #dc2626;">- ${formatNumber(whtAmount)}</td>
                            </tr>`
																: ''
														}
                            
                            <tr style="background-color: #f3f4f6;">
                                <td style="text-align: right; font-weight: bold;">${netTotalLabel}</td>
                                <td style="text-align: right; font-weight: bold; font-size: 11pt; color: #2563eb;">${formatNumber(totalAmount)}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <div class="footer-section">
                <div style="display: flex; justify-content: space-between; text-align: center;">
                    <div style="width: 30%;">
                        <div style="border-bottom: 1px dotted #000; height: 30px;"></div>
                        <p style="margin-top: 5px;">ผู้ทำรายการ (Prepared By)</p>
                        <p style="font-size: 9pt; color: #666;">(${voucher.created_by_name || '........................'})</p>
                        <p style="font-size: 9pt;">วันที่ ...../...../.....</p>
                    </div>
                    <div style="width: 30%;">
                        <div style="border-bottom: 1px dotted #000; height: 30px;"></div>
                        <p style="margin-top: 5px;">ผู้อนุมัติ (Authorized By)</p>
                        <p style="font-size: 9pt; color: #666;">(..................................)</p>
                        <p style="font-size: 9pt;">วันที่ ...../...../.....</p>
                    </div>
                    <div style="width: 30%;">
                        <div style="border-bottom: 1px dotted #000; height: 30px;"></div>
                        <p style="margin-top: 5px;">ผู้รับ/ผู้จ่ายเงิน (Payee/Payer)</p>
                        <p style="font-size: 9pt; color: #666;">(${voucher.contact_name})</p>
                        <p style="font-size: 9pt;">วันที่ ...../...../.....</p>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

// --- 3. Main Handler ---
export const GET = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return json({ message: 'Missing ID' }, { status: 400 });

	let connection;
	try {
		connection = await db.getConnection();
		const [vRows] = await connection.execute<VoucherData[]>(
			`SELECT v.*, u.full_name as created_by_name 
             FROM general_vouchers v
             LEFT JOIN users u ON v.created_by_user_id = u.id
             WHERE v.id = ?`,
			[id]
		);

		if (vRows.length === 0) return json({ message: 'Voucher not found' }, { status: 404 });
		const voucher = vRows[0];
		const [cRows] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
		const company = cRows.length > 0 ? cRows[0] : null;

		const html = getVoucherHtml(company, voucher);

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
				'Content-Disposition': `inline; filename="${voucher.voucher_number}.pdf"`
			}
		});
	} catch (err: any) {
		console.error('PDF Error:', err);
		return json({ message: err.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
