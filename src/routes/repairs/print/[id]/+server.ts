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

interface RepairData extends RowDataPacket {
	id: number;
	ticket_code: string;
	created_at: string;
	repair_status: string;
	issue_description: string;
	admin_notes: string | null;

	asset_tag: string;
	asset_name: string;
	location_name: string | null;

	reporter_name: string;
	contact_info: string | null;
}

function getLogoBase64(logoPath: string | null | undefined): string | null {
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

function getRepairHtml(
	companyData: CompanyData | null,
	repairData: RepairData,
	logoBase64: string | null
): string {
	const formatDateOnly = (isoString: string | null | undefined): string => {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString('th-TH', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '-';
		}
	};

	const getStatusLabel = (status: string) => {
		const map: Record<string, string> = {
			Pending: 'รอดำเนินการ',
			'In Progress': 'กำลังซ่อม',
			Completed: 'เสร็จสิ้น',
			Cancelled: 'ยกเลิก'
		};
		return map[status] || status;
	};

	const logoHtml = logoBase64
		? `<img src="${logoBase64}" alt="Logo" style="max-height: 50px; margin-bottom: 5px;" />`
		: `<h2 style="font-size: 18px; font-weight: bold;">${companyData?.name || 'Company Name'}</h2>`;

	const headerContent = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9pt;">
            <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="width: 60%; vertical-align: top; padding-bottom: 1rem;">
                    ${logoHtml}
                    <div style="font-size: 10px; color: #555; line-height: 1.4;">
                    ${companyData?.address_line_1 || ''}
                    ${companyData?.address_line_2 ? `<br>${companyData.address_line_2}` : ''}
                    <br>${companyData?.city || ''} ${companyData?.postal_code || ''}
                    <br><span style="font-weight: bold;">Tax ID:</span> ${companyData?.tax_id || '-'}
                </div>
                </td>
                <td style="width: 40%; vertical-align: top; text-align: right; padding-bottom: 1rem;">
                    <div style="font-size: 20px; font-weight: bold; text-transform: uppercase;">ใบแจ้งซ่อม</div>
                    <div style="font-size: 12px; font-weight: bold; color: #777;">REPAIR REQUEST</div>
                    <div style="margin-top: 10px; font-size: 10px;">
                        <strong>เลขที่ Ticket:</strong> #${repairData.ticket_code}<br>
                        <strong>วันที่แจ้ง:</strong> ${formatDateOnly(repairData.created_at)}<br>
                        <strong>สถานะ:</strong> ${getStatusLabel(repairData.repair_status)}
                    </div>
                </td>
            </tr>

            <tr>
                <td style="padding-top: 1rem; vertical-align: top; padding-right: 20px;">
                    <div style="font-weight: bold; font-size: 9pt; color: #4b5563; text-transform: uppercase; margin-bottom: 4px;">
                        ข้อมูลทรัพย์สิน (Asset Information)
                    </div>
                    <div style="font-size: 9pt; color: #374151; line-height: 1.6;">
                        <p style="margin:0;"><span style="font-weight: 600;">ชื่ออุปกรณ์:</span> ${repairData.asset_name}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">รหัสทรัพย์สิน (Asset Tag):</span> ${repairData.asset_tag}</p>
                        <p style="margin:0;"><span style="font-weight: 600;">สถานที่ตั้ง (Location):</span> ${repairData.location_name || '-'}</p>
                    </div>
                </td>
                <td style="padding-top: 1rem; vertical-align: top; padding-left: 20px;">
                    <div style="font-weight: bold; font-size: 9pt; color: #4b5563; text-transform: uppercase; margin-bottom: 4px;">
                        ผู้แจ้งซ่อม (Reporter Information)
                    </div>
                    <div style="font-size: 9pt; color: #374151; line-height: 1.6;">
                        <p style="margin:0;"><span style="font-weight: 600;">ชื่อ-นามสกุล:</span> ${repairData.reporter_name}</p>
                         <p style="margin:0;"><span style="font-weight: 600;">เบอร์ติดต่อ:</span> ${repairData.contact_info || '-'}</p>
                    </div>
                </td>
            </tr>
        </table>
    `;

	const contentHtml = `
        <div style="flex-grow: 1;">
            
            <div style="border-bottom: 1px solid #d1d5db; margin-top: 10px; margin-bottom: 100px; width: 100%;"></div>

            <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                <thead>
                    <tr style="background-color: #f9fafb;">
                        <th style="width: 60px; text-align: center; padding: 10px; font-weight: bold; border: 1px solid #000;">ลำดับ</th>
                        <th style="text-align: left; padding: 10px; font-weight: bold; border: 1px solid #000;">รายละเอียดอาการเสีย / การดำเนินการ</th>
                        <th style="width: 130px; text-align: center; padding: 10px; font-weight: bold; border: 1px solid #000;">หมายเหตุ</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="text-align: center; vertical-align: top; padding: 10px; border: 1px solid #000;">1</td>
                        <td style="vertical-align: top; padding: 10px; border: 1px solid #000;">
                            <span style="font-weight: bold; text-decoration: underline;">อาการที่แจ้ง (Issue Reported):</span><br/>
                            <div style="margin-top: 5px; white-space: pre-wrap; line-height: 1.6;">${repairData.issue_description}</div>
                        </td>
                        <td style="text-align: center; vertical-align: top; padding: 10px; border: 1px solid #000;">-</td>
                    </tr>
                    
                     ${
												repairData.admin_notes
													? `
                            <tr>
                                <td style="text-align: center; vertical-align: top; padding: 10px; border: 1px solid #000;">2</td>
                                <td style="vertical-align: top; padding: 10px; border: 1px solid #000;">
                                    <span style="font-weight: bold; text-decoration: underline; color: #047857;">บันทึกจากเจ้าหน้าที่ (Technician Notes):</span><br/>
                                    <div style="margin-top: 5px; white-space: pre-wrap; line-height: 1.6;">${repairData.admin_notes}</div>
                                </td>
                                <td style="text-align: center; vertical-align: top; padding: 10px; border: 1px solid #000;">
                                    <span style="padding: 2px 6px; border-radius: 4px; background-color: #f3f4f6; font-size: 8pt;">Updated</span>
                                </td>
                            </tr>
                            `
													: `
                             <tr style="height: 150px;">
                                <td style="text-align: center; vertical-align: middle; padding: 10px; border: 1px solid #000;">2</td>
                                <td style="vertical-align: middle; padding: 10px; border: 1px solid #000; color: #9ca3af; font-style: italic;">
                                    (พื้นที่สำหรับบันทึกผลการซ่อม / รายการอะไหล่ที่ใช้)
                                </td>
                                <td style="text-align: center; vertical-align: middle; padding: 10px; border: 1px solid #000;"></td>
                            </tr>
                            `
											}
                </tbody>
            </table>
        </div>
    `;

	const signatureBlock = `
        <div style="margin-top: 40px; page-break-inside: avoid;"> 
            <section style="border-top: 1px dotted #ccc; padding-top: 20px;"> 
                <div style="display: flex; justify-content: space-between; font-size: 10pt;"> 
                    <div style="text-align: center; width: 30%;">
                        <div style="height: 50px;"></div>
                        <p style="border-bottom: 1px dotted #999; padding-bottom: 5px; margin-bottom: 5px;">( ${repairData.reporter_name} )</p>
                        <p style="font-weight: bold; margin: 0;">ผู้แจ้งซ่อม (Reporter)</p>
                        <p style="color: #666; margin: 0; font-size: 9pt;">วันที่: ${formatDateOnly(repairData.created_at)}</p>
                    </div>
                    <div style="text-align: center; width: 30%;">
                         <div style="height: 50px;"></div>
                        <p style="border-bottom: 1px dotted #999; padding-bottom: 5px; margin-bottom: 5px;">(..............................)</p>
                        <p style="font-weight: bold; margin: 0;">ช่างผู้รับผิดชอบ (Technician)</p>
                        <p style="color: #666; margin: 0; font-size: 9pt;">วันที่: ......../......../........</p>
                    </div>
                    <div style="text-align: center; width: 30%;">
                         <div style="height: 50px;"></div>
                        <p style="border-bottom: 1px dotted #999; padding-bottom: 5px; margin-bottom: 5px;">(..............................)</p>
                        <p style="font-weight: bold; margin: 0;">ผู้อนุมัติ (Approved By)</p>
                        <p style="color: #666; margin: 0; font-size: 9pt;">วันที่: ......../......../........</p>
                    </div>
                </div>
            </section>
        </div>
    `;

	return `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <title>Repair Request - ${repairData.ticket_code}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Sarabun', sans-serif; margin: 0; padding: 0;
            background-color: #f3f4f6; color: #333;
        }
        .page-container {
            width: 210mm; min-height: 297mm; margin: 20px auto;
            background: white; padding: 40px;
            box-sizing: border-box; box-shadow: 0 0 10px rgba(0,0,0,0.1);
            display: flex; flex-direction: column; justify-content: space-between;
        }
        @media print {
            body { background: none; margin: 0; }
            @page { size: A4; margin: 0; }
            .page-container {
                width: 100%; margin: 0; box-shadow: none; border: none;
                min-height: 297mm; padding: 40px; page-break-after: always;
            }
        }
    </style>
    </head>
    <body>
        <div class="page-container">
            <div>
                ${headerContent}
                ${contentHtml}
            </div>
            ${signatureBlock}
        </div> 
    </body>
    </html>
    `;
}

export const GET: RequestHandler = async ({ params }) => {
	const repairId = params.id;

	if (!repairId) {
		return json({ success: false, message: 'Missing repair ID' }, { status: 400 });
	}

	let connection;
	try {
		connection = await db.getConnection();

		const [rows] = await connection.execute<RepairData[]>(
			`
            SELECT 
                ar.id, ar.ticket_code, ar.created_at, ar.repair_status, 
                ar.issue_description, ar.admin_notes,
                ar.reporter_name, ar.contact_info,
                a.asset_tag, a.name AS asset_name,
                l.name AS location_name
            FROM asset_repairs ar
            LEFT JOIN assets a ON ar.asset_id = a.id
            LEFT JOIN asset_locations l ON a.location_id = l.id
            WHERE ar.id = ?
            `,
			[repairId]
		);

		if (rows.length === 0) {
			return json({ success: false, message: 'Repair ticket not found' }, { status: 404 });
		}
		const repairData = rows[0];

		const [companyRows] = await connection.execute<CompanyData[]>(
			'SELECT * FROM company WHERE id = 1 LIMIT 1'
		);
		const companyData = companyRows.length ? companyRows[0] : null;

		const logoBase64 = getLogoBase64(companyData?.logo_path);

		const htmlContent = getRepairHtml(companyData, repairData, logoBase64);

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
				'Content-Disposition': `inline; filename="repair-${repairData.ticket_code}.pdf"`
			}
		});
	} catch (error: any) {
		console.error('PDF Generation Error:', error);
		return json({ success: false, message: error.message }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
