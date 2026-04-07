import { btpool } from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ url }: RequestEvent) => {
    // 1. รับค่า Search Parameters จาก URL
    const container = url.searchParams.get('container') || '';
    const delivery_order = url.searchParams.get('delivery_order') || '';
    const temp_material = url.searchParams.get('temp_material') || '';
    
    // Default ค่า Date ให้เหมือนหน้า List หลักถ้าไม่ได้ถูกส่งมา
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0); 
    
    const defaultStartDate = firstDay.toLocaleDateString('en-CA'); 
    const defaultEndDate = lastDay.toLocaleDateString('en-CA');

    const create_date_start = url.searchParams.get('create_date_start') ?? defaultStartDate;
    const create_date_end = url.searchParams.get('create_date_end') ?? defaultEndDate;

    // 2. สร้างเงื่อนไข Query
    let conditions = ['1=1'];
    let params: any[] = [];

    if (container) {
        conditions.push('p.container LIKE ?');
        params.push(`%${container}%`);
    }
    if (delivery_order) {
        conditions.push('p.delivery_order LIKE ?');
        params.push(`%${delivery_order}%`);
    }
    if (temp_material) {
        conditions.push('m.temp_material LIKE ?');
        params.push(`%${temp_material}%`);
    }
    
    if (create_date_start && create_date_end) {
        conditions.push('p.created_at >= ? AND p.created_at <= ?');
        params.push(create_date_start, create_date_end);
    } else if (create_date_start) {
        conditions.push('p.created_at >= ?');
        params.push(create_date_start);
    } else if (create_date_end) {
        conditions.push('p.created_at <= ?');
        params.push(create_date_end);
    }

    const whereClause = conditions.join(' AND ');
    const joinClause = temp_material ? 'LEFT JOIN v_material m ON p.material_id = m.id' : '';

    // Query เพื่อดึงข้อมูลทั้งหมดโดยไม่ Limit และ Offset
    const dataQuery = `
        SELECT p.* ${temp_material ? ', m.temp_material' : ''}
        FROM packing_list p
        ${joinClause}
        WHERE ${whereClause}
        ORDER BY p.id DESC
    `;

    try {
        const [data]: any = await btpool.query(dataQuery, params);

        // 3. สร้าง Workbook Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Packing List');

        worksheet.columns = [
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Container', key: 'container', width: 20 },
            { header: 'Delivery Order', key: 'delivery_order', width: 20 },
            { header: 'Item Number', key: 'item_number', width: 15 },
            { header: 'Create Date', key: 'created_at', width: 15 },
            { header: 'Material ID', key: 'material_id', width: 20 },
            { header: 'Case Number', key: 'case_number', width: 15 },
            { header: 'Storage Location', key: 'storage_location', width: 20 },
            { header: 'Box ID', key: 'box_id', width: 20 },
            { header: 'Qty', key: 'quantity', width: 10 },
            { header: 'Container Received', key: 'container_received', width: 20 },
            { header: 'File Name', key: 'file_name', width: 25 },
            { header: 'TR Name', key: 'tr_name', width: 20 }
        ];

        // ตกแต่ง Header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // 4. หย่อนข้อมูลลงแต่ละแถว
        for (const row of data) {
            const statusStr = row.receive_flg === 1 ? 'Received' : 'Pending';
            const createdDate = row.created_at ? new Date(row.created_at).toLocaleDateString('en-CA') : '-';
            
            worksheet.addRow({
                status: statusStr,
                container: row.container || '-',
                delivery_order: row.delivery_order || '-',
                item_number: row.item_number || '-',
                created_at: createdDate,
                material_id: row.temp_material || '-',
                case_number: row.case_number || '-',
                storage_location: row.storage_location || '-',
                box_id: row.box_id || '-',
                quantity: row.quantity ?? '-',
                container_received: row.container_received || '-',
                file_name: row.file_name || '-',
                tr_name: row.tr_name || '-'
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();

        return new Response(buffer as BlobPart, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="Packing_List_${new Date().toISOString().slice(0, 10)}.xlsx"`
            }
        });
    } catch (error) {
        console.error('Error exporting packing_list:', error);
        return new Response('Failed to generate Excel file', { status: 500 });
    }
};