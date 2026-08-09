const pool = require('../config/db');

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM products ORDER BY category, name');
  res.json({ products: rows });
}

async function create(req, res) {
  const { name, category, unit, rate } = req.body || {};
  if (!name || !['sales', 'service'].includes(category) || !unit || rate === undefined) {
    return res.status(400).json({ message: 'Name, category, unit and price are required.' });
  }
  const rateNum = Number(rate);
  if (isNaN(rateNum) || rateNum < 0) {
    return res.status(400).json({ message: 'Enter a valid price.' });
  }

  const [existing] = await pool.query('SELECT id FROM products WHERE name = ?', [name.trim()]);
  if (existing.length) return res.status(409).json({ message: 'A product with this name already exists.' });

  const [result] = await pool.query(
    'INSERT INTO products (name, category, unit, rate) VALUES (?, ?, ?, ?)',
    [name.trim(), category, unit, rateNum]
  );

  res.status(201).json({
    product: { id: result.insertId, name: name.trim(), category, unit, rate: rateNum }
  });
}

async function updateRate(req, res) {
  const id = Number(req.params.id);
  const { rate } = req.body || {};
  const rateNum = Number(rate);
  if (isNaN(rateNum) || rateNum < 0) {
    return res.status(400).json({ message: 'Enter a valid price.' });
  }

  const [result] = await pool.query('UPDATE products SET rate = ? WHERE id = ?', [rateNum, id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Product not found.' });
  res.json({ ok: true });
}

async function remove(req, res) {
  const id = Number(req.params.id);
  const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Product not found.' });
  res.json({ ok: true });
}

module.exports = { list, create, updateRate, remove };
