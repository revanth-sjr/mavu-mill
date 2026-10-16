const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (SECRET ? SECRET + '-refresh' : 'dev-refresh-secret');
const EXPIRES_IN_DEFAULT = '12h';
const EXPIRES_IN_REMEMBER = '30d';

if (!SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set it in your .env file before deploying.');
}

// Short-lived access token (e.g. 15 minutes)
function signAccessToken(payload) {
  return jwt.sign(payload, SECRET || 'dev-only-insecure-secret', { expiresIn: '15m' });
}

// Longer-lived refresh token (e.g. 7 days or 30 days)
function signRefreshToken(payload, rememberMe = false) {
  const expiresIn = rememberMe ? '30d' : '7d';
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, SECRET || 'dev-only-insecure-secret');
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

// Backward-compatible helpers
function signToken(payload, rememberMe = false) {
  const expiresIn = rememberMe ? EXPIRES_IN_REMEMBER : EXPIRES_IN_DEFAULT;
  return jwt.sign(payload, SECRET || 'dev-only-insecure-secret', { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET || 'dev-only-insecure-secret');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signToken,
  verifyToken,
  EXPIRES_IN_DEFAULT,
  EXPIRES_IN_REMEMBER
};

