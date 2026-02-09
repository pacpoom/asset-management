import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';
import type { RequestHandler } from './$types';

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

interface PurchaseOrderData extends RowDataPacket {
	id: number;
	po_number: string;
	po_date: string;
	vendor_id: number;

	delivery_date: string | null;
	payment_term: string | null;
	contact_person: string | null;
	remarks: string | null;

	vendor_name: string;
	vendor_address: string | null;
	vendor_tax_id: string | null;
	vendor_phone: string | null;
	vendor_email: string | null;
	prepared_by_user_name: string;

	subtotal: number;
	discount: number;
	vat_rate: number;
	vat_amount: number;
	wht_rate: number;
	wht_amount: number;
	total_amount: number;
}

interface ItemData extends RowDataPacket {
	product_name: string;
	description: string | null;
	quantity: number;
	unit: string | null;
	unit_price: number;
	discount: number;
	total_price: number;
}

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
		console.error('bahttext: Received NaN, returning ศูนย์บาทถ้วน');
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

		if (numStr[0] === '1') {
			result += numStr.length > 1 && numStr[1] !== '0' ? 'สิบ' : 'สิบ';
		} else if (numStr[0] === '2') {
			result += 'ยี่สิบ';
		} else if (numStr[0] !== '0') {
			result += THAI_NUMBERS[parseInt(numStr[0])] + 'สิบ';
		}

		if (numStr[1] === '1' && numStr[0] !== '0' && numStr[0] !== '1') {
			result += 'เอ็ด';
		} else if (numStr[1] !== '0') {
			result += THAI_NUMBERS[parseInt(numStr[1])];
		}

		return result;
	}

	const integerText = convertInteger(integerPart) || 'ศูนย์';
	const decimalText = convertDecimal(decimalPart);

	if (decimalText) {
		return `${integerText}บาท${decimalText}สตางค์`;
	} else {
		return `${integerText}บาทถ้วน`;
	}
}

function getPOHtml(
	companyData: CompanyData | null,
	poData: PurchaseOrderData,
	itemsData: ItemData[],
	logoBase64: string | null
): string {
	const subtotal = poData.subtotal || 0;
	const discount = poData.discount || 0;
	const totalAfterDiscount = subtotal - discount;
	const vat = poData.vat_amount || 0;
	const vatRate = poData.vat_rate || 0;
	const wht = poData.wht_amount || 0;
	const whtRate = poData.wht_rate || 0;
	const netAmount = poData.total_amount || 0;
	const netAmountAsNumber = parseFloat(String(netAmount)) || 0;
	const netAmountText = bahttext(netAmountAsNumber);

	const formatNumber = (num: number | string): string => {
		const numericValue = typeof num === 'string' ? parseFloat(num) : num;
		if (isNaN(numericValue)) return '0.00';
		return numericValue.toLocaleString('en-US', {
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

	const logoHtml = logoBase64
		? `<img src="${logoBase64}" alt="Logo" style="max-height: 64px; margin-bottom: 8px;" />`
		: companyData?.name
			? `<h2 style="font-size: 1.25rem; font-weight: bold; color: #1F2937;">${companyData.name}</h2>`
			: '';

	const headerContent = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; page-break-inside: avoid; font-size: 9pt;">
            <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="width: 60%; vertical-align: top; padding-bottom: 1rem;">
                    ${logoHtml}
                    <div style="font-size: 8pt; color: #6B7280; line-height: 1.4;">
                        <p style="margin:0;">${companyData?.address_line_1 || ''}</p>
                        ${companyData?.address_line_2 ? `<p style="margin:0;">${companyData.address_line_2}</p>` : ''}
                        <p style="margin:0;">
                            ${companyData?.city || ''} ${companyData?.state_province || ''} ${companyData?.postal_code || ''}
                        </p>
                        <p style="margin:4px 0 0 0;">
                            <span style="font-weight: 600; color: #374151;">Tax ID:</span>
                            ${companyData?.tax_id || '-'}
                        </p>
                    </div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
                    <h1 style="font-size: 1.5rem; font-weight: bold; color: #1F2937; text-transform: uppercase; margin: 0;">ใบสั่งซื้อ</h1>
                    <div style="margin-top: 1rem; font-size: 8pt; line-height: 1.5;">
                        <p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">เลขที่ / No.:</span> <span style="font-weight: 500; color: #1F2937;">${poData.po_number}</span></p>
                        <p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">วันที่ / Date:</span> <span style="font-weight: 500; color: #1F2937;">${formatDateOnly(poData.po_date)}</span></p>
                        <p style="margin:0;"><span style="font-weight: 600; color: #4B5563;">กำหนดส่ง / Delivery:</span> <span style="font-weight: 500; color: #1F2937;">${formatDateOnly(poData.delivery_date)}</span></p>
                    </div>
                </td>
            </tr>
            <tr>
                <td style="padding-top: 1rem; vertical-align: top;">
                    <h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ผู้จำหน่าย (Vendor)</h3>
                    <p style="font-weight: bold; color: #374151; margin: 0 0 4px 0;">${poData.vendor_name}</p>
                    <div style="font-size: 8pt; color: #374151; line-height: 1.4;">
                        ${(poData.vendor_address || 'No address provided.')
													.split(/\r?\n/)
													.map((line) => line.trim())
													.filter((line) => line.length > 0)
													.map((line) => `<p style="margin:0;">${line}</p>`)
													.join('')}
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600; color: #374151;">Tax ID:</span> ${poData.vendor_tax_id || '-'}</p>
                    <p style="font-size: 8pt; margin:2px 0 0 0;"><span style="font-weight: 600; color: #374151;">ผู้ติดต่อ:</span> ${poData.contact_person || '-'}</p>
                </td>
                <td style="padding-top: 1rem; vertical-align: top;">
                    <h3 style="font-weight: 600; color: #6B7280; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0;">ข้อมูลเพิ่มเติม (More Info)</h3>
                    <p style="font-size: 8pt; margin: 4px 0;"><span style="font-weight: 600;">ผู้จัดทำ / Prepared By:</span> ${poData.prepared_by_user_name || '-'}</p>
                    <p style="font-size: 8pt; margin: 4px 0;"><span style="font-weight: 600;">เงื่อนไขชำระเงิน / Term:</span> ${poData.payment_term || '-'}</p>
                </td>
            </tr>
        </table>
    `;

	const itemTableHeadersHtml = `
        <thead>
            <tr class="items-header-row" style="background-color: #ffffff !important; border-bottom: 1px solid #D1D5DB !important; border-top: 1px solid #D1D5DB !important;">
                <th class="w-12 text-center p-2" style="font-size: 8pt; font-weight: bold;">ลำดับ</th>
                <th class="text-left p-2" style="font-size: 8pt; font-weight: bold;">รายการสินค้า / บริการ</th>
                <th class="w-16 text-center p-2" style="font-size: 8pt; font-weight: bold;">จำนวน</th>
                <th class="w-16 text-center p-2" style="font-size: 8pt; font-weight: bold;">หน่วย</th>
                <th class="w-24 text-right p-2" style="font-size: 8pt; font-weight: bold;">ราคา/หน่วย</th> 
                <th class="w-20 text-right p-2" style="font-size: 8pt; font-weight: bold;">ส่วนลด</th> 
                <th class="w-28 text-right p-2" style="font-size: 8pt; font-weight: bold;">จำนวนเงิน</th> 
            </tr>
        </thead>
    `;

	const financialSummaryBlock = `
        <table class="w-full border-collapse border border-gray-400" style="page-break-inside: avoid !important; table-layout: fixed; margin-top: 1px;">
            <colgroup>
                <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;"> <col style="width: auto;">
                <col style="width: 112px;"> <col style="width: 128px;">
            </colgroup>
            <tfoot class="bill-summary-footer">
                <tr>
                    <td colspan="4" class="p-2" style="vertical-align: top; border-right: 1px solid #9ca3af;">
                        <div style="font-size: 8pt;">${poData.remarks}</div>
                    </td> 
                    <td class="font-bold p-2 text-right border-t border-gray-400" style="font-size: 8pt; font-weight: bold;">รวมเป็นเงิน</td>
                    <td class="p-2 text-right border-t border-gray-400" style="font-size: 8pt;">${formatNumber(subtotal)}</td>
                </tr>
                <tr>
                    <td colspan="4" class="p-2" style="border-right: 1px solid #9ca3af;"></td>
                    <td class="font-bold p-2 text-right border-l border-gray-400" style="font-size: 8pt; font-weight: bold;">ส่วนลด</td>
                    <td class="p-2 text-right" style="font-size: 8pt;">${discount > 0 ? '-' : ''}${formatNumber(discount)}</td>
                </tr>
                <tr>
                    <td colspan="4" class="p-2" style="border-right: 1px solid #9ca3af;"></td>
                    <td class="font-bold p-2 text-right border-l border-gray-400" style="font-size: 8pt; font-weight: bold;">หลังหักส่วนลด</td>
                    <td class="p-2 text-right" style="font-size: 8pt;">${formatNumber(totalAfterDiscount)}</td>
                </tr>
                <tr>
                    <td colspan="4" class="p-2" style="border-right: 1px solid #9ca3af;"></td>
                    <td class="font-bold p-2 text-right border-l border-gray-400" style="font-size: 8pt; font-weight: bold;">ภาษีมูลค่าเพิ่ม (${vatRate}%)</td>
                    <td class="p-2 text-right" style="font-size: 8pt;">${formatNumber(vat)}</td>
                </tr>
                ${
									wht > 0
										? `
                <tr>
                    <td colspan="4" class="p-2" style="border-right: 1px solid #9ca3af;"></td>
                    <td class="font-bold p-2 text-right border-l border-gray-400 text-red-600" style="font-size: 8pt; font-weight: bold;">หัก ณ ที่จ่าย (${whtRate}%)</td>
                    <td class="p-2 text-right text-red-600" style="font-size: 8pt;">${formatNumber(wht)}</td>
                </tr>`
										: ''
								}
                <tr style="background-color: #ffffff;">
                    <td colspan="4" class="p-2 text-left font-bold" style="font-size: 9pt; font-weight: bold; vertical-align: bottom; text-align: center; border-top: 1px solid #9ca3af;">
                        (จำนวนเงินสุทธิเป็นตัวอักษร: ${netAmountText})
                    </td>
                    <td class="font-bold p-2 text-right border-l border-t border-gray-400" style="font-size: 9pt; font-weight: bold;">จำนวนเงินสุทธิ</td>
                    <td class="p-2 text-right border-t border-gray-400 text-blue-700" style="font-size: 8pt; font-weight: bold;">${formatNumber(netAmount)}</td>
                </tr>
            </tfoot>
        </table>
    `;

	const paymentAndSignatureBlock = `
        <div class="payment-and-signature-block" style="page-break-inside: avoid !important;"> 
            <section class="border border-gray-400 rounded-lg p-4 mt-4">
                <h3 class="font-bold mb-2">ชำระโดย (Paid by):</h3>
                <div class="flex space-x-6"> 
                    <div><input type="checkbox" disabled> เงินสด (Cash)</div>
                    <div><input type="checkbox" disabled> เช็ค (Cheque)</div>
                    <div><input type="checkbox" disabled> โอนเงิน (Transfer)</div>
                </div>
                <div class="text-gray-500 mt-2">
                    <p>ธนาคาร: ...................... สาขา: ...................... เลขที่เช็ค/บัญชี: ......................</p>
                </div>
            </section>
            <section class="document-footer mt-4"> 
                <div class="grid grid-cols-4 gap-8 text-xs"> 
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(..............................)</p>
                        <p class="mt-1">ผู้จัดทำ (Prepared by)</p>
                        <p class="mt-0 text-gray-500">(วันที่: ......../......../........)</p>
                    </div>
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(..............................)</p>
                        <p class="mt-1">ผู้ตรวจสอบ (Checked by)</p>
                        <p class="mt-0 text-gray-500">(วันที่: ......../......../........)</p>
                    </div>
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(..............................)</p>
                        <p class="mt-1">ผู้อนุมัติ (Approved by)</p>
                        <p class="mt-0 text-gray-500">(วันที่: ......../......../........)</p>
                    </div>
                    <div class="text-center">
                        <p class="border-b border-dotted border-gray-500 pb-4">(..............................)</p>
                        <p class="mt-1">ผู้รับเงิน (Received by)</p>
                        <p class="mt-0 text-gray-500">(วันที่: ......../......../........)</p>
                    </div>
                </div>
            </section>
        </div>
    `;

	const MAX_WITH_FOOTER = 10;
	const MAX_WITHOUT_FOOTER = 18;

	const itemPages: ItemData[][] = [];
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
			for (let i = 0; i < pageIndex; i++) {
				startIndex += itemPages[i].length;
			}

			const itemsHtml = pageItems
				.map((item, itemIndex) => {
					const globalIndex = startIndex + itemIndex + 1;
					return `
                    <tr class="border-b border-gray-300">
                        <td class="p-2 text-center align-middle h-8" style="font-size: 8pt;">${globalIndex}</td>
                        <td class="p-2 align-middle h-8" style="font-size: 8pt;">
                            <div style="font-weight: 600;">${item.product_name}</div>
                            ${item.description ? `<div style="font-size: 7pt; color: #666;">${item.description}</div>` : ''}
                        </td>
                        <td class="p-2 text-center align-middle h-8" style="font-size: 8pt;">${formatNumber(item.quantity)}</td> 
                        <td class="p-2 text-center align-middle h-8" style="font-size: 8pt;">${item.unit || ''}</td> 
                        <td class="p-2 text-right align-middle h-8" style="font-size: 8pt;">${formatNumber(item.unit_price)}</td> 
                        <td class="p-2 text-right align-middle h-8" style="font-size: 8pt;">${item.discount > 0 ? formatNumber(item.discount) : '-'}</td> 
                        <td class="p-2 text-right align-middle h-8" style="font-size: 8pt;">${formatNumber(item.total_price)}</td> 
                    </tr>
                `;
				})
				.join('');

			const tableContent =
				pageItems.length > 0
					? `
                <table class="w-full border-collapse items-table" style="table-layout: fixed;">
                    ${itemTableHeadersHtml}
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            `
					: `
                <div style="height: 1px; border-top: 1px solid #eee; margin-bottom: 20px;"></div>
            `;

			let footerContent = '';

			if (isLastPage) {
				footerContent = `
                    ${financialSummaryBlock}
                    ${paymentAndSignatureBlock}
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
                ${headerContent} ${tableContent}
                
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
    <title>Purchase Order - ${poData.po_number}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        body { 
            font-family: 'Sarabun', 'Arial', sans-serif; 
            margin: 0; padding: 0;
            font-size: 9pt !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
            background-color: #FFFFFF; 
            color: #333;
        }
        .page-container {
            width: 210mm;
            margin: auto;
            background: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .document-page {
            padding: 40px; 
            box-sizing: border-box;
            position: relative;
            min-height: 297mm;
        }
        .footer-container {
            page-break-inside: avoid !important; 
            margin-top: 10px;
        }
        .items-table thead {
            display: table-header-group !important;
        }
        @media print {
            body { background-color: #FFFFFF !important; }
            .page-container { width: auto; margin: 0; box-shadow: none; }
            .document-page { padding: 0; margin: 0; min-height: auto; }
            @page { size: A4; margin: 40px; }
        }
    </style>
    </head>
    <body>
        <div class="page-container">
            ${pagesHtml}
        </div> 
    </body>
    </html>
    `;
}

export const GET: RequestHandler = async ({ url }) => {
	console.log('เริ่มสร้าง PDF Purchase Order...');

	const poId = url.searchParams.get('id');

	if (!poId) {
		return json({ success: false, message: 'Missing PO ID' }, { status: 400 });
	}

	let poData: PurchaseOrderData;
	let itemsData: ItemData[];
	let companyData: CompanyData | null = null;
	let connection;

	try {
		connection = await db.getConnection();

		const [poRows] = await connection.execute<PurchaseOrderData[]>(
			`
            SELECT 
                po.*,
                v.name AS vendor_name, v.address AS vendor_address, v.tax_id AS vendor_tax_id, v.phone AS vendor_phone, v.email AS vendor_email,
                u.full_name AS prepared_by_user_name
            FROM purchase_orders po
            LEFT JOIN vendors v ON po.vendor_id = v.id
            LEFT JOIN users u ON po.created_by = u.id
            WHERE po.id = ?
            `,
			[poId]
		);

		if (poRows.length === 0) {
			return json({ success: false, message: 'PO not found' }, { status: 404 });
		}
		poData = poRows[0];

		const [companyRows] = await connection.execute<CompanyData[]>(
			'SELECT * FROM company WHERE id = 1 LIMIT 1'
		);
		companyData = companyRows.length ? companyRows[0] : null;

		const [itemsRows] = await connection.execute<RowDataPacket[]>(
			`SELECT 
                product_name, description, quantity, unit, unit_price, discount, total_price 
             FROM purchase_order_items 
             WHERE purchase_order_id = ? 
             ORDER BY id ASC`,
			[poId]
		);
		itemsData = itemsRows as ItemData[];
	} catch (dbError: any) {
		console.error('Database Error:', dbError);
		return json({ success: false, message: 'Failed to query database' }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}

	try {
		const logoBase64 = getLogoBase64(companyData?.logo_path ?? null);

		const htmlContent = getPOHtml(companyData, poData, itemsData, logoBase64);

		const browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			headless: true
		});
		const page = await browser.newPage();

		await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true
		});

		await browser.close();

		const pdfBlob = new Blob([pdfBuffer as any], { type: 'application/pdf' });
		const downloadFilename = `PO-${poData.po_number}.pdf`;

		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${downloadFilename}"`
			}
		});
	} catch (error: any) {
		console.error('PDF Generation Error:', error);
		return json(
			{ success: false, message: 'Failed to generate PDF: ' + error.message },
			{ status: 500 }
		);
	}
};
