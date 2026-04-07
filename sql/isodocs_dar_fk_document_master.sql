-- รันหลัง isodocs_dar.sql และ document_master_list.sql แล้ว
-- เพิ่ม FK document_master_id → document_master_list(id) แบบ idempotent

SET @db := DATABASE();

SELECT COUNT(*) INTO @fk_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = @db
  AND TABLE_NAME = 'dar_request_items'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND CONSTRAINT_NAME = 'fk_dar_request_items_document_master';

SET @sql := IF(
	@fk_exists = 0,
	'ALTER TABLE dar_request_items ADD CONSTRAINT fk_dar_request_items_document_master FOREIGN KEY (document_master_id) REFERENCES document_master_list(id) ON DELETE SET NULL',
	'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
