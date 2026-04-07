import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

type IsoDocumentType = RowDataPacket & {
	id: number;
	code: string;
	name: string;
};

type RunningRow = RowDataPacket & {
	iso_document_type_id: number;
	period_year: number;
	current_no: number;
};

export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'manage isodocs master');

	const currentYear = new Date().getFullYear();

	const [types] = await pool.execute<IsoDocumentType[]>(
		`SELECT id, code, name
		 FROM iso_document_types
		 WHERE is_active = 1
		 ORDER BY code ASC`
	);

	const [runningNos] = await pool.execute<RunningRow[]>(
		`SELECT iso_document_type_id, period_year, current_no
		 FROM iso_document_running_numbers
		 ORDER BY period_year DESC, iso_document_type_id ASC`
	);

	return {
		types,
		runningNos,
		currentYear
	};
};

export const actions: Actions = {
	saveRunningNo: async ({ request, locals }) => {
		checkPermission(locals, 'manage isodocs master');
		const fd = await request.formData();
		const typeId = Number(fd.get('iso_document_type_id')?.toString() || 0);
		const periodYear = Number(fd.get('period_year')?.toString() || 0);
		const currentNo = Number(fd.get('current_no')?.toString() || '0');

		if (!typeId || !Number.isFinite(periodYear)) {
			return fail(400, {
				success: false,
				message: 'Document type and year are required.'
			});
		}
		if (!Number.isFinite(currentNo) || currentNo < 0) {
			return fail(400, { success: false, message: 'Current number must be zero or positive.' });
		}

		try {
			const [res] = await pool.execute<ResultSetHeader>(
				`INSERT INTO iso_document_running_numbers (iso_document_type_id, period_year, current_no)
				 VALUES (?, ?, ?)
				 ON DUPLICATE KEY UPDATE current_no = VALUES(current_no), updated_at = CURRENT_TIMESTAMP`,
				[typeId, periodYear, currentNo]
			);

			if (res.affectedRows === 0) {
				return fail(500, { success: false, message: 'Failed to save running number.' });
			}

			return { success: true, message: 'Running number saved.' };
		} catch (e) {
			console.error('[running-no] saveRunningNo', e);
			return fail(500, {
				success: false,
				message: 'Database error while saving running number (did you run IsoDocs SQL migrations?).'
			});
		}
	}
};
