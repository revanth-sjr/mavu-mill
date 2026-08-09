const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ message: 'Invalid username or password.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid username or password.' });

  const token = signToken({ id: user.id });
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role }
  });
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function listUsers(req, res) {
  const [rows] = await pool.query(
    'SELECT id, username, name, role, created_at FROM users ORDER BY created_at ASC'
  );
  res.json({ users: rows });
}

async function register(req, res) {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name || !['admin', 'staff'].includes(role)) {
    return res.status(400).json({ message: 'Username, password, name and a valid role are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
  if (existing.length) return res.status(409).json({ message: 'That username is already taken.' });

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    [username.trim(), hash, name.trim(), role]
  );

  res.status(201).json({
    user: { id: result.insertId, username: username.trim(), name: name.trim(), role }
  });
}

async function deleteUser(req, res) {
  const id = Number(req.params.id);

  if (id === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own account while logged in.' });
  }

  const [targetRows] = await pool.query('SELECT role FROM users WHERE id = ?', [id]);
  const target = targetRows[0];
  if (!target) return res.status(404).json({ message: 'Account not found.' });

  if (target.role === 'admin') {
    const [countRows] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (countRows[0].count <= 1) {
      return res.status(400).json({ message: 'Cannot delete the last remaining admin account.' });
    }
  }

  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true });
}

module.exports = { login, me, listUsers, register, deleteUser };
