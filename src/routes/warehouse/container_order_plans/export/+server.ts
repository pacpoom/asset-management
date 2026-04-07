import { cymspool } from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';
import { checkPermission } from '$lib/server/auth';

export const GET = async ({ url, locals }: RequestEvent) => {
    // ตรวจสอบสิทธิ์การเข้าถึงการ Export
    checkPermission(locals, 'view container order plan');

    // 1. รับค่า Search Parameters จาก URL
    const container_no = url.searchParams.get('container_no') || '';
    const plan_no = url.searchParams.get('plan_no') || '';
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0); 
    
    const defaultStartDate = firstDay.toLocaleDateString('en-CA'); 
    const defaultEndDate = lastDay.toLocaleDateString('en-CA');

    const create_date_start = url.searchParams.get('create_date_start') ?? defaultStartDate;
    const create_date_end = url.searchParams.get('create_date_end') ?? defaultEndDate;

    // 2. สร้างเงื่อนไข Query แบบเดียวกันกับหน้าตาราง
    let conditions = ['1=1'];
    let params: any[] = [];

    if (container_no) {
        conditions.push('c.container_no LIKE ?');
        params.push(`%${container_no}%`);
    }
    if (plan_no) {
        conditions.push('cop.plan_no LIKE ?');
        params.push(`%${plan_no}%`);
    }
    
    if (create_date_start && create_date_end) {
        conditions.push('cop.created_at >= ? AND cop.created_at <= ?');
        params.push(`${create_date_start} 00:00:00`, `${create_date_end} 23:59:59`);
    } else if (create_date_start) {
        conditions.push('cop.created_at >= ?');
        params.push(`${create_date_start} 00:00:00`);
    } else if (create_date_end) {
        conditions.push('cop.created_at <= ?');
        params.push(`${create_date_end} 23:59:59`);
    }

    const whereClause = conditions.join(' AND ');

    // Query เพื่อดึงข้อมูลทั้งหมดโดยไม่จำกัดหน้า (No LIMIT / OFFSET)
    const dataQuery = `
        SELECT cop.*, c.container_no, c.size, c.agent,
            CASE cop.status
                WHEN 1 THEN 'Pending'
                WHEN 2 THEN 'Received'
                WHEN 3 THEN 'Shipped Out'
                WHEN 4 THEN 'Returned'
                ELSE 'Unknown'
            END as status_label
        FROM container_order_plans cop
        LEFT JOIN containers c ON cop.container_id = c.id
        WHERE ${whereClause}
        ORDER BY cop.id DESC
    `;

    try {
        // ใช้ cymspool
        const [data]: any = await cymspool.query(dataQuery, params);

        // 3. สร้าง Workbook Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Container Order Plan');

        worksheet.columns = [
            { header: 'Status', key: 'status_label', width: 15 },
            { header: 'Plan No', key: 'plan_no', width: 20 },
            { header: 'Container No', key: 'container_no', width: 20 },
            { header: 'House B/L', key: 'house_bl', width: 25 },
            { header: 'Week Lot', key: 'week_lot', width: 15 },
            { header: 'Vessel', key: 'vessel', width: 30 },
            { header: 'Model', key: 'model', width: 20 },
            { header: 'Type', key: 'type', width: 15 },
            { header: 'Create Date', key: 'created_at', width: 20 }
        ];

        // ตกแต่ง Header ให้โดดเด่น
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // 4. หย่อนข้อมูลลงแต่ละแถวพร้อมจัดการ Format วันที่
        const pad = (n: number) => n.toString().padStart(2, '0');
        
        for (const row of data) {
            let createdDateStr = '-';
            if (row.created_at) {
                const d = new Date(row.created_at);
                if (!isNaN(d.getTime())) {
                    createdDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                }
            }
            
            worksheet.addRow({
                status_label: row.status_label || '-',
                plan_no: row.plan_no || '-',
                container_no: row.container_no || '-',
                house_bl: row.house_bl || '-',
                week_lot: row.week_lot ?? '-',
                vessel: row.vessel || '-',
                model: row.model || '-',
                type: row.type || '-',
                created_at: createdDateStr
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();

        return new Response(buffer as BlobPart, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="Container_Order_Plan_${new Date().toISOString().slice(0, 10)}.xlsx"`
            }
        });
    } catch (error) {
        console.error('Error exporting container_order_plan:', error);
        return new Response('Failed to generate Excel file', { status: 500 });
    }
};