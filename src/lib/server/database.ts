import mysql from 'mysql2/promise';
import { env } from '$env/dynamic/private';

export const pool = mysql.createPool({
	host: env.DB_HOST,
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: env.DB_DATABASE,
	port: Number(env.DB_PORT) || 3306,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

export const vdcPool = mysql.createPool({
	host: env.VDC_HOST || '192.168.111.52',
	port: Number(env.VDC_PORT) || 3308,
	user: env.VDC_USER || 'root',
	password: env.VDC_PASSWORD || 'Anji@12345',
	database: env.VDC_DATABASE || 'vdc_db',
	waitForConnections: true,
	connectionLimit: 5,
	queueLimit: 0
});

export default pool;
