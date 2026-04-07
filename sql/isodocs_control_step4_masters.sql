-- IsoDocs Control - Step 4 (Master Data + Approval Config)

-- 1) Document Type Master
CREATE TABLE IF NOT EXISTS iso_document_types (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	code VARCHAR(50) NOT NULL,
	name VARCHAR(150) NOT NULL,
	prefix VARCHAR(30) NOT NULL,
	number_format VARCHAR(100) NOT NULL DEFAULT '{PREFIX}-{YEAR}-{RUNNING}',
	running_digits INT NOT NULL DEFAULT 4,
	reset_mode ENUM('yearly', 'never') NOT NULL DEFAULT 'yearly',
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_by BIGINT UNSIGNED NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_document_types_code (code),
	KEY idx_iso_document_types_active (is_active),
	CONSTRAINT fk_iso_document_types_created_by
		FOREIGN KEY (created_by) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Running Number State by Type/Period
CREATE TABLE IF NOT EXISTS iso_document_running_numbers (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	iso_document_type_id BIGINT UNSIGNED NOT NULL,
	period_year INT NOT NULL,
	current_no INT NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_doc_running_type_year (iso_document_type_id, period_year),
	CONSTRAINT fk_iso_doc_running_type
		FOREIGN KEY (iso_document_type_id) REFERENCES iso_document_types(id)
		ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Approval Flow Header (per department + doc type)
CREATE TABLE IF NOT EXISTS iso_approval_flows (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	name VARCHAR(150) NOT NULL,
	department_id INT UNSIGNED NOT NULL,
	iso_document_type_id BIGINT UNSIGNED NOT NULL,
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_by BIGINT UNSIGNED NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_approval_flow_dept_type (department_id, iso_document_type_id),
	KEY idx_iso_approval_flows_active (is_active),
	CONSTRAINT fk_iso_approval_flows_department
		FOREIGN KEY (department_id) REFERENCES departments(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT fk_iso_approval_flows_type
		FOREIGN KEY (iso_document_type_id) REFERENCES iso_document_types(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT fk_iso_approval_flows_created_by
		FOREIGN KEY (created_by) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Approval Flow Steps
CREATE TABLE IF NOT EXISTS iso_approval_flow_steps (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	iso_approval_flow_id BIGINT UNSIGNED NOT NULL,
	step_no INT NOT NULL,
	approver_role_id BIGINT UNSIGNED NULL,
	approver_user_id BIGINT UNSIGNED NULL,
	action_type ENUM('approve', 'review') NOT NULL DEFAULT 'approve',
	require_remark TINYINT(1) NOT NULL DEFAULT 1,
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_approval_step_unique (iso_approval_flow_id, step_no),
	KEY idx_iso_approval_step_role (approver_role_id),
	KEY idx_iso_approval_step_user (approver_user_id),
	CONSTRAINT fk_iso_approval_steps_flow
		FOREIGN KEY (iso_approval_flow_id) REFERENCES iso_approval_flows(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT fk_iso_approval_steps_role
		FOREIGN KEY (approver_role_id) REFERENCES roles(id)
		ON UPDATE CASCADE ON DELETE SET NULL,
	CONSTRAINT fk_iso_approval_steps_user
		FOREIGN KEY (approver_user_id) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Approval Transaction per Document
CREATE TABLE IF NOT EXISTS iso_document_approval_steps (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	iso_document_id BIGINT UNSIGNED NOT NULL,
	iso_approval_flow_step_id BIGINT UNSIGNED NOT NULL,
	step_no INT NOT NULL,
	status ENUM('pending', 'approved', 'rejected', 'skipped') NOT NULL DEFAULT 'pending',
	acted_by BIGINT UNSIGNED NULL,
	acted_at DATETIME NULL,
	remark TEXT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_iso_doc_approval_step (iso_document_id, step_no),
	KEY idx_iso_doc_approval_status (status),
	CONSTRAINT fk_iso_doc_approval_steps_document
		FOREIGN KEY (iso_document_id) REFERENCES iso_documents(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT fk_iso_doc_approval_steps_flow_step
		FOREIGN KEY (iso_approval_flow_step_id) REFERENCES iso_approval_flow_steps(id)
		ON UPDATE CASCADE ON DELETE RESTRICT,
	CONSTRAINT fk_iso_doc_approval_steps_acted_by
		FOREIGN KEY (acted_by) REFERENCES users(id)
		ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Extend iso_documents to connect with type + flow
-- Make idempotent: add columns only if missing (prevents Error 1060 duplicate column).
SET @has_iso_document_type_id := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_documents'
      AND COLUMN_NAME = 'iso_document_type_id'
);
SET @sql_iso_document_type_id := IF(
    @has_iso_document_type_id = 0,
    'ALTER TABLE iso_documents ADD COLUMN iso_document_type_id BIGINT UNSIGNED NULL AFTER doc_no',
    'SELECT 1'
);
PREPARE stmt_iso1 FROM @sql_iso_document_type_id;
EXECUTE stmt_iso1;
DEALLOCATE PREPARE stmt_iso1;

SET @has_department_id := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_documents'
      AND COLUMN_NAME = 'department_id'
);
SET @sql_department_id := IF(
    @has_department_id = 0,
    'ALTER TABLE iso_documents ADD COLUMN department_id INT UNSIGNED NULL AFTER iso_document_type_id',
    'SELECT 1'
);
PREPARE stmt_iso2 FROM @sql_department_id;
EXECUTE stmt_iso2;
DEALLOCATE PREPARE stmt_iso2;

SET @has_iso_approval_flow_id := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_documents'
      AND COLUMN_NAME = 'iso_approval_flow_id'
);
SET @sql_iso_approval_flow_id := IF(
    @has_iso_approval_flow_id = 0,
    'ALTER TABLE iso_documents ADD COLUMN iso_approval_flow_id BIGINT UNSIGNED NULL AFTER department_id',
    'SELECT 1'
);
PREPARE stmt_iso3 FROM @sql_iso_approval_flow_id;
EXECUTE stmt_iso3;
DEALLOCATE PREPARE stmt_iso3;

SET @has_current_approval_step_no := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_documents'
      AND COLUMN_NAME = 'current_approval_step_no'
);
SET @sql_current_approval_step_no := IF(
    @has_current_approval_step_no = 0,
    'ALTER TABLE iso_documents ADD COLUMN current_approval_step_no INT NULL AFTER iso_approval_flow_id',
    'SELECT 1'
);
PREPARE stmt_iso4 FROM @sql_current_approval_step_no;
EXECUTE stmt_iso4;
DEALLOCATE PREPARE stmt_iso4;

-- 7) Permissions for new master menus
INSERT INTO permissions (name, guard_name)
SELECT 'manage isodocs master', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage isodocs master');

INSERT INTO permissions (name, guard_name)
SELECT 'manage isodocs flow', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage isodocs flow');

-- 8) Map new permissions to ISO_DOCS role
INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('manage isodocs master', 'manage isodocs flow')
WHERE r.name = 'ISO_DOCS'
	AND NOT EXISTS (
		SELECT 1
		FROM role_has_permissions rhp
		WHERE rhp.role_id = r.id AND rhp.permission_id = p.id
	);

-- 9) Add IsoDocs sub menus (under /isodocs-control)
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'IsoDocs Type Master', 'list_alt', '/isodocs-control/type-master', m.id, 'manage isodocs master', 1
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/isodocs-control/type-master'
	);

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'IsoDocs Running No', 'tag', '/isodocs-control/running-no', m.id, 'manage isodocs master', 2
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/isodocs-control/running-no'
	);

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'IsoDocs Approval Flow', 'rule_settings', '/isodocs-control/approval-flow', m.id, 'manage isodocs flow', 3
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/isodocs-control/approval-flow'
	);
