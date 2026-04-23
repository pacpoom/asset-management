import type { RequestHandler } from './$types';
import { cymspool } from '$lib/server/database';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ url }) => {
	const pullingDate = url.searchParams.get('pulling_date');
	const shop = url.searchParams.get('shop');

	if (!pullingDate) {
		return new Response('Missing pulling_date parameter', { status: 400 });
	}

	try {
		// 🌟 1. แก้ไขชื่อตารางเป็น 'company' และดึงคอลัมน์ 'name', 'logo_path'
		const [companyRows]: any = await cymspool.execute(
			`SELECT logo_path, name FROM bizcore.company LIMIT 1`
		);
		// ถ้าไม่มีข้อมูลในตาราง ให้ default ชื่อบริษัทไว้
		const company = companyRows[0] || { logo_path: '', name: 'ANJI-NYK' };

		// 🌟 2. ดึงข้อมูลแผนการเบิก
		let query = `
			SELECT 
				p.pulling_order,
				c.container_no,
				c.size,
				yl.location_code,
				p.destination
			FROM container_pulling_plans p
			LEFT JOIN container_order_plans op ON p.container_order_plan_id = op.id
			LEFT JOIN containers c ON op.container_id = c.id
			LEFT JOIN container_stocks s ON op.id = s.container_order_plan_id
			LEFT JOIN yard_locations yl ON s.yard_location_id = yl.id
			WHERE DATE(p.pulling_date) = ?
		`;

		const params: any[] = [pullingDate];
		if (shop) {
			query += ` AND p.shop = ?`;
			params.push(shop);
		}
		query += ` ORDER BY p.pulling_order ASC`;

		const [rows]: any = await cymspool.execute(query, params);

		// --- เริ่มสร้าง PDF ---
		const doc = new jsPDF();
		const pageWidth = doc.internal.pageSize.getWidth();
		const pageHeight = doc.internal.pageSize.getHeight();

		// 🌟 3. ใส่โลโก้บริษัท
		if (company.logo_path) {
			const logoAbsolutePath = path.join(process.cwd(), 'static', company.logo_path);
			if (fs.existsSync(logoAbsolutePath)) {
				const logoData = fs.readFileSync(logoAbsolutePath).toString('base64');
				doc.addImage(`data:image/png;base64,${logoData}`, 'PNG', 14, 10, 25, 25);
			}
		}

		// 🌟 4. ส่วนหัวเอกสาร
		doc.setTextColor(0, 0, 0);
		doc.setFontSize(16);
		doc.setFont('helvetica', 'bold');
		doc.text('Container Pulling Report', pageWidth / 2, 20, { align: 'center' });

		doc.setFontSize(10);
		doc.setFont('helvetica', 'normal');
		const dateObj = new Date(pullingDate);
		const formattedDate = dateObj.toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});

		// 🌟 แสดงชื่อบริษัทโดยใช้ company.name ให้ตรงกับชื่อคอลัมน์
		doc.text(`Company: ${company.name}`, 45, 28);
		doc.text(`Date: ${formattedDate}`, 45, 34);
		doc.text(`Shop: ${shop || 'All Shops'}`, 45, 40);

		// 🌟 5. ตารางข้อมูล
		const tableData = rows.map((row: any) => [
			row.pulling_order || '-',
			row.container_no || '-',
			row.size || '-',
			row.location_code || '-',
			row.destination || '-'
		]);

		autoTable(doc, {
			startY: 60,
			head: [['Order', 'Container No.', 'Size', 'Location', 'Destination']],
			body: tableData.length > 0 ? tableData : [['', '', 'No data found', '', '']],
			theme: 'grid',
			headStyles: {
				fillColor: [255, 255, 255],
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				halign: 'center'
			},
			bodyStyles: {
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.1
			},
			columnStyles: {
				0: { halign: 'center', cellWidth: 15 },
				1: { cellWidth: 40 },
				2: { halign: 'center', cellWidth: 20 },
				3: { halign: 'center', cellWidth: 35 },
				4: { cellWidth: 'auto' }
			},
			styles: { font: 'helvetica', fontSize: 9 }
		});

		// 🌟 6. ลายเซ็น
		const signatureY = pageHeight - 35;
		doc.setDrawColor(0, 0, 0);
		doc.setLineWidth(0.5);

		// ฝั่งคนขับ
		doc.line(20, signatureY, 80, signatureY);
		doc.text('Driver Signature', 50, signatureY + 6, { align: 'center' });

		// ฝั่ง รปภ.
		doc.line(pageWidth - 80, signatureY, pageWidth - 20, signatureY);
		doc.text('Security Guard Signature', pageWidth - 50, signatureY + 6, { align: 'center' });

		const pdfBuffer = doc.output('arraybuffer');
		return new Response(pdfBuffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': 'inline; filename="Pulling_Report.pdf"'
			}
		});
	} catch (error) {
		console.error('Report Error:', error);
		return new Response('Error generating report', { status: 500 });
	}
};
