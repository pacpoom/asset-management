import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
// import { checkPermission } from '$lib/server/auth';

interface DashboardStats {
	totalStockQty: number;
	totalUniqueItems: number;
	totalLocations: number;
	occupiedLocations: number;
	emptyLocations: number;
	todayTransactions: number;
}

interface RecentTransaction extends RowDataPacket {
	id: number;
	transaction_type: string;
	item_code: string;
	item_name: string;
	location_code: string;
	qty_change: number;
	created_at: string;
}

interface StockOverview extends RowDataPacket {
	item_code: string;
	item_name: string;
	total_qty: number;
}

export const load: PageServerLoad = async ({ locals }) => {
	// checkPermission(locals, 'view dashboard');

	try {
		// 1. สรุปข้อมูล Stock
		const [stockStatsRows] = await pool.execute<RowDataPacket[]>(
			'SELECT COUNT(DISTINCT item_id) as total_items, SUM(qty) as total_qty FROM inventory_stock WHERE qty > 0'
		);
		const totalUniqueItems = stockStatsRows[0].total_items || 0;
		const totalStockQty = stockStatsRows[0].total_qty || 0;

		// 2. สรุปข้อมูล Location
		const [locTotalRows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(id) as total FROM locations');
		const totalLocations = locTotalRows[0].total || 0;

		const [locOccupiedRows] = await pool.execute<RowDataPacket[]>(
			'SELECT COUNT(DISTINCT location_id) as occupied FROM inventory_stock WHERE qty > 0'
		);
		const occupiedLocations = locOccupiedRows[0].occupied || 0;
		const emptyLocations = totalLocations - occupiedLocations;

		// 3. สรุป Transaction วันนี้ (อิงตาม Timezone ของ DB หรือปรับใช้ date ฝั่ง JS ถ้ายึดตามเครื่อง)
		const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).split(' ')[0];
		const [txTodayRows] = await pool.execute<RowDataPacket[]>(
			'SELECT COUNT(id) as today_tx FROM transaction_logs WHERE DATE(created_at) = ?',
			[todayStr]
		);
		const todayTransactions = txTodayRows[0].today_tx || 0;

		// 4. ดึงรายการ Transaction 10 รายการล่าสุด
		const [recentTransactions] = await pool.execute<RecentTransaction[]>(`
			SELECT 
				t.id, t.transaction_type, t.qty_change, t.created_at,
				i.item_code, i.item_name,
				l.location_code
			FROM transaction_logs t
			LEFT JOIN items i ON t.item_id = i.id
			LEFT JOIN locations l ON t.location_id = l.id
			ORDER BY t.created_at DESC
			LIMIT 8
		`);

		// 5. ดึงรายการสินค้าที่มีจำนวน Stock มากที่สุด 5 อันดับ (Top Stock)
		const [topStocks] = await pool.execute<StockOverview[]>(`
			SELECT 
				i.item_code, i.item_name, SUM(inv.qty) as total_qty
			FROM inventory_stock inv
			LEFT JOIN items i ON inv.item_id = i.id
			GROUP BY inv.item_id
			HAVING total_qty > 0
			ORDER BY total_qty DESC
			LIMIT 5
		`);

		const stats: DashboardStats = {
			totalStockQty,
			totalUniqueItems,
			totalLocations,
			occupiedLocations,
			emptyLocations,
			todayTransactions
		};

		return {
			stats,
			recentTransactions,
			topStocks
		};
	} catch (err: any) {
		console.error('Failed to load dashboard data:', err);
		throw error(500, `Failed to load dashboard data. Error: ${err.message}`);
	}
};