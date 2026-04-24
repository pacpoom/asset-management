SET @contracts_col_exists := (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'contracts'
		AND COLUMN_NAME = 'renewal_notify_emails'
);

SET @contracts_sql := IF(
	@contracts_col_exists = 0,
	'ALTER TABLE contracts ADD COLUMN renewal_notify_emails TEXT NULL AFTER owner_user_id',
	'SELECT "contracts.renewal_notify_emails already exists"'
);

PREPARE stmt_contracts FROM @contracts_sql;
EXECUTE stmt_contracts;
DEALLOCATE PREPARE stmt_contracts;
