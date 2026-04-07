-- Last update time for user profile rows (for admin list sorting).
-- Run once on the same MySQL database as the app.

SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'updated_at';
SET @preparedStatement = (SELECT IF(
	(
		SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname
	) > 0,
	'SELECT 1',
	'ALTER TABLE users ADD COLUMN updated_at DATETIME NULL AFTER created_at'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE users
	MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
