/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Billing Script
   Orders + product catalogue now come from the real API
   (see auth.js for apiFetch/requireAuth).
   Supports billing single or multiple products per receipt!
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

// Product & Multi-item billing refs
const productSelect             = document.getElementById('productSelect');
const quantityInput             = document.getElementById('quantityInput');
const rateInput                 = document.getElementById('rateInput');
const unitDisplay               = document.getElementById('unitDisplay');
const rateStatus                = document.getElementById('rateStatus');
const btnAddItem                = document.getElementById('btnAddItem');
const itemSubtotalBox           = document.getElementById('itemSubtotalBox');
const itemSubtotalPreview       = document.getElementById('itemSubtotalPreview');
const billItemsCard             = document.getElementById('billItemsCard');
const billItemsBadge            = document.getElementById('billItemsBadge');
const billItemsTableBody        = document.getElementById('billItemsTableBody');
const btnClearBillItems         = document.getElementById('btnClearBillItems');

// Summary & Status refs
const summaryItemsCount         = document.getElementById('summaryItemsCount');
const summaryTotalQty           = document.getElementById('summaryTotalQty');
const totalDisplay              = document.getElementById('totalDisplay');
const formMessage               = document.getElementById('formMessage');
const trackCustomerCheck        = document.getElementById('trackCustomer');
const generateBtn               = document.getElementById('generateReceiptBtn');
const saveTaskBtn               = document.getElementById('saveTaskBtn');

// Receipt Preview refs
const receiptDate               = document.getElementById('receiptDate');
const receiptBillNoRow          = document.getElementById('receiptBillNoRow');
const receiptBillNo             = document.getElementById('receiptBillNo');
const receiptCustomer           = document.getElementById('receiptCustomer');
const receiptPhoneRow           = document.getElementById('receiptPhoneRow');
const receiptPhone              = document.getElementById('receiptPhone');
const receiptItemsList          = document.getElementById('receiptItemsList');
const receiptItemsCountRow      = document.getElementById('receiptItemsCountRow');
const receiptItemsCount         = document.getElementById('receiptItemsCount');
const receiptTotal              = document.getElementById('receiptTotal');

// Service Task refs
const serviceTaskBox            = document.getElementById('serviceTaskBox');
const taskTokenNoInput          = document.getElementById('taskTokenNo');
const btnNextToken              = document.getElementById('btnNextToken');
const taskReadyByInput          = document.getElementById('taskReadyByInput');
const taskNotesInput            = document.getElementById('taskNotesInput');
const intakeSlipModal           = document.getElementById('intakeSlipModal');
const btnCloseIntakeModal       = document.getElementById('btnCloseIntakeModal');
const btnDismissIntakeModal     = document.getElementById('btnDismissIntakeModal');
const btnPrintIntakeSlip        = document.getElementById('btnPrintIntakeSlip');

// ── State ─────────────────────────────────────────────────────
let ALL_PRODUCTS        = [];
let currentDefaultRate  = 0;
let lastGeneratedOrder  = null;
let customerMode        = 'existing'; // 'existing' | 'new'
let selectedCustomer    = null; // { id, name, phone, orderCount, totalSpent }
let billItems           = []; // Array of { product, category, unit, quantity, rate, total, customRate }

// ── Load product catalogue from the server ──────────────────────
async function loadProducts() {
  try {
    const data = await apiFetch('/products');
    ALL_PRODUCTS = data.products || [];
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

// ── Live calculation & preview ────────────────────────────────
function updateCalc() {
  const product = getSelectedProduct();
  const curQty  = parseFloat(quantityInput.value) || 0;
  const curRate = parseFloat(rateInput.value) || 0;
  const curItemTotal = (product && curQty > 0) ? (curQty * curRate) : 0;

  if (itemSubtotalBox) {
    if (product && curQty > 0) {
      itemSubtotalBox.style.display = 'block';
      if (itemSubtotalPreview) itemSubtotalPreview.textContent = fmt(curItemTotal);
    } else {
      itemSubtotalBox.style.display = 'none';
    }
  }

  updateRateStatus();

  // Grand totals across all billItems + current item if any
  const addedTotal = billItems.reduce((s, it) => s + it.total, 0);
  const addedQty   = billItems.reduce((s, it) => s + it.quantity, 0);

  const totalItemsCount = billItems.length + (product && curQty > 0 ? 1 : 0);
  const grandTotal      = addedTotal + curItemTotal;
  const grandQty        = addedQty + curQty;

  if (summaryItemsCount) {
    summaryItemsCount.textContent = `${totalItemsCount} product${totalItemsCount === 1 ? '' : 's'}`;
  }
  if (summaryTotalQty) {
    summaryTotalQty.textContent = `${grandQty.toFixed(2)} units`;
  }
  if (totalDisplay) {
    totalDisplay.textContent = fmt(grandTotal);
  }

  updateLiveReceipt();
}

// ── Add Item to Bill ──────────────────────────────────────────
function addItemToBill() {
  const product = getSelectedProduct();
  const qty     = parseFloat(quantityInput.value);
  const rate    = parseFloat(rateInput.value);

  if (!product) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Please select a product / பொருளைத் தேர்வு செய்யவும்';
    productSelect.focus();
    return false;
  }
  if (!qty || qty <= 0) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Please enter valid quantity / சரியான அளவை உள்ளிடவும்';
    quantityInput.focus();
    return false;
  }
  if (isNaN(rate) || rate < 0) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Please enter valid rate / சரியான விலையை உள்ளிடவும்';
    rateInput.focus();
    return false;
  }

  formMessage.textContent = '';

  const itemTotal = Number((qty * rate).toFixed(2));
  const isCustomRate = rate !== product.rate;

  // Check if same product with same rate is already in the list
  const existing = billItems.find(i => i.product === product.name && i.rate === rate);
  if (existing) {
    existing.quantity = Number((existing.quantity + qty).toFixed(2));
    existing.total = Number((existing.quantity * existing.rate).toFixed(2));
  } else {
    billItems.push({
      product: product.name,
      category: product.category || 'sales',
      unit: product.unit,
      quantity: qty,
      rate,
      total: itemTotal,
      customRate: isCustomRate
    });
  }

  // Reset product inputs for next item
  productSelect.value = '';
  quantityInput.value = '';
  rateInput.value = '';
  unitDisplay.value = '-';
  currentDefaultRate = 0;
  rateStatus.textContent = 'Default rate';
  rateStatus.classList.remove('custom');
  if (itemSubtotalBox) itemSubtotalBox.style.display = 'none';
  if (serviceTaskBox) serviceTaskBox.style.display = 'none';
  if (saveTaskBtn) saveTaskBtn.style.display = 'none';

  renderBillItems();
  updateCalc();
  updateLiveReceipt();

  // Focus back to product select for speedy entry
  productSelect.focus();
  return true;
}

// ── Remove single item from bill ──────────────────────────────
function removeItemFromBill(index) {
  if (index >= 0 && index < billItems.length) {
    billItems.splice(index, 1);
    renderBillItems();
    updateCalc();
    updateLiveReceipt();
  }
}

// ── Clear all items from bill ─────────────────────────────────
function clearBillItems() {
  if (!billItems.length) return;
  billItems = [];
  renderBillItems();
  updateCalc();
  updateLiveReceipt();
}

// ── Render Bill Items Table in the form ───────────────────────
function renderBillItems() {
  if (!billItemsCard || !billItemsTableBody) return;

  if (billItems.length === 0) {
    billItemsCard.style.display = 'none';
    billItemsTableBody.innerHTML = '';
    if (billItemsBadge) billItemsBadge.textContent = '0 items';
    return;
  }

  billItemsCard.style.display = 'block';
  if (billItemsBadge) {
    billItemsBadge.textContent = `${billItems.length} item${billItems.length === 1 ? '' : 's'}`;
  }

  billItemsTableBody.innerHTML = billItems.map((item, idx) => {
    const isService = item.category === 'service';
    const catBadge = isService
      ? '<span class="bill-item-cat service">அரைவை</span>'
      : '<span class="bill-item-cat sales">விற்பனை</span>';

    return `
      <tr>
        <td class="bill-item-num">${idx + 1}</td>
        <td>
          <div class="bill-item-name">
            <span>${escapeHtml(item.product)}</span>
            ${catBadge}
          </div>
        </td>
        <td class="bill-item-qty">${item.quantity.toFixed(2)} ${escapeHtml(item.unit)}</td>
        <td class="bill-item-rate">${fmt(item.rate)}</td>
        <td class="bill-item-total">${fmt(item.total)}</td>
        <td style="text-align:center">
          <button type="button" class="btn-remove-item" data-index="${idx}" title="Remove item / நீக்கு">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  billItemsTableBody.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      removeItemFromBill(idx);
    });
  });
}

// ── Live Receipt Preview (Updates in real time) ────────────────
function updateLiveReceipt() {
  // If lastGeneratedOrder exists and no new draft items or active inputs, leave lastGeneratedOrder
  const curProduct = getSelectedProduct();
  const curQty = parseFloat(quantityInput.value) || 0;
  const curRate = parseFloat(rateInput.value) || 0;

  // Active items = saved billItems + pending product input (if valid)
  const itemsToDisplay = [...billItems];
  if (curProduct && curQty > 0) {
    itemsToDisplay.push({
      product: curProduct.name,
      category: curProduct.category || 'sales',
      unit: curProduct.unit,
      quantity: curQty,
      rate: curRate,
      total: Number((curQty * curRate).toFixed(2)),
      customRate: curRate !== curProduct.rate
    });
  }

  // Update customer and phone preview
  let custName = '-';
  let custPhone = '';
  if (customerMode === 'existing') {
    custName = selectedCustomer ? selectedCustomer.name : '-';
    custPhone = selectedCustomer ? (selectedCustomer.phone || '') : '';
  } else {
    custName = newCustNameInput ? (newCustNameInput.value.trim() || '-') : '-';
    custPhone = newCustPhoneInput ? (newCustPhoneInput.value.trim() || '') : '';
  }

  if (receiptCustomer) receiptCustomer.textContent = custName;
  if (receiptPhoneRow) {
    if (custPhone) {
      receiptPhoneRow.style.display = '';
      if (receiptPhone) receiptPhone.textContent = custPhone;
    } else {
      receiptPhoneRow.style.display = 'none';
    }
  }

  if (receiptDate && (!lastGeneratedOrder || itemsToDisplay.length > 0)) {
    receiptDate.textContent = fmtDate(new Date());
  }

  // Render items into receipt preview
  if (!receiptItemsList) return;

  if (itemsToDisplay.length === 0) {
    receiptItemsList.innerHTML = `<div class="receipt-empty-item">No products added yet</div>`;
    if (receiptTotal) receiptTotal.textContent = fmt(0);
    if (receiptItemsCountRow) receiptItemsCountRow.style.display = 'none';
    return;
  }

  const grandTotal = itemsToDisplay.reduce((s, it) => s + it.total, 0);
  const grandQty = itemsToDisplay.reduce((s, it) => s + it.quantity, 0);

  receiptItemsList.innerHTML = itemsToDisplay.map((item, idx) => `
    <div class="receipt-item-row">
      <div class="receipt-item-name" title="${escapeHtml(item.product)}">${idx + 1}. ${escapeHtml(item.product)}</div>
      <div class="receipt-item-qty">${item.quantity.toFixed(2)} ${escapeHtml(item.unit)}</div>
      <div class="receipt-item-rate">${fmt(item.rate)}</div>
      <div class="receipt-item-amt">${fmt(item.total)}</div>
    </div>
  `).join('');

  if (receiptTotal) receiptTotal.textContent = fmt(grandTotal);
  if (receiptItemsCountRow) {
    receiptItemsCountRow.style.display = '';
    if (receiptItemsCount) {
      receiptItemsCount.textContent = `${itemsToDisplay.length} product${itemsToDisplay.length === 1 ? '' : 's'} (${grandQty.toFixed(2)} units)`;
    }
  }
}

function setReadyByPreset(mins, timeType) {
  const d = new Date();
  if (timeType === 'today-evening') {
    d.setHours(17, 0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate() + 1);
  } else if (timeType === 'tomorrow-morning') {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  } else if (mins) {
    d.setTime(d.getTime() + mins * 60000);
  }
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (taskReadyByInput) {
    taskReadyByInput.value = `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  }
}

async function loadNextToken() {
  try {
    const data = await apiFetch('/tasks/next-token');
    if (taskTokenNoInput && (!taskTokenNoInput.value || taskTokenNoInput.value.startsWith('Bag #'))) {
      taskTokenNoInput.value = data.tokenNo || `Bag #${data.nextNumber || 1}`;
    }
  } catch (e) {
    if (taskTokenNoInput && !taskTokenNoInput.value) {
      taskTokenNoInput.value = 'Bag #1';
    }
  }
}

function handleProductChange() {
  const product = getSelectedProduct();
  if (!product) {
    rateInput.value = '';
    if (serviceTaskBox) serviceTaskBox.style.display = 'none';
    if (saveTaskBtn) saveTaskBtn.style.display = 'none';
    updateCalc();
    return;
  }
  currentDefaultRate = product.rate;
  rateInput.value = product.rate;
  unitDisplay.value = product.unit;

  if (product.category === 'service') {
    if (serviceTaskBox) serviceTaskBox.style.display = 'block';
    if (saveTaskBtn) saveTaskBtn.style.display = 'inline-flex';
    if (taskReadyByInput && !taskReadyByInput.value) setReadyByPreset(60);
    if (taskTokenNoInput && !taskTokenNoInput.value) loadNextToken();
  } else {
    if (serviceTaskBox) serviceTaskBox.style.display = 'none';
    if (saveTaskBtn) saveTaskBtn.style.display = 'none';
  }

  updateCalc();
}

// ── Validate & build order payload ────────────────────────────
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

  // If user entered a product in the inputs and didn't click "Add", include it automatically!
  const curProduct = getSelectedProduct();
  const curQty     = parseFloat(quantityInput.value);
  const curRate    = parseFloat(rateInput.value);

  if (curProduct && curQty > 0 && !isNaN(curRate) && curRate >= 0) {
    const existing = billItems.find(i => i.product === curProduct.name && i.rate === curRate);
    if (existing) {
      existing.quantity = Number((existing.quantity + curQty).toFixed(2));
      existing.total = Number((existing.quantity * existing.rate).toFixed(2));
    } else {
      billItems.push({
        product: curProduct.name,
        category: curProduct.category || 'sales',
        unit: curProduct.unit,
        quantity: curQty,
        rate: curRate,
        total: Number((curQty * curRate).toFixed(2)),
        customRate: curRate !== curProduct.rate
      });
    }
    // Clear inputs
    productSelect.value = '';
    quantityInput.value = '';
    rateInput.value = '';
    unitDisplay.value = '-';
    currentDefaultRate = 0;
    renderBillItems();
  }

  if (billItems.length === 0) {
    return { error: 'Please add at least one product to the bill / பில்லில் குறைந்தபட்சம் ஒரு பொருளைச் சேர்க்கவும்' };
  }

  const tracked = trackCustomerCheck ? trackCustomerCheck.checked : true;
  const grandTotal = Number(billItems.reduce((s, it) => s + it.total, 0).toFixed(2));

  return {
    name,
    phone: phone || undefined,
    customerId: (customerMode === 'existing' && selectedCustomer) ? selectedCustomer.id : undefined,
    tracked,
    items: billItems.map(it => ({
      product: it.product,
      unit: it.unit,
      quantity: it.quantity,
      rate: it.rate,
      total: it.total,
      customRate: !!it.customRate
    })),
    total: grandTotal
  };
}

// ── Render receipt panel with finalized order / bill ───────────
function renderReceipt(billData) {
  if (!billData) return;

  if (receiptDate) receiptDate.textContent = fmtDate(billData.date || new Date());
  if (receiptCustomer) receiptCustomer.textContent = billData.name || '-';

  if (receiptBillNoRow) {
    if (billData.billNo) {
      receiptBillNoRow.style.display = '';
      if (receiptBillNo) receiptBillNo.textContent = billData.billNo;
    } else {
      receiptBillNoRow.style.display = 'none';
    }
  }

  if (receiptPhoneRow) {
    if (billData.phone) {
      receiptPhoneRow.style.display = '';
      if (receiptPhone) receiptPhone.textContent = billData.phone;
    } else {
      receiptPhoneRow.style.display = 'none';
    }
  }

  const items = billData.items || (billData.order?.items) || [billData];
  const grandTotal = billData.total !== undefined ? billData.total : (billData.order?.total || 0);
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  if (receiptItemsList) {
    receiptItemsList.innerHTML = items.map((item, idx) => `
      <div class="receipt-item-row">
        <div class="receipt-item-name" title="${escapeHtml(item.product)}">${idx + 1}. ${escapeHtml(item.product)}</div>
        <div class="receipt-item-qty">${Number(item.quantity).toFixed(2)} ${escapeHtml(item.unit || '')}</div>
        <div class="receipt-item-rate">${fmt(item.rate)}</div>
        <div class="receipt-item-amt">${fmt(item.total)}</div>
      </div>
    `).join('');
  }

  if (receiptTotal) receiptTotal.textContent = fmt(grandTotal);
  if (receiptItemsCountRow) {
    receiptItemsCountRow.style.display = '';
    if (receiptItemsCount) {
      receiptItemsCount.textContent = `${items.length} product${items.length === 1 ? '' : 's'} (${totalQty.toFixed(2)} units)`;
    }
  }
}

// ── Reset form ────────────────────────────────────────────────
function resetForm() {
  document.getElementById('billingForm').reset();
  unitDisplay.value = '-';
  currentDefaultRate = 0;
  rateStatus.textContent = 'Default rate';
  rateStatus.classList.remove('custom');
  if (itemSubtotalBox) itemSubtotalBox.style.display = 'none';

  billItems = [];
  renderBillItems();

  if (summaryItemsCount) summaryItemsCount.textContent = '0 items';
  if (summaryTotalQty) summaryTotalQty.textContent = '0.00 units';
  if (totalDisplay) totalDisplay.textContent = '\u20B90.00';

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
  if (taskTokenNoInput) taskTokenNoInput.value = '';
  if (taskNotesInput) taskNotesInput.value = '';
  if (serviceTaskBox) serviceTaskBox.style.display = 'none';
  if (saveTaskBtn) saveTaskBtn.style.display = 'none';
  hideSuggestions();
}

// ── Generate receipt (saves all order items via the API) ──────
async function generateReceipt() {
  const orderData = getOrderData();
  if (orderData.error) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = orderData.error;
    return false;
  }
  formMessage.textContent = '';

  generateBtn.disabled = true;
  try {
    const data = await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

    lastGeneratedOrder = data;
    renderReceipt(data);
    resetForm();

    const count = data.itemCount || (data.items?.length) || 1;
    const billTag = data.billNo ? `(${data.billNo}) ` : '';
    formMessage.style.color = 'var(--green)';
    formMessage.textContent = orderData.tracked
      ? `\u2713 Bill ${billTag}saved with ${count} product${count === 1 ? '' : 's'} & customer tracked!`
      : `\u2713 Bill ${billTag}generated with ${count} product${count === 1 ? '' : 's'} (not tracked)`;

    showToast(`✓ Bill ${data.billNo || ''} generated for ${data.name}!`);

    setTimeout(() => { formMessage.textContent = ''; formMessage.style.color = ''; }, 4000);
    return true;
  } catch (e) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Could not save the bill: ' + e.message;
    return false;
  } finally {
    generateBtn.disabled = false;
  }
}

// ── Print Receipt ─────────────────────────────────────────────
async function printReceipt() {
  if (!lastGeneratedOrder) {
    if (!(await generateReceipt())) return;
  }
  window.print();
}

// ── Save as Service Task & Reminder ───────────────────────────
async function saveServiceTask() {
  let name = '';
  let phone = '';

  if (customerMode === 'existing') {
    if (!selectedCustomer) {
      formMessage.style.color = 'var(--red)';
      formMessage.textContent = 'Please select a customer / வாடிக்கையாளரைத் தேர்வு செய்யவும்';
      return false;
    }
    name = selectedCustomer.name;
    phone = selectedCustomer.phone || '';
  } else {
    name = newCustNameInput ? newCustNameInput.value.trim() : '';
    phone = newCustPhoneInput ? newCustPhoneInput.value.trim() : '';
    if (!name) {
      formMessage.style.color = 'var(--red)';
      formMessage.textContent = 'Please enter customer name / வாடிக்கையாளர் பெயரை உள்ளிடவும்';
      return false;
    }
  }

  const product = getSelectedProduct();
  const qty     = parseFloat(quantityInput.value);
  const rate    = parseFloat(rateInput.value);

  if (!product) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Please select service product / அரைவை பொருளைத் தேர்வு செய்யவும்';
    return false;
  }
  if (!qty || qty <= 0) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Please enter valid quantity / சரியான அளவை உள்ளிடவும்';
    return false;
  }
  if (isNaN(rate) || rate < 0) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Please enter valid rate / சரியான விலையை உள்ளிடவும்';
    return false;
  }

  formMessage.textContent = '';

  const tokenNo = taskTokenNoInput ? taskTokenNoInput.value.trim() : '';
  const readyBy = taskReadyByInput ? taskReadyByInput.value : '';
  const notes   = taskNotesInput ? taskNotesInput.value.trim() : '';

  if (saveTaskBtn) {
    saveTaskBtn.disabled = true;
    saveTaskBtn.textContent = 'Saving...';
  }

  try {
    const payload = {
      customerName: name,
      phone: phone || undefined,
      product: product.name,
      unit: product.unit,
      quantity: qty,
      rate,
      total: Number((qty * rate).toFixed(2)),
      customRate: rate !== product.rate,
      category: product.category || 'service',
      tokenNo,
      readyBy: readyBy ? new Date(readyBy).toISOString() : new Date(Date.now() + 3600000).toISOString(),
      notes
    };

    const res = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const task = res.task;
    showToast(`✓ Service task ${task.tokenNo} added to reminder queue!`);

    openIntakeSlipModal(task);
    resetForm();
    return true;
  } catch (e) {
    formMessage.style.color = 'var(--red)';
    formMessage.textContent = 'Could not save service task: ' + e.message;
    return false;
  } finally {
    if (saveTaskBtn) {
      saveTaskBtn.disabled = false;
      saveTaskBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Save as Task / நினைவூட்டல்
      `;
    }
  }
}

function openIntakeSlipModal(task) {
  if (!task) return;
  document.getElementById('intakeSlipTokenNo').textContent = task.tokenNo || `Bag #${task.id}`;
  document.getElementById('intakeSlipCustomer').textContent = task.customerName || '-';

  const phoneRow = document.getElementById('intakeSlipPhoneRow');
  if (task.phone) {
    phoneRow.style.display = '';
    document.getElementById('intakeSlipPhone').textContent = task.phone;
  } else {
    phoneRow.style.display = 'none';
  }

  document.getElementById('intakeSlipProduct').textContent = task.productName || '-';
  document.getElementById('intakeSlipQuantity').textContent = `${task.quantity} ${task.unit} (@ ${fmt(task.rate)})`;
  document.getElementById('intakeSlipTotal').textContent = fmt(task.total);
  document.getElementById('intakeSlipReadyBy').textContent = fmtDate(task.readyBy);

  const notesRow = document.getElementById('intakeSlipNotesRow');
  if (task.notes) {
    notesRow.style.display = '';
    document.getElementById('intakeSlipNotes').textContent = task.notes;
  } else {
    notesRow.style.display = 'none';
  }

  if (intakeSlipModal) {
    intakeSlipModal.classList.add('open');
    intakeSlipModal.style.display = 'flex';
  }
}

function closeIntakeSlipModal() {
  if (intakeSlipModal) {
    intakeSlipModal.classList.remove('open');
    intakeSlipModal.style.display = 'none';
  }
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
  updateLiveReceipt();
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

  updateLiveReceipt();

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
  updateLiveReceipt();
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
  updateLiveReceipt();
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

// Enter key in quantity or rate triggers Add Item to Bill
[quantityInput, rateInput].forEach(inp => {
  if (inp) {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addItemToBill();
      }
    });
  }
});

if (btnAddItem) btnAddItem.addEventListener('click', addItemToBill);
if (btnClearBillItems) btnClearBillItems.addEventListener('click', clearBillItems);

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
    updateLiveReceipt();
  });
}
if (newCustPhoneInput) {
  newCustPhoneInput.addEventListener('input', handleNewPhoneInput);
}

// Service Task & Reminder Listeners
if (saveTaskBtn) saveTaskBtn.addEventListener('click', saveServiceTask);
if (btnNextToken) btnNextToken.addEventListener('click', loadNextToken);
if (btnCloseIntakeModal) btnCloseIntakeModal.addEventListener('click', closeIntakeSlipModal);
if (btnDismissIntakeModal) btnDismissIntakeModal.addEventListener('click', closeIntakeSlipModal);
if (btnPrintIntakeSlip) btnPrintIntakeSlip.addEventListener('click', () => window.print());
if (intakeSlipModal) {
  intakeSlipModal.addEventListener('click', (e) => {
    if (e.target.id === 'intakeSlipModal') closeIntakeSlipModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && intakeSlipModal.style.display !== 'none') {
      closeIntakeSlipModal();
    }
  });
}

// Quick Preset chips
document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const mins = chip.dataset.mins ? Number(chip.dataset.mins) : null;
    const timeType = chip.dataset.time || null;
    setReadyByPreset(mins, timeType);
  });
});

// ── Init ──────────────────────────────────────────────────────
(async function () {
  const user = await requireAuth();
  if (!user) return;

  await loadProducts();
  populateProducts();
  renderBillItems();
  updateCalc();
  updateTrackLabel();
})();
