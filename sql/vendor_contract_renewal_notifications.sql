-- Vendor contract renewal reminder log table
-- Purpose: keep one-notification-per-contract-per-reminder-date to avoid duplicate sends.
-- Note: vendor_contract_id type is generated to match vendor_contracts.id exactly (signed/unsigned/size).

SET @vc_id_column_type := (
	SELECT COLUMN_TYPE
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
	  AND TABLE_NAME = 'vendor_contracts'
	  AND COLUMN_NAME = 'id'
	LIMIT 1
);

SET @create_sql := CONCAT(
	'CREATE TABLE IF NOT EXISTS vendor_contract_renewal_notifications (',
	'id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,',
	'vendor_contract_id ', @vc_id_column_type, ' NOT NULL,',
	'notify_for_date DATE NOT NULL,',
	'notified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
	'days_before_expiry INT NOT NULL DEFAULT 30,',
	"channels VARCHAR(32) NOT NULL DEFAULT '',",
	'recipients_email TEXT NULL,',
	'recipients_line TEXT NULL,',
	'UNIQUE KEY uq_vendor_contract_notify_once (vendor_contract_id, notify_for_date),',
	'INDEX idx_vendor_contract_notified_at (notified_at),',
	'CONSTRAINT fk_vendor_contract_notify_contract FOREIGN KEY (vendor_contract_id) ',
	'REFERENCES vendor_contracts(id) ON DELETE CASCADE',
	');'
);

PREPARE stmt_create_vendor_contract_renewal_notifications FROM @create_sql;
EXECUTE stmt_create_vendor_contract_renewal_notifications;
DEALLOCATE PREPARE stmt_create_vendor_contract_renewal_notifications;
