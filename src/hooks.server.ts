import type { Handle } from '@sveltejs/kit';
import pool from '$lib/server/database';
// NEW: Import the permission fetcher
import { getUserPermissions } from '$lib/server/auth';

/**
 * This is the server 'handle' hook, which runs before every request to the server.
 * It's the ideal place to handle authentication and enrich the `event.locals` object.
 */
export const handle: Handle = async ({ event, resolve }) => {
	// 1. Get session_id from the cookie
	const sessionId = event.cookies.get('session_id');

	// 2. If a session_id exists, fetch user data from the database
	if (sessionId) {
		try {
			// MODIFIED: Join with roles table to get role name from role_id
			const [rows]: any[] = await pool.execute(
				`SELECT u.id, u.email, r.name as role 
				 FROM users u
				 JOIN roles r ON u.role_id = r.id
				 WHERE u.id = ? LIMIT 1`,
				[sessionId]
			);
			const userData = rows[0];

			// 3. If user data is found, populate event.locals
			// This makes user data available in all server-side loads and actions.
			if (userData) {
				// NEW: Fetch user's permissions
				const permissions = await getUserPermissions(userData.id);

				event.locals.user = {
					id: userData.id,
					email: userData.email,
					role: userData.role,
					permissions: permissions // Add permissions to the user object
				};
			}
		} catch (err) {
			console.error('[hooks.server.ts] Database error during session check:', err);
		}
	}

	// 4. Call resolve(event) to allow SvelteKit to continue processing the request.
	// This step is crucial; without it, SvelteKit will halt.
	const response = await resolve(event);
	return response;
};
