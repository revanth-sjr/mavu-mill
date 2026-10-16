/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Service Tasks & Reminders
   ------------------------------------------------------------
   - Monitors grain milling tasks
   - Live completion & overdue countdowns
   - Mark task as completed (Ready for Pickup)
   - One-click "Generate Bill & Deliver" when customer arrives
   ============================================================ */

let currentFilter = 'active'; // 'active' | 'pending' | 'completed' | 'billed' | 'all'
let allTasks = [];
let searchQuery = '';
let countdownInterval = null;
let pollInterval = null;
let activeModalOrder = null;

// ── Formatters ────────────────────────────────────────────────
function fmt(v) { return `\u20B9${Number(v || 0).toFixed(2)}`; }

function formatTimeOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatFullDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function getCountdownBadge(task) {
  if (task.status === 'completed') {
    return `<span class="task-badge-pill badge-completed">✓ Ready for pickup / தயார்</span>`;
  }
  if (task.status === 'billed') {
    return `<span class="task-badge-pill badge-billed">🧾 Billed &amp; Delivered</span>`;
  }
  if (task.status === 'cancelled') {
    return `<span class="task-badge-pill badge-cancelled">Cancelled</span>`;
  }

  // Pending status - calculate live countdown
  const now = new Date();
  const readyDate = new Date(task.readyBy);
  const diffMs = readyDate - now;
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    const overdueMins = Math.abs(diffMins);
    return `<span class="task-badge-pill badge-overdue">⚠️ Overdue by ${overdueMins}m (${formatTimeOnly(task.readyBy)})</span>`;
  } else if (diffMins === 0) {
    return `<span class="task-badge-pill badge-urgent">🔥 Due now (${formatTimeOnly(task.readyBy)})</span>`;
  } else if (diffMins <= 30) {
    return `<span class="task-badge-pill badge-warning">⏳ Due in ${diffMins}m (${formatTimeOnly(task.readyBy)})</span>`;
  } else {
    return `<span class="task-badge-pill badge-pending">⏱️ Ready by ${formatTimeOnly(task.readyBy)} (in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m)</span>`;
  }
}

// ── DOM References ────────────────────────────────────────────
const tasksListContainer = document.getElementById('tasksListContainer');
const taskSearchInput    = document.getElementById('taskSearchInput');
const btnRefreshTasks    = document.getElementById('btnRefreshTasks');
const taskLastRefreshed  = document.getElementById('taskLastRefreshed');

// ── Load Tasks and Counts ─────────────────────────────────────
async function loadTasks(silent = false) {
  try {
    if (!silent) {
      btnRefreshTasks?.classList.add('rotating');
    }

    // 1. Fetch counts
    const countsData = await apiFetch('/tasks/counts');
    updateCounts(countsData);

    // 2. Fetch list based on active filter
    let url = `/tasks?status=${currentFilter}`;
    if (searchQuery.trim()) {
      url += `&q=${encodeURIComponent(searchQuery.trim())}`;
    }

    const data = await apiFetch(url);
    allTasks = data.tasks || [];
    renderTasksList(allTasks);

    if (taskLastRefreshed) {
      taskLastRefreshed.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  } catch (err) {
    console.error('Error loading tasks:', err);
    if (!silent) {
      tasksListContainer.innerHTML = `
        <div class="task-empty-state card">
          <p style="color:var(--red);font-weight:600;">Failed to load tasks</p>
          <p style="color:var(--muted);font-size:0.85rem;">${err.message}</p>
          <button type="button" class="btn btn-secondary" onclick="loadTasks()" style="margin-top:0.8rem;">Retry</button>
        </div>
      `;
    }
  } finally {
    btnRefreshTasks?.classList.remove('rotating');
  }
}

function updateCounts(counts) {
  if (!counts) return;

  const statPending = document.getElementById('statPendingCount');
  const statCompleted = document.getElementById('statCompletedCount');
  const statOverdue = document.getElementById('statOverdueCount');
  const statBilled = document.getElementById('statBilledTodayCount');

  if (statPending) statPending.textContent = counts.pending;
  if (statCompleted) statCompleted.textContent = counts.completed;
  if (statOverdue) statOverdue.textContent = counts.overdue;
  if (statBilled) statBilled.textContent = counts.billedToday;

  const tabActive = document.getElementById('tabActiveCount');
  const tabPending = document.getElementById('tabPendingCount');
  const tabCompleted = document.getElementById('tabCompletedCount');

  if (tabActive) tabActive.textContent = counts.totalActive;
  if (tabPending) tabPending.textContent = counts.pending;
  if (tabCompleted) tabCompleted.textContent = counts.completed;

  // Sidebar badge
  const sidebarBadge = document.getElementById('navTaskBadge');
  if (sidebarBadge) {
    if (counts.totalActive > 0) {
      sidebarBadge.textContent = counts.totalActive;
      sidebarBadge.style.display = 'inline-block';
    } else {
      sidebarBadge.style.display = 'none';
    }
  }
}

// ── Render Tasks ──────────────────────────────────────────────
function renderTasksList(tasks) {
  if (!tasks || !tasks.length) {
    const emptyMsg = searchQuery
      ? `No tasks matching "${escapeHtml(searchQuery)}"`
      : currentFilter === 'pending'
      ? 'No active milling jobs in progress.'
      : currentFilter === 'completed'
      ? 'No completed tasks waiting for pickup.'
      : currentFilter === 'billed'
      ? 'No billed tasks yet.'
      : 'No service tasks found.';

    tasksListContainer.innerHTML = `
      <div class="task-empty-state card">
        <div class="empty-icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--faint)"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <p style="font-weight:600;font-size:1.05rem;color:var(--ink);margin-top:0.6rem;">${emptyMsg}</p>
        <p style="color:var(--muted);font-size:0.85rem;margin-top:0.2rem;">When customers drop off grains or oil seeds, create a task in Billing.</p>
        <a href="index.html" class="btn btn-primary" style="margin-top:1rem;text-decoration:none;">Go to Billing / பில்லிங்</a>
      </div>
    `;
    return;
  }

  tasksListContainer.innerHTML = tasks.map(task => {
    const isCompleted = task.status === 'completed';
    const isPending   = task.status === 'pending';
    const isBilled    = task.status === 'billed';

    return `
      <div class="task-card card ${task.isOverdue ? 'card-overdue' : ''} ${isCompleted ? 'card-completed' : ''}" id="task-card-${task.id}">
        <div class="task-card-header">
          <div class="task-token-tag">
            <span class="token-icon">🏷️</span>
            <strong>${escapeHtml(task.tokenNo)}</strong>
          </div>
          <div class="task-countdown-wrap">
            ${getCountdownBadge(task)}
          </div>
        </div>

        <div class="task-card-body">
          <div class="task-cust-row">
            <div class="task-cust-avatar">${escapeHtml((task.customerName || 'C')[0].toUpperCase())}</div>
            <div class="task-cust-info">
              <strong class="task-cust-name">${escapeHtml(task.customerName)}</strong>
              ${task.phone ? `<a href="tel:${task.phone}" class="task-cust-phone">📞 ${escapeHtml(task.phone)}</a>` : '<span class="task-cust-no-phone">No phone</span>'}
            </div>
          </div>

          <div class="task-product-box">
            <div class="task-product-title">
              <span>🌾 ${escapeHtml(task.productName)}</span>
              <strong class="task-product-total">${fmt(task.total)}</strong>
            </div>
            <div class="task-product-meta">
              <span>Quantity: <strong>${task.quantity} ${escapeHtml(task.unit)}</strong> @ ${fmt(task.rate)}/${task.unit}</span>
            </div>
            ${task.notes ? `<div class="task-notes-callout">📝 <em>${escapeHtml(task.notes)}</em></div>` : ''}
          </div>

          <div class="task-timing-grid">
            <div class="timing-item">
              <span class="timing-label">Intake time:</span>
              <span class="timing-val">${formatTimeOnly(task.createdAt)}</span>
            </div>
            <div class="timing-item">
              <span class="timing-label">Estimated Ready:</span>
              <span class="timing-val"><strong>${formatTimeOnly(task.readyBy)}</strong></span>
            </div>
            ${task.completedAt ? `
              <div class="timing-item">
                <span class="timing-label">Completed at:</span>
                <span class="timing-val" style="color:var(--sprout)">${formatTimeOnly(task.completedAt)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="task-card-footer">
          <div class="task-btn-group">
            ${isPending ? `
              <button type="button" class="btn btn-success btn-mark-complete" onclick="markTaskCompleted(${task.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
                Mark as Completed / முடிந்தது
              </button>
              <button type="button" class="btn btn-secondary btn-slip" onclick="openTokenSlip(${task.id})" title="Print Drop-off Bag Token Slip">
                🏷️ Token Slip
              </button>
              <button type="button" class="btn-task-cancel" onclick="cancelTask(${task.id})" title="Cancel Task">
                &times;
              </button>
            ` : ''}

            ${isCompleted ? `
              <button type="button" class="btn btn-primary btn-generate-bill-now" onclick="billTaskNow(${task.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Generate Bill &amp; Deliver / பில் போடு
              </button>
              <button type="button" class="btn btn-secondary" onclick="revertToPending(${task.id})" title="Put back to in-progress">
                ↩ Revert
              </button>
            ` : ''}

            ${isBilled ? `
              <button type="button" class="btn btn-secondary" onclick="viewBilledReceipt(${task.id})">
                🧾 View Receipt / பில் பார்க்க
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

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

// ── Action Handlers ───────────────────────────────────────────

// 1. Mark task completed (ready for customer pickup)
async function markTaskCompleted(id) {
  const btn = document.querySelector(`#task-card-${id} .btn-mark-complete`);
  if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

  try {
    const res = await apiFetch(`/tasks/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'completed' })
    });
    showToast(`✓ Task #${id} (${res.task?.tokenNo || ''}) is ready for pickup!`);
    await loadTasks(true);
  } catch (err) {
    showToast('Failed to update task: ' + err.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Mark as Completed / முடிந்தது'; }
  }
}

// 2. Customer arrived! Bill the task & print receipt
async function billTaskNow(id) {
  const btn = document.querySelector(`#task-card-${id} .btn-generate-bill-now`);
  if (btn) { btn.disabled = true; btn.textContent = 'Generating bill...'; }

  try {
    const res = await apiFetch(`/tasks/${id}/bill`, {
      method: 'POST'
    });

    showToast(`✓ Receipt generated for ${res.order?.name || 'Customer'}!`);
    activeModalOrder = res.order;
    displayBilledReceiptModal(res.order);
    await loadTasks(true);
  } catch (err) {
    showToast('Billing error: ' + err.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Bill & Deliver / பில் போடு'; }
  }
}

// 3. Revert completed task back to pending if needed
async function revertToPending(id) {
  if (!confirm('Revert this task back to "In Progress"?')) return;
  try {
    await apiFetch(`/tasks/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'pending' })
    });
    showToast('Task moved back to In Progress');
    await loadTasks(true);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// 4. Cancel task
async function cancelTask(id) {
  if (!confirm('Are you sure you want to cancel this service task?')) return;
  try {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    showToast('Task removed.');
    await loadTasks(true);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ── Modals & Slip Printing ────────────────────────────────────

// A. Bag Intake Token Slip
function openTokenSlip(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('slipTokenNo').textContent = task.tokenNo || `Bag #${task.id}`;
  document.getElementById('slipCustomer').textContent = task.customerName || '-';
  
  const phoneRow = document.getElementById('slipPhoneRow');
  if (task.phone) {
    phoneRow.style.display = '';
    document.getElementById('slipPhone').textContent = task.phone;
  } else {
    phoneRow.style.display = 'none';
  }

  document.getElementById('slipProduct').textContent = task.productName || '-';
  document.getElementById('slipQuantity').textContent = `${task.quantity} ${task.unit} (@ ${fmt(task.rate)})`;
  document.getElementById('slipTotal').textContent = fmt(task.total);
  document.getElementById('slipReadyBy').textContent = formatFullDateTime(task.readyBy);

  const notesRow = document.getElementById('slipNotesRow');
  if (task.notes) {
    notesRow.style.display = '';
    document.getElementById('slipNotes').textContent = task.notes;
  } else {
    notesRow.style.display = 'none';
  }

  const modal = document.getElementById('tokenSlipModal');
  if (modal) modal.style.display = 'flex';
}

function closeTokenSlipModal() {
  const modal = document.getElementById('tokenSlipModal');
  if (modal) modal.style.display = 'none';
}

// B. Billed Receipt Modal
function displayBilledReceiptModal(order) {
  if (!order) return;
  document.getElementById('taskBillDate').textContent = formatFullDateTime(order.date || new Date());
  document.getElementById('taskBillCustomer').textContent = order.name || '-';

  const phoneRow = document.getElementById('taskBillPhoneRow');
  if (order.phone) {
    phoneRow.style.display = '';
    document.getElementById('taskBillPhone').textContent = order.phone;
  } else {
    phoneRow.style.display = 'none';
  }

  document.getElementById('taskBillProduct').textContent = order.product || '-';
  document.getElementById('taskBillQuantity').textContent = `${order.quantity} ${order.unit}`;
  document.getElementById('taskBillRate').textContent = `${fmt(order.rate)} / ${order.unit}`;
  document.getElementById('taskBillTotal').textContent = fmt(order.total);

  const modal = document.getElementById('billedReceiptModal');
  if (modal) modal.style.display = 'flex';
}

function closeBilledReceiptModal() {
  const modal = document.getElementById('billedReceiptModal');
  if (modal) modal.style.display = 'none';
}

async function viewBilledReceipt(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task || !task.orderId) {
    showToast('Order details not found.', true);
    return;
  }
  try {
    const ordersRes = await apiFetch('/orders');
    const order = ordersRes.orders?.find(o => o.id === task.orderId);
    if (order) {
      activeModalOrder = order;
      displayBilledReceiptModal(order);
    } else {
      showToast('Could not load order record.', true);
    }
  } catch (err) {
    showToast('Failed to load order: ' + err.message, true);
  }
}

// ── Event Listeners ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tabs filtering
  document.querySelectorAll('.task-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      loadTasks();
    });
  });

  // Search input debounce
  let searchTimer = null;
  if (taskSearchInput) {
    taskSearchInput.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchQuery = e.target.value;
      searchTimer = setTimeout(() => {
        loadTasks();
      }, 300);
    });
  }

  // Refresh button
  if (btnRefreshTasks) {
    btnRefreshTasks.addEventListener('click', () => loadTasks());
  }

  // Modal close buttons
  document.getElementById('btnCloseTokenModal')?.addEventListener('click', closeTokenSlipModal);
  document.getElementById('btnCancelTokenModal')?.addEventListener('click', closeTokenSlipModal);
  document.getElementById('btnCloseBilledModal')?.addEventListener('click', closeBilledReceiptModal);
  document.getElementById('btnDismissBilledModal')?.addEventListener('click', closeBilledReceiptModal);

  // Print slip button
  document.getElementById('btnPrintTokenSlip')?.addEventListener('click', () => {
    window.print();
  });

  // Print billed receipt button
  document.getElementById('btnPrintBilledReceipt')?.addEventListener('click', () => {
    window.print();
  });

  // Initial load
  loadTasks();

  // Auto-refresh poll every 20 seconds
  pollInterval = setInterval(() => {
    loadTasks(true);
  }, 20000);

  // Live countdown timer update every 30 seconds
  countdownInterval = setInterval(() => {
    if (allTasks.length) {
      renderTasksList(allTasks);
    }
  }, 30000);
});
