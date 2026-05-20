const mysql = require('../node_modules/mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore' });
  const [rows] = await conn.execute("SHOW TABLES LIKE 'advance%'");
  console.log('Tables:', rows);
  const [cols] = await conn.execute("DESCRIBE advance_transactions");
  console.log('Columns:', cols.map(c => c.Field + ' ' + c.Type));
  await conn.end();
})();
