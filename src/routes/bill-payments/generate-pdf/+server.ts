import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

// ---
// 1. INTERFACES (อัปเดตให้ครบถ้วน)
// ---

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

interface VoucherData extends RowDataPacket {
	id: string; // id ของ bill_payment
	payment_reference: string | null;
	payment_date: string;
	vendor_id: string;

	// ข้อมูลที่ Join มา (เหมือนหน้าพรีวิว)
	vendor_name: string;
	vendor_address: string | null;
	vendor_tax_id: string | null;
	prepared_by_user_name: string;
	vendor_contract_number: string | null;

	// ข้อมูลการเงิน (จาก DB)
	subtotal: number;
	discount_amount: number;
	total_after_discount: number;
	withholding_tax_rate: number | null;
	withholding_tax_amount: number;
	total_amount: number; // Grand total
}

interface ItemData {
	description: string;
	quantity: number;
	unit_price: number;
	line_total: number;
}

// ---
// 2. ฟังก์ชัน BAHTTEXT (พร้อมตัวกัน NaN)
// ---

function bahttext(num: number): string {
	// (เพิ่มการป้องกัน NaN ที่เราเจอปัญหา)
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

// ---
// 3. ฟังก์ชัน GETBILLHTML (แก้ไข Layout และการคำนวณ)
// ---

function getBillHtml(
	companyData: CompanyData | null,
	voucherData: VoucherData,
	itemsData: ItemData[]
): string {
	const subtotal = voucherData.subtotal || 0;
	const discount = voucherData.discount_amount || 0;
	const totalAfterDiscount = voucherData.total_after_discount || 0;
	const vat = 0; // (ระบบนี้ไม่มี VAT)
	const wht = voucherData.withholding_tax_amount || 0;
	const netAmount = voucherData.total_amount || 0;

	// *** แก้ไข: ป้องกัน Error 'num.toFixed' ***
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

	// เพิ่มฟังก์ชัน formatDate (จำเป็นต้องใช้)
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

	const itemsHtml = itemsData
		.map(
			(item: ItemData, index: number) => `
        <tr class="border-b border-gray-300">
            <td class="p-2 text-center align-middle h-10">${index + 1}</td>
            <td class="p-2 align-middle h-10">${item.description || 'N/A'}</td>
            <td class="p-2 text-center align-middle h-10">${formatNumber(item.quantity)}</td> 
            <td class="p-2 text-center align-middle h-10">N/A</td> 
            <td class="p-2 text-center align-middle h-10">${formatNumber(item.unit_price)}</td> 
            <td class="p-2 text-center align-middle h-10">${formatNumber(item.line_total)}</td> 
        </tr>
    `
		)
		.join('');

	const addressLines = (voucherData.vendor_address || 'No address provided.')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const addressHtml =
		addressLines.length > 0
			? addressLines.map((line) => `<p class="text-sm text-gray-600">${line}</p>`).join('')
			: `<p class="text-sm text-gray-600">No address provided.</p>`;

	return `
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Bill Payment Voucher - ${voucherData.id}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { 
                font-family: 'Sarabun', 'Arial', sans-serif; 
                margin: 0; 
                padding: 0;
                -webkit-print-color-adjust: exact !important; /* Force print background colors */
                print-color-adjust: exact !important;
            }
            .page-container {
                width: 210mm;
                min-height: 297mm;
                margin: auto;
                background: white;
            }
            @media print {
                body, .page-container {
                    margin: 0;
                    box-shadow: none;
                }
            }
        </style>
    </head>
    <body class="bg-gray-100">
        <div class="page-container p-10 text-sm text-gray-800">

            <div class="mb-6 rounded-lg border bg-white p-6 shadow-sm">
                <div class="flex flex-col justify-between gap-4 border-b pb-4 md:flex-row">
                    
                    <div>
                        ${
													companyData?.logo_path
														? `<img src="http://localhost:5173${companyData.logo_path}" alt="${companyData?.name || 'Company Logo'}" class="mb-2 h-16 max-w-xs object-contain" />`
														: companyData?.name
															? `<h2 class="text-2xl font-bold text-gray-800">${companyData.name}</h2>`
															: ''
												}
                        
                        <div class="mt-2 text-sm text-gray-500 space-y-0.5"> <p>${companyData?.address_line_1 || ''}</p>
                            
                            ${companyData?.address_line_2 ? `<p>${companyData.address_line_2}</p>` : ''}
                            
                            <p>
                                ${companyData?.city || ''} ${companyData?.state_province || ''} ${companyData?.postal_code || ''}
                            </p>
                            
                            <p>${companyData?.country || ''}</p>
                            
                            <p> <span class="font-semibold text-gray-700">Tax ID:</span>
                        	${companyData?.tax_id || '-'}
                    	</p>
                	</div>
            	</div>
                    
                    <div class="text-left md:text-right">
                        
                        <h1 class="text-2xl font-bold text-gray-800 uppercase">ใบสำคัญจ่าย</h1>
                        <p class="text-sm text-gray-500">Bill Payment Voucher</p>
                        
                        <div class="mt-4 space-y-1">
                            <div class="text-sm">
                                <span class="font-semibold text-gray-600">เลขที่ / No.:</span>
                                <span class="font-medium text-gray-800">#${voucherData.id}</span>
                            </div>
                            <div class="text-sm">
                                <span class="font-semibold text-gray-600">วันที่ / Date:</span>
                                <span class="font-medium text-gray-800">${formatDateOnly(voucherData.payment_date)}</span>
                            </div>
                            <div class="text-sm">
                                <span class="font-semibold text-gray-600">อ้างอิง / Ref:</span>
                                <span class="font-medium text-gray-800">${voucherData.payment_reference || '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    
                    <div class="md:col-span-2">
                <h3 ...>ซัพพลายเออร์ (Supplier)</h3>
                <p ...>${voucherData.vendor_name}</p>
                ${addressHtml} 
                
                <p class="text-sm"> <span class="font-semibold text-gray-700">Tax ID:</span>
                    ${voucherData.vendor_tax_id || '-'}
                </p>
            </div>
                    
                    <div class="md:col-span-1">
                        <h3 class="text-sm font-semibold text-gray-500 uppercase">ข้อมูลเพิ่มเติม (More Info)</h3>
                        
                        <p class="mt-1 text-xs text-gray-600"> 
                            <span class="font-semibold">ผู้เตรียม / Prepared By:</span>
                            ${voucherData.prepared_by_user_name || '-'}
                        </p>
                        <p class="mt-1 text-xs text-gray-600"> 
                            <span class="font-semibold">สัญญา / Contract:</span>
                            ${voucherData.vendor_contract_number || '-'}
                        </p>
                    </div>
                </div>
            </div>
            <section class="mb-4">
                <table class="w-full border-collapse border border-gray-400">
                    <thead class="bg-gray-100">
                        <tr class="border-b border-gray-400">
                            <th class="p-2 w-12 text-center">ลำดับ</th>
                            <th class="p-2 text-left">รายการ</th>
                            <th class="p-2 w-20 text-center">จำนวน</th>
                            <th class="p-2 w-16 text-center">หน่วย</th>
                            <th class="p-2 w-28 text-center">ราคา/หน่วย</th> 
                            <th class="p-2 w-32 text-center">จำนวนเงิน</th> 
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                        
                        </tbody>
                    
                    <tfoot>
                        <tr>
                            <td colspan="4" rowspan="6" class="p-4 align-bottom">
                                <span class="font-bold">จำนวนเงินสุทธิ (ตัวอักษร):</span>
                                <span class="border-b border-dashed border-gray-500">
                                    (${netAmountText})
                                </span>
                            </td>
                            <td class="font-bold p-2 text-right border-l border-t border-gray-400">รวมเป็นเงิน</td>
                            <td class="p-2 text-right border-t border-gray-400">${formatNumber(subtotal)}</td>
                        </tr>
                        <tr>
                            <td class="font-bold p-2 text-right border-l border-gray-400">ส่วนลด</td>
                            <td class="p-2 text-right">${formatNumber(discount)}</td>
                        </tr>
                        <tr>
                            <td class="font-bold p-2 text-right border-l border-gray-400">หลังหักส่วนลด</td>
                            <td class="p-2 text-right">${formatNumber(totalAfterDiscount)}</td>
                        </tr>
                        <tr>
                            <td class="font-bold p-2 text-right border-l border-gray-400">ภาษีมูลค่าเพิ่ม (0%)</td>
                            <td class="p-2 text-right">${formatNumber(vat)}</td>
                        </tr>
                        <tr>
                            <td class="font-bold p-2 text-right border-l border-gray-400">หัก ณ ที่จ่าย (${voucherData.withholding_tax_rate ?? 0}%)</td>
                            <td class="p-2 text-right text-red-600">(${formatNumber(wht)})</td>
                        </tr>
                        <tr class="bg-gray-100">
                            <td class="font-bold p-2 text-right border-l border-t border-gray-400">จำนวนเงินสุทธิ</td>
                            <td class="font-bold p-2 text-right border-t border-gray-400">${formatNumber(netAmount)}</td>
                        </tr>
                    </tfoot>
                </table>
            </section>
            
            <section class="border border-gray-400 rounded-lg p-4 mb-4">
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

            <section class="mt-8"> 
                <div class="grid grid-cols-4 gap-8">
                    
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

        </div> </body>
    </html>
    `;
}

// ---
// 4. ฟังก์ชัน POST (แก้ไข Query ให้ครบ)
// ---

export async function POST({ request }) {
	console.log('ได้รับคำสั่ง... เริ่มสร้าง PDF (เวอร์ชัน DB จริง)...');

	// 4.1. ดึง voucherId (เหมือนเดิม)
	let voucherId: string;
	try {
		const body = await request.json();
		voucherId = body.voucherId;
		if (!voucherId) {
			throw new Error('voucherId is missing');
		}
		console.log(`กำลังค้นหาข้อมูลสำหรับ Voucher ID: ${voucherId}`);
	} catch (e) {
		return json(
			{ success: false, message: 'Invalid request body. "voucherId" is required.' },
			{ status: 400 }
		);
	}

	let voucherData: VoucherData;
	let itemsData: ItemData[];
	let companyData: CompanyData | null = null;
	let connection;

	// 4.2. ดึงข้อมูลจาก DB (แก้ไข Query)
	try {
		connection = await db.getConnection();

		// *** แก้ไข Query ของ Voucher (ให้เหมือนพรีวิว) ***
		const [voucherRows] = await connection.execute<VoucherData[]>(
			`
            SELECT 
                bp.id, bp.payment_reference, bp.payment_date, bp.vendor_id,
                bp.notes, bp.status,
                bp.subtotal, bp.discount_amount, bp.total_after_discount,
                bp.withholding_tax_rate, bp.withholding_tax_amount, bp.total_amount,
                v.name AS vendor_name, v.address AS vendor_address, v.tax_id AS vendor_tax_id,
                u.full_name AS prepared_by_user_name,
                vc.contract_number AS vendor_contract_number
            FROM bill_payments bp
            LEFT JOIN vendors v ON bp.vendor_id = v.id
            LEFT JOIN users u ON bp.prepared_by_user_id = u.id
            LEFT JOIN vendor_contracts vc ON bp.vendor_contract_id = vc.id
            WHERE bp.id = ?
            `,
			[voucherId]
		);

		if (voucherRows.length === 0) {
			return json(
				{ success: false, message: `Voucher not found with ID: ${voucherId}` },
				{ status: 404 }
			);
		}
		voucherData = voucherRows[0];
		console.log('ดึงข้อมูลหัวบิล (ชุดใหญ่) สำเร็จ!');

		// *** เพิ่ม: Query ดึงข้อมูลบริษัท ***
		const [companyRows] = await connection.execute<CompanyData[]>(
			'SELECT * FROM company WHERE id = 1 LIMIT 1'
		);
		companyData = companyRows.length ? companyRows[0] : null;
		console.log('ดึงข้อมูล Company สำเร็จ!');

		// *** Query ของ Items (เหมือนเดิม) ***
		const [itemsRows] = await connection.execute<RowDataPacket[]>(
			'SELECT description, quantity, unit_price, line_total FROM bill_payment_items WHERE bill_payment_id = ?',
			[voucherId]
		);
		itemsData = itemsRows as ItemData[];
		console.log(`ดึงข้อมูล Items สำเร็จ! (พบ ${itemsData.length} รายการ)`);
	} catch (dbError: any) {
		console.error('Database Error:', dbError);
		return json({ success: false, message: 'Failed to query database' }, { status: 500 });
	} finally {
		if (connection) {
			connection.release();
		}
	}

	// 4.3. สร้าง PDF (แก้ไข try...catch ให้ครอบคลุม)
	try {
		console.log('กำลังสร้าง HTML content...');
		// *** แก้ไข: ส่ง companyData เข้าไปด้วย ***
		const billHtmlContent = getBillHtml(companyData, voucherData, itemsData);

		console.log('กำลังเปิดเบราว์เซอร์...');
		const browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			headless: true
		});
		const page = await browser.newPage();

		console.log('กำลังใส่ HTML (ข้อมูลจริง) ลงในหน้า...');
		await page.setContent(billHtmlContent, { waitUntil: 'networkidle0' });

		console.log('กำลังพิมพ์เป็น PDF...');
		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true // สำคัญมากสำหรับ Tailwind CSS
		});

		await browser.close();
		console.log('ปิดเบราว์เซอร์');

		console.log('กำลังส่ง PDF buffer กลับไปยังเบราว์เซอร์...');

		const pdfBlob = new Blob([pdfBuffer as any], { type: 'application/pdf' });

		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="voucher-${voucherData.id}.pdf"`
			}
		});
	} catch (error: any) {
		// (Catch block ที่ครอบคลุมทุก Error)
		console.error('เกิดข้อผิดพลาดระหว่างสร้าง PDF (HTML or Puppeteer):', error);
		return json(
			{ success: false, message: 'Failed to generate PDF: ' + error.message },
			{ status: 500 }
		);
	}
}
