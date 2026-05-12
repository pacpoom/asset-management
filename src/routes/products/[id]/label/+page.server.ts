import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import QRCode from 'qrcode';

interface ProductRow extends RowDataPacket {
	id: number;
	sku: string;
	barcode: string | null;
	name: string;
	purchase_cost: number | null;
	selling_price: number | null;
	unit_symbol: string | null;
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	checkPermission(locals, 'view products');

	const productId = parseInt(params.id, 10);
	if (isNaN(productId)) throw error(400, 'Invalid product id');

	const [rows] = await pool.execute<ProductRow[]>(
		`SELECT p.id, p.sku, p.barcode, p.name, p.purchase_cost, p.selling_price, u.symbol AS unit_symbol
		 FROM products p
		 LEFT JOIN units u ON p.unit_id = u.id
		 WHERE p.id = ?`,
		[productId]
	);
	if (rows.length === 0) throw error(404, 'Product not found');
	const product = rows[0];

	const type = url.searchParams.get('type') || 'qr'; // 'qr' (only QR for now)
	const copies = Math.max(1, Math.min(60, parseInt(url.searchParams.get('copies') || '1', 10)));

	const payload = product.barcode || product.sku;
	const qrDataUrl = await QRCode.toDataURL(payload, {
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 256
	});

	return {
		product,
		type,
		copies,
		qrDataUrl
	};
};
