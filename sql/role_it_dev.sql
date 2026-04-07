-- Role for internal developers: access /settings/env-config (.env UI)
-- Assign to users via users.role_id or user management UI
-- สิทธิ์ System Management รวม Users Control: รัน sql/permission_it_dev_system_management.sql

INSERT INTO roles (name, guard_name)
SELECT 'IT_Dev', 'web'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'IT_Dev');
