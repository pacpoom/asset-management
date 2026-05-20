// Migration runner for Advance Expense System
const mysql = require('../node_modules/mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: '192.168.111.57',
    port: 3306,
    user: 'root',
    password: 'Anji@12345',
    database: 'bizcore',
    multipleStatements: true
  });

  console.log('Connected to database:', process.env.DB_DATABASE || 'bizcore');

  try {
    const sqlFile = path.resolve(__dirname, '../sql/advance_expense_system.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split and run each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      try {
        await connection.execute(trimmed);
        console.log('OK:', trimmed.substring(0, 60).replace(/\n/g, ' ') + '...');
      } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_DUP_FIELDNAME') {
          console.log('SKIP (already exists):', trimmed.substring(0, 60).replace(/\n/g, ' '));
        } else {
          console.warn('WARN:', err.message);
        }
      }
    }
    console.log('\nMigration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
