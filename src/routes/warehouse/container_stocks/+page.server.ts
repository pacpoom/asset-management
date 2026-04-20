import { cymspool } from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';

export const load = async ({ locals }) => {
    // ตรวจสอบสิทธิ์การเข้าถึง (ปรับชื่อสิทธิ์ตามที่มีในระบบจริง)
    await checkPermission(locals, 'view container stock');

    try {
        // ดึงข้อมูลสต๊อกตู้ พร้อม Join ข้อมูลตู้, แผนงาน และตำแหน่งลาน
        const [stocks]: any = await cymspool.query(`
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
            ORDER BY c.container_no ASC
        `);

        return { 
            stocks: stocks 
        };
    } catch (error) {
        console.error("Error loading container stocks:", error);
        return { stocks: [], error: "ไม่สามารถโหลดข้อมูลสต๊อกตู้ได้" };
    }
};