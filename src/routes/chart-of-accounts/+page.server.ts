import { fail, error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definition for ChartOfAccount
interface ChartOfAccount extends RowDataPacket {
    id: number;
    account_code: string;
    account_name: string;
    account_type: string; // Consider using a specific ENUM or string literal union if types are fixed
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// Define common account types (adjust as needed for your system)
const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense', 'Cost of Goods Sold'];

/**
 * Loads all chart of accounts records.
 */
export const load: PageServerLoad = async ({ locals }) => {
    // Permission Check: Assuming 'manage settings' or a dedicated 'manage chart of accounts' permission
    checkPermission(locals, 'manage settings');

    try {
        const [accounts] = await pool.execute<ChartOfAccount[]>(
            `SELECT id, account_code, account_name, account_type, description, is_active
             FROM chart_of_accounts
             ORDER BY account_code ASC`
        );

        // Convert is_active to boolean if it's stored as TINYINT(1)
        const formattedAccounts = accounts.map(acc => ({
            ...acc,
            is_active: Boolean(acc.is_active)
        }));

        return {
            accounts: formattedAccounts,
            accountTypes: ACCOUNT_TYPES // Pass predefined types for the dropdown
        };
    } catch (err: any) {
        console.error('Failed to load chart of accounts data:', err.message, err.stack);
        throw error(500, `Failed to load data from the server. Error: ${err.message}`);
    }
};

/**
 * Actions for saving and deleting chart of accounts entries.
 */
export const actions: Actions = {
    /**
     * Save a new or existing account.
     */
    saveAccount: async ({ request, locals }) => {
        // Permission Check
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const account_code = data.get('account_code')?.toString()?.trim();
        const account_name = data.get('account_name')?.toString()?.trim();
        const account_type = data.get('account_type')?.toString()?.trim();
        const description = data.get('description')?.toString()?.trim() || null;
        // Checkbox value needs careful handling
        const is_active = data.get('is_active') === 'on' || data.get('is_active') === 'true'; // 'on' is default for checkbox

        // --- Validation ---
        if (!account_code || !account_name || !account_type) {
            return fail(400, {
                action: 'saveAccount', success: false, message: 'Account Code, Name, and Type are required.'
            });
        }
        if (!ACCOUNT_TYPES.includes(account_type)) {
             return fail(400, {
                action: 'saveAccount', success: false, message: 'Invalid Account Type selected.'
            });
        }
        // Add more validation as needed (e.g., code format)

        try {
            const params = [account_code, account_name, account_type, description, is_active ? 1 : 0];

            if (id) {
                // Update
                await pool.execute(
                    `UPDATE chart_of_accounts SET
                        account_code = ?, account_name = ?, account_type = ?, description = ?, is_active = ?
                     WHERE id = ?`,
                    [...params, parseInt(id)]
                );
            } else {
                // Insert
                await pool.execute(
                    `INSERT INTO chart_of_accounts
                        (account_code, account_name, account_type, description, is_active)
                     VALUES (?, ?, ?, ?, ?)`,
                    params
                );
            }
            return { action: 'saveAccount', success: true, message: `Account '${account_name}' saved successfully!` };
        } catch (err: any) {
            console.error('Database error on saving account:', err.message, err.stack);
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(409, {
                    action: 'saveAccount', success: false, message: 'An account with this Account Code already exists.'
                });
            }
            return fail(500, {
                action: 'saveAccount', success: false, message: `Failed to save account. Error: ${err.message}`
            });
        }
    },

    /**
     * Delete an account.
     */
    deleteAccount: async ({ request, locals }) => {
        // Permission Check
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) {
            return fail(400, { action: 'deleteAccount', success: false, message: 'Invalid account ID.' });
        }
        const accountId = parseInt(id);

        try {
            // **Important Check**: Prevent deletion if referenced by products table
            const [productRefs] = await pool.execute<RowDataPacket[]>(
                `SELECT id FROM products
                 WHERE asset_account_id = ? OR income_account_id = ? OR expense_account_id = ?
                 LIMIT 1`,
                [accountId, accountId, accountId]
            );

            if (productRefs.length > 0) {
                 return fail(409, {
                    action: 'deleteAccount', success: false,
                    message: 'Cannot delete. This account is linked to one or more products.'
                });
            }

            // Add similar checks for other tables if this account is used elsewhere (e.g., transactions)

            // Proceed with deletion
            const [result] = await pool.execute('DELETE FROM chart_of_accounts WHERE id = ?', [accountId]);

            if ((result as any).affectedRows === 0) {
                return fail(404, { action: 'deleteAccount', success: false, message: 'Account not found.' });
            }

            // No redirect needed here, let $effect handle UI update via invalidateAll
            return { action: 'deleteAccount', success: true, message: 'Account deleted successfully.' };
        } catch (err: any) {
            console.error(`Error deleting account ID ${accountId}: ${err.message}`, err.stack);
             if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                 // Catch potential FK constraints from other tables not checked above
                return fail(409, {
                    action: 'deleteAccount', success: false,
                    message: 'Cannot delete account. It is referenced in other parts of the system.'
                });
            }
            return fail(500, {
                action: 'deleteAccount', success: false, message: `Failed to delete account. Error: ${err.message}`
            });
        }
    }
};
