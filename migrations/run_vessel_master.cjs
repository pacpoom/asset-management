const mysql = require('../node_modules/mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.111.57',
    port: 3306,
    user: 'root',
    password: 'Anji@12345',
    database: 'bizcore'
  });

  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS vessel_master (
        id               BIGINT       NOT NULL AUTO_INCREMENT,
        vessel_name      VARCHAR(255) NOT NULL,
        liner_id         INT          NULL DEFAULT NULL,
        storage_days     INT          NOT NULL DEFAULT 3,
        demurrage_days   INT          NOT NULL DEFAULT 3,
        detention_days   INT          NOT NULL DEFAULT 32,
        status           VARCHAR(20)  NOT NULL DEFAULT 'Active',
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_vessel_master_liner (liner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await conn.execute(sql);
    console.log('SUCCESS: table vessel_master created (or already exists)');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
