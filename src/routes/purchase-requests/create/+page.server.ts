import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface Department extends RowDataPacket {
	name: string;
}
interface Product extends RowDataPacket {
	id: number;
	sku: string;
	name: string;
	price: number;
	unit_id: number | null;
	unit_name: string | null;
}
interface Unit extends RowDataPacket {
	id: number;
	name: string;
	symbol: string | null;
}

async function generatePRNumber(): Promise<string> {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const prefix = `PR-${year}${month}-`;

	const [rows] = await pool.query<RowDataPacket[]>(
		`SELECT pr_number FROM purchase_requests WHERE pr_number LIKE ? ORDER BY pr_number DESC LIMIT 1`,
		[`${prefix}%`]
	);

	if (rows.length > 0) {
		const lastNumber = rows[0].pr_number;
		const sequence = parseInt(lastNumber.split('-')[2]) + 1;
		return `${prefix}${String(sequence).padStart(4, '0')}`;
	} else {
		return `${prefix}0001`;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'view vendors');

	try {
		const nextPRNumber = await generatePRNumber();

		// ดึงแผนก
		const [departments] = await pool.query<Department[]>(
			'SELECT name FROM departments ORDER BY name ASC'
		);

		// ดึงสินค้า
		const [products] = await pool.query<Product[]>(`
            SELECT 
                p.id, 
                p.sku, 
                p.name, 
                p.purchase_cost AS price, 
                p.unit_id,
                u.name AS unit_name
            FROM products p
            LEFT JOIN units u ON p.unit_id = u.id
            WHERE p.is_active = 1
            ORDER BY p.name ASC
        `);

		//ดึงหน่วยนับ
		const [units] = await pool.query<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);

		return {
			nextPRNumber,
			departments: JSON.parse(JSON.stringify(departments)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units)),
			user: locals.user
		};
	} catch (err: any) {
		console.error('Failed to load Create PR data:', err);
		return { nextPRNumber: '', departments: [], products: [], units: [] };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		checkPermission(locals, 'view vendors');
		const formData = await request.formData();

		const pr_number = formData.get('pr_number') as string;
		const request_date = formData.get('request_date') as string;
		const department = (formData.get('department') as string) || '';
		const description = (formData.get('description') as string) || '';

		const itemsJson = formData.get('items_json') as string;
		let items = [];
		try {
			items = JSON.parse(itemsJson);
		} catch (e) {
			return fail(400, { message: 'ข้อมูลรายการสินค้าไม่ถูกต้อง' });
		}

		const total_amount = parseFloat((formData.get('total_amount') as string) || '0');

		if (!request_date || items.length === 0) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			const [result] = await connection.execute<ResultSetHeader>(
				`INSERT INTO purchase_requests 
				(pr_number, request_date, requester_id, department, description, status, total_amount, created_at)
				 VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW())`,
				[pr_number, request_date, locals.user?.id, department, description, total_amount]
			);
			const prId = result.insertId;

			for (const item of items) {
				await connection.execute(
					`INSERT INTO purchase_request_items 
					(purchase_request_id, product_name, quantity, unit, expected_price, total_price)
					VALUES (?, ?, ?, ?, ?, ?)`,
					[
						prId,
						item.product_name,
						item.quantity,
						item.unit,
						item.expected_price || 0,
						item.total_price
					]
				);
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Create PR Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาด: ' + err.message });
		} finally {
			connection.release();
		}

		throw redirect(303, '/purchase-requests');
	}
};
