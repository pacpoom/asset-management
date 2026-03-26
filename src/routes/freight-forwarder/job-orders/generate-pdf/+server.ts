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
	mbl: string | null;
	liner_name: string | null;
	location: string | null;
	invoice_no: string | null;
	ccl: string | null;
	etd: string | null;
	eta: string | null;
	quantity: number | null;
	weight: number | null;
	kgs_volume: number | null;
	remarks: string | null;
	amount: number;
	currency: string;
	job_status: string;
    
    booking_no: string | null;
	vessel: string | null;
	feeder: string | null;
	port_of_loading: string | null;
	port_of_discharge: string | null;

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
    unit_name: string | null;
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
		} catch {
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
	logoBase64: string | null,
	locale: string = 'en'
): string {
	// คำแปลภาษา
	const dict = {
		en: {
			title: 'JOB ORDER',
			jobNo: 'Job No.:',
			jobDate: 'Job Date:',
			expireDate: 'Expire Date:',
			status: 'Status:',
			customer: 'Customer',
			contact: 'Contact:',
			taxId: 'Tax ID:',
			contract: 'Contract:',
			preparedBy: 'Prepared By',
			vendor: 'Vendor',
			shipmentDetails: 'Shipment Details',
			jobType: 'Job Type',
			serviceType: 'Service Type',
			hbl: 'HBL Number',
			mbl: 'MB/L',
			liner: 'Liner / Carrier',
			location: 'Port / Location',
			etd: 'ETD',
			eta: 'ETA',
			refDoc: 'Ref Document',
			ccl: 'CCL',
			quantity: 'Quantity',
			weightVol: 'Weight / KGS. Vol',
			financial: 'Financial Overview',
			remarks: 'Remarks',
			approvedBy: 'Approved By',
			dateLabel: 'Date'
		},
		th: {
			title: 'ใบสั่งงานขนส่ง (JOB ORDER)',
			jobNo: 'เลขที่ใบงาน:',
			jobDate: 'วันที่รับงาน:',
			expireDate: 'วันหมดอายุ:',
			status: 'สถานะ:',
			customer: 'ลูกค้า (Customer)',
			contact: 'ผู้ติดต่อ:',
			taxId: 'เลขประจำตัวผู้เสียภาษี:',
			contract: 'สัญญา:',
			preparedBy: 'ผู้เปิดงาน (Prepared By)',
			vendor: 'ผู้จำหน่าย (Vendor)',
			shipmentDetails: 'รายละเอียดการขนส่ง (Shipment Details)',
			jobType: 'ประเภทงาน',
			serviceType: 'ประเภทบริการ',
			hbl: 'หมายเลข HBL',
			mbl: 'หมายเลข MB/L',
			liner: 'สายเรือ / ผู้ขนส่ง',
			location: 'ท่าเรือ / สถานที่',
			etd: 'ETD',
			eta: 'ETA',
			refDoc: 'เอกสารอ้างอิง',
			ccl: 'CCL',
			quantity: 'จำนวน',
			weightVol: 'น้ำหนัก / ปริมาตร',
			financial: 'ยอดเงินเบื้องต้น (Financial Overview)',
			remarks: 'หมายเหตุ (Remarks)',
			approvedBy: 'ผู้อนุมัติ (Approved By)',
			dateLabel: 'วันที่'
		}
	};

	const t = (key: keyof typeof dict.en) => dict[locale as keyof typeof dict]?.[key] || dict.en[key];

	const formatDateOnly = (isoString: string | null | undefined) => {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
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
	const customerCompanyName = jobData.company_name || jobData.customer_name || '-';
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
                    <h1 style="font-size: 1.5rem; font-weight: bold; text-transform: uppercase; margin: 0; color: #1e3a8a;">${t('title')}</h1>
                    <div style="margin-top: 0.5rem; font-size: 8pt; line-height: 1.5;">
                        <p style="margin:0;"><span style="font-weight: 600;">${t('jobNo')}</span> ${displayJobNumber}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">${t('jobDate')}</span> ${formatDateOnly(jobData.job_date)}</p>
                        ${jobData.expire_date ? `<p style="margin:0;"><span style="font-weight: 600;">${t('expireDate')}</span> ${formatDateOnly(jobData.expire_date)}</p>` : ''}
                        <p style="margin:0;"><span style="font-weight: 600;">${t('status')}</span> <span style="font-weight:bold;">${jobData.job_status}</span></p>
                    </div>
                </td>
            </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
            <tr>
                <td style="width: 60%; vertical-align: top;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0; color: #1d4ed8;">${t('customer')}</h3>
                    <p style="font-weight: bold; margin: 0 0 4px 0; font-size: 10pt;">${customerCompanyName}</p>
                    ${customerCompanyName && customerContactName && customerCompanyName !== customerContactName ? `<p style="margin: 0 0 4px 0; font-size: 8pt;">${t('contact')} ${customerContactName}</p>` : ''}
                    <div style="font-size: 8pt; line-height: 1.4;">
                        <p style="margin:0;">${customerAddress || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">${t('taxId')}</span> ${customerTaxId || '-'}</p>
                    ${customerContract ? `<p style="font-size: 8pt; margin:4px 0 0 0;"><span style="font-weight: 600;">${t('contract')}</span> ${customerContract}</p>` : ''}
                </td>
                
                <td style="width: 40%; vertical-align: top; text-align: right;">
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0; color: #6B7280;">${t('preparedBy')}</h3>
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
                    <h3 style="font-weight: 600; text-transform: uppercase; font-size: 8pt; margin: 0 0 4px 0; color: #1d4ed8;">${t('vendor')}</h3>
                    <p style="font-weight: bold; margin: 0 0 4px 0; font-size: 10pt; color: #374151;">${vendorCompanyName}</p>
                    ${vendorCompanyName && vendorContactName && vendorCompanyName !== vendorContactName ? `<p style="margin: 0 0 4px 0; font-size: 8pt;">${t('contact')} ${vendorContactName}</p>` : ''}
                    <div style="font-size: 8pt; line-height: 1.4; color: #4b5563;">
                        <p style="margin:0;">${vendorAddress || '-'}</p>
                    </div>
                    <p style="font-size: 8pt; margin:4px 0 0 0; color: #4b5563;"><span style="font-weight: 600;">${t('taxId')}</span> ${vendorTaxId || '-'}</p>
                    ${vendorContract ? `<p style="font-size: 8pt; margin:4px 0 0 0; color: #4b5563;"><span style="font-weight: 600;">${t('contract')}</span> ${vendorContract}</p>` : ''}
                </td>
            </tr>
        </table>
        `
						: ''
				}
    `;

	const jobDetailsHtml = `
        <div>
            <h3 style="font-size: 9pt; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase;">${t('shipmentDetails')}</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; width: 25%; background-color: #f9fafb; font-weight: 600;">${t('jobType')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; width: 25%;">${jobData.job_type || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; width: 25%; background-color: #f9fafb; font-weight: 600;">${t('serviceType')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; width: 25%;">${jobData.service_type || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('hbl')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; color: #1d4ed8;">${jobData.bl_number || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('mbl')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.mbl || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Booking No.</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">${jobData.booking_no || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('liner')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.liner_name || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Vessel</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.vessel || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Feeder</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.feeder || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Port of Loading</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.port_of_loading || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">Port of Discharge</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.port_of_discharge || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('etd')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${formatDateOnly(jobData.etd)}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('eta')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${formatDateOnly(jobData.eta)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('refDoc')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.invoice_no || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('ccl')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.ccl || '-'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('quantity')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.quantity || 0} ${jobData.unit_name || ''}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: 600;">${t('weightVol')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${jobData.weight || '0.00'} / ${jobData.kgs_volume || '0.00'}</td>
                </tr>
            </table>
        </div>
        
        <div style="margin-top: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
                <tr>
                    <td style="padding: 12px; border: 1px solid #bfdbfe; background-color: #eff6ff; width: 70%; font-weight: bold; color: #1e40af; text-transform: uppercase;">
                        ${t('financial')}
                    </td>
                    <td style="padding: 12px; border: 1px solid #bfdbfe; background-color: #eff6ff; text-align: right; font-size: 14pt; font-weight: bold; color: #1e3a8a;">
                        ${Number(jobData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style="font-size: 10pt;">${jobData.currency || 'THB'}</span>
                    </td>
                </tr>
            </table>
        </div>

        <div style="margin-top: 20px;">
            <h3 style="font-size: 9pt; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase;">${t('remarks')}</h3>
            <div style="padding: 12px; border: 1px solid #e5e7eb; min-height: 80px; background-color: #fff;">
                <p style="white-space: pre-wrap; margin: 0; color: #4b5563;">${jobData.remarks || '-'}</p>
            </div>
        </div>
    `;

	const signatureBlock = `
        <div style="display: flex; justify-content: space-between; position: absolute; bottom: 60px; left: 40px; right: 40px; font-size: 8pt;">
            <div style="text-align: center; width: 30%;">
                <div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
                <p style="margin-top: 5px;">${t('preparedBy')}</p>
                <p>${t('dateLabel')} ...../...../.....</p>
            </div>
            <div style="text-align: center; width: 30%;">
                <div style="border-bottom: 1px dotted #ccc; height: 30px;"></div>
                <p style="margin-top: 5px;">${t('approvedBy')}</p>
                <p>${t('dateLabel')} ...../...../.....</p>
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
	const locale = url.searchParams.get('locale') || 'en'; // รับค่า locale เพื่อแปลภาษา

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
                   u.full_name as created_by_name,
                   un.name as unit_name
            FROM job_orders j
            LEFT JOIN customers c ON j.customer_id = c.id
            LEFT JOIN contracts con ON j.contract_id = con.id
            LEFT JOIN vendors v ON j.vendor_id = v.id
            LEFT JOIN vendor_contracts vc ON j.vendor_contract_id = vc.id
            LEFT JOIN users u ON j.created_by = u.id
            LEFT JOIN units un ON j.unit_id = un.id
            WHERE j.id = ?
        `,
			[id]
		);

		if (rows.length === 0) return json({ message: 'Job Order not found' }, { status: 404 });
		const jobData = rows[0];

		const [company] = await connection.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
		const companyData = company[0] || null;
		const logoBase64 = getLogoBase64(companyData?.logo_path);

		const html = getJobOrderHtml(companyData, jobData, logoBase64, locale);

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

		const pdfBlob = new Blob([pdfBuffer as BlobPart], { type: 'application/pdf' });
		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="JOB-${displayJobNumber}.pdf"`
			}
		});
	} catch (err: unknown) {
		console.error('PDF Error:', err);
		return json({ message: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};