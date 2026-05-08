import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import bcrypt from 'bcrypt';
import type { RowDataPacket } from 'mysql2';
import { safeInternalRedirect } from '$lib/safeRedirect';
import { dev } from '$app/environment';

interface CompanyLogo extends RowDataPacket {
	logo_path: string | null;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const sessionId = cookies.get('session_id');
	if (sessionId) {
		const next = safeInternalRedirect(url.searchParams.get('redirect'));
		throw redirect(303, next || '/');
	}

	let companyLogoPath: string | null = null;
	try {
		const [companyRows] = await pool.execute<CompanyLogo[]>(
			`SELECT logo_path FROM company WHERE id = ? LIMIT 1`,
			[1]
		);
		if (companyRows.length > 0) {
			companyLogoPath = companyRows[0].logo_path;
		}
	} catch (err) {
		console.error('[login/+page.server.ts] Failed to load company logo:', err);
	}

	const redirectTarget = safeInternalRedirect(url.searchParams.get('redirect')) || '';

	return {
		companyLogoPath,
		redirectTarget
	};
};

export const actions: Actions = {
	login: async ({ cookies, request, url }) => {
		const data = await request.formData();
		const identifier = data.get('identifier')?.toString();
		const password = data.get('password')?.toString();

		if (!identifier || !password) {
			return fail(400, {
				message: 'Please enter credentials',
				identifier: identifier as string
			});
		}

		try {
			const [rows]: any[] = await pool.execute(
				'SELECT u.*, r.name AS role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.email = ? OR u.username = ? LIMIT 1',
				[identifier, identifier]
			);
			const user = rows[0];

			if (!user) {
				return fail(401, { message: 'Invalid credentials', identifier }); // 🌟 เปลี่ยนเป็น Translation Key
			}

			if (user.is_locked || user.failed_attempts >= 3) {
				return fail(403, {
					isLocked: true,
					message: 'Account locked',
					identifier
				});
			}

			const passwordMatch = await bcrypt.compare(password, user.password_hash);

			if (!passwordMatch) {
				const newFailedAttempts = (user.failed_attempts || 0) + 1;
				let isLocked = 0;

				if (newFailedAttempts >= 3) {
					isLocked = 1;
				}

				await pool.execute('UPDATE users SET failed_attempts = ?, is_locked = ? WHERE id = ?', [
					newFailedAttempts,
					isLocked,
					user.id
				]);

				if (isLocked) {
					return fail(403, {
						isLocked: true,
						message: 'Account locked',
						identifier
					});
				}

				return fail(401, {
					message: 'Invalid credentials',
					attemptsLeft: 3 - newFailedAttempts,
					identifier
				});
			}

			if (user.failed_attempts > 0 || user.is_locked) {
				await pool.execute('UPDATE users SET failed_attempts = 0, is_locked = 0 WHERE id = ?', [
					user.id
				]);
			}

			const sessionToken = crypto.randomUUID();

			const isSuperAdmin =
				(user.username === 'admin' || user.email === 'admin') && user.role === 'admin';

			if (!isSuperAdmin) {
				await pool.execute('UPDATE users SET current_session_token = ? WHERE id = ?', [
					sessionToken,
					user.id
				]);
			}

			cookies.set('session_id', String(user.id), {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: !dev,
				maxAge: 60 * 60 * 24 * 7
			});

			cookies.set('session_token', sessionToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: !dev,
				maxAge: 60 * 60 * 24 * 7
			});

			const next =
				safeInternalRedirect(data.get('redirect')?.toString()) ||
				safeInternalRedirect(url.searchParams.get('redirect'));
			throw redirect(303, next || '/');
		} catch (err) {
			if (isRedirect(err)) throw err;
			console.error(err);
			return fail(400, {
				message: 'System connection error',
				identifier: identifier as string
			});
		}
	},

	logout: async ({ cookies }) => {
		cookies.delete('session_id', { path: '/' });
		cookies.delete('session_token', { path: '/' });
		throw redirect(303, '/login');
	}
};
