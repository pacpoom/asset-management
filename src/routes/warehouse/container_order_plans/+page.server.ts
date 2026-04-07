import { cymspool } from '$lib/server/database';
import type { PageServerLoad } from './$types';
import { checkPermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, locals }) => {
    // ตรวจสอบสิทธิ์การเข้าถึงหน้าเว็บ
    checkPermission(locals, 'view container order plan');

    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10; 

    // รับพารามิเตอร์สำหรับการค้นหา
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

    // สร้างเงื่อนไข Query
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
        // เติมเวลาให้ครอบคลุมถึงสิ้นวันของ create_date_end
        params.push(`${create_date_start} 00:00:00`, `${create_date_end} 23:59:59`);
    } else if (create_date_start) {
        conditions.push('cop.created_at >= ?');
        params.push(`${create_date_start} 00:00:00`);
    } else if (create_date_end) {
        conditions.push('cop.created_at <= ?');
        params.push(`${create_date_end} 23:59:59`);
    }

    const whereClause = conditions.join(' AND ');

    // Query สำหรับนับจำนวนข้อมูลทั้งหมด
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM container_order_plans cop
        LEFT JOIN containers c ON cop.container_id = c.id
        WHERE ${whereClause}
    `;

    // Query สำหรับดึงข้อมูลในหน้านั้นๆ (Join table)
    // เพิ่ม CASE สำหรับแปลงสถานะ
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
        LIMIT ? OFFSET ?
    `;

    try {
        const [countResult]: any = await cymspool.query(countQuery, params);
        const total = countResult[0]?.total || 0;

        const offset = (page - 1) * pageSize;
        const [data]: any = await cymspool.query(dataQuery, [...params, pageSize, offset]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
            searchParams: {
                container_no,
                plan_no,
                create_date_start,
                create_date_end
            }
        };
    } catch (error) {
        console.error('Error fetching container_order_plans:', error);
        
        return {
            data: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
            searchParams: {
                container_no,
                plan_no,
                create_date_start: defaultStartDate,
                create_date_end: defaultEndDate
            }
        };
    }
};