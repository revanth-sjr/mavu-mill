const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mavu_mill',
  waitForConnections: true,
  connectionLimit: 10,
  // Return DECIMAL columns as JS numbers instead of strings.
  decimalNumbers: true
});

module.exports = pool;
