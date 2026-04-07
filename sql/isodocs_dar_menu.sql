-- DAR permissions
INSERT INTO permissions (name, guard_name)
SELECT 'manage isodocs dar', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'manage isodocs dar');

INSERT INTO permissions (name, guard_name)
SELECT 'approve isodocs dar', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'approve isodocs dar');

-- Map DAR permissions to ISO_DOCS role
INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('manage isodocs dar', 'approve isodocs dar')
WHERE r.name = 'ISO_DOCS'
	AND NOT EXISTS (
		SELECT 1
		FROM role_has_permissions rhp
		WHERE rhp.role_id = r.id AND rhp.permission_id = p.id
	);

-- Add DAR request menu
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'DAR Request', 'description', '/isodocs-control/dar-request', m.id, 'manage isodocs dar', 4
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/isodocs-control/dar-request'
	);

-- Add DAR list/approval menu
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'DAR List', 'fact_check', '/isodocs-control/dar-list', m.id, 'approve isodocs dar', 5
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/isodocs-control/dar-list'
	);
