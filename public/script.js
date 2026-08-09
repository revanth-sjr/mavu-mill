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
const customerNameInput  = document.getElementById('customerName');
const productSelect      = document.getElementById('productSelect');
const quantityInput      = document.getElementById('quantityInput');
const rateInput          = document.getElementById('rateInput');
const unitDisplay        = document.getElementById('unitDisplay');
const defaultRateDisplay = document.getElementById('defaultRateDisplay');
const currentRateDisplay = document.getElementById('currentRateDisplay');
const totalDisplay       = document.getElementById('totalDisplay');
const rateStatus         = document.getElementById('rateStatus');
const formMessage        = document.getElementById('formMessage');
const trackCustomerCheck = document.getElementById('trackCustomer');
const generateBtn        = document.getElementById('generateReceiptBtn');

let ALL_PRODUCTS        = [];
let currentDefaultRate  = 0;
let lastGeneratedOrder  = null;

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
  rateStatus.textContent = isCustom ? 'Custom Rate' : 'Default Rate';
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
    rateStatus.textContent = 'Default Rate';
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
  const name    = customerNameInput.value.trim();
  const product = getSelectedProduct();
  const qty     = parseFloat(quantityInput.value);
  const rate    = parseFloat(rateInput.value);
  const tracked = trackCustomerCheck ? trackCustomerCheck.checked : true;

  if (!name)              return { error: 'Please enter customer name / \u0BB5\u0BBE\u0B9F\u0BBF\u0B95\u0BCD\u0B95\u0BC8\u0BAF\u0BBE\u0BB3\u0BB0\u0BCD \u0BAA\u0BC6\u0BAF\u0BB0\u0BC8 \u0B89\u0BB3\u0BCD\u0BB3\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD' };
  if (!product)           return { error: 'Please select product / \u0BAA\u0BCA\u0BB0\u0BC1\u0BB3\u0BC8 \u0BA4\u0BC7\u0BB0\u0BCD\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BB5\u0BC1\u0BAE\u0BCD' };
  if (!qty || qty <= 0)   return { error: 'Please enter valid quantity / \u0B9A\u0BB0\u0BBF\u0BAF\u0BBE\u0BA9 \u0A85\u0BB3\u0BB5\u0BC8 \u0B89\u0BB3\u0BCD\u0BB3\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD' };
  if (isNaN(rate)||rate<0)return { error: 'Please enter valid rate / \u0B9A\u0BB0\u0BBF\u0BAF\u0BBE\u0BA9 \u0BB5\u0BBF\u0BB2\u0BC8 \u0B89\u0BB3\u0BCD\u0BB3\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD' };

  return {
    name,
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
  document.getElementById('receiptProduct').textContent  = order.product;
  document.getElementById('receiptQuantity').textContent = `${order.quantity.toFixed(2)} ${order.unit}`;
  document.getElementById('receiptRate').textContent     = `${fmt(order.rate)} / ${order.unit}`;
  document.getElementById('receiptRateType').textContent = order.customRate ? 'Custom Rate' : 'Default Rate';
  document.getElementById('receiptTotal').textContent    = fmt(order.total);
}

// ── Reset form ────────────────────────────────────────────────
function resetForm() {
  document.getElementById('billingForm').reset();
  unitDisplay.value = '-';
  currentDefaultRate = 0;
  rateStatus.textContent = 'Default Rate';
  rateStatus.classList.remove('custom');
  defaultRateDisplay.textContent = '\u20B90.00';
  currentRateDisplay.textContent = '\u20B90.00';
  totalDisplay.textContent = '\u20B90.00';
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

// ── Init ──────────────────────────────────────────────────────
(async function () {
  const user = await requireAuth();
  if (!user) return;

  await loadProducts();
  populateProducts();
  updateCalc();
  updateTrackLabel();
})();
