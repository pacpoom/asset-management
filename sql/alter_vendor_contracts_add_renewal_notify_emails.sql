SET @vendor_contracts_col_exists := (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'vendor_contracts'
		AND COLUMN_NAME = 'renewal_notify_emails'
);

SET @vendor_contracts_sql := IF(
	@vendor_contracts_col_exists = 0,
	'ALTER TABLE vendor_contracts ADD COLUMN renewal_notify_emails TEXT NULL AFTER renewal_notice_days',
	'SELECT "vendor_contracts.renewal_notify_emails already exists"'
);

PREPARE stmt_vendor_contracts FROM @vendor_contracts_sql;
EXECUTE stmt_vendor_contracts;
DEALLOCATE PREPARE stmt_vendor_contracts;
