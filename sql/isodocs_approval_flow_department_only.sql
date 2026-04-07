-- Make ISO approval flow apply per department (not per document type)
-- and keep existing data compatible.

SET @db := DATABASE();

-- 1) Drop old unique key (department + type), if exists
SET @drop_old_uk := (
	SELECT IF(
		EXISTS(
			SELECT 1
			FROM information_schema.STATISTICS
			WHERE TABLE_SCHEMA = @db
			  AND TABLE_NAME = 'iso_approval_flows'
			  AND INDEX_NAME = 'uk_iso_approval_flow_dept_type'
		),
		'ALTER TABLE iso_approval_flows DROP INDEX uk_iso_approval_flow_dept_type',
		'SELECT 1'
	)
);
PREPARE stmt FROM @drop_old_uk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Make iso_document_type_id optional (NULL allowed)
SET @make_type_nullable := (
	SELECT IF(
		EXISTS(
			SELECT 1
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = @db
			  AND TABLE_NAME = 'iso_approval_flows'
			  AND COLUMN_NAME = 'iso_document_type_id'
			  AND IS_NULLABLE = 'NO'
		),
		'ALTER TABLE iso_approval_flows MODIFY COLUMN iso_document_type_id BIGINT UNSIGNED NULL',
		'SELECT 1'
	)
);
PREPARE stmt FROM @make_type_nullable;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Keep one active row per department by nulling type and creating new unique key
UPDATE iso_approval_flows
SET iso_document_type_id = NULL;

-- Keep latest row per department; remove older duplicates before adding unique key.
DELETE f1
FROM iso_approval_flows f1
JOIN iso_approval_flows f2
  ON f1.department_id = f2.department_id
 AND f1.id < f2.id;

SET @add_new_uk := (
	SELECT IF(
		EXISTS(
			SELECT 1
			FROM information_schema.STATISTICS
			WHERE TABLE_SCHEMA = @db
			  AND TABLE_NAME = 'iso_approval_flows'
			  AND INDEX_NAME = 'uk_iso_approval_flow_department'
		),
		'SELECT 1',
		'ALTER TABLE iso_approval_flows ADD UNIQUE KEY uk_iso_approval_flow_department (department_id)'
	)
);
PREPARE stmt FROM @add_new_uk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

