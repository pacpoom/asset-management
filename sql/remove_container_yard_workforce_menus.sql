-- Hide unrelated modules from sidebar WITHOUT deleting menus.
-- Safe to run multiple times.
--
-- Idea:
-- - Parent menus like "Container Yard" / "Workforce" often have permission_name = NULL,
--   which makes them visible to everyone (non-admin menu query includes permission_name IS NULL).
-- - We set a dedicated permission on those parent rows so only intended roles see them.
-- - This does NOT remove any functionality and keeps other users' access intact.

-- 1) Ensure dedicated view permissions exist
INSERT INTO permissions (name, guard_name)
SELECT 'view container yard', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'view container yard');

INSERT INTO permissions (name, guard_name)
SELECT 'view workforce', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'view workforce');

-- 1b) Roles that already had view cy keep access after we rename the menu to view container yard
INSERT INTO role_has_permissions (role_id, permission_id)
SELECT DISTINCT x.role_id, p_new.id
FROM role_has_permissions x
JOIN permissions p_old ON p_old.id = x.permission_id AND p_old.name = 'view cy'
JOIN permissions p_new ON p_new.name = 'view container yard'
WHERE NOT EXISTS (
	SELECT 1
	FROM role_has_permissions y
	WHERE y.role_id = x.role_id AND y.permission_id = p_new.id
);

-- 2) Parent rows: always normalize so ISO/IT_Dev can be denied via one permission name.
--    (Older DBs often use e.g. view cy on Container Yard — that still matched many role bundles.)
UPDATE menus
SET permission_name = 'view container yard'
WHERE LOWER(TRIM(title)) = 'container yard';

UPDATE menus
SET permission_name = 'view workforce'
WHERE LOWER(TRIM(title)) = 'workforce';

-- 2b) Children that still have NULL permission would pull the parent in for everyone via
--     permission_name IS NULL in the menu query; tie them to the same view permissions.
UPDATE menus c
INNER JOIN menus p ON c.parent_id = p.id
SET c.permission_name = 'view workforce'
WHERE LOWER(TRIM(p.title)) = 'workforce'
  AND (c.permission_name IS NULL OR TRIM(c.permission_name) = '');

UPDATE menus c
INNER JOIN menus p ON c.parent_id = p.id
SET c.permission_name = 'view container yard'
WHERE LOWER(TRIM(p.title)) = 'container yard'
  AND (c.permission_name IS NULL OR TRIM(c.permission_name) = '');

-- Optional: If your parent menus are identified by route instead of title, uncomment:
-- UPDATE menus SET permission_name = 'view container yard'
-- WHERE (route LIKE '%container%' OR route LIKE '%container-yard%')
--   AND (permission_name IS NULL OR TRIM(permission_name) = '');
--
-- UPDATE menus SET permission_name = 'view workforce'
-- WHERE (route LIKE '%workforce%')
--   AND (permission_name IS NULL OR TRIM(permission_name) = '');

-- 3) IMPORTANT: Do NOT grant these new permissions to ISO_DOCS_ADMIN or IT_Dev
-- If they already see those menus via other permissions, remove them from the role.
-- (Keep other roles unchanged so they can still use the menus.)

