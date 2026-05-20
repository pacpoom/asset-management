const mysql = require('../node_modules/mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore'
  });

  try {
    // Add permissions
    const permissions = [
      ['view advance expense', 'ดูรายการขอเบิกเงินทดรองจ่าย'],
      ['create advance expense', 'สร้างเอกสารขอเบิกเงินทดรองจ่าย'],
      ['approve advance expense', 'อนุมัติ/ปฏิเสธเอกสารขอเบิก'],
      ['delete advance expense', 'ลบเอกสารขอเบิกเงินทดรองจ่าย']
    ];

    for (const [name, description] of permissions) {
      try {
        await conn.execute(
          'INSERT INTO permissions (name, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)',
          [name, description]
        );
        console.log('Permission added/updated:', name);
      } catch (e) {
        console.log('Permission skip:', name, e.message);
      }
    }

    // Check if menus table exists and add menu
    const [menuCheck] = await conn.execute("SHOW TABLES LIKE 'menus'");
    if (menuCheck.length > 0) {
      // Find a good parent menu (Finance or similar)
      const [parents] = await conn.execute(
        "SELECT id, title FROM menus WHERE parent_id IS NULL ORDER BY `order` ASC"
      );
      console.log('Top-level menus:', parents.map(m => `${m.id}: ${m.title}`).join(', '));

      // Add menu item for Advance Expense
      await conn.execute(
        `INSERT INTO menus (title, icon, route, permission_name, \`order\`, parent_id)
         SELECT 'Advance Expense', 'payments', '/advance-expense', 'view advance expense', 99, NULL
         WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/advance-expense')
        `
      );
      console.log('Menu added (or already exists): Advance Expense');
    }

    // Give admin role all permissions
    const [adminRole] = await conn.execute("SELECT id FROM roles WHERE name LIKE '%admin%' LIMIT 1");
    if (adminRole.length > 0) {
      const adminId = adminRole[0].id;
      const [perms] = await conn.execute("SELECT id FROM permissions WHERE name LIKE '%advance expense%'");
      for (const perm of perms) {
        try {
          await conn.execute(
            'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [adminId, perm.id]
          );
        } catch {}
      }
      console.log('Admin role updated with advance expense permissions');
    }

  } finally {
    await conn.end();
    console.log('Done!');
  }
})();
