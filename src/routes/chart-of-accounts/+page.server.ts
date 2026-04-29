import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definition for ChartOfAccount
interface ChartOfAccount extends RowDataPacket {
    id: number;
    account_code: string;
    sub_account_code: string | null;
    account_name: string;
    account_name_th: string | null;
    account_type: string;
    description: string | null;
    is_active: boolean;
    linked_cost_centers_str?: string | null;
    linked_cost_centers?: string[]; // Array to hold multiple cost centers
}

// Type definition for Cost Centers available to check
interface CostCenterChoice extends RowDataPacket {
    cost_center_code: string;
    cost_center_name: string;
}

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense', 'Cost of Goods Sold'];

export const load: PageServerLoad = async ({ locals, url }) => {
    checkPermission(locals, 'manage settings');

    const search = url.searchParams.get('search')?.toString()?.trim() || '';
    const type = url.searchParams.get('type')?.toString()?.trim() || '';
    const activeStatus = url.searchParams.get('active')?.toString()?.trim() || 'all';

    // ใช้ LEFT JOIN ร่วมกับ GROUP_CONCAT เพื่อรวบรวม Cost Centers ทั้งหมดที่ผูกไว้มาเป็น String คั่นด้วยจุลภาค (comma)
    let sqlQuery = `
        SELECT a.id, a.account_code, a.sub_account_code, a.account_name, a.account_name_th, a.account_type, a.description, a.is_active,
               GROUP_CONCAT(m.cost_center_code) as linked_cost_centers_str
        FROM chart_of_accounts a
        LEFT JOIN account_cost_center_mapping m ON a.account_code = m.account_code
    `;
    const params: (string | number)[] = [];
    const whereClauses: string[] = [];

    if (search) {
        const likeSearch = `%${search}%`;
        whereClauses.push(`(a.account_code LIKE ? OR a.sub_account_code LIKE ? OR a.account_name LIKE ? OR a.account_name_th LIKE ?)`);
        params.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }
    if (type) {
        whereClauses.push(`a.account_type = ?`);
        params.push(type);
    }
    if (activeStatus !== 'all') {
        whereClauses.push(`a.is_active = ?`);
        params.push(activeStatus === 'active' ? 1 : 0);
    }

    if (whereClauses.length > 0) {
        sqlQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // ต้อง GROUP BY เพราะใช้ Aggregate function
    sqlQuery += ` GROUP BY a.id ORDER BY a.account_code ASC`;

    try {
        const [accounts] = await pool.execute<RowDataPacket[]>(sqlQuery, params);
        
        // ดึงรายการ Cost Center ทั้งหมดที่ Active เพื่อเอาไปทำ Checkbox ให้ผู้ใช้ติ๊กเลือก
        const [availableCostCenters] = await pool.execute<CostCenterChoice[]>(
            'SELECT cost_center_code, cost_center_name FROM cost_centers WHERE is_active = 1 ORDER BY cost_center_code ASC'
        );
        
        const formattedAccounts = accounts.map(acc => ({
            id: acc.id,
            account_code: acc.account_code,
            sub_account_code: acc.sub_account_code,
            account_name: acc.account_name.trim(),
            account_name_th: acc.account_name_th?.trim() || null,
            account_type: acc.account_type.trim(),
            description: acc.description,
            is_active: Boolean(acc.is_active),
            // แยก string ที่ได้จาก GROUP_CONCAT กลับไปเป็น Array
            linked_cost_centers: acc.linked_cost_centers_str ? acc.linked_cost_centers_str.split(',') : []
        }));

        return {
            accounts: formattedAccounts as ChartOfAccount[],
            accountTypes: ACCOUNT_TYPES,
            availableCostCenters, // ส่งไปที่ Frontend
            filters: { search, type, activeStatus }
        };
    } catch (err: any) {
        console.error('Failed to load chart of accounts data:', err.message, err.stack);
        throw error(500, `Failed to load data. Error: ${err.message}`);
    }
};

export const actions: Actions = {
    saveAccount: async ({ request, locals }) => {
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const account_code = data.get('account_code')?.toString()?.trim();
        const sub_account_code = data.get('sub_account_code')?.toString()?.trim() || null;
        const account_name = data.get('account_name')?.toString()?.trim();
        const account_name_th = data.get('account_name_th')?.toString()?.trim() || null;
        const account_type = data.get('account_type')?.toString()?.trim();
        const description = data.get('description')?.toString()?.trim() || null;
        const is_active = data.get('is_active') === 'on' || data.get('is_active') === 'true';
        
        // รับค่า Cost Center ที่ถูกติ๊กเลือกมาเป็น Array
        const selected_cost_centers = data.getAll('cost_centers').map(v => v.toString().trim());

        if (!account_code || !account_name || !account_type) {
            return fail(400, { action: 'saveAccount', success: false, message: 'Code, Name, Type required.' });
        }

        const connection = await pool.getConnection();
        try {
            // ใช้ Transaction เพื่อให้แน่ใจว่าถ้าบันทึกไม่สำเร็จให้ย้อนกลับทั้งหมด
            await connection.beginTransaction();

            const params = [account_code, sub_account_code, account_name, account_name_th, account_type, description, is_active ? 1 : 0];

            if (id) {
                // Update
                await connection.execute(
                    `UPDATE chart_of_accounts SET
                        account_code = ?, sub_account_code = ?, account_name = ?, account_name_th = ?, account_type = ?, description = ?, is_active = ?
                     WHERE id = ?`,
                    [...params, parseInt(id)]
                );
            } else {
                // Insert
                await connection.execute(
                    `INSERT INTO chart_of_accounts
                        (account_code, sub_account_code, account_name, account_name_th, account_type, description, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    params
                );
            }

            // จัดการ Mapping: ลบข้อมูลเก่าทิ้งทั้งหมด แล้วเพิ่มรายการใหม่ที่เลือกเข้ามา
            await connection.execute('DELETE FROM account_cost_center_mapping WHERE account_code = ?', [account_code]);
            
            if (selected_cost_centers.length > 0) {
                // สร้าง parameters แบบ batch insert เช่น VALUES (?, ?), (?, ?)
                const placeholders = selected_cost_centers.map(() => '(?, ?)').join(', ');
                const mappingParams = selected_cost_centers.flatMap(cc => [account_code, cc]);
                
                await connection.execute(
                    `INSERT INTO account_cost_center_mapping (account_code, cost_center_code) VALUES ${placeholders}`,
                    mappingParams
                );
            }

            await connection.commit();
            return { action: 'saveAccount', success: true, message: `Account '${account_name}' saved!` };
        } catch (err: any) {
            await connection.rollback();
            console.error('DB error saving account:', err.message, err.stack);
            if (err.code === 'ER_DUP_ENTRY') return fail(409, { action: 'saveAccount', success: false, message: 'Account Code exists.' });
            return fail(500, { action: 'saveAccount', success: false, message: `Failed. Error: ${err.message}` });
        } finally {
            connection.release();
        }
    },

    deleteAccount: async ({ request, locals }) => {
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const account_code = data.get('account_code')?.toString();

        if (!id || !account_code) return fail(400, { action: 'deleteAccount', success: false, message: 'Invalid ID/Code.' });

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // ตรวจสอบว่าถูกใช้ใน products หรือไม่
            const [productRefs] = await connection.execute<RowDataPacket[]>(
                `SELECT id FROM products WHERE asset_account_id = ? OR income_account_id = ? OR expense_account_id = ? LIMIT 1`,
                [parseInt(id), parseInt(id), parseInt(id)]
            );
            if (productRefs.length > 0) throw new Error('REFERENCED');

            // ลบ Mapping ก่อน
            await connection.execute('DELETE FROM account_cost_center_mapping WHERE account_code = ?', [account_code]);
            
            // แล้วค่อยลบ Account หลัก
            const [result] = await connection.execute('DELETE FROM chart_of_accounts WHERE id = ?', [parseInt(id)]);
            if ((result as any).affectedRows === 0) throw new Error('NOT_FOUND');

            await connection.commit();
            return { action: 'deleteAccount', success: true, message: 'Account deleted.' };
        } catch (err: any) {
            await connection.rollback();
            if (err.message === 'REFERENCED') return fail(409, { action: 'deleteAccount', success: false, message: 'Cannot delete. Linked to products.' });
            if (err.message === 'NOT_FOUND') return fail(404, { action: 'deleteAccount', success: false, message: 'Not found.' });
            return fail(500, { action: 'deleteAccount', success: false, message: `Failed: ${err.message}` });
        } finally {
            connection.release();
        }
    }
};