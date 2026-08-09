const pool = require('../config/db');

function serializeOrder(r) {
  return {
    id: r.id,
    name: r.customer_name,
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

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM orders ORDER BY order_date DESC');
  res.json({ orders: rows.map(serializeOrder) });
}

async function create(req, res) {
  const { name, product, unit, quantity, rate, total, customRate, tracked } = req.body || {};
  if (!name || !product || !unit || quantity === undefined || rate === undefined || total === undefined) {
    return res.status(400).json({ message: 'Missing required order fields.' });
  }
  const qtyNum = Number(quantity), rateNum = Number(rate), totalNum = Number(total);
  if ([qtyNum, rateNum, totalNum].some(n => isNaN(n) || n < 0)) {
    return res.status(400).json({ message: 'Quantity, rate and total must be valid numbers.' });
  }

  const [productRows] = await pool.query('SELECT id FROM products WHERE name = ?', [product]);
  const productId = productRows.length ? productRows[0].id : null;

  const [result] = await pool.query(
    `INSERT INTO orders
       (customer_name, product_id, product_name, unit, quantity, rate, total, custom_rate, tracked, created_by, order_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      name.trim(), productId, product, unit, qtyNum, rateNum, totalNum,
      customRate ? 1 : 0, tracked === false ? 0 : 1, req.user.id
    ]
  );

  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [result.insertId]);
  res.status(201).json({ order: serializeOrder(rows[0]) });
}

async function clearAll(req, res) {
  await pool.query('DELETE FROM orders');
  res.json({ ok: true });
}

module.exports = { list, create, clearAll };
