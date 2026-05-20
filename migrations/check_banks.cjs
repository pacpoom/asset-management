const mysql = require('../node_modules/mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore' });
  const [banks] = await conn.execute("SHOW TABLES LIKE 'bank%'");
  console.log('Bank tables:', banks);
  if (banks.length > 0) {
    const [cols] = await conn.execute("DESCRIBE banks");
    console.log('Banks cols:', cols.map(c => c.Field));
    const [rows] = await conn.execute("SELECT * FROM banks LIMIT 5");
    console.log('Banks data:', rows);
  }
  const [customers] = await conn.execute("SHOW TABLES LIKE 'customers'");
  console.log('Customers table:', customers.length > 0 ? 'EXISTS' : 'NOT FOUND');
  if (customers.length > 0) {
    const [cols] = await conn.execute("DESCRIBE customers");
    console.log('Customers cols:', cols.map(c => c.Field).join(', '));
  }
  await conn.end();
})();
