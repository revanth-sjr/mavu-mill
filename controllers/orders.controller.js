const pool = require('../config/db');
const { findOrCreateCustomer } = require('./customers.controller');

function serializeOrder(r) {
  return {
    id: r.id,
    name: r.customer_name,
    phone: r.customer_phone || null,
    customerId: r.customer_id,
    product: r.product_name,
    unit: r.unit,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    total: Number(r.total),
    customRate: !!r.custom_rate,
    tracked: !!r.tracked,
    date: r.order_date
  };
}

const SELECT_ORDERS = `
  SELECT o.*, c.phone AS customer_phone
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id
`;

async function list(req, res) {
  const [rows] = await pool.query(`${SELECT_ORDERS} ORDER BY o.order_date DESC`);
  res.json({ orders: rows.map(serializeOrder) });
}

async function create(req, res) {
  const { name, phone, product, unit, quantity, rate, total, customRate, tracked } = req.body || {};
  if (!name || !product || !unit || quantity === undefined || rate === undefined || total === undefined) {
    return res.status(400).json({ message: 'Missing required order fields.' });
  }
  const qtyNum = Number(quantity), rateNum = Number(rate), totalNum = Number(total);
  if ([qtyNum, rateNum, totalNum].some(n => isNaN(n) || n < 0)) {
    return res.status(400).json({ message: 'Quantity, rate and total must be valid numbers.' });
  }

  let cleanPhone = null;
  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    cleanPhone = String(phone).trim();
    if (!/^[0-9+\-\s]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ message: 'Enter a valid phone number, or leave it blank.' });
    }
  }

  const isTracked = tracked !== false;
  const customerId = isTracked ? await findOrCreateCustomer(name, cleanPhone) : null;

  const [productRows] = await pool.query('SELECT id FROM products WHERE name = ?', [product]);
  const productId = productRows.length ? productRows[0].id : null;

  const [result] = await pool.query(
    `INSERT INTO orders
       (customer_name, customer_id, product_id, product_name, unit, quantity, rate, total, custom_rate, tracked, created_by, order_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      name.trim(), customerId, productId, product, unit, qtyNum, rateNum, totalNum,
      customRate ? 1 : 0, isTracked ? 1 : 0, req.user.id
    ]
  );

  const [rows] = await pool.query(`${SELECT_ORDERS} WHERE o.id = ?`, [result.insertId]);
  res.status(201).json({ order: serializeOrder(rows[0]) });
}

async function clearAll(req, res) {
  await pool.query('DELETE FROM orders');
  res.json({ ok: true });
}

module.exports = { list, create, clearAll };
