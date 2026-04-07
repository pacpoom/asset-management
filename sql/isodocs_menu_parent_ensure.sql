-- แก้เคสเมนู IsoDocs ไม่ขึ้นข้าง sidebar: ฐานเดิมไม่มีแถว parent /isodocs-control
-- รันไฟล์นี้บน bizcore แล้วค่อยรันสคริปต์เมนูย่อยที่ยังไม่เคยสำเร็จ (หรือรันซ้ำได้ถ้าใช้ NOT EXISTS)

INSERT INTO menus (title, icon, route, parent_id, permission_name, `order`)
SELECT 'IsoDocs Control', 'description', '/isodocs-control', NULL, 'view isodocs', 50
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/isodocs-control');

UPDATE menus
SET permission_name = 'view isodocs'
WHERE route = '/isodocs-control';

-- หลังรันไฟล์นี้ ให้รันซ้ำ (หรือครั้งแรก) เพื่อสร้างเมนูลูกที่เคยข้ามเพราะไม่มี parent:
--   isodocs_control_step4_masters.sql  (ส่วนท้าย INSERT เมนู Type Master / Running No / Approval Flow)
--   isodocs_approval_flow_multi_users.sql (เมนู Iso Approval Flow ถ้ายังไม่มี)
--   isodocs_dar_menu.sql
