const mysql = require('../node_modules/mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore' });
  const [rows] = await conn.execute("SHOW TABLES LIKE 'document_seq%'");
  console.log('document_sequences tables:', rows);
  await conn.end();
})();
