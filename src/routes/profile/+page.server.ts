import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

type ProfileData = RowDataPacket & {
	id: number;
	username: string;
	email: string;
	role: string;
	full_name: string | null;
	emp_id: string | null;
	profile_image_url: string | null;
	department_name: string | null;
	position_name: string | null;
};

/**
 * [Load]
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const userId = locals.user.id;

	try {
		const [rows] = await pool.execute<ProfileData[]>(
			`
            SELECT
                u.id, u.username, u.email, u.profile_image_url,
                u.full_name, u.emp_id,
                r.name as role,
                d.name as department_name,
                p.name as position_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN positions p ON u.position_id = p.id
            WHERE u.id = ?
            LIMIT 1
        `,
			[userId]
		);

		if (rows.length === 0) {
			throw error(404, 'User profile not found.');
		}

		return {
			profile: rows[0]
		};
	} catch (err) {
		console.error('Failed to load user profile:', err);
		throw error(500, 'Could not load profile data.');
	}
};

/**
 * [Actions]
 */
export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(403, 'Forbidden');
		}

		const userId = locals.user.id;
		const data = await request.formData();

		const full_name = data.get('full_name')?.toString();
		const email = data.get('email')?.toString();
		const new_password = data.get('new_password')?.toString();
		const profile_image = data.get('profile_image') as File;

		if (!full_name || !email) {
			return fail(400, { success: false, message: 'Full name and Email are required.' });
		}

		let profile_image_url: string | undefined = undefined;
		let old_image_path: string | null = null;
		let uploadedFilePath: string | null = null;

		if (profile_image && profile_image.size > 0) {
			try {
				const [userRows] = await pool.execute<RowDataPacket[]>(
					'SELECT profile_image_url FROM users WHERE id = ?',
					[userId]
				);
				if (userRows.length > 0) {
					old_image_path = userRows[0].profile_image_url;
				}

				const fileExt = path.extname(profile_image.name);
				const fileName = `${uuidv4()}${fileExt}`;
				// 🔽🔽🔽 [แก้ไข] เปลี่ยน 'static' เป็น 'process.cwd()' 🔽🔽🔽
				const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');

				if (!fs.existsSync(uploadDir)) {
					fs.mkdirSync(uploadDir, { recursive: true });
				}

				uploadedFilePath = path.join(uploadDir, fileName);
				fs.writeFileSync(uploadedFilePath, Buffer.from(await profile_image.arrayBuffer()));

				profile_image_url = `/uploads/profiles/${fileName}`;
			} catch (err) {
				console.error('File upload failed:', err);
				return fail(500, { success: false, message: 'Failed to upload new profile image.' });
			}
		}

		try {
			const queryParams: any[] = [];
			const queryFields: string[] = [];

			queryFields.push('full_name = ?');
			queryParams.push(full_name);
			queryFields.push('email = ?');
			queryParams.push(email);

			if (profile_image_url) {
				queryFields.push('profile_image_url = ?');
				queryParams.push(profile_image_url);
			}

			if (new_password && new_password.length > 0) {
				if (new_password.length < 6) {
					return fail(400, {
						success: false,
						message: 'New password must be at least 6 characters.'
					});
				}
				const salt = await bcrypt.genSalt(10);
				const password_hash = await bcrypt.hash(new_password, salt);
				queryFields.push('password_hash = ?');
				queryParams.push(password_hash);
			}

			queryParams.push(userId);
			const sql = `UPDATE users SET ${queryFields.join(', ')} WHERE id = ?`;

			await pool.execute(sql, queryParams);

			if (profile_image_url && old_image_path) {
				// 🔽🔽🔽 [แก้ไข] เปลี่ยน 'static' เป็น 'process.cwd()' และใช้ path.basename 🔽🔽🔽
				const oldFilePath = path.join(process.cwd(), 'uploads', path.basename(old_image_path));
				if (fs.existsSync(oldFilePath)) {
					fs.unlinkSync(oldFilePath);
				}
			}

			return { success: true, message: 'Profile updated successfully!' };
		} catch (err: any) {
			console.error('Profile update failed:', err);

			if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
				// 🔽🔽🔽 [แก้ไข] (Bug fix) ลบไฟล์ที่เพิ่งอัปโหลด ถ้า DB พัง 🔽🔽🔽
				fs.unlinkSync(uploadedFilePath);
			}

			if (err.code === 'ER_DUP_ENTRY' && err.message.includes('email')) {
				return fail(409, {
					success: false,
					message: 'This email is already taken by another user.'
				});
			}

			return fail(500, { success: false, message: 'Failed to update profile.' });
		}
	}
};
