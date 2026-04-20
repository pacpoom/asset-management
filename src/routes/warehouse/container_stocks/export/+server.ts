import { cymspool } from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';
import { checkPermission } from '$lib/server/auth';

// ฟังก์ชันคำนวณจำนวนวันในสต๊อก (เหมือนฝั่ง Frontend)
function calculateStockDays(checkinDateStr: string | Date | null) {
    if (!checkinDateStr) return '-';
    const d = new Date(checkinDateStr);
    if (isNaN(d.getTime())) return '-';

    const start = new Date(d);
    start.setHours(0, 0, 0, 0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
    return Math.max(0, days + 1);
}

// ฟังก์ชันแปลงสถานะเป็นข้อความ
function getStatusLabel(status: number) {
    switch (status) {
        case 1: return 'Full';
        case 2: return 'Partial';
        case 3: return 'Empty';
        default: return 'Unknown';
    }
}

export const GET = async ({ url, locals }: RequestEvent) => {
    // 1. ตรวจสอบสิทธิ์การเข้าถึง
    await checkPermission(locals, 'view container stock');

    // 2. รับค่า Search Parameters จาก URL
    const search = url.searchParams.get('search') || '';
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';

    // 3. สร้างเงื่อนไข Query (กรองฝั่ง Backend)
    let conditions = ['1=1'];
    let params: any[] = [];

    // ค้นหาแบบรวม (เลขตู้, เลขแผน, ตำแหน่งลาน)
    if (search.trim()) {
        conditions.push("LOWER(CONCAT_WS(' ', c.container_no, p.plan_no, l.location_code)) LIKE ?");
        params.push(`%${search.toLowerCase()}%`);
    }

    // กรองตามวันที่ Check-in
    if (from) {
        conditions.push("DATE(s.checkin_date) >= ?");
        params.push(from);
    }
    if (to) {
        conditions.push("DATE(s.checkin_date) <= ?");
        params.push(to);
    }

    const whereClause = conditions.join(' AND ');

    // 4. Query เพื่อดึงข้อมูลที่ผ่านการกรอง (เรียงตามเลขตู้)
    const dataQuery = `
        SELECT 
            s.id AS stock_id,
            origin_plan.container_no AS origin_container_no,
            c.container_no,
            c.size,
            p.plan_no,
            p.house_bl,
            l.location_code,
            s.status,
            s.checkin_date,
            s.remarks,
            s.updated_at
        FROM container_stocks s
        JOIN containers c ON s.container_id = c.id
        JOIN container_order_plans p ON s.container_order_plan_id = p.id
        JOIN yard_locations l ON s.yard_location_id = l.id
        JOIN containers origin_plan ON origin_plan.id = p.container_id
        WHERE ${whereClause}
        ORDER BY c.container_no ASC
    `;

    try {
        const [data]: any = await cymspool.query(dataQuery, params);

        // 5. สร้าง Workbook Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Container Stock');

        // กำหนดคอลัมน์
        worksheet.columns = [
            { header: 'Original No.', key: 'origin_container_no', width: 20 },
            { header: 'Current No.', key: 'container_no', width: 20 },
            { header: 'Size', key: 'size', width: 10 },
            { header: 'Plan No.', key: 'plan_no', width: 20 },
            { header: 'House B/L', key: 'house_bl', width: 25 },
            { header: 'Location', key: 'location_code', width: 15 },
            { header: 'Status', key: 'status_label', width: 15 },
            { header: 'Check-in Date', key: 'checkin_date', width: 20 },
            { header: 'Stock Days', key: 'stock_days', width: 15 },
            { header: 'Remarks', key: 'remarks', width: 35 }
        ];

        // ตกแต่ง Header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // 6. วนลูปข้อมูลใส่ลงแต่ละบรรทัด
        const pad = (n: number) => n.toString().padStart(2, '0');

        for (const row of data) {
            let checkinDateStr = '-';
            if (row.checkin_date) {
                const d = new Date(row.checkin_date);
                if (!isNaN(d.getTime())) {
                    checkinDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                }
            }

            worksheet.addRow({
                origin_container_no: row.origin_container_no || '-',
                container_no: row.container_no || '-',
                size: row.size || '-',
                plan_no: row.plan_no || '-',
                house_bl: row.house_bl || '-',
                location_code: row.location_code || '-',
                status_label: getStatusLabel(row.status),
                checkin_date: checkinDateStr,
                stock_days: calculateStockDays(row.checkin_date),
                remarks: row.remarks || '-'
            });
        }

        // 7. แปลงเป็น Buffer แล้วส่งคืน
        const buffer = await workbook.xlsx.writeBuffer();

        return new Response(buffer as BlobPart, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="Container_Stock_${new Date().toISOString().slice(0, 10)}.xlsx"`
            }
        });
    } catch (error) {
        console.error('Error exporting container_stocks:', error);
        return new Response('Failed to generate Excel file', { status: 500 });
    }
};