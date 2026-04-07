-- Role: ISO_DOCS_USER
-- Copy of ISO_DOCS_ADMIN without: manage isodocs master, manage isodocs flow, manage isodocs dar, approve isodocs dar
--
-- Prerequisite: role `ISO_DOCS_ADMIN` must exist and hold the permissions you want to clone (minus the four above).
-- Safe to run multiple times (skips duplicate role_has_permissions rows).

INSERT INTO roles (name, guard_name)
SELECT 'ISO_DOCS_USER', 'web'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ISO_DOCS_USER');

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT ur.id, rhp.permission_id
FROM roles ar
JOIN role_has_permissions rhp ON rhp.role_id = ar.id
JOIN permissions p ON p.id = rhp.permission_id
JOIN roles ur ON ur.name = 'ISO_DOCS_USER'
WHERE ar.name = 'ISO_DOCS_ADMIN'
	AND p.name NOT IN (
		'manage isodocs master',
		'manage isodocs flow',
		'manage isodocs dar',
		'approve isodocs dar'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM role_has_permissions x
		WHERE x.role_id = ur.id AND x.permission_id = rhp.permission_id
	);
