-- Ensure System Management menu tree exists and is wired correctly.
-- Safe to run multiple times.

START TRANSACTION;

-- 1) Ensure root menu exists (reuse old "Configuration" root if present).
SET @sys_parent_id := (
	SELECT id
	FROM menus
	WHERE parent_id IS NULL
	  AND LOWER(TRIM(title)) IN ('system management', 'configuration')
	ORDER BY CASE WHEN LOWER(TRIM(title)) = 'system management' THEN 0 ELSE 1 END, id
	LIMIT 1
);

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'System Management', 'admin_panel_settings', NULL, NULL, 'manage settings', 900
WHERE @sys_parent_id IS NULL;

SET @sys_parent_id := COALESCE(
	@sys_parent_id,
	(SELECT id FROM menus WHERE parent_id IS NULL AND LOWER(TRIM(title)) = 'system management' ORDER BY id DESC LIMIT 1)
);

UPDATE menus
SET
	title = 'System Management',
	icon = COALESCE(NULLIF(icon, ''), 'admin_panel_settings'),
	route = NULL,
	permission_name = 'manage settings',
	`order` = COALESCE(`order`, 900)
WHERE id = @sys_parent_id;

-- 2) Merge duplicate top-level roots into canonical System Management.
UPDATE menus
SET parent_id = @sys_parent_id
WHERE parent_id IN (
	SELECT id
	FROM (
		SELECT id
		FROM menus
		WHERE parent_id IS NULL
		  AND LOWER(TRIM(title)) IN ('system management', 'configuration')
		  AND id <> @sys_parent_id
	) AS dup_roots
);

DELETE FROM menus
WHERE id IN (
	SELECT id
	FROM (
		SELECT id
		FROM menus
		WHERE parent_id IS NULL
		  AND LOWER(TRIM(title)) IN ('system management', 'configuration')
		  AND id <> @sys_parent_id
	) AS dup_roots
);

-- 3) Ensure child menu items exist and attach to System Management root.
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Users Control', 'manage_accounts', '/users', @sys_parent_id, 'manage users', 1
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/users');

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Roles & Permissions', 'shield_person', '/roles', @sys_parent_id, 'view roles', 2
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/roles');

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Permissions', 'verified_user', '/permissions', @sys_parent_id, 'manage settings', 3
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/permissions');

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Menu Management', 'menu', '/menus', @sys_parent_id, 'manage settings', 4
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/menus');

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Translations Management', 'translate', '/settings/translations', @sys_parent_id, 'manage settings', 5
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/settings/translations');

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Company Announcements', 'campaign', '/settings/company-announcements', @sys_parent_id, 'manage settings', 6
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/settings/company-announcements');

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Environment (.env)', 'tune', '/settings/env-config', @sys_parent_id, 'manage env config', 7
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/settings/env-config');

-- 4) Normalize existing rows (if they already exist with wrong parent/permission).
UPDATE menus
SET title = 'Users Control', icon = 'manage_accounts', parent_id = @sys_parent_id, permission_name = 'manage users'
WHERE route = '/users';

UPDATE menus
SET title = 'Roles & Permissions', icon = 'shield_person', parent_id = @sys_parent_id, permission_name = 'view roles'
WHERE route = '/roles';

UPDATE menus
SET title = 'Permissions', icon = 'verified_user', parent_id = @sys_parent_id, permission_name = 'manage settings'
WHERE route = '/permissions';

UPDATE menus
SET title = 'Menu Management', icon = 'menu', parent_id = @sys_parent_id, permission_name = 'manage settings'
WHERE route = '/menus';

UPDATE menus
SET title = 'Translations Management', icon = 'translate', parent_id = @sys_parent_id, permission_name = 'manage settings'
WHERE route = '/settings/translations';

UPDATE menus
SET title = 'Company Announcements', icon = 'campaign', parent_id = @sys_parent_id, permission_name = 'manage settings'
WHERE route = '/settings/company-announcements';

UPDATE menus
SET title = 'Environment (.env)', icon = 'tune', parent_id = @sys_parent_id, permission_name = 'manage env config'
WHERE route = '/settings/env-config';

COMMIT;

-- Verify quickly after running:
-- SELECT id, title, route, parent_id, permission_name, `order`
-- FROM menus
-- WHERE id = @sys_parent_id OR parent_id = @sys_parent_id
-- ORDER BY parent_id ASC, `order` ASC, id ASC;
