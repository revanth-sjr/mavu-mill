require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const productsRoutes = require('./routes/products.routes');
const ordersRoutes = require('./routes/orders.routes');
const customersRoutes = require('./routes/customers.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Ensure database is ready before processing API requests
app.use('/api', async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    console.error('Database initialization error:', err.message);
    res.status(500).json({
      message: 'Database connection failed. Please check database configuration.',
      error: err.message
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/customers', customersRoutes);

// Serve the frontend from this same server (same origin — no CORS issues).
// index:false so that "/" falls through to the handler below and lands on
// the login page, rather than express.static auto-serving index.html.
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { index: false }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const file = req.path === '/' ? 'login.html' : req.path;
  res.sendFile(path.join(PUBLIC_DIR, file), err => {
    if (err) next();
  });
});

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error.' });
});

// ── Schema + default data (runs automatically on boot) ──────────────
// Creates the database itself if it doesn't exist yet, so you don't have to
// run any SQL by hand before the first start. Connects without selecting a
// database, creates it, then closes — the main pool takes over from there.
async function ensureDatabaseExists() {
  // Hosted providers create the database for you and require SSL/encrypted connections
  if (process.env.DATABASE_URL || String(process.env.DB_SSL).toLowerCase() === 'true') {
    return;
  }

  const mysql = require('mysql2/promise');
  const dbName = process.env.DB_NAME || 'mavu_mill';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(50)  NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name          VARCHAR(100) NOT NULL,
      role          ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(150) NOT NULL UNIQUE,
      category    ENUM('sales', 'service') NOT NULL,
      unit        VARCHAR(20)  NOT NULL,
      rate        DECIMAL(10,2) NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(150) NOT NULL,
      phone       VARCHAR(20)  NULL UNIQUE,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(150) NOT NULL,
      customer_id   INT NULL,
      product_id    INT NULL,
      product_name  VARCHAR(150) NOT NULL,
      unit          VARCHAR(20)  NOT NULL,
      quantity      DECIMAL(10,2) NOT NULL,
      rate          DECIMAL(10,2) NOT NULL,
      total         DECIMAL(10,2) NOT NULL,
      custom_rate   TINYINT(1) NOT NULL DEFAULT 0,
      tracked       TINYINT(1) NOT NULL DEFAULT 1,
      created_by    INT NULL,
      order_date    DATETIME NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

// Handles upgrading a database that was created before the `customers`
// table existed (i.e. an `orders` table with no `customer_id` column yet).
// Safe to run every boot — it only acts if the column is actually missing.
async function ensureMigrations() {
  const [cols] = await pool.query(`SHOW COLUMNS FROM orders LIKE 'customer_id'`);
  if (cols.length === 0) {
    console.log('Migrating: adding orders.customer_id ...');
    await pool.query('ALTER TABLE orders ADD COLUMN customer_id INT NULL AFTER customer_name');
    await pool.query(
      'ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL'
    );

    // Backfill: create a customer record for each distinct existing name
    // (best-effort, no phone numbers exist for old orders) and link orders
    // to it, so historical orders join the same dashboard logic as new ones.
    const [names] = await pool.query('SELECT DISTINCT customer_name FROM orders');
    for (const row of names) {
      const [result] = await pool.query('INSERT INTO customers (name, phone) VALUES (?, NULL)', [row.customer_name]);
      await pool.query('UPDATE orders SET customer_id = ? WHERE customer_name = ? AND customer_id IS NULL', [result.insertId, row.customer_name]);
    }
    console.log(`Migration complete: linked ${names.length} existing customer name(s) to new customer records.`);
  }
}

async function seedDefaults() {
  const [userCount] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (userCount[0].count === 0) {
    const adminHash = await bcrypt.hash('admin123', 10);
    const staffHash = await bcrypt.hash('staff123', 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
      ['admin', adminHash, 'Owner Admin', 'admin', 'staff', staffHash, 'Billing Staff', 'staff']
    );
    console.log('Seeded default accounts: admin/admin123 (admin), staff/staff123 (staff). Change these!');
  }

  const [productCount] = await pool.query('SELECT COUNT(*) AS count FROM products');
  if (productCount[0].count === 0) {
    const defaults = [
      ['கம்பு', 'sales', 'kg', 32],
      ['முத்துச்சோளம்', 'sales', 'kg', 25],
      ['தேங்காய் எண்ணெய்', 'sales', 'liter', 380],
      ['கடலை எண்ணெய்', 'sales', 'liter', 270],
      ['நல்லெண்ணெய்', 'sales', 'liter', 380],
      ['விளக்கெண்ணெய்', 'sales', 'liter', 250],
      ['நாட்டுச் சர்க்கரை', 'sales', 'kg', 80],
      ['மாட்டுத் தீவனம்', 'service', 'kg', 3],
      ['மிளகாய் பொடி', 'service', 'kg', 35],
      ['கோதுமைப் பொடி', 'service', 'kg', 15],
      ['அரிசி', 'service', 'kg', 15],
      ['எண்ணெய்', 'service', 'liter', 15]
    ];
    for (const [name, category, unit, rate] of defaults) {
      await pool.query(
        'INSERT INTO products (name, category, unit, rate) VALUES (?, ?, ?, ?)',
        [name, category, unit, rate]
      );
    }
    console.log('Seeded default product catalogue.');
  }
}

const PORT = process.env.PORT || 4000;

// Turns MySQL's cryptic error codes into plain-language fixes, so a failed
// start tells you what to actually do instead of just dumping a stack trace.
function explainStartupError(err) {
  const dbName = process.env.DB_NAME || 'mavu_mill';
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';

  const lines = ['', '='.repeat(62), '  COULD NOT START — the app could not reach your database.', '='.repeat(62), ''];

  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    lines.push(`  Problem:  Nothing is listening at ${host}:${process.env.DB_PORT || 3306}.`);
    lines.push('  Meaning:  Your MySQL server is almost certainly not running.');
    lines.push('');
    lines.push('  Fix:      If you installed XAMPP, open the XAMPP Control Panel');
    lines.push('            and click "Start" next to MySQL. Then run npm start again.');
  } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    lines.push(`  Problem:  MySQL rejected the username or password for "${user}".`);
    lines.push('  Meaning:  DB_USER / DB_PASSWORD in your .env file are wrong.');
    lines.push('');
    lines.push('  Fix:      Open .env and correct them. If you use XAMPP, the');
    lines.push('            default is usually DB_USER=root with an empty password.');
  } else if (err.code === 'ER_BAD_DB_ERROR') {
    lines.push(`  Problem:  The database "${dbName}" does not exist and could not be created.`);
    lines.push('  Fix:      Check that your MySQL user is allowed to create databases,');
    lines.push(`            or create it manually: CREATE DATABASE ${dbName};`);
  } else if (err.code === 'ENOTFOUND') {
    lines.push(`  Problem:  The host "${host}" could not be found.`);
    lines.push('  Fix:      Check DB_HOST in your .env file.');
  } else {
    lines.push(`  Problem:  ${err.message}`);
    lines.push(`  Code:     ${err.code || 'unknown'}`);
  }

  lines.push('', '  Your .env file should sit next to server.js in this folder.', '='.repeat(62), '');
  return lines.join('\n');
}

// ── Database initialization (cached for both local and serverless) ──
let dbInitPromise = null;
function initDb() {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await ensureDatabaseExists();
      await ensureSchema();
      await ensureMigrations();
      await seedDefaults();
    })().catch(err => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

// Start listening if executed directly (e.g. "node server.js" or "npm start")
if (require.main === module) {
  initDb()
    .then(() => {
      const server = app.listen(PORT, () => {
        console.log('');
        console.log('  Sakthi Mill server is running.');
        console.log('');
        console.log(`  Open your browser to:  http://localhost:${PORT}`);
        console.log('');
        console.log('  (Open that address in the browser — do NOT double-click');
        console.log('   the HTML files in the public folder, that will not work.)');
        console.log('');
        console.log('  Leave this window open while you use the app.');
        console.log('  Press Ctrl+C here to stop the server.');
        console.log('');
      });

      server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          console.error('');
          console.error('='.repeat(62));
          console.error(`  PORT ${PORT} IS ALREADY IN USE`);
          console.error('='.repeat(62));
          console.error('');
          console.error('  The app is most likely already running in another');
          console.error('  terminal window. Check your open windows first —');
          console.error(`  you may just need to open http://localhost:${PORT}`);
          console.error('');
          console.error('  If not, either close the other window (Ctrl+C there),');
          console.error('  or run this app on a different port:');
          console.error('');
          console.error('     Windows:  set PORT=4001 && npm start');
          console.error('     Mac:      PORT=4001 npm start');
          console.error('');
          console.error('='.repeat(62));
          console.error('');
        } else {
          console.error('Server error:', err.message);
        }
        process.exit(1);
      });
    })
    .catch(err => {
      console.error(explainStartupError(err));
      process.exit(1);
    });
}

module.exports = app;
