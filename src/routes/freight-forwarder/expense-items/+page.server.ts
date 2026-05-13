import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import { allocateMonthlySequence } from '$lib/server/monthlyDocumentSequence';

export const load = async () => {
    const [items] = await pool.query(`
        SELECT i.*, c.category_name 
        FROM expense_items i
        LEFT JOIN expense_categories c ON i.expense_category_id = c.id
        ORDER BY i.id DESC
    `);
    
    const [categories] = await pool.query('SELECT id, category_name FROM expense_categories WHERE is_active = 1 ORDER BY category_name ASC');

    return {
        items: JSON.parse(JSON.stringify(items)),
        categories: JSON.parse(JSON.stringify(categories))
    };
};

export const actions = {
    // เพิ่มรายการใหม่
    create: async ({ request }) => {
        const formData = await request.formData();
        const expense_category_id = formData.get('expense_category_id');
        let item_code = formData.get('item_code')?.toString().trim() || ''; // เปลี่ยนเป็น let เพื่อให้กำหนดค่าใหม่ได้
        const item_name = formData.get('item_name')?.toString().trim();
        const description = formData.get('description')?.toString().trim() || '';

        if (!expense_category_id || !item_name) {
            return fail(400, { message: 'กรุณาเลือกหมวดหมู่และระบุชื่อรายการ' });
        }

        const connection = await pool.getConnection(); // ดึง connection มาเพื่อทำ Transaction
        try {
            await connection.beginTransaction(); // เริ่ม Transaction

            // ตรวจสอบว่าถ้าไม่ได้กรอก Item Code มา ให้ Generate อัตโนมัติ
            if (!item_code) {
                const dateStr = new Date().toISOString().split('T')[0];
                const meta = await allocateMonthlySequence(connection, 'ITE', dateStr, () => 'ITE-');
                const yy = meta.year.toString().slice(-2);
                const runningNo = String(meta.seq).padStart(meta.padding, '0');
                item_code = `${meta.prefix}${yy}${meta.monthStr}${runningNo}`;
            }

            // บันทึกข้อมูลลงฐานข้อมูลด้วย item_code ที่มีหรือเพิ่งถูกสร้าง
            await connection.execute(
                'INSERT INTO expense_items (expense_category_id, item_code, item_name, description, is_active) VALUES (?, ?, ?, ?, ?)',
                [expense_category_id, item_code, item_name, description, 1]
            );

            await connection.commit(); // ยืนยัน Transaction
            connection.release(); // คืน Connection กลับสู่ Pool

            return { success: true, action: 'create', message: 'เพิ่มรายการสำเร็จ' };
        } catch (err: any) {
            await connection.rollback(); // ยกเลิก Transaction ถ้าเกิดข้อผิดพลาด
            connection.release();

            console.error('Create item error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(400, { message: 'รหัสรายการ (Item Code) นี้ถูกใช้งานแล้ว' });
            }
            return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
    },

    // แก้ไขรายการ
    update: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');
        const expense_category_id = formData.get('expense_category_id');
        const item_code = formData.get('item_code')?.toString().trim();
        const item_name = formData.get('item_name')?.toString().trim();
        const description = formData.get('description')?.toString().trim() || '';
        const is_active = formData.get('is_active') === 'true' ? 1 : 0;

        if (!id || !expense_category_id || !item_name) {
            return fail(400, { message: 'ข้อมูลไม่ครบถ้วน' });
        }

        try {
            await pool.execute(
                'UPDATE expense_items SET expense_category_id = ?, item_code = ?, item_name = ?, description = ?, is_active = ? WHERE id = ?',
                [expense_category_id, item_code || null, item_name, description, is_active, id]
            );
            return { success: true, action: 'update', message: 'อัปเดตรายการสำเร็จ' };
        } catch (err: any) {
            console.error('Update item error:', err);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
        }
    },

    // ลบรายการ
    delete: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');

        if (!id) return fail(400, { message: 'ไม่พบรหัสรายการ' });

        try {
            await pool.execute('DELETE FROM expense_items WHERE id = ?', [id]);
            return { success: true, action: 'delete', message: 'ลบรายการสำเร็จ' };
        } catch (err: any) {
            console.error('Delete item error:', err);
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(400, { message: 'ไม่สามารถลบได้ เนื่องจากรายการนี้ถูกนำไปใช้ในหน้า Job แล้ว' });
            }
            return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
        }
    }
};