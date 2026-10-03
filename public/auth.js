/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Auth (real backend)
   Talks to the Express + MySQL API. The server is the source of
   truth for who's allowed to do what; the localStorage token here
   is just how the browser remembers "I'm logged in" between pages.
   ============================================================ */

const API_BASE = '/api';

// ── Token / cached-user storage ─────────────────────────────────
function getToken() { return localStorage.getItem('mavu_token'); }
function getCachedUser() {
  try { return JSON.parse(localStorage.getItem('mavu_user')); } catch { return null; }
}
function setAuth(token, user) {
  localStorage.setItem('mavu_token', token);
  localStorage.setItem('mavu_user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('mavu_token');
  localStorage.removeItem('mavu_user');
}
function logout() {
  clearAuth();
  window.location.href = 'login.html';
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
    window.location.href = 'login.html';
    throw new Error((data && data.message) || 'Session expired.');
  }
  if (!res.ok) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data;
}

// ── Page guard ───────────────────────────────────────────────────
// Verifies the token with the server (so an expired/invalid/deleted
// account is caught even if a stale token is still in localStorage),
// refreshes the cached user, and enforces a role if one is required.
// Returns the verified user, or null (after redirecting) if not allowed.
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
    return data.user;
  } catch (e) {
    // apiFetch already redirected to login on 401; anything else, stop here.
    return null;
  }
}

// ── Header user-chip + role-based nav/section visibility ───────────
function renderUserChip(user) {
  const chip = document.getElementById('userChip');
  if (chip) {
    const roleLabel = user.role === 'admin' ? 'Admin' : 'Staff';
    chip.innerHTML = `
      <span class="role-pill role-${user.role}">${roleLabel}</span>
      <span class="chip-name">${user.name}</span>
      <button type="button" class="chip-logout" id="chipLogoutBtn">Logout</button>
    `;
    const btn = document.getElementById('chipLogoutBtn');
    if (btn) btn.addEventListener('click', logout);
  }
  document.querySelectorAll('[data-role-only="admin"]').forEach(el => {
    el.style.display = user.role === 'admin' ? '' : 'none';
  });
}

// ── Login page wiring (only runs where #loginForm exists) ──────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginSubmitBtn');
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.textContent = '';
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Signing in...'; }
    try {
      const res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.message || 'Invalid username or password.';
        return;
      }
      setAuth(data.token, data.user);
      window.location.href = 'index.html';
    } catch (err) {
      loginError.textContent = 'Could not reach the server. Please check your connection and try again.';
    } finally {
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign in'; }
    }
  });
}
