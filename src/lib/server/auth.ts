import { error } from '@sveltejs/kit';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import { userHasAdminRole } from '$lib/userRole';

/**
 * All distinct role_ids for this user: `user_roles` plus legacy `users.role_id`.
 */
export async function getUserRoleIds(userId: number): Promise<number[]> {
	const [idRows] = await pool.execute<RowDataPacket[]>(
		`SELECT role_id FROM user_roles WHERE user_id = ?
		 UNION
		 SELECT u.role_id AS role_id FROM users u WHERE u.id = ? AND u.role_id IS NOT NULL`,
		[userId, userId]
	);
	return [
		...new Set(
			idRows
				.map((row) => Number(row.role_id))
				.filter((n) => Number.isInteger(n) && n > 0)
		)
	];
}

/**
 * Distinct role names assigned to the user (multi-role + primary).
 */
export async function getUserRoleNames(userId: number): Promise<string[]> {
	const [nameRows] = await pool.execute<RowDataPacket[]>(
		`SELECT DISTINCT r.name AS name
		 FROM user_roles ur
		 JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = ?
		 UNION
		 SELECT r.name AS name
		 FROM users u
		 JOIN roles r ON r.id = u.role_id
		 WHERE u.id = ? AND u.role_id IS NOT NULL`,
		[userId, userId]
	);
	return nameRows.map((row) => String(row.name ?? '')).filter((n) => n.length > 0);
}

/**
 * Fetches all permissions for a given user ID — union of every role in `user_roles` and `users.role_id`.
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
	try {
		const roleIds = await getUserRoleIds(userId);
		if (roleIds.length === 0) {
			return [];
		}
		const placeholders = roleIds.map(() => '?').join(', ');
		const [permissionRows] = await pool.execute<RowDataPacket[]>(
			`
            SELECT DISTINCT p.name
            FROM permissions p
            JOIN role_has_permissions rhp ON p.id = rhp.permission_id
            WHERE rhp.role_id IN (${placeholders})
        `,
			roleIds
		);

		return permissionRows.map((row) => row.name);
	} catch (err) {
		console.error('Failed to fetch user permissions:', err);
		return [];
	}
}

/**
 * Checks if the logged-in user has a specific permission.
 * Throws a 403 Forbidden error if the user is not logged in or lacks the permission.
 * @param locals The SvelteKit event.locals object.
 * @param requiredPermission The name of the permission to check for.
 */
export function checkPermission(locals: App.Locals, requiredPermission: string) {
	if (!locals.user) {
		throw error(401, 'Unauthorized: You must be logged in to perform this action.');
	}
	// Admin (primary or any `user_roles` row) bypasses permission checks.
	if (userHasAdminRole(locals.user) || locals.user.permissions.includes(requiredPermission)) {
		return; // User has permission
	}
	throw error(403, `Forbidden: You do not have the '${requiredPermission}' permission.`);
}
