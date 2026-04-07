import { cymspool } from '$lib/server/database';
import type { PageServerLoad, Actions } from './$types';
import { checkPermission } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
    // ตรวจสอบสิทธิ์ (ตัวอย่างชื่อสิทธิ์ สามารถปรับให้ตรงกับใน DB ได้)
    checkPermission(locals, 'view yard locations');

    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10; 
    const location_code = url.searchParams.get('location_code') || '';
    const is_active = url.searchParams.get('is_active') || '';

    // โหลดข้อมูล Yard Categories (Master Data) ทั้งหมดเพื่อใช้ใน Dropdown และ Modal จัดการ Categories
    let categories: any[] = [];
    try {
        const [catRows] = await cymspool.query('SELECT * FROM yard_categories ORDER BY type, name ASC');
        categories = catRows as any[];
    } catch (error) {
        console.error('Error fetching yard_categories:', error);
    }

    // สร้างเงื่อนไข Query สำหรับ Yard Locations
    let conditions = ['1=1'];
    let params: any[] = [];

    if (location_code) {
        conditions.push('yl.location_code LIKE ?');
        params.push(`%${location_code}%`);
    }
    if (is_active !== '') {
        conditions.push('yl.is_active = ?');
        params.push(is_active);
    }

    const whereClause = conditions.join(' AND ');

    // Query สำหรับนับจำนวนข้อมูล
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM yard_locations yl
        WHERE ${whereClause}
    `;

    // Query สำหรับดึงข้อมูล Yard Locations (Join กับ Categories เพื่อเอาชื่อมาแสดง)
    const dataQuery = `
        SELECT yl.*, 
               t.name as type_name, 
               z.name as zone_name, 
               a.name as area_name, 
               b.name as bin_name
        FROM yard_locations yl
        LEFT JOIN yard_categories t ON yl.location_type_id = t.id
        LEFT JOIN yard_categories z ON yl.zone_id = z.id
        LEFT JOIN yard_categories a ON yl.area_id = a.id
        LEFT JOIN yard_categories b ON yl.bin_id = b.id
        WHERE ${whereClause}
        ORDER BY yl.id DESC
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
                location_code,
                is_active
            },
            categories // ส่ง categories ไปให้ฝั่ง Frontend ด้วย
        };
    } catch (error) {
        console.error('Error fetching yard_locations:', error);
        return {
            data: [], total: 0, page, pageSize, totalPages: 0,
            searchParams: { location_code, is_active },
            categories
        };
    }
};

export const actions: Actions = {
    // ==================== YARD LOCATION ACTIONS ====================

    createLocation: async ({ request, locals }) => {
        checkPermission(locals, 'edit yard locations');
        const data = await request.formData();
        
        const location_code = data.get('location_code')?.toString().trim();
        const location_type_id = data.get('location_type_id')?.toString() || null;
        const zone_id = data.get('zone_id')?.toString() || null;
        const area_id = data.get('area_id')?.toString() || null;
        const bin_id = data.get('bin_id')?.toString() || null;
        const is_active = data.get('is_active') ? 1 : 0;

        if (!location_code) return fail(400, { message: 'กรุณากรอก Location Code' });

        try {
            await cymspool.query(
                `INSERT INTO yard_locations (location_code, location_type_id, zone_id, area_id, bin_id, is_active, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [location_code, location_type_id, zone_id, area_id, bin_id, is_active]
            );
            return { success: true };
        } catch (error: any) {
            if (error.code === 'ER_DUP_ENTRY') {
                return fail(400, { message: 'Location Code นี้มีอยู่แล้วในระบบ' });
            }
            console.error('Create Location error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
    },

    updateLocation: async ({ request, locals }) => {
        checkPermission(locals, 'edit yard locations');
        const data = await request.formData();
        
        const id = data.get('id')?.toString();
        const location_code = data.get('location_code')?.toString().trim();
        const location_type_id = data.get('location_type_id')?.toString() || null;
        const zone_id = data.get('zone_id')?.toString() || null;
        const area_id = data.get('area_id')?.toString() || null;
        const bin_id = data.get('bin_id')?.toString() || null;
        const is_active = data.get('is_active') ? 1 : 0;

        if (!id || !location_code) return fail(400, { message: 'ข้อมูลไม่ครบถ้วน' });

        try {
            await cymspool.query(
                `UPDATE yard_locations 
                 SET location_code=?, location_type_id=?, zone_id=?, area_id=?, bin_id=?, is_active=?, updated_at=NOW() 
                 WHERE id=?`,
                [location_code, location_type_id, zone_id, area_id, bin_id, is_active, id]
            );
            return { success: true };
        } catch (error: any) {
            if (error.code === 'ER_DUP_ENTRY') {
                return fail(400, { message: 'Location Code นี้มีอยู่แล้วในระบบ' });
            }
            console.error('Update Location error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
        }
    },

    deleteLocation: async ({ request, locals }) => {
        checkPermission(locals, 'delete yard locations');
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) return fail(400, { message: 'ไม่พบรหัสที่ต้องการลบ' });

        try {
            await cymspool.query('DELETE FROM yard_locations WHERE id = ?', [id]);
            return { success: true };
        } catch (error: any) {
            console.error('Delete Location error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
        }
    },

    // ==================== YARD CATEGORY ACTIONS (MASTER DATA) ====================

    createCategory: async ({ request, locals }) => {
        checkPermission(locals, 'edit yard locations');
        const data = await request.formData();
        
        const name = data.get('name')?.toString().trim();
        const type = data.get('type')?.toString().trim(); // 'zone', 'area', 'bin', 'location_type'
        const description = data.get('description')?.toString().trim() || null;

        if (!name || !type) return fail(400, { message: 'กรุณากรอกชื่อและประเภทข้อมูล' });

        try {
            await cymspool.query(
                `INSERT INTO yard_categories (name, type, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
                [name, type, description]
            );
            return { success: true };
        } catch (error: any) {
            console.error('Create Category error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล Category' });
        }
    },

    updateCategory: async ({ request, locals }) => {
        checkPermission(locals, 'edit yard locations');
        const data = await request.formData();
        
        const id = data.get('id')?.toString();
        const name = data.get('name')?.toString().trim();
        const type = data.get('type')?.toString().trim();
        const description = data.get('description')?.toString().trim() || null;

        if (!id || !name || !type) return fail(400, { message: 'ข้อมูลไม่ครบถ้วน' });

        try {
            await cymspool.query(
                `UPDATE yard_categories SET name=?, type=?, description=?, updated_at=NOW() WHERE id=?`,
                [name, type, description, id]
            );
            return { success: true };
        } catch (error: any) {
            console.error('Update Category error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล Category' });
        }
    },

    deleteCategory: async ({ request, locals }) => {
        checkPermission(locals, 'delete yard locations');
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) return fail(400, { message: 'ไม่พบรหัสที่ต้องการลบ' });

        try {
            await cymspool.query('DELETE FROM yard_categories WHERE id = ?', [id]);
            return { success: true };
        } catch (error: any) {
            // ดักจับกรณี Category นี้ถูกใช้งานอยู่ในตาราง yard_locations (Foreign Key Constraint)
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(400, { message: 'ไม่สามารถลบได้ เนื่องจากถูกใช้งานอยู่ใน Yard Location แล้ว' });
            }
            console.error('Delete Category error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
        }
    }
};