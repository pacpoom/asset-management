import { error } from '@sveltejs/kit';
import { canAccessPurchaseDocumentByDepartment } from '$lib/purchaseDocumentAccess';
import pool from '$lib/server/database';

let tableEnsured = false;

export async function ensurePurchaseDocumentDeletionLogTable(): Promise<void> {
	if (tableEnsured) return;
	await pool.execute(`
		CREATE TABLE IF NOT EXISTS purchase_document_deletion_log (
			document_id INT NOT NULL,
			document_type VARCHAR(16) NOT NULL,
			document_number VARCHAR(64) NULL,
			creator_department_id INT NULL,
			deleted_by_user_id INT NOT NULL,
			deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (document_id),
			KEY idx_pddl_deleted_at (deleted_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
	`);
	tableEnsured = true;
}

export async function insertPurchaseDocumentDeletionLog(row: {
	documentId: number;
	documentType: string;
	documentNumber: string | null;
	creatorDepartmentId: number | null;
	deletedByUserId: number;
}): Promise<void> {
	await ensurePurchaseDocumentDeletionLogTable();
	await pool.execute(
		`INSERT INTO purchase_document_deletion_log
			(document_id, document_type, document_number, creator_department_id, deleted_by_user_id)
		 VALUES (?, ?, ?, ?, ?)`,
		[
			row.documentId,
			row.documentType,
			row.documentNumber,
			row.creatorDepartmentId,
			row.deletedByUserId
		]
	);
}

/** If this id was a deleted PR and the user may see it, throw 404 with Thai message; otherwise no-op. */
export async function throwIfDeletedPurchaseRequisition(
	documentId: number,
	user: App.User | null
): Promise<void> {
	await ensurePurchaseDocumentDeletionLogTable();
	const [logRows] = await pool.query<any[]>(
		`SELECT pddl.document_type, pddl.creator_department_id, u.full_name AS deleted_by_name
		 FROM purchase_document_deletion_log pddl
		 LEFT JOIN users u ON u.id = pddl.deleted_by_user_id
		 WHERE pddl.document_id = ?
		 LIMIT 1`,
		[documentId]
	);
	if (logRows.length === 0) return;
	const log = logRows[0];
	if (String(log.document_type || '').toUpperCase() !== 'PR') return;
	const logDeptId = log.creator_department_id != null ? Number(log.creator_department_id) : null;
	if (!canAccessPurchaseDocumentByDepartment(user, logDeptId)) return;
	const by = String(log.deleted_by_name || '').trim() || '-';
	throw error(404, `PR นี้ถูกลบแล้วโดย User ${by}`);
}
