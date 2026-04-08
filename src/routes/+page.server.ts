import { fail, error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkAnyPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import { shouldLoadAssetDashboard, getFallbackHomePath } from '$lib/postLoginRedirect';

type AnnouncementRow = RowDataPacket & {
	id: number;
	title: string;
	content: string;
	is_pinned: number;
	start_at: string | null;
	end_at: string | null;
	image_url: string | null;
	attachment_name: string | null;
	attachment_url: string | null;
	created_at: string;
};
type AnnouncementImageRow = RowDataPacket & {
	announcement_id: number;
	image_url: string;
	sort_order: number;
};
type AnnouncementAttachmentRow = RowDataPacket & {
	announcement_id: number;
	file_name: string;
	file_url: string;
	sort_order: number;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	// ผู้ใช้ที่ไม่มี view dashboard / view dashboard news ไปหน้าแรกที่เข้าได้ (เช่น IsoDocs) แทน 403
	if (!shouldLoadAssetDashboard(locals.user)) {
		throw redirect(303, getFallbackHomePath(locals.user));
	}
	checkAnyPermission(locals, ['view dashboard', 'view dashboard news']);

	try {
		const [
			assetsCountResult,
			vendorsCountResult,
			usersCountResult,
			pendingPrCountResult,
			categoryStatsResult,
			locationStatsResult,
			announcementRowsResult
		] = await Promise.allSettled([
			pool.execute<any[]>('SELECT COUNT(*) as total FROM assets'),
			pool.execute<any[]>('SELECT COUNT(*) as total FROM vendors'),
			pool.execute<any[]>('SELECT COUNT(*) as total FROM users'),
			pool.execute<any[]>('SELECT COUNT(*) as total FROM purchase_requests WHERE status = "PENDING"'),
			pool.execute<any[]>(`
				SELECT ac.name, COUNT(a.id) as count 
				FROM assets a 
				JOIN asset_categories ac ON a.category_id = ac.id 
				GROUP BY ac.name
			`),
			pool.execute<any[]>(`
				SELECT al.name, COUNT(a.id) as count 
				FROM assets a 
				JOIN asset_locations al ON a.location_id = al.id 
				GROUP BY al.name
			`),
			pool.execute<AnnouncementRow[]>(
				`SELECT id, title, content, is_pinned, start_at, end_at, image_url, attachment_name, attachment_url, created_at
				 FROM company_announcements
				 WHERE is_active = 1
				 ORDER BY is_pinned DESC, COALESCE(start_at, created_at) DESC, created_at DESC
				 LIMIT 8`
			)
		]);

		const assetsCount =
			assetsCountResult.status === 'fulfilled' ? Number(assetsCountResult.value[0][0]?.total || 0) : 0;
		const vendorsCount =
			vendorsCountResult.status === 'fulfilled' ? Number(vendorsCountResult.value[0][0]?.total || 0) : 0;
		const usersCount =
			usersCountResult.status === 'fulfilled' ? Number(usersCountResult.value[0][0]?.total || 0) : 0;
		const pendingPrCount =
			pendingPrCountResult.status === 'fulfilled'
				? Number(pendingPrCountResult.value[0][0]?.total || 0)
				: 0;
		const categoryStats = categoryStatsResult.status === 'fulfilled' ? categoryStatsResult.value[0] : [];
		const locationStats = locationStatsResult.status === 'fulfilled' ? locationStatsResult.value[0] : [];
		const announcementRows =
			announcementRowsResult.status === 'fulfilled' ? announcementRowsResult.value[0] : [];
		const announcementIds = announcementRows.map((r) => r.id);
		let imageRows: AnnouncementImageRow[] = [];
		let attachmentRows: AnnouncementAttachmentRow[] = [];
		if (announcementIds.length > 0) {
			const [imgRows] = await pool.query<AnnouncementImageRow[]>(
				`SELECT announcement_id, image_url, sort_order
				 FROM company_announcement_images
				 WHERE announcement_id IN (?)
				 ORDER BY announcement_id ASC, sort_order ASC, id ASC`,
				[announcementIds]
			);
			const [attRows] = await pool.query<AnnouncementAttachmentRow[]>(
				`SELECT announcement_id, file_name, file_url, sort_order
				 FROM company_announcement_attachments
				 WHERE announcement_id IN (?)
				 ORDER BY announcement_id ASC, sort_order ASC, id ASC`,
				[announcementIds]
			);
			imageRows = imgRows;
			attachmentRows = attRows;
		}
		const imageMap = new Map<number, AnnouncementImageRow[]>();
		for (const i of imageRows) {
			const list = imageMap.get(i.announcement_id) ?? [];
			list.push(i);
			imageMap.set(i.announcement_id, list);
		}
		const attachmentMap = new Map<number, AnnouncementAttachmentRow[]>();
		for (const a of attachmentRows) {
			const list = attachmentMap.get(a.announcement_id) ?? [];
			list.push(a);
			attachmentMap.set(a.announcement_id, list);
		}

		return {
			totalAssets: assetsCount,
			totalVendors: vendorsCount,
			totalUsers: usersCount,
			pendingPRs: pendingPrCount,
			assetsByCategory: categoryStats,
			assetsByLocation: locationStats,
			announcements: announcementRows.map((r) => ({
				...r,
				images: imageMap.get(r.id) ?? [],
				attachments: attachmentMap.get(r.id) ?? []
			}))
		};
	} catch (err: any) {
		console.error('Dashboard Load Error:', err);
		return {
			totalAssets: 0,
			totalVendors: 0,
			totalUsers: 0,
			pendingPRs: 0,
			assetsByCategory: [],
			assetsByLocation: [],
			announcements: []
		};
	}
};