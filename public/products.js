/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Product & Team Management (Admin)
   Talks to the real API (see auth.js for apiFetch/requireAuth).
   ============================================================ */

function fmt(v) { return `\u20B9${Number(v || 0).toFixed(2)}`; }
function emptyState(msg) { return `<div class="empty-state" style="grid-column: 1 / -1; padding: 1.8rem; text-align: center; color: var(--muted); font-size: 0.88rem; background: var(--page); border-radius: var(--r); border: 1px dashed var(--line);">${msg}</div>`; }

function showMsg(elId, msg, isError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.textContent = msg;
  setTimeout(() => { if (el) { el.textContent = ''; el.style.color = ''; } }, 3200);
}

let currentUserId = null;
let cachedProducts = [];
let currentCategoryFilter = 'all';
let currentSearchTerm = '';

// ── Update Stat Indicators ──────────────────────────────────
function updateProductStats(products) {
  const total = products.length;
  const sales = products.filter(p => p.category === 'sales');
  const service = products.filter(p => p.category === 'service');

  const setT = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setT('statTotalCount', total);
  setT('statSalesCount', sales.length);
  setT('statServiceCount', service.length);

  setT('filterAllCount', total);
  setT('filterSalesCount', sales.length);
  setT('filterServiceCount', service.length);

  setT('salesBadgeCount', `${sales.length} items`);
  setT('serviceBadgeCount', `${service.length} services`);
}

// ── Render Product Cards ─────────────────────────────────────
function renderProductCards() {
  const term = currentSearchTerm.toLowerCase().trim();
  const matchesSearch = (p) => {
    if (!term) return true;
    const name = (p.name || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    const unit = (p.unit || '').toLowerCase();
    return name.includes(term) || cat.includes(term) || unit.includes(term);
  };

  const filtered = cachedProducts.filter(matchesSearch);
  const salesList = filtered.filter(p => p.category === 'sales');
  const serviceList = filtered.filter(p => p.category === 'service');

  const renderCard = (p) => `
    <div class="product-card product-row" data-id="${p.id}" data-category="${p.category}">
      <div class="product-card-top">
        <div class="product-card-tags">
          <span class="product-cat-tag tag-${p.category}">${p.category === 'sales'
            ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>Sales'
            : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M12 2l9 4.9V17L12 22l-9-5V6.9L12 2z"/><path d="M12 22V12"/></svg>Service'
          }</span>
          <span class="product-unit-tag">per ${p.unit}</span>
        </div>
        <button type="button" class="btn-card-del btn-delete-product" data-id="${p.id}" aria-label="Delete ${p.name}" title="Delete ${p.name}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="product-card-body">
        <h3 class="product-name">${p.name}</h3>
      </div>

      <div class="product-card-rate-row">
        <div class="rate-input-field">
          <span class="rate-currency">&#8377;</span>
          <input type="number" min="0" step="0.01" class="rate-edit-input" data-id="${p.id}" value="${p.rate}">
        </div>
        <button type="button" class="btn-mini btn-save-rate" data-id="${p.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Save
        </button>
      </div>
    </div>`;

  const salesEl = document.getElementById('salesProductList');
  const serviceEl = document.getElementById('serviceProductList');
  const salesWrap = document.getElementById('salesGroupWrap');
  const serviceWrap = document.getElementById('serviceGroupWrap');

  if (salesEl) {
    salesEl.innerHTML = salesList.length ? salesList.map(renderCard).join('') : emptyState(term ? 'No matching sales products.' : 'No sales products yet.');
  }

  if (serviceEl) {
    serviceEl.innerHTML = serviceList.length ? serviceList.map(renderCard).join('') : emptyState(term ? 'No matching service items.' : 'No service items yet.');
  }

  // Handle Tab Filtering Visibility
  if (salesWrap) {
    salesWrap.style.display = (currentCategoryFilter === 'all' || currentCategoryFilter === 'sales') ? '' : 'none';
  }
  if (serviceWrap) {
    serviceWrap.style.display = (currentCategoryFilter === 'all' || currentCategoryFilter === 'service') ? '' : 'none';
  }

  wireProductRowEvents();
}

// ── Fetch & Load Products ────────────────────────────────────
async function renderProductList() {
  try {
    const data = await apiFetch('/products');
    cachedProducts = data.products || [];
    updateProductStats(cachedProducts);
    renderProductCards();
  } catch (e) {
    showMsg('productFormMessage', e.message, true);
  }
}

function wireProductRowEvents() {
  document.querySelectorAll('.btn-save-rate').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const input = document.querySelector(`.rate-edit-input[data-id="${id}"]`);
      const newRate = parseFloat(input.value);
      if (isNaN(newRate) || newRate < 0) {
        showMsg('productFormMessage', 'Enter a valid price.', true);
        return;
      }

      try {
        await apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ rate: newRate }) });
        const prod = cachedProducts.find(p => String(p.id) === String(id));
        if (prod) prod.rate = newRate;
        showMsg('productFormMessage', `\u2713 Price updated: ${fmt(newRate)}`);
      } catch (e) {
        showMsg('productFormMessage', e.message, true);
      }
    };
  });

  document.querySelectorAll('.btn-delete-product').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const row = btn.closest('.product-row');
      const name = row ? (row.querySelector('.product-name')?.textContent || 'this item') : 'this item';
      if (!confirm(`Delete "${name}"? Past orders keep their recorded price; this only removes it from new billing.`)) return;

      try {
        await apiFetch(`/products/${id}`, { method: 'DELETE' });
        showMsg('productFormMessage', `\u2713 "${name}" removed.`);
        renderProductList();
      } catch (e) {
        showMsg('productFormMessage', e.message, true);
      }
    };
  });
}

async function handleAddProduct() {
  const name     = document.getElementById('newProductName').value.trim();
  const category = document.getElementById('newProductCategory').value;
  const unit     = document.getElementById('newProductUnit').value;
  const rate     = parseFloat(document.getElementById('newProductRate').value);

  if (!name) return showMsg('productFormMessage', 'Enter a product name / பொருள் பெயர்.', true);
  if (isNaN(rate) || rate < 0) return showMsg('productFormMessage', 'Enter a valid price / சரியான விலை.', true);

  try {
    await apiFetch('/products', { method: 'POST', body: JSON.stringify({ name, category, unit, rate }) });
    document.getElementById('newProductForm').reset();
    showMsg('productFormMessage', `\u2713 "${name}" added at ${fmt(rate)}/${unit}.`);
    renderProductList();
  } catch (e) {
    showMsg('productFormMessage', e.message, true);
  }
}

// ── Team accounts ────────────────────────────────────────────
async function renderUserList() {
  let users = [];
  try {
    const data = await apiFetch('/auth/users');
    users = data.users || [];
  } catch (e) {
    showMsg('userFormMessage', e.message, true);
    return;
  }

  const teamCountEl = document.getElementById('statTeamCount');
  if (teamCountEl) teamCountEl.textContent = users.length;
  const teamBadgeEl = document.getElementById('teamCountBadge');
  if (teamBadgeEl) teamBadgeEl.textContent = `${users.length} accounts`;

  const userListEl = document.getElementById('userListBody');
  if (!userListEl) return;

  userListEl.innerHTML = users.length ? users.map(u => `
    <div class="user-account-card product-row" data-id="${u.id}">
      <div class="user-card-head">
        <div class="user-avatar-mark">${(u.name || 'U').charAt(0).toUpperCase()}</div>
        <div class="user-card-details">
          <div class="user-card-name">
            <strong class="product-name">${u.name}</strong>
            ${u.id === currentUserId ? '<span class="user-you-tag">You</span>' : ''}
          </div>
          <div class="user-card-username">
            <span>@${u.username}</span>
            ${u.unique_code ? `<span class="user-code-pill">${u.unique_code}</span>` : ''}
          </div>
        </div>
        <span class="role-pill role-${u.role}">${u.role === 'admin'
          ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Admin'
          : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Staff'
        }</span>
      </div>

      ${u.id === currentUserId ? `
        <div class="user-card-actions you-actions">
          <span class="current-user-notice">Current signed in account</span>
        </div>
      ` : `
        <div class="user-card-actions">
          <button type="button" class="btn-user-action btn-reset-user-pwd" data-id="${u.id}" data-name="${u.name}" title="Reset password for ${u.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Reset
          </button>
          <button type="button" class="btn-user-del btn-delete-user" data-id="${u.id}" data-name="${u.name}" title="Remove account ${u.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Remove
          </button>
        </div>
      `}
    </div>`).join('') : emptyState('No accounts registered yet.');

  // Reset password event
  document.querySelectorAll('#userListBody .btn-reset-user-pwd').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const newPassword = prompt(`Enter new password for "${name}" (minimum 6 characters):`);
      if (newPassword === null) return;
      if (!newPassword || newPassword.length < 6) {
        alert('Password must be at least 6 characters long.');
        return;
      }
      try {
        await apiFetch(`/auth/users/${id}/password`, {
          method: 'PUT',
          body: JSON.stringify({ newPassword })
        });
        showMsg('userFormMessage', `\u2713 Password for "${name}" updated successfully.`);
      } catch (e) {
        showMsg('userFormMessage', e.message, true);
      }
    };
  });

  // Delete user event
  document.querySelectorAll('#userListBody .btn-delete-user').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name || 'this account';
      if (!confirm(`Remove account "${name}"? They will no longer be able to log in.`)) return;

      try {
        await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
        showMsg('userFormMessage', `\u2713 Account "${name}" removed.`);
        renderUserList();
      } catch (e) {
        showMsg('userFormMessage', e.message, true);
      }
    };
  });
}

// ── Search & Filter Controls Setup ───────────────────────────
function setupCatalogueControls() {
  const searchInput = document.getElementById('productSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value;
      renderProductCards();
    });
  }

  const filterButtons = document.querySelectorAll('.filter-pill-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategoryFilter = btn.dataset.filter || 'all';
      renderProductCards();
    });
  });
}

if (document.getElementById('addProductBtn')) {
  document.getElementById('addProductBtn').addEventListener('click', handleAddProduct);
}

// ── Init (admin-only page) ──────────────────────────────────────
(async function () {
  const user = await requireAuth({ role: 'admin' });
  if (!user) return;
  currentUserId = user.id;

  // Display owner's unique mill code
  const code = (user.unique_code || user.uniqueCode || '').trim();
  const codeEl = document.getElementById('ownerMillCodeDisplay');
  if (codeEl) {
    codeEl.textContent = code || 'OWN-......';
  }

  const copyBtn = document.getElementById('btnCopyMillCode');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        const textSpan = document.getElementById('copyMillCodeText');
        if (textSpan) textSpan.textContent = 'Copied! ✓';
        if (typeof showToast === 'function') showToast(`Copied ${code} to clipboard!`);
        setTimeout(() => {
          if (textSpan) textSpan.textContent = 'Copy / நகலெடு';
        }, 2200);
      }).catch(() => {
        prompt('Copy your unique mill code:', code);
      });
    });
  }

  setupCatalogueControls();
  renderProductList();
  renderUserList();
})();

