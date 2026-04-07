import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ locals }: RequestEvent) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Template');

        // กำหนดคอลัมน์ให้ตรงกับไฟล์ CSV Template ที่ส่งมา
        worksheet.columns = [
            { header: 'container_no', key: 'container_no', width: 20 },
            { header: 'model', key: 'model', width: 15 },
            { header: 'type', key: 'type', width: 15 },
            { header: 'house_bl', key: 'house_bl', width: 25 },
            { header: 'eta_date', key: 'eta_date', width: 15 },
            { header: 'free_time', key: 'free_time', width: 15 },
            { header: 'depot', key: 'depot', width: 20 },
            { header: 'agent', key: 'agent', width: 20 },
            { header: 'container_owner', key: 'container_owner', width: 25 },
            { header: 'vessel', key: 'vessel', width: 30 },
            { header: 'week_lot', key: 'week_lot', width: 15 },
            { header: 'checkin_date', key: 'checkin_date', width: 15 }
        ];

        // ตกแต่ง Header ให้อ่านง่าย
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        const buffer = await workbook.xlsx.writeBuffer();

        return new Response(buffer as BlobPart, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="container_order_plan_template.xlsx"`
            }
        });
    } catch (error) {
        console.error('Error generating template:', error);
        return new Response('Failed to generate template', { status: 500 });
    }
};