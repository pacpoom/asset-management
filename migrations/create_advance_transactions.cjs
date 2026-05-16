const mysql = require('../node_modules/mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.111.57', port: 3306, user: 'root', password: 'Anji@12345', database: 'bizcore'
  });

  console.log('Creating advance_transactions table...');
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS advance_transactions (
      id int NOT NULL AUTO_INCREMENT,
      advance_application_id int NOT NULL,
      job_order_id bigint DEFAULT NULL,
      transaction_date date NOT NULL,
      description varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      amount decimal(15,2) NOT NULL DEFAULT '0.00',
      type enum('expense','refund') NOT NULL DEFAULT 'expense',
      invoice_image varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      slip_image varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      remark text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      created_by int DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_advance_txn_app (advance_application_id),
      KEY idx_advance_txn_job (job_order_id),
      CONSTRAINT fk_advance_txn_app FOREIGN KEY (advance_application_id) REFERENCES advance_applications (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('advance_transactions table created successfully!');

  const [rows] = await conn.execute("SHOW TABLES LIKE 'advance%'");
  console.log('Advance tables:', rows.map(r => Object.values(r)[0]));
  await conn.end();
})();
