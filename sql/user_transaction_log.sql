-- Unified user audit: role changes, password changes, quick actions (one row per logical action).
-- Run on the same database as the app.
-- Note: the Users page also auto-creates this table without FKs if missing, so inserts work;
--       this file adds optional FKs and password_changed_at for a full migration.

CREATE TABLE IF NOT EXISTS user_transaction_log (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	target_user_id BIGINT UNSIGNED NOT NULL,
	actor_user_id BIGINT UNSIGNED NOT NULL,
	`transaction` TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_utl_target_created (target_user_id, created_at),
	KEY idx_utl_created (created_at),
	CONSTRAINT fk_utl_target FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE CASCADE,
	CONSTRAINT fk_utl_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- When the password hash is set or updated, maintain this for "password age" and audit text.
SET @dbname = DATABASE();
SET @preparedStatement = (SELECT IF(
	(
		SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at'
	) > 0,
	'SELECT 1',
	'ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL DEFAULT NULL AFTER password_hash'
));
PREPARE alterPwdCol FROM @preparedStatement;
EXECUTE alterPwdCol;
DEALLOCATE PREPARE alterPwdCol;

-- Backfill: approximate last change as account creation where still unknown.
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
