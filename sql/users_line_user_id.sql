-- Optional LINE Messaging API user id (for IsoDocs approval notifications via OA).
-- Run once on your MySQL database.

SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'line_user_id';
SET @preparedStatement = (SELECT IF(
	(
		SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname
	) > 0,
	'SELECT 1',
	'ALTER TABLE users ADD COLUMN line_user_id VARCHAR(64) NULL COMMENT ''LINE OA userId for push (U...)'' AFTER iso_section'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Manual fallback (if the block above fails), run against the same database as the app:
-- ALTER TABLE users ADD COLUMN line_user_id VARCHAR(64) NULL COMMENT 'LINE OA userId for push (U...)' AFTER iso_section;
