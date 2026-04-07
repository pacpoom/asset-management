CREATE TABLE IF NOT EXISTS iso_documents (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	doc_no VARCHAR(100) NOT NULL,
	title VARCHAR(255) NOT NULL,
	description TEXT NULL,
	file_path VARCHAR(500) NULL,
	version VARCHAR(50) NOT NULL DEFAULT '1.0',
	status ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
	created_by BIGINT UNSIGNED NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	approved_by BIGINT UNSIGNED NULL,
	approved_at DATETIME NULL,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_documents_doc_no (doc_no),
	KEY idx_iso_documents_status (status),
	KEY idx_iso_documents_created_by (created_by),
	KEY idx_iso_documents_approved_by (approved_by),
	CONSTRAINT fk_iso_documents_created_by
		FOREIGN KEY (created_by) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE RESTRICT,
	CONSTRAINT fk_iso_documents_approved_by
		FOREIGN KEY (approved_by) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iso_document_audit_logs (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	iso_document_id BIGINT UNSIGNED NOT NULL,
	user_id BIGINT UNSIGNED NOT NULL,
	action VARCHAR(100) NOT NULL,
	remark TEXT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_iso_doc_audit_document_id (iso_document_id),
	KEY idx_iso_doc_audit_user_id (user_id),
	KEY idx_iso_doc_audit_created_at (created_at),
	CONSTRAINT fk_iso_doc_audit_document
		FOREIGN KEY (iso_document_id) REFERENCES iso_documents(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT fk_iso_doc_audit_user
		FOREIGN KEY (user_id) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (name, guard_name)
SELECT 'view isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'view isodocs');

INSERT INTO permissions (name, guard_name)
SELECT 'create isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'create isodocs');

INSERT INTO permissions (name, guard_name)
SELECT 'edit isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'edit isodocs');

INSERT INTO permissions (name, guard_name)
SELECT 'delete isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'delete isodocs');

INSERT INTO permissions (name, guard_name)
SELECT 'upload isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'upload isodocs');

INSERT INTO permissions (name, guard_name)
SELECT 'submit isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'submit isodocs');

INSERT INTO permissions (name, guard_name)
SELECT 'approve isodocs', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'approve isodocs');

INSERT INTO roles (name, guard_name)
SELECT 'ISO_DOCS', 'web'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ISO_DOCS');

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
	'view isodocs',
	'create isodocs',
	'edit isodocs',
	'delete isodocs',
	'upload isodocs',
	'submit isodocs',
	'approve isodocs'
)
WHERE r.name = 'ISO_DOCS'
	AND NOT EXISTS (
		SELECT 1
		FROM role_has_permissions rhp
		WHERE rhp.role_id = r.id AND rhp.permission_id = p.id
	);

-- Root menu ต้องมีก่อน — สคริปต์อื่น (step4, DAR, approval flow) อิง parent นี้
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'IsoDocs Control', 'description', '/isodocs-control', NULL, 'view isodocs', 50
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/isodocs-control');

UPDATE menus
SET permission_name = 'view isodocs'
WHERE route = '/isodocs-control';
