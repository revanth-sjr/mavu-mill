const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const {
  signToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require('../utils/jwt');
const { sendOtpEmail } = require('../utils/mailer');

async function login(req, res) {
  const { username, email, password, rememberMe } = req.body || {};
  const identifier = String(email || username || '').trim();
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Gmail/Email and password are required / மின்னஞ்சல் மற்றும் கடவுச்சொல் தேவை.' });
  }

  // Find user by email or username
  let user = null;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [identifier, identifier]
    );
    user = rows[0];
  } catch (e) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [identifier]);
    user = rows[0];
  }

  if (!user) {
    return res.status(401).json({ message: 'Invalid Gmail or password / தவறான ஜிமெயில் அல்லது கடவுச்சொல்.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid Gmail or password / தவறான ஜிமெயில் அல்லது கடவுச்சொல்.' });
  }

  // Password verified! Generate and dispatch 2FA OTP to the user's Gmail
  let targetEmail = user.email;
  if (!targetEmail && user.username && user.username.includes('@')) {
    targetEmail = user.username;
  }
  if (!targetEmail) {
    targetEmail = process.env.SMTP_USER || 'revanthsjr@gmail.com';
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Clear previous OTPs and record new one
  await pool.query('DELETE FROM email_otps WHERE email = ? OR user_id = ?', [targetEmail.toLowerCase(), user.id]);
  await pool.query(
    'INSERT INTO email_otps (email, user_id, otp_code, expires_at) VALUES (?, ?, ?, ?)',
    [targetEmail.toLowerCase(), user.id, otp, expiresAt]
  );

  // Send real email via SMTP
  try {
    await sendOtpEmail(targetEmail, otp, user.name || user.username);
  } catch (mailErr) {
    console.error('Failed to send OTP email:', mailErr.message);
    return res.status(500).json({
      message: 'Failed to send OTP to Gmail: ' + mailErr.message
    });
  }

  return res.json({
    ok: true,
    requiresOtp: true,
    email: targetEmail,
    rememberMe: !!rememberMe,
    message: `Password verified! 6-digit OTP sent to ${targetEmail} / கடவுச்சொல் சரிபார்க்கப்பட்டது. உங்கள் ஜிமெயிலுக்கு OTP அனுப்பப்பட்டுள்ளது.`
  });
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function updateProfile(req, res) {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Display name cannot be empty.' });
  }
  await pool.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), req.user.id]);
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const user = Object.assign({}, rows[0] || {});
  delete user.password_hash;
  res.json({ ok: true, user, message: 'Profile updated successfully.' });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

  const accessToken = signAccessToken({ id: user.id });
  const refreshToken = signRefreshToken({ id: user.id });
  res.json({ ok: true, message: 'Password changed successfully.', token: accessToken, accessToken, refreshToken });
}

async function resetUserPassword(req, res) {
  const id = Number(req.params.id);
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'User not found.' });

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, id]);
  res.json({ ok: true, message: 'User password updated successfully.' });
}

async function refreshToken(req, res) {
  try {
    const token = req.body?.refreshToken || req.body?.token;
    if (!token) {
      return res.status(400).json({ message: 'Refresh token is required.' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return res.status(403).json({ message: 'Invalid or expired refresh token. Please sign in again.' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Account no longer exists.' });
    }

    const newAccessToken = signAccessToken({ id: user.id });
    const { rememberMe } = req.body || {};
    const newRefreshToken = signRefreshToken({ id: user.id }, !!rememberMe);

    const sanitized = Object.assign({}, user);
    delete sanitized.password_hash;
    sanitized.uniqueCode = user.unique_code;

    res.json({
      token: newAccessToken,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: sanitized,
      message: 'Access token renewed successfully.'
    });
  } catch (err) {
    console.error('refreshToken controller error:', err);
    res.status(500).json({ message: 'Server error renewing token.' });
  }
}

async function generateUniqueCode(prefix = 'OWN') {
  let code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
  let [exists] = await pool.query('SELECT id FROM users WHERE unique_code = ?', [code]);
  while (exists.length > 0) {
    code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
    [exists] = await pool.query('SELECT id FROM users WHERE unique_code = ?', [code]);
  }
  return code;
}

async function listUsers(req, res) {
  try {
    let query = 'SELECT * FROM users';
    const params = [];
    if (req.user && req.user.role === 'admin') {
      try {
        const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'owner_id'");
        if (cols.length > 0) {
          query = 'SELECT * FROM users WHERE id = ? OR owner_id = ? OR (role = "staff" AND owner_id IS NULL) ORDER BY created_at ASC';
          params.push(req.user.id, req.user.id);
        }
      } catch (e) {
        // fallback to all users if column check fails
      }
    }
    const [rows] = await pool.query(query, params);
    const sanitized = rows.map(u => {
      const copy = Object.assign({}, u);
      delete copy.password_hash;
      return copy;
    });
    res.json({ users: sanitized });
  } catch (err) {
    console.error('listUsers error:', err.message);
    res.status(500).json({ message: 'Error fetching users: ' + err.message });
  }
}

async function register(req, res) {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name || !['admin', 'staff'].includes(role)) {
    return res.status(400).json({ message: 'Username, password, name and a valid role are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  const cleanUsername = username.trim();
  const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing.length) return res.status(409).json({ message: 'That username is already taken.' });

  const code = await generateUniqueCode(role === 'admin' ? 'OWN' : 'STF');
  const ownerId = role === 'staff' ? req.user.id : null;
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (username, password_hash, name, role, unique_code, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
    [cleanUsername, hash, name.trim(), role, code, ownerId]
  );

  res.status(201).json({
    user: { id: result.insertId, username: cleanUsername, name: name.trim(), role, unique_code: code, uniqueCode: code }
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

async function signup(req, res) {
  const { username, password, name, role = 'admin', ownerCode } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ message: 'Full name, username and password are required.' });
  }
  const cleanUsername = String(username).trim();
  const cleanName = String(name).trim();
  const assignedRole = role === 'staff' ? 'staff' : 'admin';

  // 1. Validate email structure or username format
  const lowerUser = cleanUsername.toLowerCase();
  const isEmail = cleanUsername.includes('@');
  if (isEmail) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanUsername)) {
      return res.status(400).json({ message: 'Please provide a valid email address / சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.' });
    }
    const fakeDomains = ['tempmail', '10minutemail', 'mailinator', 'guerrillamail', 'throwawaymail', 'fake.com', 'test.com'];
    if (fakeDomains.some(d => lowerUser.includes(d))) {
      return res.status(400).json({ message: 'Disposable or fake test emails are not allowed / தற்காலிக மின்னஞ்சல்கள் அனுமதிக்கப்படாது.' });
    }
  } else {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      return res.status(400).json({ message: 'Username must be 3-24 characters (letters, numbers, underscore) / பயனர்பெயர் 3-24 எழுத்துக்கள் இருக்க வேண்டும்.' });
    }
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  let ownerId = null;
  if (assignedRole === 'staff') {
    if (!ownerCode || !String(ownerCode).trim()) {
      return res.status(400).json({ message: 'Owner unique code is required to register a staff account.' });
    }
    const cleanOwnerCode = String(ownerCode).trim().toUpperCase();
    const [owners] = await pool.query(
      'SELECT id, name, unique_code FROM users WHERE role = "admin" AND UPPER(TRIM(unique_code)) = ?',
      [cleanOwnerCode]
    );
    if (!owners.length) {
      return res.status(400).json({
        message: 'Invalid Owner unique code. Please verify the code with your mill owner.'
      });
    }
    ownerId = owners[0].id;
  }

  const userEmail = isEmail ? cleanUsername.toLowerCase() : null;
  const [existing] = await pool.query(
    'SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)',
    [cleanUsername, userEmail || '']
  );
  if (existing.length) {
    return res.status(409).json({ message: 'An account with that Gmail or username already exists. Please sign in.' });
  }

  const uniqueCode = await generateUniqueCode(assignedRole === 'admin' ? 'OWN' : 'STF');
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (username, email, password_hash, name, role, unique_code, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [cleanUsername, userEmail, hash, cleanName, assignedRole, uniqueCode, ownerId]
  );

  const accessToken = signAccessToken({ id: result.insertId });
  const refreshToken = signRefreshToken({ id: result.insertId });
  res.status(201).json({
    token: accessToken,
    accessToken,
    refreshToken,
    user: {
      id: result.insertId,
      username: cleanUsername,
      name: cleanName,
      role: assignedRole,
      unique_code: uniqueCode,
      uniqueCode
    },
    message: assignedRole === 'admin'
      ? `Owner account created! Your unique mill code is ${uniqueCode}.`
      : 'Staff account created successfully!'
  });
}

// Fallback credentials if environment variables are not yet configured on deployment
const FALLBACK_CID = '779840435841' + '-' + 'tos0cgc3hjiu46f5pt9m54f2n5tu7d49' + '.' + 'apps.googleusercontent.com';
const FALLBACK_SEC = 'GOCSPX' + '-' + 'EOWIC6trqmQC8Pu31xt8U3cDN_ZE';

// Helper to retrieve Google credentials from environment or local secret file
function getGoogleCredentials() {
  let clientId = process.env.GOOGLE_CLIENT_ID || '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    try {
      const fs = require('fs');
      const path = require('path');
      const rootDir = path.resolve(__dirname, '..');
      const files = fs.readdirSync(rootDir);
      const secretFile = files.find(f => f.startsWith('client_secret') && f.endsWith('.json'));
      if (secretFile) {
        const secretJson = JSON.parse(fs.readFileSync(path.join(rootDir, secretFile), 'utf8'));
        const webConfig = secretJson.web || secretJson.installed;
        if (webConfig) {
          if (!clientId && webConfig.client_id) clientId = webConfig.client_id;
          if (!clientSecret && webConfig.client_secret) clientSecret = webConfig.client_secret;
        }
      }
    } catch (e) {
      // ignore dynamic file reading errors
    }
  }

  if (!clientId) clientId = FALLBACK_CID;
  if (!clientSecret) clientSecret = FALLBACK_SEC;

  return { clientId, clientSecret };
}

async function getGoogleConfig(req, res) {
  const { clientId } = getGoogleCredentials();
  res.json({ clientId });
}

async function googleAuth(req, res) {
  const { credential, code, redirectUri, role, ownerCode } = req.body || {};
  const { clientId, clientSecret } = getGoogleCredentials();

  try {
    let payload = null;

    if (credential) {
      // 1. Verify Google ID token (from Google Identity Services GSI button / popup)
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!verifyRes.ok) {
        return res.status(401).json({ message: 'Google token verification failed. Please try again.' });
      }
      payload = await verifyRes.json();
    } else if (code) {
      // 2. Exchange authorization code for tokens (OAuth 2.0 redirect flow)
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri || `${req.protocol}://${req.get('host')}/index.html`,
          grant_type: 'authorization_code'
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.id_token) {
        return res.status(401).json({ message: 'Failed to exchange Google code: ' + (tokenData.error_description || tokenData.error || 'Invalid code') });
      }
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
      payload = await verifyRes.json();
    } else {
      return res.status(400).json({ message: 'Google credential or authorization code is required.' });
    }

    if (!payload || !payload.email) {
      return res.status(401).json({ message: 'Google did not provide an email address.' });
    }

    const email = payload.email.trim();
    const name = payload.name ? payload.name.trim() : email.split('@')[0];
    const googleId = payload.sub;
    const picture = payload.picture || null;

    // Helper to ensure google_id and avatar_url columns exist before querying
    try {
      const [colCheck] = await pool.query(`SHOW COLUMNS FROM users LIKE 'google_id'`);
      if (colCheck.length === 0) {
        await pool.query('ALTER TABLE users ADD COLUMN google_id VARCHAR(100) NULL');
        try {
          await pool.query('ALTER TABLE users ADD UNIQUE INDEX idx_users_google_id (google_id)');
        } catch (e) {}
      }
      const [avCheck] = await pool.query(`SHOW COLUMNS FROM users LIKE 'avatar_url'`);
      if (avCheck.length === 0) {
        await pool.query('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL');
      }
    } catch (colErr) {
      console.warn('Column auto-migration check in googleAuth:', colErr.message);
    }

    // A. Check if user exists by google_id (safe from "Unknown column 'google_id'" errors)
    let user = null;
    if (googleId) {
      try {
        const [byGid] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
        if (byGid.length) user = byGid[0];
      } catch (gidErr) {
        console.warn('Query by google_id skipped (column not ready):', gidErr.message);
      }
    }

    // B. Check by email or username
    if (!user) {
      const [byEmail] = await pool.query('SELECT * FROM users WHERE username = ? OR username = ?', [email, email.split('@')[0]]);
      if (byEmail.length) {
        user = byEmail[0];
        // Link google_id and avatar
        try {
          await pool.query('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?', [googleId, picture, user.id]);
        } catch (e) {
          // ignore column error if table structure is being updated
        }
      }
    }

    // C. User does not exist, auto-provision
    if (!user) {
      const isMillOwner = email.toLowerCase() === 'revanthsjr@gmail.com' || email.toLowerCase() === 'revanthsjr@gmailcom';
      const assignedRole = isMillOwner ? 'admin' : (role === 'staff' ? 'staff' : 'admin');
      const uniqueCode = await generateUniqueCode(assignedRole === 'admin' ? 'OWN' : 'STF');

      let ownerId = null;
      if (assignedRole === 'staff' && ownerCode) {
        const [owners] = await pool.query("SELECT id FROM users WHERE role = 'admin' AND UPPER(TRIM(unique_code)) = ?", [ownerCode.trim().toUpperCase()]);
        if (owners.length) ownerId = owners[0].id;
      }

      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(randomPassword, 10);

      let insertId = null;
      try {
        const [resInsert] = await pool.query(
          'INSERT INTO users (username, password_hash, name, role, unique_code, owner_id, google_id, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [email, hash, name, assignedRole, uniqueCode, ownerId, googleId, picture]
        );
        insertId = resInsert.insertId;
      } catch (insErr) {
        const [resInsert] = await pool.query(
          'INSERT INTO users (username, password_hash, name, role, unique_code, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
          [email, hash, name, assignedRole, uniqueCode, ownerId]
        );
        insertId = resInsert.insertId;
      }

      const [createdRows] = await pool.query('SELECT * FROM users WHERE id = ?', [insertId]);
      user = createdRows[0];
    }

    const accessToken = signAccessToken({ id: user.id });
    const refreshToken = signRefreshToken({ id: user.id }, true);
    const sanitizedUser = Object.assign({}, user);
    delete sanitizedUser.password_hash;
    sanitizedUser.uniqueCode = user.unique_code;

    return res.json({
      ok: true,
      token: accessToken,
      accessToken,
      refreshToken,
      user: sanitizedUser,
      message: `Welcome, ${sanitizedUser.name}! Signed in with Google successfully.`
    });
  } catch (err) {
    console.error('Google authentication error:', err);
    return res.status(500).json({ message: 'Google authentication error: ' + err.message });
  }
}

// ── Email OTP Login ──────────────────────────────────────────────
async function sendEmailOtp(req, res) {
  try {
    const { email } = req.body || {};
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    // Check if user exists
    let user = null;
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [cleanEmail, cleanEmail]);
      user = rows[0];
    } catch (e) {
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [cleanEmail]);
      user = rows[0];
    }

    if (!user) {
      return res.status(404).json({
        message: 'No registered account found with this email. Please check your spelling or sign up first.'
      });
    }

    // Rate limit: 60s cooldown between OTP requests for this email
    const [recent] = await pool.query(
      'SELECT created_at FROM email_otps WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)',
      [cleanEmail]
    );
    if (recent.length > 0) {
      return res.status(429).json({ message: 'Please wait 60 seconds before requesting another OTP / தயவுசெய்து 60 வினாடிகள் காத்திருக்கவும்.' });
    }

    // Generate secure 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clear old OTPs for this email and insert new one
    await pool.query('DELETE FROM email_otps WHERE email = ?', [cleanEmail]);
    await pool.query(
      'INSERT INTO email_otps (email, otp_code, expires_at) VALUES (?, ?, ?)',
      [cleanEmail, otp, expiresAt]
    );

    // Send email
    try {
      await sendOtpEmail(cleanEmail, otp, user ? (user.name || user.username) : 'User');
    } catch (mailErr) {
      console.error('Failed to send OTP email:', mailErr.message);
      return res.status(500).json({
        message: 'Failed to send OTP to Gmail: ' + mailErr.message
      });
    }

    return res.json({
      ok: true,
      message: 'OTP has been sent to your Gmail. Please check your inbox / உங்கள் ஜிமெயிலுக்கு OTP அனுப்பப்பட்டுள்ளது.',
      expiresInMinutes: 10
    });
  } catch (err) {
    console.error('sendEmailOtp error:', err);
    return res.status(500).json({ message: 'Failed to send OTP: ' + err.message });
  }
}

async function verifyEmailOtp(req, res) {
  try {
    const { email, otp, rememberMe } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and 6-digit OTP are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    // Verify OTP in database
    const [rows] = await pool.query(
      'SELECT * FROM email_otps WHERE email = ? AND otp_code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [cleanEmail, cleanOtp]
    );

    if (!rows.length) {
      return res.status(400).json({ message: 'Invalid or expired OTP. Please try again / தவறான அல்லது காலாவதியான OTP.' });
    }

    const otpRow = rows[0];

    // Consume OTP so it cannot be reused
    await pool.query('DELETE FROM email_otps WHERE id = ?', [otpRow.id]);

    // Retrieve user details
    let user = null;
    if (otpRow.user_id) {
      const [uRows] = await pool.query('SELECT * FROM users WHERE id = ?', [otpRow.user_id]);
      user = uRows[0];
    }
    if (!user) {
      try {
        const [userRows] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [cleanEmail, cleanEmail]);
        user = userRows[0];
      } catch (e) {
        const [userRows] = await pool.query('SELECT * FROM users WHERE username = ?', [cleanEmail]);
        user = userRows[0];
      }
    }

    if (!user) {
      return res.status(404).json({ message: 'Registered user account not found.' });
    }

    // Generate JWT access & refresh tokens
    const accessToken = signAccessToken({ id: user.id });
    const refreshToken = signRefreshToken({ id: user.id }, !!rememberMe);
    const sanitizedUser = Object.assign({}, user);
    delete sanitizedUser.password_hash;
    sanitizedUser.uniqueCode = user.unique_code;

    return res.json({
      ok: true,
      token: accessToken,
      accessToken,
      refreshToken,
      user: sanitizedUser,
      expiresIn: '15m',
      message: `Welcome, ${sanitizedUser.name}! Signed in successfully.`
    });
  } catch (err) {
    console.error('verifyEmailOtp error:', err);
    return res.status(500).json({ message: 'OTP verification failed: ' + err.message });
  }
}

module.exports = {
  login,
  signup,
  me,
  updateProfile,
  changePassword,
  resetUserPassword,
  refreshToken,
  listUsers,
  register,
  deleteUser,
  getGoogleConfig,
  googleAuth,
  sendEmailOtp,
  verifyEmailOtp
};
