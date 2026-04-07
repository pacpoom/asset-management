-- Extend Iso Approval Flow for fixed 3 stages with multi users.
-- Safe to run multiple times.

SET @has_step_key := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_approval_flow_steps'
      AND COLUMN_NAME = 'step_key'
);
SET @sql_step_key := IF(
    @has_step_key = 0,
    'ALTER TABLE iso_approval_flow_steps ADD COLUMN step_key VARCHAR(50) NULL AFTER step_no',
    'SELECT 1'
);
PREPARE stmt1 FROM @sql_step_key;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @has_step_name := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_approval_flow_steps'
      AND COLUMN_NAME = 'step_name'
);
SET @sql_step_name := IF(
    @has_step_name = 0,
    'ALTER TABLE iso_approval_flow_steps ADD COLUMN step_name VARCHAR(150) NULL AFTER step_key',
    'SELECT 1'
);
PREPARE stmt2 FROM @sql_step_name;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @has_approver_user_ids_json := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'iso_approval_flow_steps'
      AND COLUMN_NAME = 'approver_user_ids_json'
);
SET @sql_approver_users := IF(
    @has_approver_user_ids_json = 0,
    'ALTER TABLE iso_approval_flow_steps ADD COLUMN approver_user_ids_json JSON NULL AFTER approver_user_id',
    'SELECT 1'
);
PREPARE stmt3 FROM @sql_approver_users;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- Ensure submenu exists under IsoDocs_Control.
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Iso Approval Flow', 'rule_settings', '/isodocs-control/approval-flow', m.id, 'manage isodocs flow', 4
FROM menus m
WHERE m.route = '/isodocs-control'
  AND NOT EXISTS (
      SELECT 1 FROM menus WHERE route = '/isodocs-control/approval-flow'
  );
