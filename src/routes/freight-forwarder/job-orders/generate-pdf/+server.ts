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

interface JobOrderData extends RowDataPacket {
	id: number;
	job_number: string | null;
	job_type: string;
	service_type: string | null;
	job_date: string;
	expire_date: string | null;
	bl_number: string | null;
	liner_name: string | null;
	location: string | null;
	invoice_no: string | null;
	remarks: string | null;
	amount: number;
	currency: string;
	job_status: string;

	customer_name: string | null;
	company_name: string | null;
	customer_address: string | null;
	customer_tax_id: string | null;
	contract_number: string | null;

	vendor_id: number | null;
	vendor_name: string | null;
	vendor_company_name: string | null;
	vendor_address: string | null;
	vendor_tax_id: string | null;
	vendor_contract_number: string | null;

	created_by_name: string | null;
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

function formatJobNumber(type: string, dateStr: string, id: number) {
	if (!type || !dateStr || !id) return `JOB-${id}`;
	const d = new Date(dateStr);
	const yy = String(d.getFullYear()).slice(-2);
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const paddedId = String(id).padStart(4, '0');
	return `${type}${yy}${mm}${paddedId}`;
}

function getJobOrderHtml(
	companyData: CompanyData | null,
	jobData: JobOrderData,
	logoBase64: string | null
): string {
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
		: `<h2 style="font-size: 1.25rem; font-weight: bold;">${companyData?.name || ''}</h2>`;

	const displayJobNumber =
		jobData.job_number || formatJobNumber(jobData.job_type, jobData.job_date, jobData.id);

	// ข้อมูลลูกค้า
	const customerCompanyName = jobData.company_name || jobData.customer_name || 'ไม่ระบุลูกค้า';
	const customerContactName = jobData.customer_name;
	const customerAddress = jobData.customer_address;
	const customerTaxId = jobData.customer_tax_id;
	const customerContract = jobData.contract_number;

	// ข้อมูลผู้จำหน่าย (ถ้ามี)
	const hasVendor = !!jobData.vendor_id;
	const vendorCompanyName = jobData.vendor_company_name || jobData.vendor_name || '-';
	const vendorContactName = jobData.vendor_name;
	const vendorAddress = jobData.vendor_address;
	const vendorTaxId = jobData.vendor_tax_id;
	const vendorContract = jobData.vendor_contract_number;

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
                    <h1 style="font-size: 1.5rem; font-weight: bold; text-transform: uppercase; margin: 0; color: #1e3a8a;">ใบสั่งงานขนส่ง</h1>
                    <p style="font-size: 10pt; color: #666; font-weight: bold;">JOB ORDER</p>
                    <div style="margin-top: 0.5rem; font-size: 8pt; line-height: 1.5;">
                        <p style="margin:0;"><span style="font-weight: 600;">Job No.:</span> ${displayJobNumber}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">Job Date:</span> ${formatDateOnly(jobData.job_date)}</p>
                        ${jobData.expire_date ? `<p style="margin:0;"><span style="font-weight: 600;">Expire Date:</span> ${formatDateOnly(jobData.expire_date)}</p>` : ''}
                        <p style="margin:0;"><span style="font-weight: 600;">Status:</span> <span style="font-weight:bold;">${jobData.job_status}</span></p>
                    </div>
                </td>
            </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
            <tr>
                <td style="width: 60%; vertical-align: top;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0; color: #1d4ed8;">ลูกค้า (Customer)</h3>
                    <p style="font-weight: bold; margin: 0 0 4px 0; font-size: 10pt;">${customerCompanyName}</p>
                    ${customerCompanyName && customerContactName && customerCompanyName !== customerContactName ? `<p style="margin: 0 0 4px 0; font-size: 8pt;">Contact: ${customerContactName}</p>` : ''}
                    <div style="font-size: 8pt; line-height: 1.4;">
                        <p style="margin:0;">${customerAddress || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">Tax ID:</span> ${customerTaxId || '-'}</p>
                    ${customerContract ? `<p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">Contract:</span> ${customerContract}</p>` : ''}
                </td>
                
                <td style="width: 40%; vertical-align: top; text-align: right;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0; color: #6B7280;">ผู้เปิดงาน (Prepared By)</h3>
                    <p style="font-size: 8pt;">${jobData.created_by_name || '-'}</p>
                </td>
            </tr>
        </table>
        
        ${
					hasVendor
						? `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt;">
            <tr>
                <td style="width: 100%; vertical-align: top; border-top: 1px solid #dee2e6; padding-top: 1rem;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0; color: #1d4ed8;">ผู้จำหน่าย (Vendor)</h3>
                    <p style="font-weight: bold; margin: 0 0 4px 0; font-size: 10pt; color: #374151;">${vendorCompanyName}</p>
                    ${vendorCompanyName && vendorContactName && vendorCompanyName !== vendorContactName ? `<p style="margin: 0 0 4px 0; font-size: 8pt;">Contact: ${vendorContactName}</p>` : ''}
                    <div style="font-size: 8pt; line-height: 1.4; color: #4b5563;">
                        <p style="margin:0;">${vendorAddress || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0; color: #4b5563;"><span style="font-weight: 600;">Tax ID:</span> ${vendorTaxId || '-'}</p>
                    ${vendorContract ? `<p style="font-size: 8pt; margin:4px 0 0 0; color: #4b5563;"><span style="font-weight: 600;">Contract:</span> ${vendorContract}</p>` : ''}
                </td>
            </tr>
        </table>
        `
						: ''
				}
    `;

	const jobDetailsHtml = `
        <div>
            <h3 style="font-size: 9pt; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase;">Shipment Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; width: 25%; background-color: #f9fafb; font-weight: 600;">Job Type</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; width: 25%;">${jobData.job_type || '-'}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; width: 25%; background-color: #f9fafb; font-weight: 600;">Service Type</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; width: 25%;">${jobData.service_type || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">B/L Number</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #1d4ed8;">${jobData.bl_number || '-'}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Liner / Carrier</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${jobData.liner_name || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Port / Location</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${jobData.location || '-'}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Ref Document</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${jobData.invoice_no || '-'}</td>
                </tr>
            </table>
        </div>
        
        <div style="margin-top: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
                <tr>
                    <td style="padding: 12px; border: 1px solid #bfdbfe; background-color: #eff6ff; width: 70%; font-weight: bold; color: #1e40af; text-transform: uppercase;">
                        Financial Overview (ยอดเงินเบื้องต้น)
                    </td>
                    <td style="padding: 12px; border: 1px solid #bfdbfe; background-color: #eff6ff; text-align: right; font-size: 14pt; font-weight: bold; color: #1e3a8a;">
                        ${Number(jobData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style="font-size: 10pt;">${jobData.currency || 'THB'}</span>
                    </td>
                </tr>
            </table>
        </div>

        <div style="margin-top: 20px;">
            <h3 style="font-size: 9pt; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase;">Remarks (หมายเหตุ)</h3>
            <div style="padding: 12px; border: 1px solid #e5e7eb; min-height: 80px; background-color: #fff;">
                <p style="white-space: pre-wrap; margin: 0; color: #4b5563;">${jobData.remarks || '-'}</p>
            </div>
        </div>
    `;

	const signatureBlock = `
        <div style="display: flex; justify-content: space-between; position: absolute; bottom: 60px; left: 40px; right: 40px; font-size: 8pt;">
            <div style="text-align: center; width: 30%;">
                <div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
                <p style="margin-top: 5px;">ผู้เปิดใบงาน (Prepared by)</p>
                <p>วันที่ ...../...../.....</p>
            </div>
            <div style="text-align: center; width: 30%;">
                <div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
                <p style="margin-top: 5px;">ผู้อนุมัติ (Approved By)</p>
                <p>วันที่ ...../...../.....</p>
            </div>
        </div>
    `;

	return `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
                body { font-family: 'Sarabun', sans-serif; font-size: 9pt; color: #333; background: #fff !important; margin: 0; padding: 0; }
                .document-page { padding: 40px; box-sizing: border-box; position: relative; height: 297mm; }
                @media print { @page { size: A4; margin: 0; } body { -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="document-page">
                ${headerContent}
                ${jobDetailsHtml}
                ${signatureBlock}
            </div>
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

		const [rows] = await connection.execute<JobOrderData[]>(
			`
            SELECT j.*, 
                   c.name as customer_name, c.company_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   con.contract_number,
                   v.name as vendor_name, v.company_name as vendor_company_name, v.address as vendor_address, v.tax_id as vendor_tax_id,
                   vc.contract_number as vendor_contract_number,
                   u.full_name as created_by_name
            FROM job_orders j
            LEFT JOIN customers c ON j.customer_id = c.id
            LEFT JOIN contracts con ON j.contract_id = con.id
            LEFT JOIN vendors v ON j.vendor_id = v.id
            LEFT JOIN vendor_contracts vc ON j.vendor_contract_id = vc.id
            LEFT JOIN users u ON j.created_by = u.id
            WHERE j.id = ?
        `,
			[id]
		);

		if (rows.length === 0) return json({ message: 'Job Order not found' }, { status: 404 });
		const jobData = rows[0];

		const [company] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
		const companyData = company[0] || null;
		const logoBase64 = getLogoBase64(companyData?.logo_path);

		const html = getJobOrderHtml(companyData, jobData, logoBase64);

		const browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			headless: true
		});
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'networkidle0' });
		const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
		await browser.close();

		const displayJobNumber =
			jobData.job_number || formatJobNumber(jobData.job_type, jobData.job_date, jobData.id);

		const pdfBlob = new Blob([pdfBuffer as any], { type: 'application/pdf' });
		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="JOB-${displayJobNumber}.pdf"`
			}
		});
	} catch (err: any) {
		console.error('PDF Error:', err);
		return json({ message: err.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
