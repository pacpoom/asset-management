-- Permission: ดูข่าวสาร / ประกาศบนหน้าแรก (/) — โค้ดอ้างชื่อ 'view dashboard news'
-- (ชื่อฟีเจอร์ภาษาอังกฤษอาจเรียก DashboardNews; ใน DB ใช้รูปแบบเดียวกับ view dashboard)
-- รันแล้วไปผูกกับ Role ที่ต้องการใน Roles & Permissions เอง

INSERT INTO permissions (name, guard_name)
SELECT 'view dashboard news', 'web'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'view dashboard news');
