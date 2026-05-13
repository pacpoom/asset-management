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
    // ดู type ของ job_orders.id เพื่อให้ FK ตรงกัน
    const [cols] = await conn.execute(
      "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='bizcore' AND TABLE_NAME='job_orders' AND COLUMN_NAME='id'"
    );
    const idType = cols[0]?.COLUMN_TYPE || 'int';
    console.log('job_orders.id type:', idType);

    const sql = `
      CREATE TABLE IF NOT EXISTS job_containers (
        id               ${idType}       NOT NULL AUTO_INCREMENT,
        job_order_id     ${idType}       NOT NULL,
        container_size   ENUM('20','40') NOT NULL,
        container_number VARCHAR(20)     NULL DEFAULT NULL,
        seal_number      VARCHAR(50)     NULL DEFAULT NULL,
        remarks          VARCHAR(255)    NULL DEFAULT NULL,
        created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_job_containers_job_order_id (job_order_id),
        CONSTRAINT fk_job_containers_job_order
          FOREIGN KEY (job_order_id) REFERENCES job_orders (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await conn.execute(sql);
    console.log('SUCCESS: table job_containers created (or already exists)');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
