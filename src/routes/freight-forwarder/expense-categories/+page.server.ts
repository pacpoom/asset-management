import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async () => {
    // ดึงข้อมูลทั้งหมดมาแสดงในตาราง
    const [categories] = await pool.query('SELECT * FROM expense_categories ORDER BY id DESC');
    return {
        categories: JSON.parse(JSON.stringify(categories))
    };
};

export const actions = {
    // เพิ่มหมวดหมู่ใหม่
    create: async ({ request }) => {
        const formData = await request.formData();
        const category_code = formData.get('category_code')?.toString().trim();
        const category_name = formData.get('category_name')?.toString().trim();
        const description = formData.get('description')?.toString().trim() || '';

        if (!category_code || !category_name) {
            return fail(400, { message: 'กรุณากรอกรหัสและชื่อหมวดหมู่' });
        }

        try {
            await pool.execute(
                'INSERT INTO expense_categories (category_code, category_name, description, is_active) VALUES (?, ?, ?, ?)',
                [category_code, category_name, description, 1]
            );
            return { success: true, action: 'create' };
        } catch (err: any) {
            console.error('Create category error:', err);
            // ตรวจสอบ Duplicate Code
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(400, { message: 'รหัสหมวดหมู่นี้ถูกใช้งานแล้ว' });
            }
            return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
    },

    // แก้ไขหมวดหมู่
    update: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');
        const category_code = formData.get('category_code')?.toString().trim();
        const category_name = formData.get('category_name')?.toString().trim();
        const description = formData.get('description')?.toString().trim() || '';
        const is_active = formData.get('is_active') === 'true' ? 1 : 0;

        if (!id || !category_code || !category_name) {
            return fail(400, { message: 'ข้อมูลไม่ครบถ้วน' });
        }

        try {
            await pool.execute(
                'UPDATE expense_categories SET category_code = ?, category_name = ?, description = ?, is_active = ? WHERE id = ?',
                [category_code, category_name, description, is_active, id]
            );
            return { success: true, action: 'update' };
        } catch (err: any) {
            console.error('Update category error:', err);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
        }
    },

    // ลบหมวดหมู่
    delete: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');

        if (!id) return fail(400, { message: 'ไม่พบรหัสหมวดหมู่' });

        try {
            await pool.execute('DELETE FROM expense_categories WHERE id = ?', [id]);
            return { success: true, action: 'delete' };
        } catch (err: any) {
            console.error('Delete category error:', err);
            // กรณีที่มีข้อมูลตารางลูก (expense_items) ผูกอยู่ จะลบไม่ได้ตาม Foreign Key
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(400, { message: 'ไม่สามารถลบได้ เนื่องจากมีรายการย่อย (Expense Items) ใช้งานอยู่' });
            }
            return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
        }
    }
};
