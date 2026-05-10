-- Records purchase document IDs after hard-delete so deep links (e.g. from email) can show who removed the PR.
CREATE TABLE IF NOT EXISTS purchase_document_deletion_log (
	document_id INT NOT NULL,
	document_type VARCHAR(16) NOT NULL,
	document_number VARCHAR(64) NULL,
	creator_department_id INT NULL,
	deleted_by_user_id INT NOT NULL,
	deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (document_id),
	KEY idx_pddl_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
