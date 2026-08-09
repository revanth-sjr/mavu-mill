require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const productsRoutes = require('./routes/products.routes');
const ordersRoutes = require('./routes/orders.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);

// ── Serve the frontend (same server, same origin — no CORS headaches) ──
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

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
    CREATE TABLE IF NOT EXISTS orders (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(150) NOT NULL,
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
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
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

ensureSchema()
  .then(seedDefaults)
  .then(() => {
    app.listen(PORT, () => console.log(`Mavu Mill server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Startup failed (check your DB connection settings in .env):', err.message);
    process.exit(1);
  });
