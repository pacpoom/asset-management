import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import pool from '$lib/server/database';

async function generateVoucherNumber(type: string, dateStr: string) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const prefix = `${type}-${year}${month}-`; // เช่น RV-202311-

	const [rows] = await pool.query<any[]>(
		`SELECT voucher_number FROM general_vouchers 
         WHERE voucher_number LIKE ? ORDER BY voucher_number DESC LIMIT 1`,
		[`${prefix}%`]
	);

	let nextNum = 1;
	if (rows.length > 0) {
		const lastNumStr = rows[0].voucher_number.split('-').pop();
		nextNum = parseInt(lastNumStr) + 1;
	}
	return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		const type = formData.get('voucher_type')?.toString();
		const date = formData.get('voucher_date')?.toString();
		const contact_name = formData.get('contact_name')?.toString();
		const description = formData.get('description')?.toString();

		// รับค่าตัวเลขใหม่
		const subtotal = parseFloat(formData.get('subtotal')?.toString() || '0');
		const vat_rate = parseFloat(formData.get('vat_rate')?.toString() || '0');
		const vat_amount = parseFloat(formData.get('vat_amount')?.toString() || '0');
		const wht_rate = parseFloat(formData.get('wht_rate')?.toString() || '0');
		const wht_amount = parseFloat(formData.get('wht_amount')?.toString() || '0');
		const total_amount = parseFloat(formData.get('total_amount')?.toString() || '0');

		if (!type || !date) return fail(400, { message: 'ข้อมูลไม่ครบถ้วน' });

		const connection = await pool.getConnection();
		try {
			const number = await generateVoucherNumber(type, date);

			await connection.execute(
				`INSERT INTO general_vouchers 
                (voucher_type, voucher_number, voucher_date, contact_name, description, 
                 subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total_amount, 
                 status, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)`,
				[
					type,
					number,
					date,
					contact_name,
					description,
					subtotal,
					vat_rate,
					vat_amount,
					wht_rate,
					wht_amount,
					total_amount,
					locals.user?.id || null
				]
			);
		} catch (e: any) {
			console.error(e);
			return fail(500, { message: e.message });
		} finally {
			connection.release();
		}

		throw redirect(303, '/payments');
	}
};
