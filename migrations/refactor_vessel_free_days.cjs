/**
 * Migration: refactor vessel free days
 *
 * - Add vessel_master_id (FK) to job_orders
 * - Populate it by matching job_orders.vessel = vessel_master.vessel_name
 * - (legacy) ถ้ามีคอลัมน์ free days บน job_orders แล้ว drop — ปัจจุบันใช้ job_orders เก็บ snapshot
 *   ดู migrations/move_free_days_to_job_orders.cjs สำหรับย้ายจาก job_containers
 */
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
    // ── 1. Check which columns currently exist ─────────────────────────
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'bizcore' AND TABLE_NAME = 'job_orders'`
    );
    const existing = new Set(cols.map((r) => r.COLUMN_NAME));

    // ── 2. Add vessel_master_id if not present ─────────────────────────
    if (!existing.has('vessel_master_id')) {
      await conn.execute(
        'ALTER TABLE job_orders ADD COLUMN vessel_master_id BIGINT DEFAULT NULL AFTER vessel'
      );
      console.log('✓ Added vessel_master_id column');

      await conn.execute(
        'ALTER TABLE job_orders ADD KEY idx_job_orders_vessel_master (vessel_master_id)'
      );
      console.log('✓ Added index on vessel_master_id');
    } else {
      console.log('– vessel_master_id already exists, skipping ADD');
    }

    // ── 3. Populate vessel_master_id by name match ─────────────────────
    const [upd] = await conn.execute(
      `UPDATE job_orders j
       JOIN vessel_master vm
         ON TRIM(j.vessel) = TRIM(vm.vessel_name) AND vm.status = 'Active'
       SET j.vessel_master_id = vm.id
       WHERE j.vessel_master_id IS NULL AND j.vessel IS NOT NULL AND j.vessel != ''`
    );
    console.log(`✓ Matched vessel_master_id for ${upd.affectedRows} job(s) by vessel name`);

    // ── 4. Drop old free-day columns ───────────────────────────────────
    const toDrop = ['storage_days', 'demurrage_days', 'detention_days'].filter((c) =>
      existing.has(c)
    );
    if (toDrop.length > 0) {
      const dropClauses = toDrop.map((c) => `DROP COLUMN ${c}`).join(', ');
      await conn.execute(`ALTER TABLE job_orders ${dropClauses}`);
      console.log(`✓ Dropped columns: ${toDrop.join(', ')}`);
    } else {
      console.log('– storage/demurrage/detention already absent, skipping DROP');
    }

    console.log('\n✅ Migration complete!');
    console.log(
      '   Free days are now sourced from vessel_master via vessel_master_id FK.'
    );
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
