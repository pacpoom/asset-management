import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import { getUserPermissions, getUserRoleNames } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname === '/api/line/webhook') {
		return resolve(event);
	}

	const sessionId = event.cookies.get('session_id');
	const sessionToken = event.cookies.get('session_token');

	if (sessionId) {
		try {
			const baseSql = `SELECT u.id, u.username, u.email, u.full_name, u.profile_image_url, u.current_session_token, r.name AS role
				 FROM users u
				 LEFT JOIN roles r ON u.role_id = r.id
				 WHERE u.id = ? LIMIT 1`;
			let rows: any[];
			let isoSection: string | null = null;
			try {
				const [withIso]: any[] = await pool.execute(
					`SELECT u.id, u.username, u.email, u.full_name, u.profile_image_url, u.current_session_token, u.iso_section, r.name AS role
					 FROM users u
					 LEFT JOIN roles r ON u.role_id = r.id
					 WHERE u.id = ? LIMIT 1`,
					[sessionId]
				);
				rows = withIso;
				isoSection = withIso[0]?.iso_section ?? null;
			} catch (e: any) {
				if (e?.errno === 1054 && String(e?.sqlMessage || '').includes('iso_section')) {
					const [withoutIso]: any[] = await pool.execute(baseSql, [sessionId]);
					rows = withoutIso;
				} else {
					throw e;
				}
			}

			const userData = rows[0];

			if (userData) {
				const isSuperAdmin =
					userData.role === 'admin' &&
					(userData.username === 'admin' || userData.email === 'admin');

				if (!isSuperAdmin && userData.current_session_token !== sessionToken) {
					event.cookies.delete('session_id', { path: '/' });
					event.cookies.delete('session_token', { path: '/' });
					throw redirect(303, '/login?kicked_out=true');
				}

				const [roleNames, permissions] = await Promise.all([
					getUserRoleNames(userData.id),
					getUserPermissions(userData.id)
				]);

				event.locals.user = {
					id: userData.id,
					email: userData.email,
					full_name: userData.full_name,
					profile_image_url: userData.profile_image_url,
					role: userData.role ?? 'user',
					roleNames,
					permissions,
					iso_section: isoSection
				};
			}
		} catch (err: any) {
			if (err?.status === 303 || err?.status === 302 || err?.location) {
				throw err;
			}
			console.error('[hooks.server.ts] Database error during session check:', err);
		}
	}

	return await resolve(event);
};
