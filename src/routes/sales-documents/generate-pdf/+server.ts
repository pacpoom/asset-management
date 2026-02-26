import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

// (ฟังก์ชัน bahttext และ getLogoBase64 คงเดิมจากของเก่า ให้วางต่อกันได้เลย)
// สำหรับความกระชับในไฟล์นี้ ผมจะรวมเฉพาะส่วนที่ปรับปรุงเรื่องหัวเอกสาร

// ... [ใส่ฟังก์ชัน getLogoBase64 และ bahttext ไว้ตรงนี้เหมือนโค้ดเดิม] ...

function getDocumentTitle(type: string): { th: string; en: string } {
    switch (type) {
        case 'QT': return { th: 'ใบเสนอราคา', en: 'QUOTATION' };
        case 'BN': return { th: 'ใบวางบิล', en: 'BILLING NOTE' };
        case 'INV': return { th: 'ใบแจ้งหนี้', en: 'INVOICE' };
        case 'RE': return { th: 'ใบเสร็จรับเงิน', en: 'RECEIPT' };
        default: return { th: 'เอกสาร', en: 'DOCUMENT' };
    }
}

function getInvoiceHtml(companyData: any, docData: any, itemsData: any[], logoBase64: string | null): string {
    const subtotal = Number(docData.subtotal || 0);
    const discount = Number(docData.discount_amount || 0);
    const totalAfterDiscount = Number(docData.total_after_discount || 0);
    const vatRate = Number(docData.vat_rate || 0);
    const vatAmt = Number(docData.vat_amount || 0);
    
    // คำนวณ WHT
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
    const whtRateText = ratesArray.length > 0 ? ratesArray.join('%, ') : '0';
    const whtAmt = calculatedWhtAmt > 0 ? calculatedWhtAmt : Number(docData.wht_amount || 0);
    
    const netAmount = totalAfterDiscount + vatAmt - whtAmt;
    // const netAmountText = bahttext(netAmount); // สมมติว่ามีฟังก์ชันนี้

    const docTitle = getDocumentTitle(docData.document_type);

    const formatNumber = (num: number) => num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatDateOnly = (iso: string) => iso ? new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

    const headerContent = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
            <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="width: 60%; vertical-align: top; padding-bottom: 1rem;">
                    <h2 style="font-size: 1.25rem; font-weight: bold;">${companyData?.name || ''}</h2>
                    <!-- ใส่ Logo และ ที่อยู่ -->
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
                    <!-- แสดงชื่อเอกสารตาม Document Type -->
                    <h1 style="font-size: 1.5rem; font-weight: bold; text-transform: uppercase; margin: 0; color: #1e3a8a;">${docTitle.th}</h1>
                    <p style="font-size: 10pt; color: #666; font-weight: bold;">${docTitle.en}</p>
                    <div style="margin-top: 0.5rem; font-size: 8pt; line-height: 1.5;">
                        <p style="margin:0;"><span style="font-weight: 600;">เลขที่ / No.:</span> ${docData.document_number}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">วันที่ / Date:</span> ${formatDateOnly(docData.document_date)}</p>
                        ${docData.due_date ? `<p style="margin:0; color: #b91c1c;"><span style="font-weight: 600;">ครบกำหนด / Due:</span> ${formatDateOnly(docData.due_date)}</p>` : ''}
                    </div>
                </td>
            </tr>
        </table>
    `;

    // ... (ส่วนการวนลูปรายการสินค้าและตาราง HTML คงเดิม เปลี่ยนแค่ชื่อตัวแปรที่ดึงจาก DB)
    return `<html><body>${headerContent} <h2>[รายการสินค้าอยู่ตรงนี้]</h2> </body></html>`; // แทนที่ด้วย HTML เต็ม
}

export const GET = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return json({ message: 'Missing ID' }, { status: 400 });

	let connection;
	try {
		connection = await db.getConnection();

        // เปลี่ยน query มาดึงจาก sales_documents
		const [rows] = await connection.execute<any[]>(
			`SELECT sd.*, c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id, u.full_name as created_by_name
            FROM sales_documents sd
            LEFT JOIN customers c ON sd.customer_id = c.id
            LEFT JOIN users u ON sd.created_by_user_id = u.id
            WHERE sd.id = ?`,
			[id]
		);

		if (rows.length === 0) return json({ message: 'Document not found' }, { status: 404 });
		const docData = rows[0];

		const [items] = await connection.execute<RowDataPacket[]>(
			`SELECT description, quantity, unit_price, line_total, wht_rate FROM sales_document_items WHERE document_id = ? ORDER BY item_order ASC`,
			[id]
		);

		const [company] = await connection.execute<any[]>('SELECT * FROM company LIMIT 1');
		
		// const html = getInvoiceHtml(company[0], docData, items, null); 
        // สั่งสร้าง PDF ด้วย Puppeteer ตามโค้ดเดิม

		return json({ message: "PDF Generated (Demo logic implemented for new structure)" });
	} catch (err: any) {
		return json({ message: err.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};