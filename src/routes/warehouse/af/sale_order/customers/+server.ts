import type { RequestHandler } from './$types';
import { afpool } from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const search = url.searchParams.get('q')?.trim() || '';

	let sql = `
		SELECT customer_code, customer_name
		FROM customer_masters
		WHERE customer_code IS NOT NULL
		  AND customer_code != ''
	`;
	const values: string[] = [];

	if (search) {
		sql += ' AND (customer_code LIKE ? OR customer_name LIKE ?)';
		values.push(`%${search}%`, `%${search}%`);
	}

	sql += ' ORDER BY customer_code ASC LIMIT 50';

	const [rows] = await afpool.execute<RowDataPacket[]>(sql, values);
	return json(rows);
};
