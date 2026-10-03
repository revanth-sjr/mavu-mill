const fs = require('fs');
const mysql = require('mysql2/promise');

// Most cloud MySQL providers (Aiven, PlanetScale, Railway, etc.) require an
// encrypted connection and hand you either a connection URL or a set of
// host/user/password fields. Both styles are supported here.

function buildSslOption() {
  if (String(process.env.DB_SSL).toLowerCase() !== 'true') return undefined;

  // If the provider gave you a CA certificate file, point DB_SSL_CA_PATH at
  // it — this is the most secure option and what Aiven recommends.
  const caPath = process.env.DB_SSL_CA_PATH;
  if (caPath && fs.existsSync(caPath)) {
    return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  }

  // Some hosts inject the certificate contents directly as an env var.
  if (process.env.DB_SSL_CA) {
    return { ca: process.env.DB_SSL_CA, rejectUnauthorized: true };
  }

  // Fall back to encrypted-but-unverified. The connection is still encrypted,
  // but the server's identity isn't checked, so prefer a CA cert when you can.
  return { rejectUnauthorized: false };
}

const poolOptions = {
  waitForConnections: true,
  connectionLimit: 10,
  // Return DECIMAL columns as JS numbers instead of strings.
  decimalNumbers: true
};

let pool;

if (process.env.DATABASE_URL) {
  // e.g. mysql://user:pass@host:3306/dbname
  pool = mysql.createPool(Object.assign(
    { uri: process.env.DATABASE_URL },
    poolOptions,
    { ssl: buildSslOption() }
  ));
} else {
  pool = mysql.createPool(Object.assign({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mavu_mill',
    ssl: buildSslOption()
  }, poolOptions));
}

module.exports = pool;
