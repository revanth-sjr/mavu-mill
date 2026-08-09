const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '12h';

if (!SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set it in your .env file before deploying.');
}

function signToken(payload) {
  return jwt.sign(payload, SECRET || 'dev-only-insecure-secret', { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET || 'dev-only-insecure-secret');
}

module.exports = { signToken, verifyToken };
