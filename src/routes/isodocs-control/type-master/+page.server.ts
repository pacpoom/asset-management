import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

type IsoDocumentType = RowDataPacket & {
	id: number;
	code: string;
	name: string;
	prefix: string;
	number_format: string;
	running_digits: number;
	reset_mode: 'yearly' | 'never';
	is_active: number;
	created_at: string;
};

export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'manage isodocs master');

	const [types] = await pool.execute<IsoDocumentType[]>(
		`SELECT id, code, name, prefix, number_format, running_digits, reset_mode, is_active, created_at
		 FROM iso_document_types
		 ORDER BY is_active DESC, code ASC`
	);

	return {
		types
	};
};

export const actions: Actions = {
	saveType: async ({ request, locals }) => {
		checkPermission(locals, 'manage isodocs master');
		const data = await request.formData();

		const id = Number(data.get('id')?.toString() || 0);
		const code = (data.get('code')?.toString() || '').trim().toUpperCase();
		const name = (data.get('name')?.toString() || '').trim();
		const prefix = (data.get('prefix')?.toString() || '').trim().toUpperCase();
		const numberFormat =
			(data.get('number_format')?.toString() || '').trim() || '{PREFIX}-{YEAR}-{RUNNING}';
		const runningDigits = Number(data.get('running_digits')?.toString() || 4);
		const resetMode = (data.get('reset_mode')?.toString() || 'yearly') as 'yearly' | 'never';
		const isActive = data.get('is_active')?.toString() === '1' ? 1 : 0;

		if (!code || !name || !prefix) {
			return fail(400, {
				success: false,
				action: 'saveType',
				message: 'Code, name and prefix are required.'
			});
		}

		if (!['yearly', 'never'].includes(resetMode) || runningDigits < 1 || runningDigits > 12) {
			return fail(400, {
				success: false,
				action: 'saveType',
				message: 'Invalid reset mode or running digits.'
			});
		}

		try {
			if (id > 0) {
				await pool.execute(
					`UPDATE iso_document_types
					 SET code = ?, name = ?, prefix = ?, number_format = ?, running_digits = ?, reset_mode = ?, is_active = ?
					 WHERE id = ?`,
					[code, name, prefix, numberFormat, runningDigits, resetMode, isActive, id]
				);
			} else {
				await pool.execute(
					`INSERT INTO iso_document_types
					 (code, name, prefix, number_format, running_digits, reset_mode, is_active, created_by)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						code,
						name,
						prefix,
						numberFormat,
						runningDigits,
						resetMode,
						isActive,
						locals.user?.id || null
					]
				);
			}

			return {
				success: true,
				action: 'saveType',
				message: id > 0 ? 'Document type updated.' : 'Document type created.'
			};
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					success: false,
					action: 'saveType',
					message: 'Duplicate code. Please use a unique code.'
				});
			}

			console.error('saveType error', err);
			return fail(500, {
				success: false,
				action: 'saveType',
				message: 'Failed to save document type.'
			});
		}
	},

	deleteType: async ({ request, locals }) => {
		checkPermission(locals, 'manage isodocs master');
		const data = await request.formData();
		const id = Number(data.get('id')?.toString() || 0);

		if (!id) {
			return fail(400, { success: false, action: 'deleteType', message: 'Invalid type id.' });
		}

		try {
			const [result] = await pool.execute<ResultSetHeader>(
				`DELETE FROM iso_document_types WHERE id = ?`,
				[id]
			);

			if (result.affectedRows === 0) {
				return fail(404, {
					success: false,
					action: 'deleteType',
					message: 'Document type not found.'
				});
			}

			return { success: true, action: 'deleteType', message: 'Document type deleted.' };
		} catch (err: any) {
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					success: false,
					action: 'deleteType',
					message: 'Cannot delete: this type is already in use.'
				});
			}

			throw error(500, 'Failed to delete document type.');
		}
	}
};
