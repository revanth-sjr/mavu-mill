const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN_DEFAULT = '12h';
const EXPIRES_IN_REMEMBER = '30d';

if (!SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set it in your .env file before deploying.');
}

function signToken(payload, rememberMe = false) {
  const expiresIn = rememberMe ? EXPIRES_IN_REMEMBER : EXPIRES_IN_DEFAULT;
  return jwt.sign(payload, SECRET || 'dev-only-insecure-secret', { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET || 'dev-only-insecure-secret');
}

module.exports = { signToken, verifyToken, EXPIRES_IN_DEFAULT, EXPIRES_IN_REMEMBER };
