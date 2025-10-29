import mysql from 'mysql2/promise';
// SvelteKit will automatically pull values from the .env file.
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } from '$env/static/private';

// Create a connection pool to MySQL.
// Using a pool is better for managing multiple simultaneous connections.
const pool = mysql.createPool({
  host: DB_HOST,
  port: parseInt(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  
  supportBigNumbers: true,
  bigNumberStrings: true

});

export default pool;