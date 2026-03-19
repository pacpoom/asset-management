import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
// import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

interface TransactionLog extends RowDataPacket {
	id: number;
	transaction_type: string;
	item_id: number;
	location_id: number;
	serial_number: string | null;
	qty_change: number;
	notes: string | null;
	created_at: string;
	// Joined
	item_code?: string;
	item_name?: string;
	location_code?: string;
	unit_name?: string;
	unit_symbol?: string;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	// checkPermission(locals, 'view transaction logs');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const startDate = url.searchParams.get('startDate') || '';
	const endDate = url.searchParams.get('endDate') || '';

	let limit = parseInt(url.searchParams.get('limit') || '50', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) limit = 50;
	const offset = (page - 1) * limit;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		if (searchQuery) {
			whereClause += ` AND (
                t.serial_number LIKE ? OR
                i.item_code LIKE ? OR
                i.item_name LIKE ? OR
                l.location_code LIKE ? OR
                t.transaction_type LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND DATE(t.created_at) >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND DATE(t.created_at) <= ? `;
			params.push(endDate);
		}

		const countSql = `
            SELECT COUNT(t.id) as total 
            FROM transaction_logs t
            LEFT JOIN items i ON t.item_id = i.id
            LEFT JOIN locations l ON t.location_id = l.id
            ${whereClause}
        `;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		const logsSql = `
            SELECT
                t.*,
                i.item_code, i.item_name,
                u.name AS unit_name, u.symbol AS unit_symbol,
                l.location_code
            FROM transaction_logs t
            LEFT JOIN items i ON t.item_id = i.id
            LEFT JOIN units u ON i.unit_id = u.id
            LEFT JOIN locations l ON t.location_id = l.id
            ${whereClause}
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [logRows] = await pool.execute<TransactionLog[]>(logsSql, params);

		return {
			logs: logRows,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			startDate,
			endDate
		};
	} catch (err: any) {
		console.error('Failed to load transaction logs:', err);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};