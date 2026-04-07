-- ให้ role IT_Dev เข้าเมนู System Management: Users Control, Roles & Permissions, Permissions, Menu Management
-- (manage env config ผูกไว้แล้วใน sql/permission_manage_env_config.sql)
-- รันบน MySQL ฐานเดียวกับแอป แล้วให้ผู้ใช้ IT_Dev รีเฟรช / ล็อกอินใหม่

INSERT INTO permissions (name, guard_name)
SELECT 'manage users', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage users');

INSERT INTO permissions (name, guard_name)
SELECT 'view roles', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'view roles');

INSERT INTO permissions (name, guard_name)
SELECT 'edit roles', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'edit roles');

INSERT INTO permissions (name, guard_name)
SELECT 'create roles', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'create roles');

INSERT INTO permissions (name, guard_name)
SELECT 'delete roles', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'delete roles');

INSERT INTO permissions (name, guard_name)
SELECT 'manage settings', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage settings');

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
	'manage users',
	'view roles',
	'edit roles',
	'create roles',
	'delete roles',
	'manage settings'
)
WHERE r.name = 'IT_Dev'
	AND NOT EXISTS (
		SELECT 1
		FROM role_has_permissions x
		WHERE x.role_id = r.id AND x.permission_id = p.id
	);
