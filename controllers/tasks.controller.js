const pool = require('../config/db');
const { findOrCreateCustomer } = require('./customers.controller');
const { sendTaskReadyEmail } = require('../utils/mailer');

function serializeTask(r) {
  const now = new Date();
  const readyDate = r.ready_by ? new Date(r.ready_by) : null;
  const isOverdue = r.status === 'pending' && readyDate && readyDate < now;
  const minutesRemaining = readyDate ? Math.round((readyDate - now) / 60000) : 0;

  return {
    id: r.id,
    tokenNo: r.token_no || `Task #${r.id}`,
    customerName: r.customer_name,
    customerId: r.customer_id,
    phone: r.customer_phone || r.effective_phone || null,
    customerEmail: r.customer_email || null,
    productId: r.product_id,
    productName: r.product_name,
    unit: r.unit,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    total: Number(r.total),
    customRate: !!r.custom_rate,
    category: r.category || 'service',
    readyBy: r.ready_by,
    status: r.status,
    notes: r.notes || '',
    reminderSentAt: r.reminder_sent_at || null,
    orderId: r.order_id,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    billedAt: r.billed_at,
    isOverdue,
    minutesRemaining
  };
}

const SELECT_TASKS = `
  SELECT t.*, COALESCE(t.customer_phone, c.phone) AS effective_phone, c.email AS customer_email
  FROM service_tasks t
  LEFT JOIN customers c ON t.customer_id = c.id
`;

async function list(req, res) {
  try {
    const { status, category, q } = req.query || {};
    let where = [];
    let params = [];

    if (status === 'active') {
      where.push("t.status IN ('pending', 'completed')");
    } else if (status && ['pending', 'completed', 'billed', 'cancelled'].includes(status)) {
      where.push('t.status = ?');
      params.push(status);
    }

    if (category && category === 'service') {
      where.push("(t.category = 'service' OR t.category IS NULL)");
    } else if (category && category === 'sales') {
      where.push("t.category = 'sales'");
    }

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      where.push('(t.customer_name LIKE ? OR t.customer_phone LIKE ? OR t.token_no LIKE ? OR t.product_name LIKE ? OR c.phone LIKE ?)');
      params.push(term, term, term, term, term);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let orderBy = 't.created_at DESC';
    if (status === 'pending') {
      orderBy = 't.ready_by ASC';
    } else if (status === 'completed') {
      orderBy = 't.completed_at DESC';
    } else if (status === 'active') {
      orderBy = "FIELD(t.status, 'pending', 'completed'), t.ready_by ASC";
    }

    const [rows] = await pool.query(`${SELECT_TASKS} ${whereClause} ORDER BY ${orderBy}`, params);
    res.json({ tasks: rows.map(serializeTask) });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ message: 'Error retrieving tasks: ' + err.message });
  }
}

async function counts(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
        SUM(CASE WHEN status = 'pending' AND ready_by < NOW() THEN 1 ELSE 0 END) AS overdueCount,
        SUM(CASE WHEN status = 'billed' AND DATE(billed_at) = CURDATE() THEN 1 ELSE 0 END) AS billedTodayCount,
        SUM(CASE WHEN status IN ('pending', 'completed') AND (category = 'service' OR category IS NULL) THEN 1 ELSE 0 END) AS serviceCount,
        SUM(CASE WHEN status IN ('pending', 'completed') AND category = 'sales' THEN 1 ELSE 0 END) AS salesCount
      FROM service_tasks
    `);

    const r = rows[0] || {};
    const pending = Number(r.pendingCount || 0);
    const completed = Number(r.completedCount || 0);
    const overdue = Number(r.overdueCount || 0);
    const billedToday = Number(r.billedTodayCount || 0);
    const serviceCount = Number(r.serviceCount || 0);
    const salesCount = Number(r.salesCount || 0);

    res.json({
      pending,
      completed,
      overdue,
      billedToday,
      serviceCount,
      salesCount,
      totalActive: pending + completed
    });
  } catch (err) {
    console.error('Tasks counts error:', err);
    res.status(500).json({ message: 'Error retrieving task counts: ' + err.message });
  }
}

async function getNextToken(req, res) {
  try {
    const category = req.query?.category === 'sales' ? 'sales' : 'service';
    const [rows] = await pool.query(`
      SELECT COUNT(*) AS countToday 
      FROM service_tasks 
      WHERE DATE(created_at) = CURDATE() AND (category = ? OR (? = 'service' AND category IS NULL))
    `, [category, category]);
    const nextNumber = (rows[0]?.countToday || 0) + 1;
    const prefix = category === 'sales' ? 'Order #' : 'Bag #';
    res.json({
      nextNumber,
      tokenNo: `${prefix}${nextNumber}`
    });
  } catch (err) {
    console.error('Get next token error:', err);
    res.status(500).json({ message: 'Error generating token number: ' + err.message });
  }
}

async function create(req, res) {
  try {
    const {
      customerName,
      phone,
      product,
      unit,
      quantity,
      rate,
      total,
      customRate,
      readyBy,
      tokenNo,
      notes
    } = req.body || {};

    if (!customerName || !product || !unit || quantity === undefined || rate === undefined || total === undefined) {
      return res.status(400).json({ message: 'Customer name, product, quantity, rate, and total are required.' });
    }

    const qtyNum = Number(quantity), rateNum = Number(rate), totalNum = Number(total);
    if ([qtyNum, rateNum, totalNum].some(n => isNaN(n) || n < 0)) {
      return res.status(400).json({ message: 'Quantity, rate and total must be valid positive numbers.' });
    }

    let cleanPhone = null;
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      cleanPhone = String(phone).trim();
    }

    // Link or create customer
    const customerId = await findOrCreateCustomer(customerName.trim(), cleanPhone);

    // Find product ID and category
    const [productRows] = await pool.query('SELECT id, category FROM products WHERE name = ?', [product]);
    const productId = productRows.length ? productRows[0].id : null;

    // Parse ready_by time
    let readyDate = readyBy ? new Date(readyBy) : null;
    if (!readyDate || isNaN(readyDate.getTime())) {
      // Default to +1 hour if not specified
      readyDate = new Date(Date.now() + 60 * 60 * 1000);
    }

    // Format readyBy as MySQL datetime: YYYY-MM-DD HH:MM:SS
    const mysqlReadyBy = readyDate.toISOString().slice(0, 19).replace('T', ' ');

    let finalTokenNo = tokenNo ? String(tokenNo).trim() : '';
    const determinedCategory = (req.body.category && ['service', 'sales'].includes(req.body.category))
      ? req.body.category
      : (productRows[0]?.category || 'service');

    if (!finalTokenNo) {
      const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM service_tasks WHERE DATE(created_at) = CURDATE()');
      const prefix = determinedCategory === 'sales' ? 'Order #' : 'Bag #';
      finalTokenNo = `${prefix}${(countRows[0]?.c || 0) + 1}`;
    }

    let createdById = null;
    if (req.user && req.user.id) {
      const [uRows] = await pool.query('SELECT id FROM users WHERE id = ?', [req.user.id]);
      if (uRows.length) createdById = uRows[0].id;
    }

    const [result] = await pool.query(
      `INSERT INTO service_tasks
         (token_no, customer_name, customer_id, customer_phone, product_id, product_name, category, unit, quantity, rate, total, custom_rate, ready_by, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        finalTokenNo,
        customerName.trim(),
        customerId,
        cleanPhone,
        productId,
        product,
        determinedCategory,
        unit,
        qtyNum,
        rateNum,
        totalNum,
        customRate ? 1 : 0,
        mysqlReadyBy,
        notes ? String(notes).trim() : null,
        createdById
      ]
    );

    const [createdRows] = await pool.query(`${SELECT_TASKS} WHERE t.id = ?`, [result.insertId]);
    res.status(201).json({
      task: serializeTask(createdRows[0]),
      message: 'Service task & reminder created successfully.'
    });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ message: 'Error creating task: ' + err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status update.' });
    }

    const [targetRows] = await pool.query('SELECT * FROM service_tasks WHERE id = ?', [id]);
    if (!targetRows.length) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    let completedAt = null;
    if (status === 'completed') {
      completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    await pool.query(
      'UPDATE service_tasks SET status = ?, completed_at = ? WHERE id = ?',
      [status, completedAt, id]
    );

    const [updatedRows] = await pool.query(`${SELECT_TASKS} WHERE t.id = ?`, [id]);
    res.json({
      task: serializeTask(updatedRows[0]),
      message: status === 'completed' ? 'Task marked as completed / ready for pickup!' : `Task updated to ${status}.`
    });
  } catch (err) {
    console.error('Update task status error:', err);
    res.status(500).json({ message: 'Error updating task status: ' + err.message });
  }
}

async function billTask(req, res) {
  try {
    const id = Number(req.params.id);
    const [taskRows] = await pool.query(`${SELECT_TASKS} WHERE t.id = ?`, [id]);
    const task = taskRows[0];

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    if (task.status === 'billed' && task.order_id) {
      // Already billed - return the existing order
      const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [task.order_id]);
      if (orderRows.length) {
        return res.json({
          alreadyBilled: true,
          order: orderRows[0],
          task: serializeTask(task),
          message: 'This task was already billed.'
        });
      }
    }

    // Insert into orders table
    const [orderResult] = await pool.query(
      `INSERT INTO orders
         (customer_name, customer_id, product_id, product_name, unit, quantity, rate, total, custom_rate, tracked, created_by, order_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
      [
        task.customer_name,
        task.customer_id,
        task.product_id,
        task.product_name,
        task.unit,
        task.quantity,
        task.rate,
        task.total,
        task.custom_rate,
        req.user?.id || null
      ]
    );

    const orderId = orderResult.insertId;

    // Update task to 'billed'
    await pool.query(
      `UPDATE service_tasks 
       SET status = 'billed', order_id = ?, billed_at = NOW(), completed_at = COALESCE(completed_at, NOW()) 
       WHERE id = ?`,
      [orderId, id]
    );

    // Fetch the new order
    const [newOrderRows] = await pool.query(`
      SELECT o.*, c.phone AS customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `, [orderId]);

    const orderRow = newOrderRows[0];
    const serializedOrder = {
      id: orderRow.id,
      name: orderRow.customer_name,
      phone: orderRow.customer_phone || task.effective_phone || null,
      customerId: orderRow.customer_id,
      product: orderRow.product_name,
      unit: orderRow.unit,
      quantity: Number(orderRow.quantity),
      rate: Number(orderRow.rate),
      total: Number(orderRow.total),
      customRate: !!orderRow.custom_rate,
      tracked: !!orderRow.tracked,
      date: orderRow.order_date
    };

    const [refetchedTask] = await pool.query(`${SELECT_TASKS} WHERE t.id = ?`, [id]);

    res.status(201).json({
      order: serializedOrder,
      task: serializeTask(refetchedTask[0]),
      message: 'Bill generated and saved to orders successfully!'
    });
  } catch (err) {
    console.error('Bill task error:', err);
    res.status(500).json({ message: 'Error generating bill for task: ' + err.message });
  }
}

async function remove(req, res) {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM service_tasks WHERE id = ?', [id]);
    res.json({ ok: true, message: 'Task deleted successfully.' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ message: 'Error deleting task: ' + err.message });
  }
}

/**
 * POST /api/tasks/:id/remind
 * Sends customer pickup reminder via WhatsApp and/or Email.
 * Updates reminder_sent_at = NOW() in database.
 */
async function sendReminder(req, res) {
  try {
    const id = Number(req.params.id);
    const { phone: overridePhone, email: overrideEmail, reminderType } = req.body || {};

    const [rows] = await pool.query(`${SELECT_TASKS} WHERE t.id = ?`, [id]);
    const rawTask = rows[0];
    if (!rawTask) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const task = serializeTask(rawTask);
    const targetPhone = (overridePhone || task.phone || '').toString().trim();
    const targetEmail = (overrideEmail || task.customerEmail || '').toString().trim();

    // If phone was provided and task or customer didn't have phone, save it
    if (targetPhone && !task.phone) {
      await pool.query('UPDATE service_tasks SET customer_phone = ? WHERE id = ?', [targetPhone, id]);
      if (task.customerId) {
        await pool.query('UPDATE customers SET phone = COALESCE(phone, ?) WHERE id = ?', [targetPhone, task.customerId]);
      }
      task.phone = targetPhone;
    }

    // Format phone for WhatsApp (clean non-digits; prepend 91 for standard 10-digit Indian numbers)
    let cleanPhoneDigits = targetPhone.replace(/\D/g, '');
    if (cleanPhoneDigits.length === 10) {
      cleanPhoneDigits = '91' + cleanPhoneDigits;
    }

    // Build bilingual WhatsApp reminder message
    let messageText = '';
    const isReadyReminder = (reminderType === 'ready' || (!reminderType && task.status === 'completed'));
    const isReceipt = (reminderType === 'receipt' || (!reminderType && task.status === 'billed'));

    if (isReadyReminder) {
      messageText = 
`*சக்தி எண்ணெய் மற்றும் மாவு ஆலை*
*Sakthi Oil & Flour Mill*
--------------------------------
வணக்கம் *${task.customerName}*!

உங்கள் அரைவை / பொருட்கள் தயார் நிலையில் உள்ளது. ஆலையில் வந்து பெற்றுக் கொள்ளவும்.
Your order is *READY FOR PICKUP* at our mill counter.

[டோக்கன் / Token]: ${task.tokenNo}
[பொருள் / Item]: ${task.productName}
[அளவு / Qty]: ${task.quantity} ${task.unit}
[மொத்த கட்டணம் / Amount]: ₹${task.total}

ஆலை முகவரி: சக்தி எண்ணெய் மற்றும் மாவு ஆலை
நன்றி / Thank you!`;
    } else if (isReceipt) {
      messageText = 
`*சக்தி எண்ணெய் மற்றும் மாவு ஆலை*
*Sakthi Oil & Flour Mill*
--------------------------------
வணக்கம் *${task.customerName}*!

உங்கள் பில் / ரசீது விவரம்:
Your billing receipt details:

[டோக்கன் / Token]: ${task.tokenNo}
[பொருள் / Item]: ${task.productName}
[அளவு / Qty]: ${task.quantity} ${task.unit}
[கட்டணம் / Total]: ₹${task.total}
[நிலை / Status]: நிறைவு பெற்றது (Delivered)

நன்றி, மீண்டும் வருக! / Thank you, visit again!`;
    } else {
      // Intake / Token slip notification
      messageText = 
`*சக்தி எண்ணெய் மற்றும் மாவு ஆலை*
*Sakthi Oil & Flour Mill*
--------------------------------
வணக்கம் *${task.customerName}*!

உங்கள் அரைவை பதிவு செய்யப்பட்டது.
Your milling / order task has been registered.

[டோக்கன் / Token]: ${task.tokenNo}
[பொருள் / Item]: ${task.productName}
[அளவு / Qty]: ${task.quantity} ${task.unit}
[மதிப்பீடு கட்டணம் / Est. Amount]: ₹${task.total}

நேரில் வரும்போது இந்த டோக்கன் எண்ணைக் காண்பிக்கவும்.
Please present this token number when collecting.
நன்றி! / Thank you!`;
    }

    const whatsappUrl = cleanPhoneDigits 
      ? `https://wa.me/${cleanPhoneDigits}?text=${encodeURIComponent(messageText)}`
      : null;

    // Update reminder_sent_at timestamp in database
    await pool.query('UPDATE service_tasks SET reminder_sent_at = NOW() WHERE id = ?', [id]);

    // Send email reminder if email is present
    let emailResult = null;
    if (targetEmail && targetEmail.includes('@')) {
      try {
        emailResult = await sendTaskReadyEmail(targetEmail, task.customerName, task);
      } catch (emErr) {
        console.warn('Email reminder failed:', emErr.message);
      }
    }

    const [refetched] = await pool.query(`${SELECT_TASKS} WHERE t.id = ?`, [id]);

    res.json({
      ok: true,
      whatsappUrl,
      emailSent: !!emailResult?.sent,
      task: serializeTask(refetched[0]),
      message: 'Reminder recorded successfully!'
    });
  } catch (err) {
    console.error('Send reminder error:', err);
    res.status(500).json({ message: 'Error processing reminder: ' + err.message });
  }
}

module.exports = {
  list,
  counts,
  getNextToken,
  create,
  updateStatus,
  billTask,
  remove,
  sendReminder
};
