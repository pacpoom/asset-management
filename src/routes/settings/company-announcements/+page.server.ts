import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

type AnnouncementRow = RowDataPacket & {
	id: number;
	title: string;
	content: string;
	is_active: number;
	is_pinned: number;
	start_at: string | null;
	end_at: string | null;
	image_url: string | null;
	attachment_name: string | null;
	attachment_url: string | null;
	created_at: string;
	updated_at: string;
};
type AnnouncementImageRow = RowDataPacket & {
	id: number;
	announcement_id: number;
	image_url: string;
	sort_order: number;
};
type AnnouncementAttachmentRow = RowDataPacket & {
	id: number;
	announcement_id: number;
	file_name: string;
	file_url: string;
	sort_order: number;
};

const ANNOUNCEMENT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'announcements');

/** `datetime-local` → MySQL DATETIME (`YYYY-MM-DD HH:mm:ss`). */
function formDatetimeLocalToMysql(raw: string | null | undefined): string | null {
	const s = (raw ?? '').trim();
	if (!s) return null;
	let v = s.includes('T') ? s.replace('T', ' ') : s;
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) v = `${v}:00`;
	return v;
}

async function saveUpload(file: File): Promise<{ url: string; name: string }> {
	const ext = path.extname(file.name || '').toLowerCase();
	const safeExt = ext && ext.length <= 10 ? ext : '';
	const filename = `${Date.now()}-${randomUUID()}${safeExt}`;
	await mkdir(ANNOUNCEMENT_UPLOAD_DIR, { recursive: true });
	const bytes = new Uint8Array(await file.arrayBuffer());
	await writeFile(path.join(ANNOUNCEMENT_UPLOAD_DIR, filename), bytes);
	return { url: `/uploads/announcements/${filename}`, name: file.name || filename };
}

export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'manage settings');
	try {
		const [rows] = await pool.execute<AnnouncementRow[]>(
			`SELECT id, title, content, is_active, is_pinned, start_at, end_at, image_url, attachment_name, attachment_url, created_at, updated_at
			 FROM company_announcements
			 ORDER BY is_pinned DESC, updated_at DESC`
		);
		const ids = rows.map((r) => r.id);
		let images: AnnouncementImageRow[] = [];
		let attachments: AnnouncementAttachmentRow[] = [];
		if (ids.length > 0) {
			const [imgRows] = await pool.query<AnnouncementImageRow[]>(
				`SELECT id, announcement_id, image_url, sort_order
				 FROM company_announcement_images
				 WHERE announcement_id IN (?)
				 ORDER BY announcement_id ASC, sort_order ASC, id ASC`,
				[ids]
			);
			const [attRows] = await pool.query<AnnouncementAttachmentRow[]>(
				`SELECT id, announcement_id, file_name, file_url, sort_order
				 FROM company_announcement_attachments
				 WHERE announcement_id IN (?)
				 ORDER BY announcement_id ASC, sort_order ASC, id ASC`,
				[ids]
			);
			images = imgRows;
			attachments = attRows;
		}
		const imageMap = new Map<number, AnnouncementImageRow[]>();
		for (const i of images) {
			const list = imageMap.get(i.announcement_id) ?? [];
			list.push(i);
			imageMap.set(i.announcement_id, list);
		}
		const attachmentMap = new Map<number, AnnouncementAttachmentRow[]>();
		for (const a of attachments) {
			const list = attachmentMap.get(a.announcement_id) ?? [];
			list.push(a);
			attachmentMap.set(a.announcement_id, list);
		}
		return {
			announcements: rows.map((r) => ({
				...r,
				images: imageMap.get(r.id) ?? [],
				attachments: attachmentMap.get(r.id) ?? []
			}))
		};
	} catch (err) {
		console.error('load company-announcements error', err);
		throw error(500, 'Failed to load company announcements.');
	}
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		checkPermission(locals, 'manage settings');
		const fd = await request.formData();
		const id = Number(fd.get('id')?.toString() || 0);
		const title = (fd.get('title')?.toString() || '').trim();
		const content = (fd.get('content')?.toString() || '').trim();
		const isPinned = fd.get('is_pinned')?.toString() === '1' ? 1 : 0;
		const isActive = fd.get('is_active')?.toString() === '0' ? 0 : 1;
		const startAt = formDatetimeLocalToMysql(fd.get('start_at')?.toString());
		const endAt = formDatetimeLocalToMysql(fd.get('end_at')?.toString());
		const imageFiles = fd
			.getAll('image_files')
			.filter((v): v is File => v instanceof File && v.size > 0);
		const attachmentFiles = fd
			.getAll('attachment_files')
			.filter((v): v is File => v instanceof File && v.size > 0);

		if (!title || !content) {
			return fail(400, { success: false, message: 'Title and content are required.' });
		}

		try {
			const uploadedImages: { url: string; name: string }[] = [];
			for (const f of imageFiles) {
				uploadedImages.push(await saveUpload(f));
			}
			const uploadedAttachments: { url: string; name: string }[] = [];
			for (const f of attachmentFiles) {
				uploadedAttachments.push(await saveUpload(f));
			}

			if (id > 0) {
				const [existRows] = await pool.execute<AnnouncementRow[]>(
					`SELECT image_url, attachment_name, attachment_url FROM company_announcements WHERE id = ? LIMIT 1`,
					[id]
				);
				const current = existRows[0];
				await pool.execute(
					`UPDATE company_announcements
					 SET title = ?, content = ?, is_pinned = ?, is_active = ?, start_at = ?, end_at = ?,
					     image_url = ?, attachment_name = ?, attachment_url = ?
					 WHERE id = ?`,
					[
						title,
						content,
						isPinned,
						isActive,
						startAt,
						endAt,
						current?.image_url ?? null,
						current?.attachment_name ?? null,
						current?.attachment_url ?? null,
						id
					]
				);
				for (const [idx, img] of uploadedImages.entries()) {
					await pool.execute(
						`INSERT INTO company_announcement_images (announcement_id, image_url, sort_order) VALUES (?, ?, ?)`,
						[id, img.url, idx]
					);
				}
				for (const [idx, att] of uploadedAttachments.entries()) {
					await pool.execute(
						`INSERT INTO company_announcement_attachments (announcement_id, file_name, file_url, sort_order) VALUES (?, ?, ?, ?)`,
						[id, att.name, att.url, idx]
					);
				}
				return { success: true, message: 'Announcement updated.' };
			}

			const [insertResult] = await pool.execute<ResultSetHeader>(
				`INSERT INTO company_announcements
				 (title, content, is_pinned, is_active, start_at, end_at, image_url, attachment_name, attachment_url, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					title,
					content,
					isPinned,
					isActive,
					startAt,
					endAt,
					null,
					null,
					null,
					locals.user?.id || null
				]
			);
			const announcementId = Number(insertResult.insertId || 0);
			for (const [idx, img] of uploadedImages.entries()) {
				await pool.execute(
					`INSERT INTO company_announcement_images (announcement_id, image_url, sort_order) VALUES (?, ?, ?)`,
					[announcementId, img.url, idx]
				);
			}
			for (const [idx, att] of uploadedAttachments.entries()) {
				await pool.execute(
					`INSERT INTO company_announcement_attachments (announcement_id, file_name, file_url, sort_order) VALUES (?, ?, ?, ?)`,
					[announcementId, att.name, att.url, idx]
				);
			}
			return { success: true, message: 'Announcement created.' };
		} catch (err: any) {
			console.error('save company-announcements error', err);
			const detail = err?.sqlMessage || err?.message;
			return fail(500, {
				success: false,
				message: detail ? `Failed to save announcement. ${detail}` : 'Failed to save announcement.'
			});
		}
	},

	delete: async ({ request, locals }) => {
		checkPermission(locals, 'manage settings');
		const fd = await request.formData();
		const id = Number(fd.get('id')?.toString() || 0);
		if (!id) return fail(400, { success: false, message: 'Invalid id.' });

		await pool.execute(`DELETE FROM company_announcements WHERE id = ?`, [id]);
		return { success: true, message: 'Announcement deleted.' };
	},

	deleteImage: async ({ request, locals }) => {
		checkPermission(locals, 'manage settings');
		const fd = await request.formData();
		const id = Number(fd.get('id')?.toString() || 0);
		if (!id) return fail(400, { success: false, message: 'Invalid image id.' });
		await pool.execute(`DELETE FROM company_announcement_images WHERE id = ?`, [id]);
		return { success: true, message: 'Image removed.' };
	},

	deleteAttachment: async ({ request, locals }) => {
		checkPermission(locals, 'manage settings');
		const fd = await request.formData();
		const id = Number(fd.get('id')?.toString() || 0);
		if (!id) return fail(400, { success: false, message: 'Invalid attachment id.' });
		await pool.execute(`DELETE FROM company_announcement_attachments WHERE id = ?`, [id]);
		return { success: true, message: 'Attachment removed.' };
	}
};
