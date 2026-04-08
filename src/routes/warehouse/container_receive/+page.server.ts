import { fail } from '@sveltejs/kit';
import { cymspool } from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';

export const load = async ({ locals }) => {
    // ตรวจสอบสิทธิ์การเข้าถึงหน้าเว็บ (ถ้าไม่มีสิทธิ์ ฟังก์ชันนี้ควรจะ Throw Redirect ไปหน้าอื่น)
    await checkPermission(locals , 'view container receive');

    try {
        // 1. ดึงข้อมูลตู้จาก Plan ที่ยังไม่ได้รับเข้าลาน (ไม่มีใน container_stocks) และ status = 1
        const [pendingPlans]: any = await cymspool.query(`
            SELECT 
                p.id as plan_id, 
                p.plan_no, 
                c.id as container_id,
                c.container_no,
                c.size
            FROM container_order_plans p
            JOIN containers c ON p.container_id = c.id
            LEFT JOIN container_stocks s ON p.id = s.container_order_plan_id
            WHERE s.id IS NULL AND p.status = 1
            ORDER BY p.created_at DESC
            LIMIT 100
        `);

        // 2. ดึงตำแหน่งที่ว่างในลาน (สมมติว่าดึง location ที่ active)
        const [locations]: any = await cymspool.query(`
            SELECT id, location_code 
            FROM yard_locations 
            WHERE is_active = 1
            ORDER BY location_code ASC
        `);

        return {
            plans: pendingPlans,
            locations: locations
        };
    } catch (error) {
        console.error("Error loading receive data:", error);
        return { plans: [], locations: [], error: "ไม่สามารถโหลดข้อมูลได้" };
    }
};

export const actions = {
    default: async ({ request, locals }) => {
        // ตรวจสอบสิทธิ์การทำรายการก่อนบันทึก
        await checkPermission(locals , 'view container receive');

        const data = await request.formData();
        const plan_id = data.get('plan_id');
        const yard_location_id = data.get('yard_location_id');
        const status = data.get('status'); // 1: Full, 2: Partial, 3: Empty
        const remarks = data.get('remarks');
        
        // ดึง User ID จาก Session ผ่าน locals (หากไม่มีจะใช้ค่าเริ่มต้นคือ 1 ไปก่อน)
        const user_id = locals.user?.id || 1; 

        if (!plan_id || !yard_location_id || !status) {
            return fail(400, { error: 'กรุณากรอกข้อมูลให้ครบถ้วน', incorrect: true });
        }

        const connection = await cymspool.getConnection();

        try {
            // เริ่ม Transaction เพื่อป้องกันข้อมูลไม่สมบูรณ์
            await connection.beginTransaction();

            // 1. หา container_id จาก plan_id และตรวจสอบให้มั่นใจว่า status = 1
            const [planRows]: any = await connection.query(
                `SELECT container_id FROM container_order_plans WHERE id = ? AND status = 1`,
                [plan_id]
            );
            
            if (planRows.length === 0) {
                throw new Error("ไม่พบข้อมูล Plan หรือ Plan ไม่ได้อยู่ในสถานะที่รับได้ (status ไม่ใช่ 1)");
            }
            const container_id = planRows[0].container_id;

            // 2. บันทึกเข้า Stock (สถานะปัจจุบัน)
            await connection.query(
                `INSERT INTO container_stocks 
                (container_order_plan_id, container_id, yard_location_id, status, checkin_date, exchange_flg, remarks, created_at, updated_at) 
                VALUES (?, ?, ?, ?, CURDATE(), 0, ?, NOW(), NOW())`,
                [plan_id, container_id, yard_location_id, status, remarks]
            );

            // 3. บันทึก History (Transaction)
            await connection.query(
                `INSERT INTO container_transactions 
                (container_order_plan_id, user_id, yard_location_id, activity_type, transaction_date, remarks, created_at, updated_at) 
                VALUES (?, ?, ?, 'Receive', NOW(), ?, NOW(), NOW())`,
                [plan_id, user_id, yard_location_id, remarks]
            );

            // 4. อัปเดตสถานะและวันที่รับเข้าใน container_order_plans
            await connection.query(
                `UPDATE container_order_plans 
                SET status = 2, checkin_date = NOW(), updated_at = NOW() 
                WHERE id = ?`,
                [plan_id]
            );

            // ยืนยันการบันทึก
            await connection.commit();

            return { success: true, message: 'รับตู้เข้าลานสำเร็จ' };

        } catch (error: any) {
            // ยกเลิกการบันทึกหากเกิดข้อผิดพลาด
            await connection.rollback();
            console.error("Transaction Error:", error);
            return fail(500, { error: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        } finally {
            connection.release();
        }
    }
};