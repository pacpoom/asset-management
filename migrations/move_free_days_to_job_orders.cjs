/**
 * ย้าย storage_days, demurrage_days, detention_days
 * จาก job_containers → job_orders แล้วลบออกจาก job_containers
 *
 * รัน: node migrations/move_free_days_to_job_orders.cjs
 */
const mysql = require('../node_modules/mysql2/promise');
const fs = require('fs');
const path = require('path');

function loadEnv() {
	const envPath = path.join(__dirname, '..', '.env');
	if (!fs.existsSync(envPath)) return {};
	const out = {};
	for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!m) continue;
		out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
	}
	return out;
}

async function columnExists(conn, table, column) {
	const [rows] = await conn.query(
		`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		[table, column]
	);
	return rows.length > 0;
}

(async () => {
	const env = loadEnv();
	const conn = await mysql.createConnection({
		host: env.DB_HOST || 'localhost',
		port: Number(env.DB_PORT) || 3306,
		user: env.DB_USER || 'root',
		password: env.DB_PASSWORD || '',
		database: env.DB_DATABASE || env.DB_NAME || 'bizcore'
	});

	try {
		console.log('Database:', (await conn.query('SELECT DATABASE() as db'))[0][0].db);

		for (const col of ['storage_days', 'demurrage_days', 'detention_days']) {
			if (!(await columnExists(conn, 'job_orders', col))) {
				const after =
					col === 'storage_days'
						? 'AFTER vessel_master_id'
						: col === 'demurrage_days'
							? 'AFTER storage_days'
							: 'AFTER demurrage_days';
				await conn.execute(
					`ALTER TABLE job_orders ADD COLUMN ${col} INT NULL DEFAULT NULL ${after}`
				);
				console.log(`✓ job_orders.${col} added`);
			} else {
				console.log(`– job_orders.${col} already exists`);
			}
		}

		const jcHas = await columnExists(conn, 'job_containers', 'storage_days');
		if (jcHas) {
			const [upd] = await conn.execute(`
				UPDATE job_orders j
				INNER JOIN (
				  SELECT job_order_id,
				         MAX(storage_days)   AS storage_days,
				         MAX(demurrage_days) AS demurrage_days,
				         MAX(detention_days) AS detention_days
				  FROM job_containers
				  WHERE storage_days IS NOT NULL
				     OR demurrage_days IS NOT NULL
				     OR detention_days IS NOT NULL
				  GROUP BY job_order_id
				) jc ON jc.job_order_id = j.id
				SET j.storage_days   = COALESCE(j.storage_days,   jc.storage_days),
				    j.demurrage_days = COALESCE(j.demurrage_days, jc.demurrage_days),
				    j.detention_days = COALESCE(j.detention_days, jc.detention_days)
			`);
			console.log(`✓ Copied from job_containers → job_orders (${upd.affectedRows} job(s))`);
		} else {
			console.log('– job_containers has no free-day columns, skip copy from containers');
		}

		const [updVm] = await conn.execute(`
			UPDATE job_orders j
			INNER JOIN vessel_master vm ON j.vessel_master_id = vm.id
			SET j.storage_days   = COALESCE(j.storage_days,   vm.storage_days),
			    j.demurrage_days = COALESCE(j.demurrage_days, vm.demurrage_days),
			    j.detention_days = COALESCE(j.detention_days, vm.detention_days)
			WHERE j.vessel_master_id IS NOT NULL
		`);
		console.log(`✓ Filled from vessel_master where empty (${updVm.affectedRows} row(s) touched)`);

		for (const col of ['storage_days', 'demurrage_days', 'detention_days']) {
			if (await columnExists(conn, 'job_containers', col)) {
				await conn.execute(`ALTER TABLE job_containers DROP COLUMN ${col}`);
				console.log(`✓ Dropped job_containers.${col}`);
			}
		}

		console.log('\n✅ Migration complete. Free days are now on job_orders only.');
	} catch (e) {
		console.error('ERROR:', e.message);
		process.exit(1);
	} finally {
		await conn.end();
	}
})();
