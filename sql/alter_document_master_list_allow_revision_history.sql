-- Allow revision history rows per Doc Code.
-- 1) remove unique constraint on doc_code
-- 2) enforce uniqueness on (doc_code, current_revision)

SET @schema_name := DATABASE();

SET @drop_doc_code_unique_sql := (
	SELECT IF(
		EXISTS (
			SELECT 1
			FROM INFORMATION_SCHEMA.STATISTICS
			WHERE TABLE_SCHEMA = @schema_name
			  AND TABLE_NAME = 'document_master_list'
			  AND INDEX_NAME = 'doc_code'
			  AND NON_UNIQUE = 0
		),
		'ALTER TABLE document_master_list DROP INDEX doc_code',
		'SELECT 1'
	)
);
PREPARE stmt_drop_doc_code_unique FROM @drop_doc_code_unique_sql;
EXECUTE stmt_drop_doc_code_unique;
DEALLOCATE PREPARE stmt_drop_doc_code_unique;

SET @add_doc_code_rev_unique_sql := (
	SELECT IF(
		NOT EXISTS (
			SELECT 1
			FROM INFORMATION_SCHEMA.STATISTICS
			WHERE TABLE_SCHEMA = @schema_name
			  AND TABLE_NAME = 'document_master_list'
			  AND INDEX_NAME = 'uq_doc_code_revision'
		),
		'ALTER TABLE document_master_list ADD UNIQUE KEY uq_doc_code_revision (doc_code, current_revision)',
		'SELECT 1'
	)
);
PREPARE stmt_add_doc_code_rev_unique FROM @add_doc_code_rev_unique_sql;
EXECUTE stmt_add_doc_code_rev_unique;
DEALLOCATE PREPARE stmt_add_doc_code_rev_unique;
