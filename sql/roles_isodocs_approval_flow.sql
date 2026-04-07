-- Roles: ISO_DOCS_MGR, ISO_DOCS_VP, ISODOCS_QMR — ตรงกับหน้า /roles และ $lib/darWorkflowLabels.ts
-- Permissions: isodocs dar approval manager | vp | qmr ผูกกับขั้น Iso Approval Flow: Reviewed By / Approved By / Notify QMR
--
-- หมายเหตุ DAR List: (1) ถูกเลือกในขั้น Flow หรือ (2) มีสิทธิ์ isodocs dar approval manager|vp|qmr
--          สิทธิ์ approve|manage isodocs dar ต้องถูกเลือกใน Flow อยู่ดี
--          การโหลด flow สำหรับใบ DAR ไม่กรองตามแผนกผู้ขอ — ใช้ทุก iso_approval_flows ที่ is_active แล้วคัดตาม document type ของใบ

INSERT INTO permissions (name, guard_name)
SELECT 'isodocs dar approval manager', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'isodocs dar approval manager');

INSERT INTO permissions (name, guard_name)
SELECT 'isodocs dar approval vp', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'isodocs dar approval vp');

INSERT INTO permissions (name, guard_name)
SELECT 'isodocs dar approval qmr', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'isodocs dar approval qmr');

INSERT INTO roles (name, guard_name)
SELECT 'ISO_DOCS_MGR', 'web'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ISO_DOCS_MGR');

INSERT INTO roles (name, guard_name)
SELECT 'ISO_DOCS_VP', 'web'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ISO_DOCS_VP');

INSERT INTO roles (name, guard_name)
SELECT 'ISODOCS_QMR', 'web'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ISODOCS_QMR');

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = 'isodocs dar approval manager'
WHERE r.name = 'ISO_DOCS_MGR'
	AND NOT EXISTS (
		SELECT 1 FROM role_has_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
	);

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = 'isodocs dar approval vp'
WHERE r.name = 'ISO_DOCS_VP'
	AND NOT EXISTS (
		SELECT 1 FROM role_has_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
	);

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = 'isodocs dar approval qmr'
WHERE r.name = 'ISODOCS_QMR'
	AND NOT EXISTS (
		SELECT 1 FROM role_has_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
	);
