const mysql = require('../node_modules/mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore'
  });

  try {
    // Check permissions table structure
    const [cols] = await conn.execute("DESCRIBE permissions");
    console.log('Permissions columns:', cols.map(c => c.Field).join(', '));

    const permissions = [
      'view advance expense',
      'create advance expense',
      'approve advance expense',
      'delete advance expense'
    ];

    for (const name of permissions) {
      try {
        await conn.execute('INSERT IGNORE INTO permissions (name) VALUES (?)', [name]);
        console.log('Permission added:', name);
      } catch (e) {
        console.log('Permission error:', name, e.message);
      }
    }

    // Give admin role all advance expense permissions
    const [adminRoles] = await conn.execute("SELECT id FROM roles WHERE name LIKE '%admin%'");
    console.log('Admin roles:', adminRoles.map(r => r.id));

    if (adminRoles.length > 0) {
      const [perms] = await conn.execute("SELECT id, name FROM permissions WHERE name LIKE '%advance expense%'");
      console.log('Advance permissions:', perms.map(p => p.name));

      for (const role of adminRoles) {
        for (const perm of perms) {
          try {
            await conn.execute(
              'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
              [role.id, perm.id]
            );
          } catch {}
        }
      }
      console.log('Admin roles updated with advance expense permissions');
    }

  } finally {
    await conn.end();
    console.log('Done!');
  }
})();
