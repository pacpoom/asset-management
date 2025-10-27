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
 * Loads all chart of accounts records with Server-Side Filtering.
 */
export const load: PageServerLoad = async ({ locals, url }) => { // Added 'url' to access search parameters
    // Permission Check: Assuming 'manage settings' or a dedicated 'manage chart of accounts' permission
    checkPermission(locals, 'manage settings');

    // 1. Get filter parameters from URL
    const search = url.searchParams.get('search')?.toString()?.trim() || '';
    const type = url.searchParams.get('type')?.toString()?.trim() || '';
    const activeStatus = url.searchParams.get('active')?.toString()?.trim() || 'all';

    let sqlQuery = `
        SELECT id, account_code, account_name, account_type, description, is_active
        FROM chart_of_accounts
    `;
    const params: (string | number)[] = [];
    const whereClauses: string[] = [];

    // 2. Add WHERE LIKE clauses based on search input
    if (search) {
        const likeSearch = `%${search}%`;
        whereClauses.push(`(account_code LIKE ? OR account_name LIKE ?)`);
        params.push(likeSearch, likeSearch);
    }
    
    // 3. Add Account Type filter
    if (type) {
        whereClauses.push(`account_type = ?`);
        params.push(type);
    }

    // 4. Add Active Status filter
    if (activeStatus !== 'all') {
        whereClauses.push(`is_active = ?`);
        params.push(activeStatus === 'active' ? 1 : 0);
    }

    // Combine WHERE clauses
    if (whereClauses.length > 0) {
        sqlQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sqlQuery += ` ORDER BY account_code ASC`;

    try {
        console.log('--- Executing SQL Query for Chart of Accounts (Server Filtered) ---');
        console.log('SQL:', sqlQuery.replace(/\s+/g, ' ').trim());
        console.log('Parameters:', params);
        
        const [accounts] = await pool.execute<ChartOfAccount[]>(sqlQuery, params);
        
        // Data cleaning (trimming is still important)
        const formattedAccounts = accounts.map(acc => ({
            ...acc,
            account_name: acc.account_name.trim(),
            account_type: acc.account_type.trim(),
            is_active: Boolean(acc.is_active)
        }));
        
        console.log(`Query returned ${accounts.length} account(s).`);
        if (formattedAccounts.length > 0) {
            console.log('Sample account data (Cleaned):', formattedAccounts[0].account_code, formattedAccounts[0].account_name, formattedAccounts[0].account_type);
        }
        console.log(`Returning ${formattedAccounts.length} formatted account(s) to the client.`);


        return {
            accounts: formattedAccounts,
            accountTypes: ACCOUNT_TYPES, // Pass predefined types for the dropdown
            // Also pass filter states back to the client for UI sync
            filters: { search, type, activeStatus }
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