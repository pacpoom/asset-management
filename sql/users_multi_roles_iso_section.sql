-- Migration: Support multiple roles per user + iso_section field
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id),
    KEY idx_user_roles_role_id (role_id),
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE
);

SET @has_iso_section := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'iso_section'
);
SET @alter_sql := IF(
    @has_iso_section = 0,
    'ALTER TABLE users ADD COLUMN iso_section VARCHAR(255) NULL AFTER position_id',
    'SELECT 1'
);
PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill primary role into mapping table (idempotent; avoids duplicate-key warnings vs INSERT IGNORE).
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, u.role_id
FROM users u
WHERE u.role_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = u.id AND ur.role_id = u.role_id
  );
