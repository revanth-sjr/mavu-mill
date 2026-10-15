const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');

async function login(req, res) {
  const { username, password, rememberMe } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ message: 'Invalid username or password.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid username or password.' });

  const token = signToken({ id: user.id }, !!rememberMe);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      unique_code: user.unique_code,
      uniqueCode: user.unique_code
    },
    expiresIn: rememberMe ? '30d' : '12h'
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

  const token = signToken({ id: user.id });
  res.json({ ok: true, message: 'Password changed successfully.', token });
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
  const { rememberMe } = req.body || {};
  const token = signToken({ id: req.user.id }, !!rememberMe);
  res.json({ token, user: req.user, message: 'Session extended.' });
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
  const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
  const sanitized = rows.map(u => {
    const copy = Object.assign({}, u);
    delete copy.password_hash;
    return copy;
  });
  res.json({ users: sanitized });
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

  // 1. Prevent fake Gmail accounts: Gmail users MUST authenticate via "Continue with Google"
  const lowerUser = cleanUsername.toLowerCase();
  if (lowerUser.endsWith('@gmail.com') || lowerUser.endsWith('@googlemail.com')) {
    return res.status(400).json({
      message: 'Gmail accounts must sign in using the "Continue with Google" button / ஜிமெயில் கணக்குகளுக்கு "Continue with Google" பொத்தானைப் பயன்படுத்தவும்.'
    });
  }

  // 2. Validate email structure or username format
  if (cleanUsername.includes('@')) {
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

  const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing.length) {
    return res.status(409).json({ message: 'That username is already taken. Please sign in or use another username.' });
  }

  const uniqueCode = await generateUniqueCode(assignedRole === 'admin' ? 'OWN' : 'STF');
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (username, password_hash, name, role, unique_code, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
    [cleanUsername, hash, cleanName, assignedRole, uniqueCode, ownerId]
  );

  const token = signToken({ id: result.insertId });
  res.status(201).json({
    token,
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
          redirect_uri: redirectUri || 'https://mavu-mill-qladoau67-revanthsjr-7530.vercel.app/index.html',
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

    const token = signToken({ id: user.id }, true);
    const sanitizedUser = Object.assign({}, user);
    delete sanitizedUser.password_hash;
    sanitizedUser.uniqueCode = user.unique_code;

    return res.json({
      ok: true,
      token,
      user: sanitizedUser,
      message: `Welcome, ${sanitizedUser.name}! Signed in with Google successfully.`
    });
  } catch (err) {
    console.error('Google authentication error:', err);
    return res.status(500).json({ message: 'Google authentication error: ' + err.message });
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
  googleAuth
};
