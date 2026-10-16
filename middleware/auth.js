const { verifyToken } = require('../utils/jwt');
const pool = require('../config/db');

// Looks up the user fresh from the DB on every request (rather than trusting
// the role baked into the token) so that role changes or account deletions
// take effect immediately, not just after the token expires.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not logged in.' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(403).json({ message: 'Session expired. Please refresh session.', code: 'TOKEN_EXPIRED' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!rows.length) return res.status(401).json({ message: 'Account no longer exists.' });
    const user = Object.assign({}, rows[0]);
    delete user.password_hash;
    req.user = user;
    next();
  } catch (dbErr) {
    console.error('Database error in authenticate middleware:', dbErr.message);
    return res.status(500).json({ message: 'Database error verifying session: ' + dbErr.message });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
