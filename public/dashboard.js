/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Dashboard Script
   Orders now come from the real API (see auth.js for
   apiFetch/requireAuth) instead of localStorage.
   ============================================================ */

// ── State ────────────────────────────────────────────────────
let allOrders    = [];
let activePeriod = 'today';
let activeSort   = 'recent';
let openCustomer = null;

// ── Formatters ───────────────────────────────────────────────
function fmt(v)    { return `₹${Number(v || 0).toFixed(2)}`; }
function fmtShort(v) {
  if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v/1000).toFixed(1)}K`;
  return fmt(v);
}
function fmtDate(d) {
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtDay(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Period filter ─────────────────────────────────────────────
function filterByPeriod(orders, period) {
  const now  = new Date();
  const todayStr = now.toDateString();
  return orders.filter(o => {
    const d = new Date(o.date);
    if (period === 'today') return d.toDateString() === todayStr;
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === 'year')  return d.getFullYear() === now.getFullYear();
    return true; // all
  });
}

// ── Sort orders ───────────────────────────────────────────────
function sortOrders(orders, sort) {
  const arr = [...orders];
  if (sort === 'recent')       return arr.sort((a,b) => new Date(b.date) - new Date(a.date));
  if (sort === 'oldest')       return arr.sort((a,b) => new Date(a.date) - new Date(b.date));
  if (sort === 'highest_qty')  return arr.sort((a,b) => b.quantity - a.quantity);
  if (sort === 'lowest_qty')   return arr.sort((a,b) => a.quantity - b.quantity);
  if (sort === 'highest_total')return arr.sort((a,b) => b.total - a.total);
  return arr;
}

// ── Customer aggregation ──────────────────────────────────────
function buildCustomerMap(orders) {
  const map = {};
  orders.filter(o => o.tracked !== false).forEach(o => {
    // Group by the real customer_id from the database when we have one
    // (the normal case) — fall back to a name-based key only for legacy
    // data that predates the customers table.
    const key = o.customerId != null ? `id:${o.customerId}` : `name:${o.name.trim().toLowerCase()}`;
    if (!map[key]) map[key] = { name: o.name, phone: o.phone || null, orders: [], productCount: {} };
    if (!map[key].phone && o.phone) map[key].phone = o.phone;
    map[key].orders.push(o);
    map[key].productCount[o.product] = (map[key].productCount[o.product] || 0) + o.quantity;
  });
  return Object.values(map).map(c => {
    const sorted = [...c.orders].sort((a,b) => new Date(b.date) - new Date(a.date));
    const fav = Object.entries(c.productCount).sort((a,b) => b[1]-a[1])[0];
    return {
      name:       c.name,
      phone:      c.phone,
      visits:     c.orders.length,
      spent:      c.orders.reduce((s,o) => s + o.total, 0),
      favProduct: fav ? fav[0] : '—',
      lastVisit:  sorted[0].date,
      orders:     sorted
    };
  }).sort((a,b) => b.spent - a.spent);
}

// ── 7-day trend ───────────────────────────────────────────────
function get7DayTrend(orders) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    days.push({ label: d.toLocaleDateString('en-IN',{weekday:'short'}), key: d.toDateString(), total: 0, isToday: i===0 });
  }
  orders.forEach(o => {
    const key = new Date(o.date).toDateString();
    const hit = days.find(d => d.key === key);
    if (hit) hit.total += o.total;
  });
  return days;
}

// ── Monthly breakdown ─────────────────────────────────────────
function getMonthWise(orders) {
  const map = {};
  orders.forEach(o => {
    const d = new Date(o.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!map[key]) map[key] = { label, total: 0, count: 0, key };
    map[key].total += o.total;
    map[key].count += 1;
  });
  return Object.values(map).sort((a,b) => b.key.localeCompare(a.key));
}

// ── Render stats ──────────────────────────────────────────────
function renderStats(filtered) {
  const labels = { today:'today', month:'this month', year:'this year', all:'all time' };
  const earnings = filtered.reduce((s,o) => s+o.total, 0);
  const qty      = filtered.reduce((s,o) => s+o.quantity, 0);

  document.getElementById('statEarnings').textContent  = fmtShort(earnings);
  document.getElementById('statOrders').textContent    = filtered.length;
  document.getElementById('statQty').textContent       = qty.toFixed(2);
  document.getElementById('statEarningSub').textContent = labels[activePeriod] || '';
  document.getElementById('statOrdersSub').textContent  = `orders ${labels[activePeriod] || ''}`;
  document.getElementById('statQtySub').textContent     = `units ${labels[activePeriod] || ''}`;
}

// ── Render top items ──────────────────────────────────────────
function renderTopItems(filtered) {
  const el = document.getElementById('topItemsList');
  const map = {};
  filtered.forEach(o => {
    if (!map[o.product]) map[o.product] = { qty: 0, total: 0 };
    map[o.product].qty   += o.quantity;
    map[o.product].total += o.total;
  });
  const items = Object.entries(map).sort((a,b) => b[1].qty - a[1].qty).slice(0,6);
  if (!items.length) { el.innerHTML = emptyState('No product data for this period.'); return; }
  el.innerHTML = items.map(([name, v], i) => `
    <div class="list-item">
      <div class="item-row">
        <span class="item-name">
          ${i === 0 ? '<span class="top-badge">TOP</span>' : ''}
          ${name}
        </span>
        <strong>${v.qty.toFixed(2)}</strong>
      </div>
      <div class="item-sub">
        <span>Sales</span>
        <strong>${fmt(v.total)}</strong>
      </div>
    </div>`).join('');
}

// ── Render recent orders ──────────────────────────────────────
function renderRecentOrders(filtered) {
  const el = document.getElementById('recentOrders');
  const sorted = sortOrders(filtered, activeSort).slice(0, 8);
  if (!sorted.length) { el.innerHTML = emptyState('No orders for this period.'); return; }
  el.innerHTML = sorted.map(o => `
    <div class="order-item">
      <div class="order-top">
        <span class="order-name">${o.name}${o.tracked === false ? ' <em style="color:var(--muted);font-size:0.75rem;font-weight:400">(untracked)</em>' : ''}</span>
        <span class="order-total">${fmt(o.total)}</span>
      </div>
      <div class="order-bottom">
        <span>${o.product} · ${o.quantity.toFixed(2)} ${o.unit} · ${fmt(o.rate)}/${o.unit}</span>
        <span>${fmtDate(o.date)}</span>
      </div>
    </div>`).join('');
}

// ── Render trend ──────────────────────────────────────────────
function renderTrend() {
  const data = get7DayTrend(allOrders);
  const max  = Math.max(...data.map(d=>d.total), 1);
  const barsEl  = document.getElementById('trendBars');
  const daysEl  = document.getElementById('trendDays');

  barsEl.innerHTML = data.map(d => {
    const pct = Math.max((d.total/max)*100, d.total>0?8:4);
    return `
      <div class="bar-col">
        <div class="bar-col-inner">
          <div class="bar-amt">${d.total > 0 ? fmtShort(d.total) : ''}</div>
          <div class="bar${d.isToday?' today':''}" style="height:${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  daysEl.innerHTML = data.map(d =>
    `<span${d.isToday?' style="color:var(--orange);font-weight:800"':''}>${d.label}</span>`
  ).join('');
}

// ── Render top customers ──────────────────────────────────────
function renderTopCustomers(filtered) {
  const el = document.getElementById('topCustomers');
  const cmap = buildCustomerMap(filtered);
  const top  = cmap.slice(0, 5);
  if (!top.length) { el.innerHTML = emptyState('No tracked customer data.'); return; }
  el.innerHTML = top.map((c, i) => {
    const isRepeat = c.visits >= 3;
    return `
    <div class="customer-item" data-customer="${encodeURIComponent(c.name)}">
      <div class="customer-top">
        <div style="display:flex;align-items:center;gap:0.6rem">
          <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="customer-name">
              ${i===0?'<span class="top-badge" style="margin-right:0.3rem">TOP</span>':''}
              ${c.name}
              ${isRepeat?'<span class="repeat-badge" style="margin-left:0.3rem">Regular</span>':''}
            </div>
            <div class="customer-meta">${c.visits} visit${c.visits>1?'s':''} · Last: ${fmtDay(c.lastVisit)}${c.phone ? ' · ' + c.phone : ''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="customer-spent">${fmtShort(c.spent)}</div>
          <div class="customer-orders">${c.visits} orders</div>
        </div>
      </div>
      <div class="customer-fav">⭐ Favourite: ${c.favProduct}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('.customer-item').forEach(item => {
    item.addEventListener('click', () => {
      openCustomerModal(decodeURIComponent(item.dataset.customer));
    });
  });
}

// ── Render customer list (full, with search filter) ───────────
let customerSearchTerm = '';

function renderCustomerList() {
  const el = document.getElementById('customerListBody');
  if (!el) return;
  let cmap = buildCustomerMap(allOrders);
  const total = cmap.length;

  const term = customerSearchTerm.trim().toLowerCase();
  if (term) {
    cmap = cmap.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.toLowerCase().includes(term))
    );
  }

  const countEl = document.getElementById('customerSearchCount');
  if (countEl) {
    countEl.textContent = term
      ? `${cmap.length} of ${total}`
      : `${total} customer${total === 1 ? '' : 's'}`;
  }

  if (!cmap.length) {
    el.innerHTML = emptyState(term ? `No customer matches "${customerSearchTerm}".` : 'No tracked customers yet.');
    return;
  }
  el.innerHTML = cmap.map(c => {
    const isRepeat = c.visits >= 3;
    return `
    <div class="customer-item" data-customer="${encodeURIComponent(c.name)}">
      <div class="customer-top">
        <div style="display:flex;align-items:center;gap:0.6rem">
          <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="customer-name">
              ${c.name}
              ${isRepeat?'<span class="repeat-badge" style="margin-left:0.3rem">Regular</span>':''}
            </div>
            <div class="customer-meta">${c.visits} visit${c.visits>1?'s':''} · Last: ${fmtDay(c.lastVisit)}${c.phone ? ' · ' + c.phone : ''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="customer-spent">${fmtShort(c.spent)}</div>
          <div class="customer-orders">${c.visits} orders · ${fmt(c.spent)}</div>
        </div>
      </div>
      <div class="customer-fav">⭐ Favourite: ${c.favProduct}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('.customer-item').forEach(item => {
    item.addEventListener('click', () => {
      openCustomerModal(decodeURIComponent(item.dataset.customer));
    });
  });
}

// ── Monthly report ────────────────────────────────────────────
function renderMonthlyReport() {
  const now = new Date();
  const mo  = now.getMonth(), yr = now.getFullYear();
  const monthOrders = allOrders.filter(o => {
    const d = new Date(o.date);
    return d.getMonth()===mo && d.getFullYear()===yr;
  });

  const title = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  document.getElementById('monthReportTitle').textContent = title;

  const totalEarnings = monthOrders.reduce((s,o)=>s+o.total,0);
  const totalQty      = monthOrders.reduce((s,o)=>s+o.quantity,0);

  const pmap = {};
  monthOrders.forEach(o => { pmap[o.product]=(pmap[o.product]||0)+o.quantity; });
  const topProd = Object.entries(pmap).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('monthlyStats').innerHTML = `
    <div class="month-row">
      <span class="month-name">Total Earnings</span>
      <span class="month-val">${fmt(totalEarnings)}</span>
    </div>
    <div class="month-row">
      <span class="month-name">Total Orders</span>
      <span class="month-val">${monthOrders.length}</span>
    </div>
    <div class="month-row">
      <span class="month-name">Total Quantity</span>
      <span class="month-val">${totalQty.toFixed(2)}</span>
    </div>
    <div class="month-row">
      <span class="month-name">Top Product</span>
      <span class="month-val">${topProd ? topProd[0] : '—'}</span>
    </div>`;

  const prodRows = Object.entries(pmap).sort((a,b)=>b[1]-a[1]);
  document.getElementById('monthlyProducts').innerHTML = prodRows.length
    ? prodRows.map(([name,qty]) => `
        <div class="month-row">
          <span class="month-name" style="font-size:0.83rem">${name}</span>
          <span class="month-sub">${qty.toFixed(2)}</span>
        </div>`).join('')
    : emptyState('No orders this month.');
}

// ── Yearly report ─────────────────────────────────────────────
function renderYearlyReport() {
  const yr = new Date().getFullYear();
  document.getElementById('yearReportTitle').textContent = `Year ${yr}`;
  const yearOrders = allOrders.filter(o => new Date(o.date).getFullYear() === yr);

  const totalEarnings = yearOrders.reduce((s,o)=>s+o.total,0);
  const totalQty      = yearOrders.reduce((s,o)=>s+o.quantity,0);

  const pmap = {};
  yearOrders.forEach(o => { pmap[o.product]=(pmap[o.product]||0)+o.quantity; });
  const topProds = Object.entries(pmap).sort((a,b)=>b[1]-a[1]).slice(0,3);

  document.getElementById('yearlyStats').innerHTML = `
    <div class="month-row">
      <span class="month-name">Total Earnings</span>
      <span class="month-val">${fmt(totalEarnings)}</span>
    </div>
    <div class="month-row">
      <span class="month-name">Total Orders</span>
      <span class="month-val">${yearOrders.length}</span>
    </div>
    <div class="month-row">
      <span class="month-name">Total Quantity</span>
      <span class="month-val">${totalQty.toFixed(2)}</span>
    </div>
    <div class="month-row">
      <span class="month-name">Top Products</span>
      <span class="month-val" style="font-size:0.82rem;text-align:right">${topProds.map(p=>p[0]).join(', ') || '—'}</span>
    </div>`;

  const months = getMonthWise(yearOrders);
  document.getElementById('monthWiseList').innerHTML = months.length
    ? months.map(m => `
        <div class="month-row">
          <div>
            <div class="month-name" style="font-size:0.85rem">${m.label}</div>
            <div class="month-sub">${m.count} orders</div>
          </div>
          <span class="month-val">${fmtShort(m.total)}</span>
        </div>`).join('')
    : emptyState('No orders this year.');
}

// ── Customer Modal ────────────────────────────────────────────
function openCustomerModal(name) {
  openCustomer = name;
  const cmap = buildCustomerMap(allOrders);
  const c = cmap.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!c) return;

  document.getElementById('modalCustomerName').textContent = c.phone ? `${c.name} (${c.phone})` : c.name;
  document.getElementById('modalTotalSpent').textContent   = fmtShort(c.spent);
  document.getElementById('modalTotalOrders').textContent  = c.visits;
  document.getElementById('modalLastVisit').textContent    = fmtDay(c.lastVisit);
  document.getElementById('modalFav').textContent          = c.favProduct;

  document.getElementById('modalOrders').innerHTML = c.orders.map(o => `
    <div class="order-item">
      <div class="order-top">
        <span style="font-weight:600">${o.product}</span>
        <span class="order-total">${fmt(o.total)}</span>
      </div>
      <div class="order-bottom">
        <span>${o.quantity.toFixed(2)} ${o.unit} · ${fmt(o.rate)}/${o.unit}</span>
        <span>${fmtDate(o.date)}</span>
      </div>
    </div>`).join('');

  document.getElementById('customerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCustomerModal() {
  document.getElementById('customerModal').classList.remove('open');
  document.body.style.overflow = '';
  openCustomer = null;
}

// ── Last updated ──────────────────────────────────────────────
function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) el.textContent = `Updated: ${new Date().toLocaleTimeString('en-IN', { timeStyle: 'short' })}`;
}

// ── Empty state helper ────────────────────────────────────────
function emptyState(msg) {
  return `<div class="empty-state">${msg}</div>`;
}

// ── Fetch orders from the API ───────────────────────────────────
async function fetchOrders() {
  try {
    const data = await apiFetch('/orders');
    allOrders = data.orders;
  } catch (e) {
    console.error('Could not load orders:', e.message);
  }
}

// ── Master render ─────────────────────────────────────────────
async function renderDashboard() {
  await fetchOrders();
  const filtered = sortOrders(filterByPeriod(allOrders, activePeriod), activeSort);
  renderStats(filtered);
  renderTopItems(filtered);
  renderRecentOrders(filtered);
  renderTrend();
  renderTopCustomers(filtered);
  renderCustomerList();
  renderMonthlyReport();
  renderYearlyReport();
  updateLastUpdated();
}

// ── Clear data (admin only — server also enforces this) ─────────
async function clearAllData() {
  if (!confirm('⚠️ This will permanently delete ALL orders and customer data.\n\nAre you sure?')) return;
  try {
    await apiFetch('/orders', { method: 'DELETE' });
    renderDashboard();
  } catch (e) {
    alert('Could not clear data: ' + e.message);
  }
}

// ── Export / Download Records (Excel / CSV) ────────────────────
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function triggerDownload(content, filename, mimeType = 'text/csv;charset=utf-8;') {
  // \uFEFF is UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 text properly (Tamil characters, etc.)
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadOrdersCsv(ordersToExport, filenamePrefix = 'sakthi_mill_records') {
  const list = ordersToExport || filterByPeriod(allOrders, activePeriod);
  if (!list || !list.length) {
    alert('No records available to download for this period.');
    return;
  }

  const sorted = sortOrders(list, activeSort);
  const headers = [
    'Order ID',
    'Date & Time',
    'Date',
    'Time',
    'Customer Name',
    'Phone',
    'Product',
    'Quantity',
    'Unit',
    'Rate (INR)',
    'Total (INR)',
    'Custom Rate',
    'Tracked'
  ];

  let totalQty = 0;
  let totalAmount = 0;

  const rows = sorted.map(o => {
    const d = new Date(o.date);
    const dateStr = d.toLocaleDateString('en-IN');
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    totalQty += Number(o.quantity) || 0;
    totalAmount += Number(o.total) || 0;

    return [
      escapeCsv(o.id || ''),
      escapeCsv(fmtDate(o.date)),
      escapeCsv(dateStr),
      escapeCsv(timeStr),
      escapeCsv(o.name || ''),
      escapeCsv(o.phone || '—'),
      escapeCsv(o.product || ''),
      escapeCsv(Number(o.quantity).toFixed(2)),
      escapeCsv(o.unit || ''),
      escapeCsv(Number(o.rate).toFixed(2)),
      escapeCsv(Number(o.total).toFixed(2)),
      escapeCsv(o.customRate ? 'Yes' : 'No'),
      escapeCsv(o.tracked !== false ? 'Yes' : 'No')
    ].join(',');
  });

  const summaryRow = [
    escapeCsv('TOTAL'),
    escapeCsv(`${sorted.length} orders`),
    '""',
    '""',
    '""',
    '""',
    '""',
    escapeCsv(totalQty.toFixed(2)),
    '""',
    '""',
    escapeCsv(totalAmount.toFixed(2)),
    '""',
    '""'
  ].join(',');

  const csvContent = [headers.join(','), ...rows, '', summaryRow].join('\r\n');
  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${activePeriod}_${dateTag}.csv`;
  triggerDownload(csvContent, filename);
}

function downloadCustomersCsv() {
  const customers = buildCustomerMap(allOrders);
  if (!customers.length) {
    alert('No customer records available to download.');
    return;
  }

  const headers = [
    'Customer Name',
    'Phone Number',
    'Total Orders',
    'Total Spent (INR)',
    'Favourite Product',
    'Last Order Date'
  ];

  let grandSpent = 0;
  let grandOrders = 0;

  const rows = customers.map(c => {
    grandSpent += c.spent;
    grandOrders += c.visits;
    return [
      escapeCsv(c.name),
      escapeCsv(c.phone || '—'),
      escapeCsv(c.visits),
      escapeCsv(c.spent.toFixed(2)),
      escapeCsv(c.favProduct || '—'),
      escapeCsv(fmtDate(c.lastVisit))
    ].join(',');
  });

  const summaryRow = [
    escapeCsv('TOTAL CUSTOMERS: ' + customers.length),
    '""',
    escapeCsv(grandOrders),
    escapeCsv(grandSpent.toFixed(2)),
    '""',
    '""'
  ].join(',');

  const csvContent = [headers.join(','), ...rows, '', summaryRow].join('\r\n');
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerDownload(csvContent, `sakthi_mill_customers_${dateTag}.csv`);
}

function printPeriodReport() {
  const filtered = filterByPeriod(allOrders, activePeriod);
  if (!filtered.length) {
    alert('No records available for the selected period.');
    return;
  }
  const periodTitles = { today: 'Today', month: 'This Month', year: 'This Year', all: 'All Time' };
  const periodLabel = periodTitles[activePeriod] || activePeriod;
  const earnings = filtered.reduce((s,o) => s + o.total, 0);
  const qty = filtered.reduce((s,o) => s + o.quantity, 0);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const rowsHtml = sortOrders(filtered, 'recent').map((o, idx) => `
    <tr>
      <td style="color:#666">${idx + 1}</td>
      <td>${fmtDate(o.date)}</td>
      <td><strong>${o.name}</strong>${o.phone ? '<br><small style="color:#666">' + o.phone + '</small>' : ''}</td>
      <td>${o.product}</td>
      <td style="text-align:right">${Number(o.quantity).toFixed(2)} ${o.unit}</td>
      <td style="text-align:right">₹${Number(o.rate).toFixed(2)}</td>
      <td style="text-align:right"><strong>₹${Number(o.total).toFixed(2)}</strong></td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ta">
    <head>
      <meta charset="UTF-8">
      <title>Sales Statement - ${periodLabel}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #12201A; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #16704A; padding-bottom: 12px; margin-bottom: 20px; }
        .brand { font-size: 20px; font-weight: 800; color: #16704A; }
        .meta { text-align: right; font-size: 13px; color: #555; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; background: #F4F8F6; padding: 12px 16px; border-radius: 6px; }
        .stat-item { flex: 1; }
        .stat-lbl { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; }
        .stat-val { font-size: 18px; font-weight: 700; color: #16704A; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; padding: 8px; border-bottom: 2px solid #ddd; background: #fafafa; font-size: 12px; font-weight: 600; }
        td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
        .total-row td { font-size: 14px; font-weight: bold; border-top: 2px solid #16704A; background: #F4F8F6; }
        @media print {
          @page { margin: 12mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">சக்தி எண்ணெய் மற்றும் மாவு ஆலை</div>
          <div style="font-size:13px;color:#666">Sakthi Oil &amp; Flour Mill &middot; Sales Statement</div>
        </div>
        <div class="meta">
          <div><strong>Period:</strong> ${periodLabel}</div>
          <div><strong>Printed:</strong> ${new Date().toLocaleString('en-IN')}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat-item">
          <div class="stat-lbl">Total Earnings</div>
          <div class="stat-val">₹${earnings.toFixed(2)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-lbl">Total Orders</div>
          <div class="stat-val">${filtered.length}</div>
        </div>
        <div class="stat-item">
          <div class="stat-lbl">Total Quantity</div>
          <div class="stat-val">${qty.toFixed(2)} units</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Date &amp; Time</th>
            <th>Customer</th>
            <th>Product</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td colspan="4">TOTAL (${filtered.length} orders)</td>
            <td style="text-align:right">${qty.toFixed(2)}</td>
            <td></td>
            <td style="text-align:right">₹${earnings.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// ── Wire up controls ──────────────────────────────────────────
document.querySelectorAll('.filter-btn[data-period]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-period]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePeriod = btn.dataset.period;
    renderDashboard();
  });
});

document.getElementById('sortSelect').addEventListener('change', e => {
  activeSort = e.target.value;
  renderDashboard();
});

document.getElementById('modalClose').addEventListener('click', closeCustomerModal);
document.getElementById('customerModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCustomerModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCustomerModal();
});

const clearBtn = document.getElementById('clearDataBtn');
if (clearBtn) clearBtn.addEventListener('click', clearAllData);

const refreshBtn = document.getElementById('refreshDashboardBtn');
if (refreshBtn) refreshBtn.addEventListener('click', renderDashboard);

const downloadRecordsBtn = document.getElementById('downloadRecordsBtn');
if (downloadRecordsBtn) {
  downloadRecordsBtn.addEventListener('click', () => downloadOrdersCsv());
}

const exportOrdersCsvBtn = document.getElementById('exportOrdersCsvBtn');
if (exportOrdersCsvBtn) {
  exportOrdersCsvBtn.addEventListener('click', () => downloadOrdersCsv());
}

const printReportBtn = document.getElementById('printReportBtn');
if (printReportBtn) {
  printReportBtn.addEventListener('click', printPeriodReport);
}

const exportCustomersCsvBtn = document.getElementById('exportCustomersCsvBtn');
if (exportCustomersCsvBtn) {
  exportCustomersCsvBtn.addEventListener('click', downloadCustomersCsv);
}

const modalExportBtn = document.getElementById('modalExportCustomerOrdersBtn');
if (modalExportBtn) {
  modalExportBtn.addEventListener('click', () => {
    if (!openCustomer) return;
    const cmap = buildCustomerMap(allOrders);
    const c = cmap.find(x => x.name.toLowerCase() === openCustomer.toLowerCase());
    if (c && c.orders && c.orders.length) {
      const cleanName = c.name.replace(/[^a-zA-Z0-9\u0B80-\u0BFF]/g, '_');
      downloadOrdersCsv(c.orders, `sakthi_mill_customer_${cleanName}`);
    } else {
      alert('No orders found for this customer.');
    }
  });
}

const customerSearchInput = document.getElementById('customerSearchInput');
if (customerSearchInput) {
  customerSearchInput.addEventListener('input', e => {
    customerSearchTerm = e.target.value;
    renderCustomerList(); // filters in memory, no refetch needed
  });
}

// ── Init ──────────────────────────────────────────────────────
(async function () {
  const user = await requireAuth();
  if (!user) return;

  await renderDashboard();

  // Auto-refresh every 60 seconds to pick up new orders from the billing tab
  setInterval(renderDashboard, 60000);
})();
