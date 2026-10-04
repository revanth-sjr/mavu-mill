/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Billing Script
   Orders + product catalogue now come from the real API
   (see auth.js for apiFetch/requireAuth).
   ============================================================ */

// ── Formatters ────────────────────────────────────────────────
function fmt(v) { return `\u20B9${Number(v || 0).toFixed(2)}`; }
function fmtDate(d) {
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── DOM refs ──────────────────────────────────────────────────
const pillExistingCustomer      = document.getElementById('pillExistingCustomer');
const pillNewCustomer           = document.getElementById('pillNewCustomer');
const existingCustomerContainer = document.getElementById('existingCustomerContainer');
const newCustomerContainer      = document.getElementById('newCustomerContainer');
const customerSearchWrap        = document.getElementById('customerSearchWrap');
const existingCustomerSearch    = document.getElementById('existingCustomerSearch');
const customerSuggestions       = document.getElementById('customerSuggestions');
const btnBrowseAllCustomers     = document.getElementById('btnBrowseAllCustomers');
const selectedCustomerCard      = document.getElementById('selectedCustomerCard');
const selectedCustAvatar        = document.getElementById('selectedCustAvatar');
const selectedCustName          = document.getElementById('selectedCustName');
const selectedCustMeta          = document.getElementById('selectedCustMeta');
const btnChangeCustomer         = document.getElementById('btnChangeCustomer');
const newCustNameInput          = document.getElementById('newCustName');
const newCustPhoneInput         = document.getElementById('newCustPhone');
const newCustomerDuplicateHint  = document.getElementById('newCustomerDuplicateHint');
const customerNameInput         = document.getElementById('customerName');
const customerPhoneInput        = document.getElementById('customerPhone');

const productSelect             = document.getElementById('productSelect');
const quantityInput             = document.getElementById('quantityInput');
const rateInput                 = document.getElementById('rateInput');
const unitDisplay               = document.getElementById('unitDisplay');
const defaultRateDisplay        = document.getElementById('defaultRateDisplay');
const currentRateDisplay        = document.getElementById('currentRateDisplay');
const totalDisplay              = document.getElementById('totalDisplay');
const rateStatus                = document.getElementById('rateStatus');
const formMessage               = document.getElementById('formMessage');
const trackCustomerCheck        = document.getElementById('trackCustomer');
const generateBtn               = document.getElementById('generateReceiptBtn');

let ALL_PRODUCTS        = [];
let currentDefaultRate  = 0;
let lastGeneratedOrder  = null;
let customerMode        = 'existing'; // 'existing' | 'new'
let selectedCustomer    = null; // { id, name, phone, orderCount, totalSpent }


// ── Load product catalogue from the server ──────────────────────
async function loadProducts() {
  try {
    const data = await apiFetch('/products');
    ALL_PRODUCTS = data.products;
  } catch (e) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Could not load products: ' + e.message;
    ALL_PRODUCTS = [];
  }
}

function populateProducts() {
  productSelect.querySelectorAll('optgroup').forEach(og => og.remove());

  const sales = ALL_PRODUCTS.filter(p => p.category === 'sales');
  const service = ALL_PRODUCTS.filter(p => p.category === 'service');

  const sg = document.createElement('optgroup');
  sg.label = 'Sales / \u0BB5\u0BBF\u0BB1\u0BCD\u0BAA\u0BA9\u0BC8';
  sales.forEach(p => {
    const o = document.createElement('option');
    o.value = p.name; o.textContent = p.name;
    sg.appendChild(o);
  });
  const sv = document.createElement('optgroup');
  sv.label = 'Service / \u0A85\u0BB0\u0BB5\u0BC8 \u0B95\u0BC2\u0BB2\u0BBF';
  service.forEach(p => {
    const o = document.createElement('option');
    o.value = p.name; o.textContent = p.name;
    sv.appendChild(o);
  });
  productSelect.appendChild(sg);
  productSelect.appendChild(sv);
}

function getSelectedProduct() {
  return ALL_PRODUCTS.find(p => p.name === productSelect.value);
}

// ── Rate status badge ─────────────────────────────────────────
function updateRateStatus() {
  const product = getSelectedProduct();
  const cur = parseFloat(rateInput.value) || 0;
  const isCustom = Boolean(product) && cur !== currentDefaultRate;
  rateStatus.textContent = isCustom ? 'Custom rate' : 'Default rate';
  rateStatus.classList.toggle('custom', isCustom);
}

// ── Live calculation ──────────────────────────────────────────
function updateCalc() {
  const product = getSelectedProduct();
  const qty  = parseFloat(quantityInput.value) || 0;
  const rate = parseFloat(rateInput.value) || 0;

  if (!product) {
    unitDisplay.value = '-';
    currentDefaultRate = 0;
    defaultRateDisplay.textContent = '\u20B90.00';
    currentRateDisplay.textContent = '\u20B90.00';
    totalDisplay.textContent = '\u20B90.00';
    rateStatus.textContent = 'Default rate';
    rateStatus.classList.remove('custom');
    return;
  }

  unitDisplay.value = product.unit;
  defaultRateDisplay.textContent = `${fmt(currentDefaultRate)} / ${product.unit}`;
  currentRateDisplay.textContent = `${fmt(rate)} / ${product.unit}`;
  totalDisplay.textContent = fmt(qty * rate);
  updateRateStatus();
}

function handleProductChange() {
  const product = getSelectedProduct();
  if (!product) { rateInput.value = ''; updateCalc(); return; }
  currentDefaultRate = product.rate;
  rateInput.value = product.rate;
  unitDisplay.value = product.unit;
  updateCalc();
}

// ── Validate & build order ────────────────────────────────────
function getOrderData() {
  let name = '';
  let phone = '';

  if (customerMode === 'existing') {
    if (!selectedCustomer) {
      return { error: 'Please select an existing customer, or switch to "New Customer" / \u0BB5\u0BBE\u0B9F\u0BBF\u0B95\u0BCD\u0B95\u0BC8\u0BAF\u0BBE\u0BB3\u0BB0\u0BC8\u0BA4\u0BCD \u0BA4\u0BC7\u0BB0\u0BCD\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BB5\u0BC1\u0BAE\u0BCD' };
    }
    name = selectedCustomer.name;
    phone = selectedCustomer.phone || '';
  } else {
    name = newCustNameInput ? newCustNameInput.value.trim() : '';
    phone = newCustPhoneInput ? newCustPhoneInput.value.trim() : '';
    if (!name) {
      return { error: 'Please enter customer name / \u0BB5\u0BBE\u0B9F\u0BBF\u0B95\u0BCD\u0B95\u0BC8\u0BAF\u0BBE\u0BB3\u0BB0\u0BCD \u0BAA\u0BC6\u0BAF\u0BB0\u0BC8 \u0B89\u0BB3\u0BCD\u0BB3\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD' };
    }
    if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) {
      return { error: 'Enter a valid phone number, or leave it blank.' };
    }
  }

  // Update hidden inputs for backward compatibility
  customerNameInput.value = name;
  customerPhoneInput.value = phone;

  const product = getSelectedProduct();
  const qty     = parseFloat(quantityInput.value);
  const rate    = parseFloat(rateInput.value);
  const tracked = trackCustomerCheck ? trackCustomerCheck.checked : true;

  if (!product)           return { error: 'Please select product / \u0BAA\u0BCA\u0BB0\u0BC1\u0BB3\u0BC8 \u0BA4\u0BC7\u0BB0\u0BCD\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BB5\u0BC1\u0BAE\u0BCD' };
  if (!qty || qty <= 0)   return { error: 'Please enter valid quantity / \u0B9A\u0BB0\u0BBF\u0BAF\u0BBE\u0BA9 \u0A85\u0BB3\u0BB5\u0BC8 \u0B89\u0BB3\u0BCD\u0BB3\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD' };
  if (isNaN(rate)||rate<0)return { error: 'Please enter valid rate / \u0B9A\u0BB0\u0BBF\u0BAF\u0BBE\u0BA9 \u0BB5\u0BBF\u0BB2\u0BC8 \u0B89\u0BB3\u0BCD\u0BB3\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD' };

  return {
    name,
    phone: phone || undefined,
    customerId: (customerMode === 'existing' && selectedCustomer) ? selectedCustomer.id : undefined,
    product:    product.name,
    quantity:   qty,
    unit:       product.unit,
    rate,
    total:      qty * rate,
    customRate: rate !== product.rate,
    tracked
  };
}

// ── Render receipt panel ──────────────────────────────────────
function renderReceipt(order) {
  document.getElementById('receiptDate').textContent     = fmtDate(order.date);
  document.getElementById('receiptCustomer').textContent = order.name;
  const phoneRow = document.getElementById('receiptPhoneRow');
  if (order.phone) {
    document.getElementById('receiptPhone').textContent = order.phone;
    phoneRow.style.display = '';
  } else {
    phoneRow.style.display = 'none';
  }
  document.getElementById('receiptProduct').textContent  = order.product;
  document.getElementById('receiptQuantity').textContent = `${order.quantity.toFixed(2)} ${order.unit}`;
  document.getElementById('receiptRate').textContent     = `${fmt(order.rate)} / ${order.unit}`;
  document.getElementById('receiptRateType').textContent = order.customRate ? 'Custom rate' : 'Default rate';
  document.getElementById('receiptTotal').textContent    = fmt(order.total);
}

// ── Reset form ────────────────────────────────────────────────
function resetForm() {
  document.getElementById('billingForm').reset();
  unitDisplay.value = '-';
  currentDefaultRate = 0;
  rateStatus.textContent = 'Default rate';
  rateStatus.classList.remove('custom');
  defaultRateDisplay.textContent = '\u20B90.00';
  currentRateDisplay.textContent = '\u20B90.00';
  totalDisplay.textContent = '\u20B90.00';

  selectedCustomer = null;
  customerNameInput.value = '';
  customerPhoneInput.value = '';
  if (existingCustomerSearch) existingCustomerSearch.value = '';
  if (selectedCustomerCard) selectedCustomerCard.style.display = 'none';
  if (customerSearchWrap) customerSearchWrap.style.display = '';
  if (newCustNameInput) newCustNameInput.value = '';
  if (newCustPhoneInput) newCustPhoneInput.value = '';
  if (newCustomerDuplicateHint) {
    newCustomerDuplicateHint.textContent = '';
    newCustomerDuplicateHint.style.display = 'none';
  }
  hideSuggestions();
}

// ── Generate receipt (saves the order via the API) ─────────────
async function generateReceipt() {
  const order = getOrderData();
  if (order.error) { formMessage.style.color = 'var(--red)'; formMessage.textContent = order.error; return false; }
  formMessage.textContent = '';

  generateBtn.disabled = true;
  try {
    const data = await apiFetch('/orders', { method: 'POST', body: JSON.stringify(order) });
    lastGeneratedOrder = data.order;
    renderReceipt(data.order);
    resetForm();

    formMessage.style.color = 'var(--green)';
    formMessage.textContent = order.tracked
      ? '\u2713 Receipt saved & customer tracked!'
      : '\u2713 Receipt generated (not tracked)';
    setTimeout(() => { formMessage.textContent = ''; formMessage.style.color = ''; }, 3000);
    return true;
  } catch (e) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Could not save the order: ' + e.message;
    return false;
  } finally {
    generateBtn.disabled = false;
  }
}

// ── Print ─────────────────────────────────────────────────────
async function printReceipt() {
  if (!lastGeneratedOrder) { if (!(await generateReceipt())) return; }
  window.print();
}

// ── Update track-customer label dynamically ───────────────────
function updateTrackLabel() {
  const lbl = document.getElementById('trackLabel');
  if (!lbl) return;
  if (trackCustomerCheck && trackCustomerCheck.checked) {
    lbl.textContent = 'Track Customer (data will be saved to dashboard)';
    lbl.style.color = 'var(--green)';
  } else {
    lbl.textContent = 'Track Customer (receipt only, no data saved to dashboard)';
    lbl.style.color = 'var(--muted)';
  }
}

// ── Customer Management (Existing vs New) ─────────────────────
let suggestTimer = null;
let phoneCheckTimer = null;
let activeSuggestionIndex = -1;
let currentSuggestions = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function setCustomerMode(mode) {
  customerMode = mode;
  if (mode === 'existing') {
    pillExistingCustomer.classList.add('active');
    pillNewCustomer.classList.remove('active');
    existingCustomerContainer.style.display = '';
    newCustomerContainer.style.display = 'none';

    if (selectedCustomer) {
      customerNameInput.value = selectedCustomer.name;
      customerPhoneInput.value = selectedCustomer.phone || '';
    } else {
      customerNameInput.value = '';
      customerPhoneInput.value = '';
      setTimeout(() => existingCustomerSearch && existingCustomerSearch.focus(), 50);
    }
  } else {
    pillNewCustomer.classList.add('active');
    pillExistingCustomer.classList.remove('active');
    newCustomerContainer.style.display = '';
    existingCustomerContainer.style.display = 'none';

    customerNameInput.value = newCustNameInput ? newCustNameInput.value.trim() : '';
    customerPhoneInput.value = newCustPhoneInput ? newCustPhoneInput.value.trim() : '';
    setTimeout(() => newCustNameInput && newCustNameInput.focus(), 50);
  }
}

function hideSuggestions() {
  if (!customerSuggestions) return;
  customerSuggestions.classList.remove('open');
  customerSuggestions.innerHTML = '';
  activeSuggestionIndex = -1;
  currentSuggestions = [];
}

function selectCustomer(customer) {
  if (!customer) return;
  selectedCustomer = customer;
  customerNameInput.value = customer.name;
  customerPhoneInput.value = customer.phone || '';

  const initial = (customer.name.trim()[0] || 'C').toUpperCase();
  if (selectedCustAvatar) selectedCustAvatar.textContent = initial;
  if (selectedCustName) selectedCustName.textContent = customer.name;

  const phoneStr = customer.phone ? customer.phone : 'No phone';
  const visits = Number(customer.orderCount || 0);
  const visitsStr = `${visits} order${visits === 1 ? '' : 's'}`;
  const spentStr = customer.totalSpent ? ` \u00b7 ${fmt(customer.totalSpent)} total` : '';
  if (selectedCustMeta) selectedCustMeta.textContent = `${phoneStr} \u00b7 ${visitsStr}${spentStr}`;

  if (customerSearchWrap) customerSearchWrap.style.display = 'none';
  if (selectedCustomerCard) selectedCustomerCard.style.display = 'flex';
  hideSuggestions();

  if (!productSelect.value) {
    productSelect.focus();
  } else {
    quantityInput.focus();
  }
}

function changeCustomer() {
  selectedCustomer = null;
  customerNameInput.value = '';
  customerPhoneInput.value = '';
  if (selectedCustomerCard) selectedCustomerCard.style.display = 'none';
  if (customerSearchWrap) customerSearchWrap.style.display = '';
  if (existingCustomerSearch) {
    existingCustomerSearch.value = '';
    existingCustomerSearch.focus();
  }
  searchCustomers('');
}

function renderSuggestions(customers, searchTerm = '') {
  currentSuggestions = customers;
  if (!customerSuggestions) return;

  if (!customers.length) {
    customerSuggestions.innerHTML = `
      <div style="padding:0.75rem 0.9rem;font-size:0.82rem;color:var(--muted);text-align:center;">
        No customer found matching "<strong>${escapeHtml(searchTerm)}</strong>"
      </div>
      <div class="suggestion-footer">
        <span>Not registered?</span>
        <button type="button" class="btn-link-select" id="btnQuickSwitchToNew">+ Register as New Customer</button>
      </div>
    `;
    const quickBtn = document.getElementById('btnQuickSwitchToNew');
    if (quickBtn) {
      quickBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        setCustomerMode('new');
        if (searchTerm && newCustNameInput) newCustNameInput.value = searchTerm;
        hideSuggestions();
      });
    }
    customerSuggestions.classList.add('open');
    return;
  }

  const itemsHtml = customers.map((c, i) => {
    const phone = c.phone ? `<span>${escapeHtml(c.phone)}</span>` : '<span style="color:var(--faint);">No phone</span>';
    const orders = `${c.orderCount || 0} order${c.orderCount === 1 ? '' : 's'}`;
    const spent = c.totalSpent ? ` \u00b7 ${fmt(c.totalSpent)}` : '';
    return `
      <button type="button" class="suggestion-item${i === activeSuggestionIndex ? ' active' : ''}" data-index="${i}" role="option">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
          <span class="suggestion-name">${escapeHtml(c.name)}</span>
          <span style="font-size:0.72rem;font-family:var(--mono-face);color:var(--muted);">${orders}${spent}</span>
        </div>
        <div class="suggestion-meta">${phone}</div>
      </button>
    `;
  }).join('');

  const footerHtml = `
    <div class="suggestion-footer">
      <span>Can't find customer?</span>
      <button type="button" class="btn-link-select" id="btnQuickSwitchToNew">+ Register as New Customer</button>
    </div>
  `;

  customerSuggestions.innerHTML = itemsHtml + footerHtml;
  customerSuggestions.classList.add('open');

  customerSuggestions.querySelectorAll('.suggestion-item').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      selectCustomer(currentSuggestions[Number(btn.dataset.index)]);
    });
  });

  const quickBtn = document.getElementById('btnQuickSwitchToNew');
  if (quickBtn) {
    quickBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      setCustomerMode('new');
      if (searchTerm && newCustNameInput) newCustNameInput.value = searchTerm;
      hideSuggestions();
    });
  }
}

async function searchCustomers(term = '') {
  try {
    const q = (term || '').trim();
    const url = q ? `/customers?q=${encodeURIComponent(q)}&limit=8` : `/customers?limit=10`;
    const data = await apiFetch(url);
    renderSuggestions(data.customers || [], q);
  } catch (e) {
    hideSuggestions();
  }
}

function handleCustomerSearchInput(e) {
  clearTimeout(suggestTimer);
  const term = e.target.value;
  suggestTimer = setTimeout(() => searchCustomers(term), 200);
}

function handleSuggestionKeys(e) {
  if (!customerSuggestions.classList.contains('open')) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    activeSuggestionIndex = Math.max(0, Math.min(currentSuggestions.length - 1, activeSuggestionIndex + dir));
    renderSuggestions(currentSuggestions, existingCustomerSearch.value);
  } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
    e.preventDefault();
    selectCustomer(currentSuggestions[activeSuggestionIndex]);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

async function checkDuplicatePhone(phone) {
  const clean = (phone || '').trim();
  if (clean.length < 7) {
    if (newCustomerDuplicateHint) {
      newCustomerDuplicateHint.style.display = 'none';
      newCustomerDuplicateHint.innerHTML = '';
    }
    return;
  }
  try {
    const data = await apiFetch(`/customers?q=${encodeURIComponent(clean)}&limit=5`);
    const cleanDigits = clean.replace(/[^0-9]/g, '');
    const match = (data.customers || []).find(c => c.phone && c.phone.replace(/[^0-9]/g, '') === cleanDigits);
    if (match && newCustomerDuplicateHint) {
      newCustomerDuplicateHint.style.display = 'block';
      newCustomerDuplicateHint.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Phone already registered for <strong>${escapeHtml(match.name)}</strong>. 
        <button type="button" class="btn-link-select" id="btnSelectExistingFromDuplicate">Select ${escapeHtml(match.name)}</button>
      `;
      const btn = document.getElementById('btnSelectExistingFromDuplicate');
      if (btn) {
        btn.addEventListener('click', () => {
          setCustomerMode('existing');
          selectCustomer(match);
        });
      }
    } else if (newCustomerDuplicateHint) {
      newCustomerDuplicateHint.style.display = 'none';
      newCustomerDuplicateHint.innerHTML = '';
    }
  } catch (e) {
    // Ignore duplicate check network errors
  }
}

function handleNewPhoneInput(e) {
  customerPhoneInput.value = e.target.value.trim();
  clearTimeout(phoneCheckTimer);
  phoneCheckTimer = setTimeout(() => checkDuplicatePhone(e.target.value), 350);
}

// ── Refresh catalogue (e.g. admin updated prices in another tab) ──
async function refreshProductData() {
  const currentVal = productSelect.value;
  await loadProducts();
  populateProducts();
  if (currentVal && ALL_PRODUCTS.some(p => p.name === currentVal)) {
    productSelect.value = currentVal;
    handleProductChange();
  }
}

// ── Event listeners ───────────────────────────────────────────
productSelect.addEventListener('change', handleProductChange);
quantityInput.addEventListener('input', updateCalc);
rateInput.addEventListener('input', updateCalc);
generateBtn.addEventListener('click', generateReceipt);
document.getElementById('printReceiptBtn').addEventListener('click', printReceipt);
if (trackCustomerCheck) trackCustomerCheck.addEventListener('change', updateTrackLabel);
window.addEventListener('focus', refreshProductData);

// Customer Segment pills
if (pillExistingCustomer) pillExistingCustomer.addEventListener('click', () => setCustomerMode('existing'));
if (pillNewCustomer) pillNewCustomer.addEventListener('click', () => setCustomerMode('new'));

// Existing Customer lookup listeners
if (existingCustomerSearch) {
  existingCustomerSearch.addEventListener('input', handleCustomerSearchInput);
  existingCustomerSearch.addEventListener('focus', () => {
    if (!customerSuggestions.classList.contains('open')) {
      searchCustomers(existingCustomerSearch.value);
    }
  });
  existingCustomerSearch.addEventListener('keydown', handleSuggestionKeys);
  existingCustomerSearch.addEventListener('blur', () => setTimeout(hideSuggestions, 180));
}

if (btnBrowseAllCustomers) {
  btnBrowseAllCustomers.addEventListener('click', () => {
    if (existingCustomerSearch) existingCustomerSearch.focus();
    searchCustomers('');
  });
}

if (btnChangeCustomer) {
  btnChangeCustomer.addEventListener('click', changeCustomer);
}

// New Customer registration listeners
if (newCustNameInput) {
  newCustNameInput.addEventListener('input', () => {
    customerNameInput.value = newCustNameInput.value.trim();
  });
}
if (newCustPhoneInput) {
  newCustPhoneInput.addEventListener('input', handleNewPhoneInput);
}

// ── Init ──────────────────────────────────────────────────────
(async function () {
  const user = await requireAuth();
  if (!user) return;

  await loadProducts();
  populateProducts();
  updateCalc();
  updateTrackLabel();
})();
