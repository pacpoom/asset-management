import { json } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import db from '$lib/server/database';

function getLogoBase64(logoPath: string | null): string | null {
	if (!logoPath) return null;

	if (logoPath.startsWith('data:image')) return logoPath;

	const tryPaths = [
		path.resolve(process.cwd(), logoPath.startsWith('/') ? logoPath.slice(1) : logoPath),
		path.resolve(process.cwd(), 'static', logoPath.startsWith('/') ? logoPath.slice(1) : logoPath),
		path.resolve(process.cwd(), 'uploads/company/Logo.png'),
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

export const GET = async ({ url }) => {
	const id = url.searchParams.get('id');

	if (!id) return json({ message: 'Missing ID' }, { status: 400 });

	let connection;
	try {
		connection = await db.getConnection();

		const [reqRows]: any = await connection.execute(
			`SELECT * FROM manpower_requests WHERE id = ?`,
			[id]
		);
		if (reqRows.length === 0) return json({ message: 'Request not found' }, { status: 404 });
		const req = reqRows[0];

		let logoBase64 = null;
		try {
			const [compRows]: any = await connection.execute('SELECT logo_path FROM company LIMIT 1');
			if (compRows.length > 0 && compRows[0].logo_path) {
				logoBase64 = getLogoBase64(compRows[0].logo_path);
			}
		} catch (e) {
			console.log('No company settings found.', e);
		}

		const cb = (isChecked: boolean) =>
			isChecked ? '<span class="checked-box">☑</span>' : '<span class="check-box">☐</span>';

		const formatDate = (dateStr: string) => {
			if (!dateStr) return '&nbsp;';
			return new Date(dateStr).toLocaleDateString('en-GB', {
				day: '2-digit',
				month: 'short',
				year: 'numeric'
			});
		};

		const logoHtml = logoBase64
			? `<img src="${logoBase64}" style="max-height: 80px; max-width: 100%; object-fit: contain;" />`
			: ``;

		const html = `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
                * {
                    font-size: 10px !important; 
                }
                body { 
                    font-family: 'Sarabun', sans-serif; 
                    color: #000; 
                    background: #fff; 
                    margin: 0; 
                    padding: 0; 
                    line-height: 1.4; 
                }
                table { width: 100%; border-collapse: collapse; }
                td, th { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
                .header-text { text-align: center; font-weight: bold; }
                
                .title-th { margin: 0; font-weight: bold; } 
                .title-en { margin: 0; font-weight: normal; } 
                
                .label { font-weight: bold; text-transform: uppercase; color: #111; display: block; } 
                .val { font-weight: normal; color: #000; display: block; margin-top: 2px; } 
                .section-head { background-color: #e5e7eb; font-weight: bold; text-transform: uppercase; padding: 6px 8px; } 
                
                .check-box { font-family: sans-serif; } 
                .checked-box { font-weight: bold; } 
                
                .inner-table { width: 100%; border-collapse: collapse; }
                .inner-table td { border: none; padding: 4px; vertical-align: middle; }
                
                .signature-box { text-align: center; padding: 25px 5px 10px 5px; height: 120px; } 
                .sig-line { border-bottom: 1px dotted #000; display: inline-block; width: 150px; margin-bottom: 6px; } 
                .nowrap { white-space: nowrap; }
                .dotted-line { border-bottom: 1px dotted #000 !important; width: 100%; } 
            </style>
        </head>
        <body>
            <table style="height: 80px;">
                <tr>
                    <td style="width: 25%; text-align: center; vertical-align: middle;">
                        ${logoHtml}
                    </td>
                    <td style="width: 50%; vertical-align: middle;" class="header-text">
                        <div class="title-th">ใบขออัตรากำลังสำหรับพนักงานรับเหมาแรงงาน</div>
                        <div class="title-en">Outsource Requisition Form</div>
                    </td>
                    <td style="width: 25%; vertical-align: middle; text-align: center;">
                        <span class="label" style="text-align: center; display: block;">Req.No./เลขที่ใบขอ</span>
                        <span class="val" style="font-weight: bold; text-align: center; margin-top: 6px;">${req.request_no}</span>
                    </td>
                </tr>
            </table>

            <table style="border-top: none;">
                <tr>
                    <td style="width: 33.33%; border-top: none;"><span class="label">DEPARTMENT / ฝ่าย</span><span class="val">${req.department || '&nbsp;'}</span></td>
                    <td style="width: 33.33%; border-top: none;"><span class="label">Division / สังกัด</span><span class="val">${req.division || '&nbsp;'}</span></td>
                    <td style="width: 33.33%; border-top: none;"><span class="label">SECTION / แผนก</span><span class="val">${req.section}</span></td>
                </tr>
                <tr>
                    <td><span class="label">Group / กลุ่มงาน</span><span class="val">${req.emp_group || '&nbsp;'}</span></td>
                    <td><span class="label">POSITION / ตำแหน่ง</span><span class="val">${req.position_name}</span></td>
                    <td><span class="label">Report to / รายงานตรงกับ</span><span class="val">${req.report_to || '&nbsp;'}</span></td>
                </tr>
                <tr>
                    <td style="padding: 10px 8px;"><span class="label">NUMBER REQUIRED / จำนวนที่ต้องการ</span><span class="val" style="text-align:center; font-weight:bold;">${req.request_qty} Person(s)</span></td>
                    <td colspan="2" style="padding: 10px 8px;"><span class="label">DATE REQUIRED / เริ่มงานวันที่</span><span class="val" style="text-align:center; font-weight:bold;">${formatDate(req.target_date)}</span></td>
                </tr>
            </table>

            <table style="border-top: none;">
                <tr><td colspan="3" class="section-head" style="border-top: none;">TYPE OF POSITION / ประเภทอัตราตำแหน่ง</td></tr>
                <tr>
                    <td style="width: 25%; border-bottom: none; padding: 8px;" class="nowrap">${cb(req.position_type === 'Permanent')} Permanent / ประจำ</td>
                    <td style="width: 25%; border-bottom: none; padding: 8px;" class="nowrap">${cb(req.wage_type === 'Monthly')} Monthly / รายเดือน</td>
                    <td style="width: 50%; border-bottom: none; color: #555; padding: 8px;" class="nowrap">กรณีเป็นตำแหน่งอัตราชั่วคราวโปรดระบุระยะเวลา<br>(If temporary position, please specify period)</td>
                </tr>
                <tr>
                    <td style="border-top: none; padding: 8px;" class="nowrap">${cb(req.position_type === 'Temporary')} Temporary / ชั่วคราว</td>
                    <td style="border-top: none; padding: 8px;" class="nowrap">${cb(req.wage_type === 'Daily')} Daily / รายวัน</td>
                    <td style="border-top: none; text-align: center; padding: 8px;" class="dotted-line">${req.position_period || '&nbsp;'}</td>
                </tr>
            </table>

            <table style="border-top: none;">
                <tr><td class="section-head" style="border-top: none;">NATURE OF REQUIREMENT / เสนอเพื่อขอ</td></tr>
                <tr>
                    <td style="padding: 10px 15px;">
                        <table class="inner-table">
                            <tr>
                                <td style="width: 40%;" class="nowrap">${cb(req.budget_status === 'In budget')} In budget / มีในงบประมาณ</td>
                                <td style="width: 60%;" class="nowrap">${cb(req.budget_status === 'Not in budget')} Not in budget / ไม่มีในงบประมาณที่ตั้งไว้</td>
                            </tr>
                            <tr><td colspan="2" style="padding-top: 12px;" class="nowrap">${cb(req.req_nature === 'Replacement')} Replacement / ทดแทนตำแหน่งเดิม</td></tr>
                            <tr>
                                <td colspan="2" style="padding-left: 20px;">
                                    <table class="inner-table">
                                        <tr>
                                            <td class="nowrap" style="width: 1px;">Name / ชื่อพนักงาน</td>
                                            <td class="dotted-line">${req.replacement_name || '&nbsp;'}</td>
                                        </tr>
                                        <tr>
                                            <td class="nowrap" style="width: 1px;">Effective resign date / วันที่มีผลออก</td>
                                            <td class="dotted-line">${req.replacement_resign_date ? formatDate(req.replacement_resign_date) : '&nbsp;'}</td>
                                        </tr>
                                        <tr>
                                            <td class="nowrap" style="width: 1px;">Reason / เหตุผลที่ออก</td>
                                            <td class="dotted-line">${req.replacement_reason || '&nbsp;'}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr><td colspan="2" style="padding-top: 12px;" class="nowrap">${cb(req.req_nature === 'Additional')} Additional / เพิ่มตำแหน่งงานใหม่</td></tr>
                            <tr>
                                <td colspan="2" style="padding-left: 20px;">
                                    <table class="inner-table">
                                        <tr>
                                            <td class="nowrap" style="width: 1px;">Reason / เหตุผลที่เพิ่ม</td>
                                            <td class="dotted-line">${req.additional_reason || '&nbsp;'}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <table style="border-top: none;">
                <tr><td class="section-head" style="border-top: none;">INFORMATION FOR RECRUITMENT / ข้อมูลเพื่อการสรรหาว่าจ้าง</td></tr>
                <tr>
                    <td style="padding: 10px 15px;">
                        <div style="font-weight: bold; margin-bottom: 4px;">EDUCATION / ระดับการศึกษา</div>
                        <table class="inner-table nowrap" style="margin-bottom: 8px;">
                            <tr>
                                <td>${cb(req.edu_level === "Master's")} ปริญญาโท</td>
                                <td>${cb(req.edu_level === "Bachelor's")} ปริญญาตรี</td>
                                <td>${cb(req.edu_level === 'Diploma')} อนุปริญญา/ปวส.</td>
                                <td>${cb(req.edu_level === 'Highschool')} ปวช./ม.6</td>
                                <td>${cb(req.edu_level === 'Junior High school or below')} ม.3 หรือต่ำกว่า</td>
                            </tr>
                        </table>
                        
                        <table class="inner-table nowrap" style="margin-bottom: 8px;">
                            <tr>
                                <td class="nowrap" style="width: 1px;">อายุ (Age)</td>
                                <td class="dotted-line" style="text-align:center; width: 60px;">${req.req_age || '&nbsp;'}</td>
                                <td class="nowrap" style="width: 1px; padding-right: 15px;">ปี</td>
                                <td class="nowrap" style="width: 1px;">ประสบการณ์ (Experience)</td>
                                <td class="dotted-line" style="text-align:center; width: 70px;">${req.req_experience || '&nbsp;'}</td>
                                <td class="nowrap" style="width: 1px; padding-left: 15px;">สาขาวิชา (Major Field)</td>
                                <td class="dotted-line">${req.req_major || '&nbsp;'}</td>
                            </tr>
                        </table>

                        <table class="inner-table nowrap" style="margin-bottom: 12px;">
                            <tr>
                                <td class="nowrap" style="width: 1px; padding-right: 15px;">เพศ (Gender)</td>
                                <td style="width: 90px;">${cb(req.req_gender === 'Male')} ชาย (Male)</td>
                                <td style="width: 90px;">${cb(req.req_gender === 'Female')} หญิง (Female)</td>
                                <td>${cb(req.req_gender === 'Not specified')} ไม่ระบุ (Not specified)</td>
                            </tr>
                        </table>

                        <div style="font-weight: bold; margin-bottom: 4px;">REQUIRED CERTIFICATION / เอกสารที่ต้องมี</div>
                        <table class="inner-table nowrap" style="margin-bottom: 6px;">
                            <tr>
                                <td style="width: 32%;">${cb(!!req.cert_driving)} ใบขับขี่ประเภท <span class="dotted-line" style="display: inline-block; width: 60px; text-align:center;">${req.cert_driving || '&nbsp;'}</span></td>
                                <td style="width: 30%;">${cb(req.cert_forklift === 1)} ใบอบรมรถโฟล์คลิฟต์</td>
                                <td style="width: 38%;">${cb(req.cert_safety === 1)} ใบอบรมเจ้าหน้าที่ความปลอดภัย (จป.)</td>
                            </tr>
                        </table>
                        <table class="inner-table nowrap" style="margin-bottom: 8px;">
                            <tr>
                                <td class="nowrap" style="width: 1px;">${cb(!!req.cert_other)} เอกสารอื่นๆ </td>
                                <td class="dotted-line" style="text-align:center;">${req.cert_other || '&nbsp;'}</td>
                            </tr>
                        </table>

                        <div style="font-weight: bold; margin-top: 10px;">OTHER QUALIFICATIONS / คุณสมบัติอื่นๆ (โปรดระบุ)</div>
                        <div class="dotted-line" style="min-height: 18px; margin-top: 6px;">${req.other_qualifications || '&nbsp;'}</div>
                        <div class="dotted-line" style="min-height: 18px; margin-top: 10px;"></div>
                    </td>
                </tr>
            </table>

            <table style="border-top: none;">
                <tr>
                    <td class="signature-box" style="width: 33.33%; border-top: none;">
                        <div class="label" style="margin-bottom: 30px;">REQUESTED BY<br>ผู้ขออัตราตำแหน่งงาน</div>
                        <div class="sig-line"></div>
                        <div style="margin-top: 4px;">( Supervisor )</div>
                        <div style="margin-top: 8px;">Date ......../......../........</div>
                    </td>
                    <td class="signature-box" style="width: 33.33%; border-top: none;">
                        <div class="label" style="margin-bottom: 30px;">APPROVED BY DEPARTMENT<br>อนุมัติโดยผู้จัดการฝ่าย</div>
                        <div class="sig-line"></div>
                        <div style="margin-top: 4px;">( Department Manager )</div>
                        <div style="margin-top: 8px;">Date ......../......../........</div>
                    </td>
                    <td class="signature-box" style="width: 33.33%; border-top: none;">
                        <div class="label" style="margin-bottom: 30px;">APPROVED BY<br>อนุมัติโดยผู้จัดการฝ่ายบริหารทรัพยากรบุคคล</div>
                        <div class="sig-line"></div>
                        <div style="margin-top: 4px;">( HR Manager )</div>
                        <div style="margin-top: 8px;">Date ......../......../........</div>
                    </td>
                </tr>
            </table>

        </body>
        </html>
    `;

		const browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			headless: true
		});
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'networkidle0' });

		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
			displayHeaderFooter: true,
			headerTemplate: '<span></span>',
			footerTemplate: `
        <div style="width: 100%; font-size: 8px; font-family: sans-serif; padding-left: 15mm; padding-right: 15mm; color: #555;">
            FM-HR-04-01 Rev.00 Effective date August 28, 2020
        </div>
    `,
			margin: {
				top: '15mm',
				right: '15mm',
				bottom: '15mm',
				left: '15mm'
			}
		});

		await browser.close();

		const pdfBlob = new Blob([pdfBuffer as BlobPart], { type: 'application/pdf' });
		return new Response(pdfBlob, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${req.request_no}.pdf"`
			}
		});
	} catch (err: unknown) {
		console.error('PDF Error:', err);
		return json({ message: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
	} finally {
		if (connection) connection.release();
	}
};
