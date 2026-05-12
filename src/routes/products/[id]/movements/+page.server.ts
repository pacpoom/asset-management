import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

interface ProductRow extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	quantity_on_hand: number;
	unit_symbol: string | null;
	product_type: string;
}

interface MovementRow extends RowDataPacket {
	id: number;
	movement_type: string;
	qty_change: number;
	qty_before: number;
	qty_after: number;
	reference_type: string | null;
	reference_id: number | null;
	notes: string | null;
	user_id: number | null;
	user_name: string | null;
	created_at: string;
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	checkPermission(locals, 'view product stock history');

	const productId = parseInt(params.id, 10);
	if (isNaN(productId)) throw error(400, 'Invalid product id');

	const [productRows] = await pool.execute<ProductRow[]>(
		`SELECT p.id, p.sku, p.name, p.quantity_on_hand, u.symbol AS unit_symbol, p.product_type
		 FROM products p
		 LEFT JOIN units u ON p.unit_id = u.id
		 WHERE p.id = ?`,
		[productId]
	);
	if (productRows.length === 0) throw error(404, 'Product not found');

	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
	const limit = 50;
	const offset = (page - 1) * limit;
	const typeFilter = url.searchParams.get('type') || '';

	let where = ' WHERE m.product_id = ? ';
	const qParams: any[] = [productId];
	if (typeFilter) {
		where += ' AND m.movement_type = ? ';
		qParams.push(typeFilter);
	}

	const [countRes] = await pool.execute<any[]>(
		`SELECT COUNT(*) AS total FROM product_stock_movements m ${where}`,
		qParams
	);
	const total = Number(countRes[0]?.total || 0);
	const totalPages = Math.max(1, Math.ceil(total / limit));

	const [movements] = await pool.query<MovementRow[]>(
		`SELECT m.id, m.movement_type, m.qty_change, m.qty_before, m.qty_after,
		        m.reference_type, m.reference_id, m.notes, m.user_id, u.full_name AS user_name,
		        m.created_at
		 FROM product_stock_movements m
		 LEFT JOIN users u ON m.user_id = u.id
		 ${where}
		 ORDER BY m.created_at DESC, m.id DESC
		 LIMIT ? OFFSET ?`,
		[...qParams, limit, offset]
	);

	return {
		product: productRows[0],
		movements,
		page,
		totalPages,
		total,
		typeFilter
	};
};
