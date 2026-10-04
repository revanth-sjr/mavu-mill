const pool = require('../config/db');

async function list(req, res) {
  // Optional ?q= search across name and phone. Used by the billing page's
  // customer lookup and the dashboard's customer search box.
  const q = (req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 100, 100);

  let where = '';
  const params = [];
  if (q) {
    where = 'WHERE c.name LIKE ? OR c.phone LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }

  const [rows] = await pool.query(`
    SELECT c.id, c.name, c.phone, c.created_at,
           COUNT(o.id) AS order_count,
           COALESCE(SUM(o.total), 0) AS total_spent,
           MAX(o.order_date) AS last_order_date
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    ${where}
    GROUP BY c.id
    ORDER BY total_spent DESC
    LIMIT ?
  `, [...params, limit]);

  res.json({
    customers: rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      orderCount: r.order_count,
      totalSpent: Number(r.total_spent),
      lastOrderDate: r.last_order_date
    }))
  });
}

// Matches an existing customer or creates a new one.
//  - If a phone number is given, it's the source of truth: exact match on
//    phone, otherwise create a new customer with that phone.
//  - If no phone is given, fall back to matching an existing *phoneless*
//    customer with the same name (case-insensitive), otherwise create a
//    new phoneless customer. This deliberately does NOT merge into a
//    customer who has a phone on file, so a same-named walk-in without a
//    phone doesn't get silently attached to someone else's phone-verified
//    record.
async function findOrCreateCustomer(name, phone) {
  const cleanName = String(name).trim();

  if (phone) {
    const cleanPhone = String(phone).trim();
    const [existing] = await pool.query('SELECT id FROM customers WHERE phone = ?', [cleanPhone]);
    if (existing.length) return existing[0].id;
    const [result] = await pool.query('INSERT INTO customers (name, phone) VALUES (?, ?)', [cleanName, cleanPhone]);
    return result.insertId;
  }

  const [existing] = await pool.query(
    'SELECT id FROM customers WHERE phone IS NULL AND LOWER(name) = LOWER(?) LIMIT 1',
    [cleanName]
  );
  if (existing.length) return existing[0].id;
  const [result] = await pool.query('INSERT INTO customers (name, phone) VALUES (?, NULL)', [cleanName]);
  return result.insertId;
}

async function create(req, res) {
  const { name, phone } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Customer name is required.' });
  }

  let cleanPhone = null;
  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    cleanPhone = String(phone).trim();
    if (!/^[0-9+\-\s]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ message: 'Enter a valid phone number, or leave it blank.' });
    }
    const [existing] = await pool.query('SELECT id, name, phone FROM customers WHERE phone = ?', [cleanPhone]);
    if (existing.length) {
      return res.status(409).json({
        message: `Phone number is already registered for ${existing[0].name}.`,
        customer: existing[0]
      });
    }
  }

  const [result] = await pool.query(
    'INSERT INTO customers (name, phone) VALUES (?, ?)',
    [name.trim(), cleanPhone]
  );

  res.status(201).json({
    ok: true,
    message: 'Customer registered successfully.',
    customer: { id: result.insertId, name: name.trim(), phone: cleanPhone }
  });
}

module.exports = { list, create, findOrCreateCustomer };
