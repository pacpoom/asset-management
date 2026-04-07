import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import { hasDarListAccess } from '$lib/isodocsDarPermissions';

interface DarRequest extends RowDataPacket {
	id: number;
	dar_no: string;
	request_type: 'new_document' | 'revise_document' | 'cancel_document' | 'request_copy';
	document_type_scope: string | null;
	requester_name: string | null;
	requester_position: string | null;
	requester_department: string | null;
	request_date: string;
	remark: string | null;
	reviewer_comment: string | null;
	reviewer_name: string | null;
	reviewer_position: string | null;
	reviewer_date: string | null;
	approver_comment: string | null;
	approver_name: string | null;
	approver_position: string | null;
	approver_date: string | null;
	document_controller_comment: string | null;
	register_name: string | null;
	register_position: string | null;
	register_date: string | null;
	status: string;
}

interface DarItem extends RowDataPacket {
	id: number;
	dar_request_id: number;
	line_no: number;
	document_code: string;
	document_name: string;
	revision: string;
	effective_date: string | null;
	request_reason: string | null;
	copies_requested: number | null;
}

interface DarAttachment extends RowDataPacket {
	id: number;
	dar_request_item_id: number;
	file_original_name: string;
	file_system_name: string;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!hasDarListAccess(locals.user)) {
		throw error(403, 'Forbidden: You do not have DAR access.');
	}

	const requestId = Number(params.id || 0);
	if (!requestId) {
		throw error(400, 'Invalid DAR ID');
	}

	const [requests] = await pool.execute<DarRequest[]>(
		`SELECT
			id,
			dar_no,
			request_type,
			document_type_scope,
			requester_name,
			requester_position,
			requester_department,
			request_date,
			remark,
			reviewer_comment,
			reviewer_name,
			reviewer_position,
			reviewer_date,
			approver_comment,
			approver_name,
			approver_position,
			approver_date,
			document_controller_comment,
			register_name,
			register_position,
			register_date,
			status
		 FROM dar_requests
		 WHERE id = ?
		 LIMIT 1`,
		[requestId]
	);

	if (!requests[0]) {
		throw error(404, 'DAR not found');
	}

	const request = requests[0];

	const [items] = await pool.execute<DarItem[]>(
		`SELECT
			id,
			dar_request_id,
			line_no,
			document_code,
			document_name,
			revision,
			effective_date,
			request_reason,
			copies_requested
		 FROM dar_request_items
		 WHERE dar_request_id = ?
		 ORDER BY line_no ASC`,
		[requestId]
	);

	let attachments: DarAttachment[] = [];
	if (items.length > 0) {
		const itemIds = items.map((item) => item.id);
		const [rows] = await pool.query<DarAttachment[]>(
			`SELECT id, dar_request_item_id, file_original_name, file_system_name
			 FROM dar_request_item_attachments
			 WHERE dar_request_item_id IN (?)
			 ORDER BY id ASC`,
			[itemIds]
		);
		attachments = rows;
	}

	return {
		request,
		items,
		attachments
	};
};
