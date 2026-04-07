-- Add missing IsoDocs menus to match legacy project.
-- Prereq: isodocs_menu_parent_ensure.sql or isodocs_control_step3.sql (root menu exists).
-- Safe to run multiple times.

-- Document Master List (under IsoDocs Control)
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Document Master List', 'list_alt', '/isodocs-control/document-list', m.id, 'view isodocs', 6
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/isodocs-control/document-list'
	);

-- Document Code Generator (top-level menu, but grouped under IsoDocs Control in sidebar)
INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'Document Code Generator', 'qr_code_2', '/document-code-generator', m.id, 'view isodocs', 7
FROM menus m
WHERE m.route = '/isodocs-control'
	AND NOT EXISTS (
		SELECT 1 FROM menus WHERE route = '/document-code-generator'
	);

