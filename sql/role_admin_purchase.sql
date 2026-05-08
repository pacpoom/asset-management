-- Create role Admin_Purchase (view all departments in Purchase module)
-- and copy the same permissions from role Purchase.

INSERT INTO roles (name, guard_name)
SELECT 'Admin_Purchase', 'web'
WHERE NOT EXISTS (
	SELECT 1 FROM roles WHERE LOWER(REPLACE(REPLACE(name, ' ', ''), '-', '_')) = 'admin_purchase'
);

INSERT IGNORE INTO role_has_permissions (role_id, permission_id)
SELECT ar.id, rp.permission_id
FROM roles ar
JOIN roles pr ON LOWER(REPLACE(REPLACE(pr.name, ' ', ''), '-', '_')) = 'purchase'
JOIN role_has_permissions rp ON rp.role_id = pr.id
WHERE LOWER(REPLACE(REPLACE(ar.name, ' ', ''), '-', '_')) = 'admin_purchase';
