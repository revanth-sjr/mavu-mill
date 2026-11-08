const pool = require('../config/db');
const { findOrCreateCustomer } = require('./customers.controller');

function serializeOrder(r) {
  return {
    id: r.id,
    billNo: r.bill_no || `BILL-${r.id}`,
    name: r.customer_name,
    phone: r.customer_phone || null,
    customerId: r.customer_id,
    productId: r.product_id,
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

async function getNextBillNo() {
  try {
    const [rows] = await pool.query(`
      SELECT bill_no FROM orders 
      WHERE bill_no IS NOT NULL AND bill_no != ''
      ORDER BY id DESC LIMIT 50
    `);
    let maxNum = 1000;
    for (const r of rows) {
      if (!r.bill_no) continue;
      const numMatch = r.bill_no.match(/(\d+)/);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    return `BILL-${maxNum + 1}`;
  } catch (err) {
    return `BILL-${Date.now().toString().slice(-6)}`;
  }
}

async function list(req, res) {
  try {
    const { billNo } = req.query || {};
    let query = `${SELECT_ORDERS}`;
    const params = [];

    if (billNo) {
      query += ` WHERE o.bill_no = ? ORDER BY o.id ASC`;
      params.push(billNo);
    } else {
      query += ` ORDER BY o.order_date DESC, o.id DESC`;
    }

    const [rows] = await pool.query(query, params);
    res.json({ orders: rows.map(serializeOrder) });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ message: 'Error retrieving orders: ' + err.message });
  }
}

async function create(req, res) {
  try {
    const {
      name,
      phone,
      customerId: reqCustomerId,
      tracked,
      items,
      product,
      unit,
      quantity,
      rate,
      total,
      customRate
    } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Customer name is required / வாடிக்கையாளர் பெயர் அவசியம்.' });
    }

    // Support both multi-item ({ items: [...] }) and legacy single-item
    let orderItems = [];
    if (Array.isArray(items) && items.length > 0) {
      orderItems = items;
    } else if (product && unit) {
      orderItems = [{ product, unit, quantity, rate, total, customRate }];
    } else {
      return res.status(400).json({ message: 'Please select at least one product / குறைந்தபட்சம் ஒரு பொருள் தேவை.' });
    }

    // Validate all items
    for (let i = 0; i < orderItems.length; i++) {
      const it = orderItems[i];
      if (!it.product || !it.unit || it.quantity === undefined || it.rate === undefined) {
        return res.status(400).json({ message: `Item #${i + 1} (${it.product || 'Unknown'}) is missing required fields.` });
      }
      const qtyNum = Number(it.quantity);
      const rateNum = Number(it.rate);
      const totalNum = it.total !== undefined ? Number(it.total) : qtyNum * rateNum;
      if (isNaN(qtyNum) || qtyNum <= 0 || isNaN(rateNum) || rateNum < 0 || isNaN(totalNum) || totalNum < 0) {
        return res.status(400).json({ message: `Item #${i + 1} (${it.product}) has invalid quantity, rate, or total.` });
      }
    }

    let cleanPhone = null;
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      cleanPhone = String(phone).trim();
      if (!/^[0-9+\-\s]{7,15}$/.test(cleanPhone)) {
        return res.status(400).json({ message: 'Enter a valid phone number, or leave it blank.' });
      }
    }

    const isTracked = tracked !== false;
    let customerId = null;
    if (isTracked) {
      if (reqCustomerId) {
        customerId = reqCustomerId;
      } else {
        customerId = await findOrCreateCustomer(name.trim(), cleanPhone);
      }
    }

    const billNo = await getNextBillNo();
    let userId = null;
    if (req.user && req.user.id) {
      const [uRows] = await pool.query('SELECT id FROM users WHERE id = ?', [req.user.id]);
      if (uRows.length) userId = uRows[0].id;
    }

    const insertedOrders = [];
    for (const it of orderItems) {
      const qtyNum = Number(it.quantity);
      const rateNum = Number(it.rate);
      const totalNum = it.total !== undefined ? Number(it.total) : qtyNum * rateNum;

      const [productRows] = await pool.query('SELECT id FROM products WHERE name = ?', [it.product]);
      const productId = productRows.length ? productRows[0].id : null;

      const [result] = await pool.query(
        `INSERT INTO orders
           (bill_no, customer_name, customer_id, product_id, product_name, unit, quantity, rate, total, custom_rate, tracked, created_by, order_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          billNo,
          name.trim(),
          customerId,
          productId,
          it.product,
          it.unit,
          qtyNum,
          rateNum,
          totalNum,
          it.customRate ? 1 : 0,
          isTracked ? 1 : 0,
          userId
        ]
      );

      insertedOrders.push({
        id: result.insertId,
        billNo,
        product: it.product,
        productId,
        unit: it.unit,
        quantity: qtyNum,
        rate: rateNum,
        total: totalNum,
        customRate: !!it.customRate
      });
    }

    const [firstRows] = await pool.query(`${SELECT_ORDERS} WHERE o.id = ?`, [insertedOrders[0].id]);
    const primaryOrder = firstRows[0] || {};
    const orderDate = primaryOrder.order_date || new Date();
    const customerPhone = primaryOrder.customer_phone || cleanPhone || null;

    const grandTotal = insertedOrders.reduce((sum, it) => sum + it.total, 0);
    const totalQuantity = insertedOrders.reduce((sum, it) => sum + it.quantity, 0);

    const billResult = {
      billNo,
      name: name.trim(),
      phone: customerPhone,
      customerId,
      date: orderDate,
      items: insertedOrders,
      itemCount: insertedOrders.length,
      totalQuantity,
      total: grandTotal,
      tracked: isTracked,
      order: {
        id: insertedOrders[0].id,
        billNo,
        name: name.trim(),
        phone: customerPhone,
        customerId,
        product: insertedOrders.length === 1 ? insertedOrders[0].product : `${insertedOrders.length} items (${insertedOrders.map(i => i.product).join(', ')})`,
        unit: insertedOrders.length === 1 ? insertedOrders[0].unit : 'items',
        quantity: totalQuantity,
        rate: insertedOrders.length === 1 ? insertedOrders[0].rate : grandTotal,
        total: grandTotal,
        customRate: insertedOrders.some(i => i.customRate),
        tracked: isTracked,
        date: orderDate,
        items: insertedOrders
      }
    };

    res.status(201).json(billResult);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ message: 'Error saving order: ' + err.message });
  }
}

async function clearAll(req, res) {
  try {
    await pool.query('DELETE FROM orders');
    res.json({ ok: true });
  } catch (err) {
    console.error('Clear orders error:', err);
    res.status(500).json({ message: 'Error clearing orders: ' + err.message });
  }
}

module.exports = { list, create, clearAll, getNextBillNo };
