/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Product & Team Management (Admin)
   Talks to the real API (see auth.js for apiFetch/requireAuth).
   ============================================================ */

function fmt(v) { return `\u20B9${Number(v || 0).toFixed(2)}`; }
function emptyState(msg) { return `<div class="empty-state">${msg}</div>`; }

function showMsg(elId, msg, isError) {
  const el = document.getElementById(elId);
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 3000);
}

let currentUserId = null;

// ── Products ─────────────────────────────────────────────────
async function renderProductList() {
  let products = [];
  try {
    const data = await apiFetch('/products');
    products = data.products;
  } catch (e) {
    showMsg('productFormMessage', e.message, true);
    return;
  }

  const renderGroup = (list) => list.length ? list.map(p => `
    <div class="product-row" data-id="${p.id}">
      <div class="product-info">
        <span class="product-name">${p.name}</span>
        <span class="product-unit">per ${p.unit}</span>
      </div>
      <div class="product-rate-block">
        <span class="rate-currency">&#8377;</span>
        <input type="number" min="0" step="0.01" class="rate-edit-input" data-id="${p.id}" value="${p.rate}">
        <button type="button" class="btn-mini btn-save-rate" data-id="${p.id}">Save</button>
        <button type="button" class="btn-mini btn-delete-product" data-id="${p.id}" aria-label="Delete ${p.name}">&#10005;</button>
      </div>
    </div>`).join('') : emptyState('No products in this category yet.');

  document.getElementById('salesProductList').innerHTML   = renderGroup(products.filter(p => p.category === 'sales'));
  document.getElementById('serviceProductList').innerHTML = renderGroup(products.filter(p => p.category === 'service'));

  wireProductRowEvents();
}

function wireProductRowEvents() {
  document.querySelectorAll('.btn-save-rate').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const input = document.querySelector(`.rate-edit-input[data-id="${id}"]`);
      const newRate = parseFloat(input.value);
      if (isNaN(newRate) || newRate < 0) { showMsg('productFormMessage', 'Enter a valid price.', true); return; }

      try {
        await apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ rate: newRate }) });
        showMsg('productFormMessage', `\u2713 Price updated: ${fmt(newRate)}`);
      } catch (e) {
        showMsg('productFormMessage', e.message, true);
      }
    });
  });

  document.querySelectorAll('.btn-delete-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const row = btn.closest('.product-row');
      const name = row.querySelector('.product-name').textContent;
      if (!confirm(`Delete "${name}"? Past orders keep their recorded price; this only removes it from new billing.`)) return;

      try {
        await apiFetch(`/products/${id}`, { method: 'DELETE' });
        showMsg('productFormMessage', `\u2713 "${name}" removed.`);
        renderProductList();
      } catch (e) {
        showMsg('productFormMessage', e.message, true);
      }
    });
  });
}

async function handleAddProduct() {
  const name     = document.getElementById('newProductName').value.trim();
  const category = document.getElementById('newProductCategory').value;
  const unit     = document.getElementById('newProductUnit').value;
  const rate     = parseFloat(document.getElementById('newProductRate').value);

  if (!name) return showMsg('productFormMessage', 'Enter a product name.', true);
  if (isNaN(rate) || rate < 0) return showMsg('productFormMessage', 'Enter a valid price.', true);

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
    users = data.users;
  } catch (e) {
    showMsg('userFormMessage', e.message, true);
    return;
  }

  document.getElementById('userListBody').innerHTML = users.length ? users.map(u => `
    <div class="product-row" data-id="${u.id}">
      <div class="product-info">
        <span class="product-name">${u.name}${u.id === currentUserId ? ' <span style="color:var(--muted);font-weight:500">(you)</span>' : ''}</span>
        <span class="product-unit">@${u.username}</span>
      </div>
      <div class="product-rate-block">
        <span class="role-pill role-${u.role}">${u.role === 'admin' ? 'Admin' : 'Staff'}</span>
        ${u.id === currentUserId ? '' : `<button type="button" class="btn-mini btn-delete-product" data-id="${u.id}" aria-label="Remove ${u.name}">&#10005;</button>`}
      </div>
    </div>`).join('') : emptyState('No accounts yet.');

  document.querySelectorAll('#userListBody .btn-delete-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const row = btn.closest('.product-row');
      const name = row.querySelector('.product-name').textContent;
      if (!confirm(`Remove account "${name}"? They will no longer be able to log in.`)) return;

      try {
        await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
        showMsg('userFormMessage', `\u2713 "${name}" removed.`);
        renderUserList();
      } catch (e) {
        showMsg('userFormMessage', e.message, true);
      }
    });
  });
}

async function handleAddUser() {
  const name     = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUsername').value.trim();
  const role     = document.getElementById('newUserRole').value;
  const password = document.getElementById('newUserPassword').value;

  if (!name)     return showMsg('userFormMessage', 'Enter a full name.', true);
  if (!username) return showMsg('userFormMessage', 'Enter a username.', true);
  if (!password || password.length < 6) return showMsg('userFormMessage', 'Password must be at least 6 characters.', true);

  try {
    await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, username, role, password }) });
    document.getElementById('newUserForm').reset();
    showMsg('userFormMessage', `\u2713 Account "${username}" created.`);
    renderUserList();
  } catch (e) {
    showMsg('userFormMessage', e.message, true);
  }
}

document.getElementById('addProductBtn').addEventListener('click', handleAddProduct);
document.getElementById('addUserBtn').addEventListener('click', handleAddUser);

// ── Init (admin-only page) ──────────────────────────────────────
(async function () {
  const user = await requireAuth({ role: 'admin' });
  if (!user) return;
  currentUserId = user.id;
  renderProductList();
  renderUserList();
})();
