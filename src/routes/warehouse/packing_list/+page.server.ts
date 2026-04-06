import { btpool } from '$lib/server/database'; 
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10; 

    const container = url.searchParams.get('container') || '';
    const delivery_order = url.searchParams.get('delivery_order') || '';
    const temp_material = url.searchParams.get('temp_material') || '';
    
    // คำนวณหาวันแรกและวันสุดท้ายของเดือนปัจจุบัน เพื่อตั้งเป็น Default ให้ตรงกับ Frontend
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0); 
    
    const defaultStartDate = firstDay.toLocaleDateString('en-CA'); 
    const defaultEndDate = lastDay.toLocaleDateString('en-CA');

    const create_date_start = url.searchParams.get('create_date_start') ?? defaultStartDate;
    const create_date_end = url.searchParams.get('create_date_end') ?? defaultEndDate;

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
    
    // ✅ อัปเดต: ปรับแก้ตรงนี้ให้เหมือน SQL ตามที่คุณต้องการ
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

    const countQuery = `
        SELECT COUNT(*) as total 
        FROM packing_list p
        ${joinClause}
        WHERE ${whereClause}
    `;

    const dataQuery = `
        SELECT p.* ${temp_material ? ', m.temp_material' : ''}
        FROM packing_list p
        ${joinClause}
        WHERE ${whereClause}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
    `;

    try {
        const [countResult]: any = await btpool.query(countQuery, params);
        const total = countResult[0]?.total || 0;

        const offset = (page - 1) * pageSize;
        
        const [data]: any = await btpool.query(dataQuery, [...params, pageSize, offset]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
            searchParams: {
                container,
                delivery_order,
                temp_material,
                create_date_start,
                create_date_end
            }
        };
    } catch (error) {
        console.error('Error fetching packing_list:', error);
        
        return {
            data: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
            searchParams: {
                container,
                delivery_order,
                temp_material,
                create_date_start: defaultStartDate,
                create_date_end: defaultEndDate
            }
        };
    }
};