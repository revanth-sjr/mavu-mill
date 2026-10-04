/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Auth & Session Management
   Handles JWT token lifecycle:
   - 12h default expiration / 30d "Remember Me"
   - Auto-logout warning with 5-minute interactive countdown
   - Token refresh without losing active work
   - Self-service password change modal
   - Admin password reset support
   ============================================================ */

const API_BASE = '/api';

// ── Token / cached-user storage ─────────────────────────────────
function getToken() { return localStorage.getItem('mavu_token'); }
function getCachedUser() {
  try { return JSON.parse(localStorage.getItem('mavu_user')); } catch { return null; }
}
function setAuth(token, user, rememberMe) {
  localStorage.setItem('mavu_token', token);
  if (user) localStorage.setItem('mavu_user', JSON.stringify(user));
  if (rememberMe !== undefined) {
    if (rememberMe) localStorage.setItem('mavu_remember', '1');
    else localStorage.removeItem('mavu_remember');
  }
}
function clearAuth() {
  localStorage.removeItem('mavu_token');
  localStorage.removeItem('mavu_user');
  localStorage.removeItem('mavu_remember');
}
function logout() {
  clearAuth();
  window.location.href = 'login.html?logout=1';
}

// ── Decode JWT Expiration (ms) ──────────────────────────────────
function getTokenExp(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(json);
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

// ── Lightweight Toast Notification ──────────────────────────────
function showToast(message, isError = false) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-item' + (isError ? ' toast-error' : '');
  toast.innerHTML = (isError ? '&#9888; ' : '') + message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Fetch wrapper: attaches the token, parses JSON, handles auth errors ──
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = Object.assign({}, options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401) {
    clearAuth();
    window.location.href = 'login.html?expired=1';
    throw new Error((data && data.message) || 'Session expired.');
  }
  if (!res.ok) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data;
}

// ── Session Watcher: Auto-Logout Warning & Refresh ──────────────
let sessionCheckInterval = null;
let countdownInterval = null;

function ensureSessionWarningModal() {
  if (document.getElementById('sessionWarningModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'sessionWarningModal';
  overlay.className = 'modal-overlay session-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'sessionWarningTitle');

  overlay.innerHTML = `
    <div class="modal session-modal-card">
      <div class="session-modal-icon">&#9203;</div>
      <h2 id="sessionWarningTitle" class="session-modal-title">Session Expiring Soon / அமர்வு எச்சரிக்கை</h2>
      <p class="session-modal-text">
        Your session will expire in <strong id="sessionWarningTimer" class="session-timer-badge">05:00</strong> due to security timeout. Would you like to stay signed in?
      </p>
      <p class="session-modal-sub">
        பாதுகாப்பு காரணங்களுக்காக உங்கள் அமர்வு விரைவில் காலாவதியாகும். தொடர்ந்து உள்நுழைந்திருக்க விரும்புகிறீர்களா?
      </p>
      <div class="session-modal-actions">
        <button type="button" class="btn btn-primary" id="btnExtendSession">Stay signed in / அமர்வை நீட்டிக்கவும்</button>
        <button type="button" class="btn-session-logout" id="btnSessionLogout">Logout now / இப்போது வெளியேறு</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('btnExtendSession').addEventListener('click', extendSession);
  document.getElementById('btnSessionLogout').addEventListener('click', logout);
}

async function extendSession() {
  const btn = document.getElementById('btnExtendSession');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extending session...';
  }
  try {
    const isRemembered = localStorage.getItem('mavu_remember') === '1';
    const res = await apiFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ rememberMe: isRemembered })
    });
    setAuth(res.token, res.user);
    hideSessionWarning();
    showToast('✓ Session extended successfully for ' + (isRemembered ? '30 days' : '12 hours'));
  } catch (err) {
    console.error('Session extend error:', err);
    showToast('Failed to extend session: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Stay signed in / அமர்வை நீட்டிக்கவும்';
    }
  }
}

function hideSessionWarning() {
  const modal = document.getElementById('sessionWarningModal');
  if (modal) modal.classList.remove('open');
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function showSessionWarning(expMs) {
  ensureSessionWarningModal();
  const modal = document.getElementById('sessionWarningModal');
  const timerBadge = document.getElementById('sessionWarningTimer');
  if (!modal || modal.classList.contains('open')) return;

  modal.classList.add('open');

  function updateDisplay() {
    const remainingSeconds = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      hideSessionWarning();
      clearAuth();
      window.location.href = 'login.html?expired=1';
      return;
    }
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    if (timerBadge) {
      timerBadge.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  updateDisplay();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateDisplay, 1000);
}

function initSessionWatcher() {
  if (window.location.pathname.endsWith('login.html')) return;
  const token = getToken();
  if (!token) return;

  ensureSessionWarningModal();
  ensureChangePasswordModal();

  if (sessionCheckInterval) clearInterval(sessionCheckInterval);

  function checkSession() {
    const currentToken = getToken();
    if (!currentToken) return;
    const exp = getTokenExp(currentToken);
    if (!exp) return;

    const remainingMs = exp - Date.now();
    const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    if (remainingMs <= 0) {
      clearAuth();
      window.location.href = 'login.html?expired=1';
    } else if (remainingMs <= WARNING_THRESHOLD_MS) {
      showSessionWarning(exp);
    } else {
      hideSessionWarning();
    }
  }

  checkSession();
  sessionCheckInterval = setInterval(checkSession, 15000); // Check every 15s
}

// ── Change Password Modal ───────────────────────────────────────
function ensureChangePasswordModal() {
  if (document.getElementById('changePasswordModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'changePasswordModal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'changePasswordTitle');

  overlay.innerHTML = `
    <div class="modal" style="max-width: 440px;">
      <div class="modal-header">
        <div>
          <h2 id="changePasswordTitle">Change password</h2>
          <p class="header-sub" id="changePasswordSub">கடவுச்சொல்லை மாற்றவும்</p>
        </div>
        <button type="button" class="modal-close" id="changePasswordClose" aria-label="Close">&#10005;</button>
      </div>

      <form id="changePasswordForm" novalidate>
        <div class="field-group">
          <label for="currentPassword">Current password / தற்போதைய கடவுச்சொல்</label>
          <input id="currentPassword" type="password" placeholder="Enter current password" autocomplete="current-password" required>
        </div>

        <div class="field-group">
          <label for="newPassword">New password / புதிய கடவுச்சொல்</label>
          <input id="newPassword" type="password" placeholder="Minimum 6 characters" autocomplete="new-password" minlength="6" required>
        </div>

        <div class="field-group">
          <label for="confirmNewPassword">Confirm new password / உறுதிப்படுத்தவும்</label>
          <input id="confirmNewPassword" type="password" placeholder="Re-type new password" autocomplete="new-password" minlength="6" required>
        </div>

        <p class="form-message" id="changePasswordMsg" aria-live="polite" style="margin-top:0.4rem;"></p>

        <div style="display:flex; justify-content:flex-end; gap:0.6rem; margin-top:1.2rem;">
          <button type="button" class="filter-btn" id="changePasswordCancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="changePasswordSubmitBtn">Update password</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('changePasswordClose');
  const cancelBtn = document.getElementById('changePasswordCancel');
  const form = document.getElementById('changePasswordForm');

  function closeModal() {
    overlay.classList.remove('open');
    form.reset();
    const msg = document.getElementById('changePasswordMsg');
    if (msg) msg.textContent = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const msg = document.getElementById('changePasswordMsg');
    const submitBtn = document.getElementById('changePasswordSubmitBtn');

    msg.textContent = '';
    msg.style.color = '';

    if (!currentPassword) {
      msg.textContent = 'Please enter your current password.';
      msg.style.color = 'var(--clay)';
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      msg.textContent = 'New password must be at least 6 characters long.';
      msg.style.color = 'var(--clay)';
      return;
    }
    if (newPassword !== confirmNewPassword) {
      msg.textContent = 'New passwords do not match.';
      msg.style.color = 'var(--clay)';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';
    }

    try {
      const res = await apiFetch('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (res.token) {
        localStorage.setItem('mavu_token', res.token);
      }

      msg.textContent = '✓ Password changed successfully! / கடவுச்சொல் மாற்றப்பட்டது.';
      msg.style.color = 'var(--mill)';
      showToast('✓ Password updated successfully');

      setTimeout(() => {
        closeModal();
      }, 1200);
    } catch (err) {
      msg.textContent = err.message || 'Failed to change password.';
      msg.style.color = 'var(--clay)';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update password';
      }
    }
  });
}

function openChangePasswordModal() {
  ensureChangePasswordModal();
  const user = getCachedUser();
  const sub = document.getElementById('changePasswordSub');
  if (sub && user) {
    sub.textContent = `Logged in as ${user.name} (@${user.username})`;
  }
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.classList.add('open');
  const currInput = document.getElementById('currentPassword');
  if (currInput) currInput.focus();
}

// ── Header user-chip + role-based nav/section visibility ───────────
function renderUserChip(user) {
  const chip = document.getElementById('userChip');
  if (chip) {
    const roleLabel = user.role === 'admin' ? 'Admin' : 'Staff';
    chip.innerHTML = `
      <span class="role-pill role-${user.role}">${roleLabel}</span>
      <span class="chip-name" title="${user.name} (@${user.username})">${user.name}</span>
      <button type="button" class="chip-action" id="chipChangePasswordBtn" title="Change your password">Password</button>
      <button type="button" class="chip-logout" id="chipLogoutBtn">Logout</button>
    `;
    const logoutBtn = document.getElementById('chipLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const changePwdBtn = document.getElementById('chipChangePasswordBtn');
    if (changePwdBtn) changePwdBtn.addEventListener('click', openChangePasswordModal);
  }
  document.querySelectorAll('[data-role-only="admin"]').forEach(el => {
    el.style.display = user.role === 'admin' ? '' : 'none';
  });
}

// ── Page guard ───────────────────────────────────────────────────
async function requireAuth(opts = {}) {
  if (!getToken()) { window.location.href = 'login.html'; return null; }
  try {
    const data = await apiFetch('/auth/me');
    setAuth(getToken(), data.user);
    if (opts.role && data.user.role !== opts.role) {
      window.location.href = 'index.html';
      return null;
    }
    renderUserChip(data.user);
    initSessionWatcher();
    return data.user;
  } catch (e) {
    return null;
  }
}

// ── Login page wiring ─────────────────────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginSubmitBtn');
  const sessionNotice = document.getElementById('sessionNotice');

  // Check URL parameters for status notices
  const urlParams = new URLSearchParams(window.location.search);
  if (sessionNotice) {
    if (urlParams.get('expired')) {
      sessionNotice.className = 'auth-alert';
      sessionNotice.style.display = 'block';
      sessionNotice.innerHTML = '<strong>Session expired:</strong> Your session has timed out. Please sign in again.<br><span style="font-size:0.78rem">அமர்வு காலாவதியானது. தயவுசெய்து மீண்டும் உள்நுழையவும்.</span>';
    } else if (urlParams.get('logout')) {
      sessionNotice.className = 'auth-alert success';
      sessionNotice.style.display = 'block';
      sessionNotice.innerHTML = 'You have signed out safely. / வெற்றிகரமாக வெளியேறிவிட்டீர்கள்.';
    }
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.textContent = '';
    if (sessionNotice) sessionNotice.style.display = 'none';

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = !!document.getElementById('loginRememberMe')?.checked;

    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Signing in...'; }
    try {
      const res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe })
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        if (text.includes('<!DOCTYPE html>') || text.includes('sso-api') || text.includes('Vercel')) {
          loginError.textContent = 'Vercel Deployment Protection is enabled. Please disable "Vercel Authentication" under Project Settings > Deployment Protection.';
          return;
        }
        throw parseErr;
      }

      if (!res.ok) {
        loginError.textContent = (data && data.message) || 'Invalid username or password.';
        return;
      }
      setAuth(data.token, data.user, rememberMe);
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Login error:', err);
      loginError.textContent = err.message || 'Could not reach the server. Please check your connection and try again.';
    } finally {
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign in'; }
    }
  });
}
