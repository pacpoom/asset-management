-- Add QMR recipients per approval flow (multi users)
-- Safe to run multiple times.

SET @has_qmr_user_ids_json := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_approval_flows'
      AND COLUMN_NAME = 'qmr_user_ids_json'
);

SET @sql_qmr := IF(
    @has_qmr_user_ids_json = 0,
    'ALTER TABLE iso_approval_flows ADD COLUMN qmr_user_ids_json JSON NULL AFTER is_active',
    'SELECT 1'
);

PREPARE stmt FROM @sql_qmr;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
