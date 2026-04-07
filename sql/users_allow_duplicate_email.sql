-- Migration: Allow duplicate email in users table
-- Safe to run multiple times.

SET @has_email_unique := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'email'
      AND NON_UNIQUE = 0
);

SET @drop_sql := IF(
    @has_email_unique > 0,
    'ALTER TABLE users DROP INDEX email',
    'SELECT 1'
);

PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
