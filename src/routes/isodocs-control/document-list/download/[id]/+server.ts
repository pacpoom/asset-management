import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs/promises';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import {
	buildCanceledDocumentPdf,
	buildDistributionControlledPdf,
	buildOriginalControlledPdf
} from '$lib/server/pdfStamp';
import { PERM_ISODOCS_DAR_QMR } from '$lib/isodocsDarPermissions';

const MASTER_UPLOAD_DIR = path.resolve('uploads', 'isodocs', 'document-master');

type DocRow = RowDataPacket & {
	id: number;
	attached_file_original_name: string | null;
	attached_file_system_name: string | null;
	status: string | null;
};

function contentTypeByExt(ext: string): string {
	switch (ext) {
		case '.pdf':
			return 'application/pdf';
		case '.doc':
			return 'application/msword';
		case '.docx':
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		default:
			return 'application/octet-stream';
	}
}

export const GET: RequestHandler = async ({ locals, params }) => {
	checkPermission(locals, 'view isodocs');
	const id = Number(params.id || 0);
	if (!id) throw error(400, 'Invalid document id');

	const [rows] = await pool.execute<DocRow[]>(
		`SELECT id, attached_file_original_name, attached_file_system_name, status
		 FROM document_master_list
		 WHERE id = ?
		 LIMIT 1`,
		[id]
	);
	const row = rows[0];
	if (!row || !row.attached_file_system_name) throw error(404, 'File not found');

	const safeSystemName = path.basename(String(row.attached_file_system_name));
	const safeOriginalName = path.basename(
		String(row.attached_file_original_name || row.attached_file_system_name)
	);
	const fullPath = path.join(MASTER_UPLOAD_DIR, safeSystemName);
	try {
		await fs.access(fullPath);
	} catch {
		throw error(404, 'File not found');
	}

	const ext = path.extname(safeOriginalName).toLowerCase();
	const lowerRole = String(locals.user?.role || '').trim().toLowerCase();
	const roleNames = (locals.user?.roleNames || []).map((n) => String(n || '').trim().toLowerCase());
	const isQmrUser =
		locals.user?.permissions?.includes(PERM_ISODOCS_DAR_QMR) ||
		lowerRole.includes('qmr') ||
		roleNames.some((n) => n.includes('qmr'));

	const normalizedStatus = String(row.status || '').toLowerCase();
	// Some DBs still fallback cancelled docs to inactive (enum doesn't include 'cancelled').
	const isCancelled = normalizedStatus === 'cancelled' || normalizedStatus === 'inactive';
	const bodyBuffer =
		ext !== '.pdf'
			? await fs.readFile(fullPath)
			: isCancelled
				? await buildCanceledDocumentPdf(fullPath)
			: isQmrUser
				? await buildOriginalControlledPdf(fullPath)
				: await buildDistributionControlledPdf(fullPath);
	const body = new Uint8Array(bodyBuffer);

	return new Response(body, {
		headers: {
			'content-type': contentTypeByExt(ext),
			'content-disposition': `attachment; filename="${encodeURIComponent(safeOriginalName)}"`,
			'cache-control': 'no-store'
		}
	});
};
