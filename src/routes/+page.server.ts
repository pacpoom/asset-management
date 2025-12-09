import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [
			[assetsCount],
			[vendorsCount],
			[usersCount],
			[pendingPrCount],
			[categoryStats],
			[locationStats]
		] = await Promise.all([
			pool.execute<any[]>('SELECT COUNT(*) as total FROM assets'),
			pool.execute<any[]>('SELECT COUNT(*) as total FROM vendors'),
			pool.execute<any[]>('SELECT COUNT(*) as total FROM users'),
			pool.execute<any[]>(
				'SELECT COUNT(*) as total FROM purchase_requests WHERE status = "PENDING"'
			),
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
			`)
		]);

		return {
			totalAssets: assetsCount[0].total,
			totalVendors: vendorsCount[0].total,
			totalUsers: usersCount[0].total,
			pendingPRs: pendingPrCount[0].total,
			assetsByCategory: categoryStats,
			assetsByLocation: locationStats
		};
	} catch (err: any) {
		console.error('Dashboard Load Error:', err);
		return {
			totalAssets: 0,
			totalVendors: 0,
			totalUsers: 0,
			pendingPRs: 0,
			assetsByCategory: [],
			assetsByLocation: []
		};
	}
};
