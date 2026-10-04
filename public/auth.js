/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Auth & Settings Management
   Features:
   - Modern Settings Modal (Profile, Light/Dark Theme, Password, Logout)
   - Real-time Theme Switcher (Light & Dark with persistence)
   - User Profile Information & Name Update
   - Self-service Change Password
   - 12h Default Expiration / 30d Remember Me
   - Auto-Logout Warning & One-Click Session Extension
   ============================================================ */

const API_BASE = '/api';

// ── Theme Management (Instant + Persisted) ──────────────────────
function getTheme() {
  return localStorage.getItem('mavu_theme') || (
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
}

function setTheme(theme) {
  const target = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('mavu_theme', target);

  // Update any theme icons
  const iconSpan = document.querySelector('#chipThemeBtn .theme-icon');
  if (iconSpan) {
    iconSpan.textContent = target === 'dark' ? '☀️' : '🌙';
  }
  const btn = document.getElementById('chipThemeBtn');
  if (btn) {
    btn.setAttribute('title', target === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme');
  }

  // Update theme cards in settings modal if open
  document.querySelectorAll('.theme-card-option').forEach(card => {
    if (card.dataset.themeVal === target) card.classList.add('active');
    else card.classList.remove('active');
  });

  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: target } }));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  showToast(`Switched to ${next === 'dark' ? 'Dark' : 'Light'} theme / ${next === 'dark' ? 'இரவுப் பயன்முறை' : 'பகற்பயன்முறை'}`);
}

// Initial theme apply
(function initTheme() {
  const current = getTheme();
  document.documentElement.setAttribute('data-theme', current);
})();

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
  }, 3200);
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

// ── Settings & Profile Modal ────────────────────────────────────
function ensureSettingsModal() {
  if (document.getElementById('settingsModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'settingsModal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'settingsModalTitle');

  overlay.innerHTML = `
    <div class="modal modal-settings">
      <div class="settings-header">
        <div class="settings-title-row">
          <div class="settings-icon-bubble">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div>
            <h2 id="settingsModalTitle">Settings &amp; Profile</h2>
            <p class="header-sub">அமைப்புகள் மற்றும் கணக்கு விவரங்கள்</p>
          </div>
        </div>
        <button type="button" class="modal-close" id="settingsModalClose" aria-label="Close">&#10005;</button>
      </div>

      <!-- Navigation Tabs -->
      <div class="settings-tabs" role="tablist">
        <button type="button" class="settings-tab-btn active" data-tab="profile" role="tab">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Profile</span>
        </button>
        <button type="button" class="settings-tab-btn" data-tab="appearance" role="tab">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          <span>Appearance</span>
        </button>
        <button type="button" class="settings-tab-btn" data-tab="password" role="tab">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Password</span>
        </button>
        <button type="button" class="settings-tab-btn" data-tab="account" role="tab">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>Account &amp; Logout</span>
        </button>
      </div>

      <!-- Pane 1: Profile -->
      <div class="settings-pane active" id="pane-profile" role="tabpanel">
        <div class="profile-card-hero">
          <div class="profile-avatar-circle" id="settingsAvatar">ச</div>
          <div class="profile-meta">
            <h3 id="settingsProfileName">—</h3>
            <div class="profile-username-tag" id="settingsProfileUsername">@username</div>
            <span class="role-pill" id="settingsProfileRole">Staff</span>
          </div>
        </div>

        <form id="profileUpdateForm" novalidate>
          <div class="field-group">
            <label for="editDisplayName">Display name / உங்கள் பெயர்</label>
            <input id="editDisplayName" type="text" placeholder="Your full name" required>
          </div>
          <p class="form-message" id="profileUpdateMsg" style="margin:0.3rem 0;"></p>
          <div style="display:flex; justify-content:flex-end; margin-top:0.8rem;">
            <button type="submit" class="btn btn-primary" id="btnSaveProfile">Save profile</button>
          </div>
        </form>

        <div class="profile-grid-info">
          <div class="profile-stat-box">
            <div class="profile-stat-label">Organization / ஆலை</div>
            <div class="profile-stat-val">சக்தி எண்ணெய் &amp; மாவு ஆலை</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-label">Account Role</div>
            <div class="profile-stat-val" id="profileRoleDetail">Administrator</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-label">Registered Since</div>
            <div class="profile-stat-val" id="profileCreatedDetail">—</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-label">System Platform</div>
            <div class="profile-stat-val">Vercel Cloud Serverless</div>
          </div>
        </div>
      </div>

      <!-- Pane 2: Appearance (Theme) -->
      <div class="settings-pane" id="pane-appearance" role="tabpanel">
        <div>
          <h3 style="font-size:1.02rem;margin-bottom:0.2rem;">Theme preferences / வண்ண தீம்</h3>
          <p style="font-size:0.84rem;color:var(--muted);margin-bottom:1.1rem;">
            Choose a visual appearance for your counter display. Settings are saved per device.
          </p>

          <div class="theme-selector-grid">
            <!-- Light Theme Option -->
            <div class="theme-card-option" data-theme-val="light" id="themeCardLight">
              <div class="theme-card-preview theme-preview-light">
                <div class="theme-prev-bar">
                  <div style="width:24px;height:6px;background:#16704A;border-radius:3px;"></div>
                  <div style="width:14px;height:14px;background:#E8F3ED;border-radius:50%;"></div>
                </div>
                <div class="theme-prev-content">
                  <div class="theme-prev-box"></div>
                  <div class="theme-prev-box" style="flex:0.8;"></div>
                </div>
              </div>
              <div class="theme-option-info">
                <span class="theme-option-title">☀️ Light theme</span>
                <span class="theme-selected-pill">Active</span>
              </div>
              <div class="theme-option-desc">
                Clean daylight aesthetic with forest green tones. Ideal for well-lit counters.
              </div>
            </div>

            <!-- Dark Theme Option -->
            <div class="theme-card-option" data-theme-val="dark" id="themeCardDark">
              <div class="theme-card-preview theme-preview-dark">
                <div class="theme-prev-bar">
                  <div style="width:24px;height:6px;background:#2BA86D;border-radius:3px;"></div>
                  <div style="width:14px;height:14px;background:#1D3328;border-radius:50%;"></div>
                </div>
                <div class="theme-prev-content">
                  <div class="theme-prev-box"></div>
                  <div class="theme-prev-box" style="flex:0.8;"></div>
                </div>
              </div>
              <div class="theme-option-info">
                <span class="theme-option-title">🌙 Dark theme</span>
                <span class="theme-selected-pill">Active</span>
              </div>
              <div class="theme-option-desc">
                Sleek emerald midnight palette. Reduces eye strain during evening counter shifts.
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.9rem 1.1rem;background:var(--page);border:1px solid var(--line);border-radius:var(--r);">
            <div>
              <strong style="font-size:0.88rem;color:var(--ink);">Quick Toggle</strong>
              <div style="font-size:0.78rem;color:var(--muted)">You can also click the sun/moon icon in the top header at any time.</div>
            </div>
            <button type="button" class="btn btn-secondary" id="btnToggleThemeSetting" style="min-height:36px;padding:0 0.9rem;font-size:0.82rem;">
              Switch to <span id="themeToggleTarget">Dark</span> Mode
            </button>
          </div>
        </div>
      </div>

      <!-- Pane 3: Password -->
      <div class="settings-pane" id="pane-password" role="tabpanel">
        <div>
          <h3 style="font-size:1.02rem;margin-bottom:0.2rem;">Change your password / கடவுச்சொல்லை மாற்று</h3>
          <p style="font-size:0.84rem;color:var(--muted);margin-bottom:1.1rem;">
            Keep your account secure with a strong password of at least 6 characters.
          </p>

          <form id="settingsChangePasswordForm" novalidate>
            <div class="field-group">
              <label for="settingsCurrentPassword">Current password / தற்போதைய கடவுச்சொல்</label>
              <input id="settingsCurrentPassword" type="password" placeholder="Enter current password" autocomplete="current-password" required>
            </div>

            <div class="field-group">
              <label for="settingsNewPassword">New password / புதிய கடவுச்சொல்</label>
              <input id="settingsNewPassword" type="password" placeholder="Minimum 6 characters" autocomplete="new-password" minlength="6" required>
            </div>

            <div class="field-group">
              <label for="settingsConfirmPassword">Confirm new password / புதிய கடவுச்சொல்லை உறுதிப்படுத்து</label>
              <input id="settingsConfirmPassword" type="password" placeholder="Re-type new password" autocomplete="new-password" minlength="6" required>
            </div>

            <p class="form-message" id="settingsPasswordMsg" style="margin:0.4rem 0;"></p>

            <div style="display:flex; justify-content:flex-end; gap:0.6rem; margin-top:1.1rem;">
              <button type="submit" class="btn btn-primary" id="btnSettingsPasswordSubmit">Update password</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Pane 4: Account & Logout -->
      <div class="settings-pane" id="pane-account" role="tabpanel">
        <div>
          <div class="session-info-card">
            <div>
              <div class="session-stat-heading">Active Session / தற்போதைய அமர்வு</div>
              <div class="session-stat-text">Token remaining: <strong id="settingsSessionTimerBadge" class="session-timer-badge">--:--</strong></div>
            </div>
            <button type="button" class="btn btn-secondary" id="btnSettingsExtendSession" style="min-height:38px;font-size:0.84rem;">
              Extend session
            </button>
          </div>

          <div class="danger-zone-card">
            <div class="danger-zone-text">
              <h4>Sign out / கணக்கிலிருந்து வெளியேறு</h4>
              <p>End your current session on this device. You will need to sign in again to access the counter.</p>
            </div>
            <button type="button" class="btn-danger-logout" id="btnSettingsLogout">
              Logout now
            </button>
          </div>
        </div>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      overlay.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(`pane-${btn.dataset.tab}`);
      if (pane) pane.classList.add('active');
    });
  });

  // Modal close handlers
  const closeBtn = document.getElementById('settingsModalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettingsModal();
  });

  // Theme option clicks
  document.getElementById('themeCardLight').addEventListener('click', () => {
    setTheme('light');
    updateThemeSelectorUI();
  });
  document.getElementById('themeCardDark').addEventListener('click', () => {
    setTheme('dark');
    updateThemeSelectorUI();
  });
  document.getElementById('btnToggleThemeSetting').addEventListener('click', () => {
    toggleTheme();
    updateThemeSelectorUI();
  });

  // Profile Name Update Form
  document.getElementById('profileUpdateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('editDisplayName');
    const msg = document.getElementById('profileUpdateMsg');
    const btn = document.getElementById('btnSaveProfile');
    const newName = nameInput.value.trim();

    if (!newName) {
      msg.textContent = 'Please enter a name.';
      msg.style.color = 'var(--clay)';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const res = await apiFetch('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
      setAuth(getToken(), res.user);
      msg.textContent = '✓ Profile updated successfully!';
      msg.style.color = 'var(--mill)';
      renderUserChip(res.user);
      populateSettingsModal(res.user);
      showToast('✓ Profile updated successfully');
      setTimeout(() => { msg.textContent = ''; }, 2500);
    } catch (err) {
      msg.textContent = err.message || 'Failed to update profile.';
      msg.style.color = 'var(--clay)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save profile';
    }
  });

  // Password Change Form inside Settings
  document.getElementById('settingsChangePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const curr = document.getElementById('settingsCurrentPassword').value;
    const newP = document.getElementById('settingsNewPassword').value;
    const conf = document.getElementById('settingsConfirmPassword').value;
    const msg = document.getElementById('settingsPasswordMsg');
    const btn = document.getElementById('btnSettingsPasswordSubmit');

    msg.textContent = '';
    if (!curr) {
      msg.textContent = 'Current password is required.';
      msg.style.color = 'var(--clay)';
      return;
    }
    if (!newP || newP.length < 6) {
      msg.textContent = 'New password must be at least 6 characters.';
      msg.style.color = 'var(--clay)';
      return;
    }
    if (newP !== conf) {
      msg.textContent = 'New passwords do not match.';
      msg.style.color = 'var(--clay)';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating...';
    try {
      const res = await apiFetch('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: curr, newPassword: newP })
      });
      if (res.token) localStorage.setItem('mavu_token', res.token);
      msg.textContent = '✓ Password updated successfully!';
      msg.style.color = 'var(--mill)';
      document.getElementById('settingsChangePasswordForm').reset();
      showToast('✓ Password updated successfully');
      setTimeout(() => { msg.textContent = ''; }, 3000);
    } catch (err) {
      msg.textContent = err.message || 'Failed to update password.';
      msg.style.color = 'var(--clay)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update password';
    }
  });

  // Account tab actions
  document.getElementById('btnSettingsExtendSession').addEventListener('click', extendSession);
  document.getElementById('btnSettingsLogout').addEventListener('click', logout);
}

function updateThemeSelectorUI() {
  const current = document.documentElement.getAttribute('data-theme') || getTheme();
  const lightCard = document.getElementById('themeCardLight');
  const darkCard = document.getElementById('themeCardDark');
  const toggleBtn = document.getElementById('themeToggleTarget');

  if (lightCard && darkCard) {
    if (current === 'dark') {
      lightCard.classList.remove('active');
      darkCard.classList.add('active');
    } else {
      lightCard.classList.add('active');
      darkCard.classList.remove('active');
    }
  }
  if (toggleBtn) {
    toggleBtn.textContent = current === 'dark' ? 'Light' : 'Dark';
  }
}

function populateSettingsModal(user) {
  if (!user) user = getCachedUser() || {};
  const initial = (user.name || user.username || 'S').trim().charAt(0).toUpperCase();

  const avatar = document.getElementById('settingsAvatar');
  if (avatar) avatar.textContent = initial;

  const nameEl = document.getElementById('settingsProfileName');
  if (nameEl) nameEl.textContent = user.name || 'User';

  const userEl = document.getElementById('settingsProfileUsername');
  if (userEl) userEl.textContent = `@${user.username || 'user'}`;

  const roleEl = document.getElementById('settingsProfileRole');
  if (roleEl) {
    roleEl.textContent = user.role === 'admin' ? 'Admin' : 'Staff';
    roleEl.className = `role-pill role-${user.role || 'staff'}`;
  }

  const editInput = document.getElementById('editDisplayName');
  if (editInput) editInput.value = user.name || '';

  const roleDetail = document.getElementById('profileRoleDetail');
  if (roleDetail) {
    roleDetail.textContent = user.role === 'admin' ? 'Administrator (Full Access)' : 'Staff (Billing & Orders)';
  }

  const createdDetail = document.getElementById('profileCreatedDetail');
  if (createdDetail) {
    if (user.created_at) {
      const d = new Date(user.created_at);
      createdDetail.textContent = isNaN(d) ? 'Active' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      createdDetail.textContent = 'Mill Staff';
    }
  }

  updateThemeSelectorUI();
  updateSessionTimerInSettings();
}

function updateSessionTimerInSettings() {
  const token = getToken();
  const badge = document.getElementById('settingsSessionTimerBadge');
  if (!badge) return;
  if (!token) {
    badge.textContent = 'None';
    return;
  }
  const exp = getTokenExp(token);
  if (!exp) {
    badge.textContent = '12 hours';
    return;
  }
  const remSec = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  const hrs = Math.floor(remSec / 3600);
  const mins = Math.floor((remSec % 3600) / 60);
  badge.textContent = hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`;
}

function openSettingsModal(initialTab = 'profile') {
  ensureSettingsModal();
  populateSettingsModal(getCachedUser());

  // Activate requested tab
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.querySelectorAll('.settings-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === initialTab);
    });
    modal.querySelectorAll('.settings-pane').forEach(p => {
      p.classList.toggle('active', p.id === `pane-${initialTab}`);
    });
    modal.classList.add('open');
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('open');
}

// Alias for backwards compatibility
function openChangePasswordModal() {
  openSettingsModal('password');
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
  const btn = document.getElementById('btnExtendSession') || document.getElementById('btnSettingsExtendSession');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extending...';
  }
  try {
    const isRemembered = localStorage.getItem('mavu_remember') === '1';
    const res = await apiFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ rememberMe: isRemembered })
    });
    setAuth(res.token, res.user);
    hideSessionWarning();
    updateSessionTimerInSettings();
    showToast('✓ Session extended successfully for ' + (isRemembered ? '30 days' : '12 hours'));
  } catch (err) {
    console.error('Session extend error:', err);
    showToast('Failed to extend session: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText || 'Stay signed in';
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
  ensureSettingsModal();

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

// ── Header user-chip + role-based nav/section visibility ───────────
function renderUserChip(user) {
  const chip = document.getElementById('userChip');
  if (chip) {
    const roleLabel = user.role === 'admin' ? 'Admin' : 'Staff';
    const isDark = (document.documentElement.getAttribute('data-theme') || getTheme()) === 'dark';

    chip.innerHTML = `
      <button type="button" class="chip-theme-btn" id="chipThemeBtn" title="${isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}" aria-label="Toggle theme">
        <span class="theme-icon">${isDark ? '☀️' : '🌙'}</span>
      </button>
      <button type="button" class="chip-action" id="chipSettingsBtn" title="Open Settings &amp; Profile">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Settings
      </button>
      <span class="role-pill role-${user.role}">${roleLabel}</span>
      <span class="chip-name" title="${user.name} (@${user.username})" style="cursor:pointer;" id="chipUserNameLink">${user.name}</span>
      <button type="button" class="chip-logout" id="chipLogoutBtn">Logout</button>
    `;

    document.getElementById('chipThemeBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('chipSettingsBtn')?.addEventListener('click', () => openSettingsModal('profile'));
    document.getElementById('chipUserNameLink')?.addEventListener('click', () => openSettingsModal('profile'));
    document.getElementById('chipLogoutBtn')?.addEventListener('click', logout);
  }

  // Sidebar Settings button if present on page
  const sidebarBtn = document.getElementById('sidebarSettingsBtn');
  if (sidebarBtn) {
    sidebarBtn.addEventListener('click', () => openSettingsModal('profile'));
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
