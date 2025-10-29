import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

// định nghĩa kiểu dữ liệu Product (คัดลอกมาจาก +page.server.ts)
interface Product extends RowDataPacket { 
    id: number; 
    sku: string; 
    name: string; 
    unit_id: number; 
    purchase_cost: number | null; 
}

/**
 * API Endpoint สำหรับค้นหา Products แบบ Asynchronously
 */
export const GET: RequestHandler = async ({ url, locals }) => {
    // ตรวจสอบสิทธิ์ผู้ใช้
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    const searchTerm = url.searchParams.get('search') || '';
    
    // ถ้าไม่มีคำค้นหา ส่งค่าว่างกลับไป (หรืออาจจะส่ง Top 20 รายการล่าสุด)
    if (searchTerm.trim() === '') {
         return json([]);
    }

    const query = `
        SELECT id, sku, name, unit_id, purchase_cost
        FROM products
        WHERE is_active = 1
          AND (sku LIKE ? OR name LIKE ?)
        ORDER BY 
            CASE 
                WHEN sku LIKE ? THEN 1
                WHEN name LIKE ? THEN 2
                ELSE 3
            END,
            sku ASC,
            name ASC
        LIMIT 20
    `;
    
    const likeTerm = `%${searchTerm}%`;
    const startsWithTerm = `${searchTerm}%`;

    try {
        const [productRows] = await pool.execute<Product[]>(query, [
            likeTerm, 
            likeTerm, 
            startsWithTerm, // ให้ความสำคัญกับ SKU ที่ขึ้นต้นด้วยคำค้นหา
            startsWithTerm  // ให้ความสำคัญกับชื่อที่ขึ้นต้นด้วยคำค้นหา
        ]);
        
        // Map ข้อมูลให้เป็น format ที่ svelte-select ต้องการ
        // { value, label, product }
        const options = productRows.map(p => ({
            value: p.id,
            label: `${p.sku} - ${p.name}`,
            product: p // ส่ง object product ทั้งหมดไปด้วย
        }));

        return json(options);

    } catch (err: any) {
        console.error(`API Error searching products: ${err.message}`, err.stack);
        throw error(500, 'Failed to search products');
    }
};
