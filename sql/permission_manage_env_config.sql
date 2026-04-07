-- Permission สำหรับหน้า Environment (.env) + ผูกกับ role IT_Dev
-- รันแล้วให้ user ที่เป็น IT_Dev (primary role) ล็อกอินใหม่หรือรีเฟรช session

INSERT INTO permissions (name, guard_name)
SELECT 'manage env config', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage env config');

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = 'manage env config'
WHERE r.name = 'IT_Dev'
	AND NOT EXISTS (
		SELECT 1
		FROM role_has_permissions x
		WHERE x.role_id = r.id AND x.permission_id = p.id
	);
