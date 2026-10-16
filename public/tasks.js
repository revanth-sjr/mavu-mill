/* ============================================================
   சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Service & Sales Tasks Queue
   ------------------------------------------------------------
   - Separates tasks into Service (அரைவை பணிகள்) & Sales (விற்பனை ஆர்டர்கள்)
   - Flash card tactile layouts with countdown timers
   - Mark task completed (Ready for Pickup / தயார்)
   - One-click "Generate Bill & Deliver" when customer arrives
   ============================================================ */

let currentFilter = 'active';   // 'active' | 'pending' | 'completed' | 'billed' | 'all'
let currentCategory = 'all';     // 'all' | 'service' | 'sales'
let allTasks = [];
let searchQuery = '';
let taskCountdownInterval = null;
let taskPollInterval = null;
let activeModalOrder = null;

// ── Formatters ────────────────────────────────────────────────
function fmt(v) {
  return `\u20B9${Number(v || 0).toFixed(2)}`;
}

function formatTimeOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatFullDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function getCountdownBadge(task) {
  if (task.status === 'completed') {
    return `<span class="task-badge-pill badge-completed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><polyline points="20 6 9 17 4 12"/></svg> Ready for pickup / தயார்</span>`;
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
    const hrs = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    return `<span class="task-badge-pill badge-overdue">⚠️ Overdue by ${timeStr} (${formatTimeOnly(task.readyBy)})</span>`;
  } else if (diffMins === 0) {
    return `<span class="task-badge-pill badge-urgent">🔥 Due now (${formatTimeOnly(task.readyBy)})</span>`;
  } else if (diffMins <= 30) {
    return `<span class="task-badge-pill badge-warning">⏳ Due in ${diffMins}m (${formatTimeOnly(task.readyBy)})</span>`;
  } else {
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    return `<span class="task-badge-pill badge-pending">⏱️ Ready by ${formatTimeOnly(task.readyBy)} (in ${durStr})</span>`;
  }
}

// ── DOM Element Getters (Safe & Dynamic) ────────────────────────
function getContainer() {
  return document.getElementById('tasksListContainer');
}

// ── Load Tasks and Counts ─────────────────────────────────────
async function loadTasks(silent = false) {
  const container = getContainer();
  const refreshBtn = document.getElementById('btnRefreshTasks');

  try {
    if (!silent && refreshBtn) {
      refreshBtn.classList.add('rotating');
    }

    // Build URL for tasks list
    let url = `/tasks?status=${currentFilter}`;
    if (currentCategory && currentCategory !== 'all') {
      url += `&category=${currentCategory}`;
    }
    if (searchQuery.trim()) {
      url += `&q=${encodeURIComponent(searchQuery.trim())}`;
    }

    // 1. Fetch task list first and render immediately
    const listData = await apiFetch(url);
    allTasks = listData.tasks || [];
    renderTasksList(allTasks);

    // 2. Fetch counts in parallel or non-blocking
    try {
      const countsData = await apiFetch('/tasks/counts');
      updateCounts(countsData);
    } catch (countErr) {
      console.warn('Could not update task counts:', countErr);
    }

    const taskLastRefreshed = document.getElementById('taskLastRefreshed');
    if (taskLastRefreshed) {
      taskLastRefreshed.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  } catch (err) {
    console.error('Error loading tasks:', err);
    if (!silent && container) {
      container.innerHTML = `
        <div class="task-empty-state card" style="text-align:center;padding:2.5rem 1.5rem;">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--clay-wash);color:var(--clay);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 style="color:var(--clay);font-size:1.15rem;margin-bottom:0.4rem;">Failed to load tasks / பணிகளை ஏற்ற முடியவில்லை</h3>
          <p style="color:var(--muted);font-size:0.88rem;max-width:440px;margin:0 auto 1.2rem;">${escapeHtml(err.message || 'Cannot connect to server. Ensure http://localhost:4000 is running.')}</p>
          <button type="button" class="btn btn-primary" onclick="loadTasks()" style="display:inline-flex;align-items:center;gap:0.4rem;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Try Again / மீண்டும் முயல்க
          </button>
        </div>
      `;
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('rotating');
    }
  }
}

function updateCounts(counts) {
  if (!counts) return;

  // Top metric stat cards
  const elService = document.getElementById('statServiceCount');
  const elSales = document.getElementById('statSalesCount');
  const elCompleted = document.getElementById('statCompletedCount');
  const elOverdue = document.getElementById('statOverdueCount');

  if (elService) elService.textContent = counts.serviceCount || 0;
  if (elSales) elSales.textContent = counts.salesCount || 0;
  if (elCompleted) elCompleted.textContent = counts.completed || 0;
  if (elOverdue) elOverdue.textContent = counts.overdue || 0;

  // Category switch bar pill counters
  const countAllCat = document.getElementById('countAllCat');
  const countServiceCat = document.getElementById('countServiceCat');
  const countSalesCat = document.getElementById('countSalesCat');

  if (countAllCat) countAllCat.textContent = counts.totalActive || 0;
  if (countServiceCat) countServiceCat.textContent = counts.serviceCount || 0;
  if (countSalesCat) countSalesCat.textContent = counts.salesCount || 0;

  // Status Filter tabs
  const tabActive = document.getElementById('tabActiveCount');
  const tabPending = document.getElementById('tabPendingCount');
  const tabCompleted = document.getElementById('tabCompletedCount');

  if (tabActive) tabActive.textContent = counts.totalActive || 0;
  if (tabPending) tabPending.textContent = counts.pending || 0;
  if (tabCompleted) tabCompleted.textContent = counts.completed || 0;

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

// ── Render Flash Card Sections ────────────────────────────────
function renderTasksList(tasks) {
  const container = getContainer();
  if (!container) return;

  if (!tasks || !tasks.length) {
    const emptyMsg = searchQuery
      ? `No tasks matching "${escapeHtml(searchQuery)}"`
      : currentCategory === 'service'
      ? 'No service tasks found in this view.'
      : currentCategory === 'sales'
      ? 'No sales orders found in this view.'
      : currentFilter === 'pending'
      ? 'No milling or sales tasks currently in progress.'
      : currentFilter === 'completed'
      ? 'No completed tasks waiting for pickup.'
      : currentFilter === 'billed'
      ? 'No billed tasks recorded yet.'
      : 'No active tasks found in the reminder queue.';

    container.innerHTML = `
      <div class="task-empty-state card">
        <div class="empty-icon-wrap">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--faint)"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <p style="font-weight:700;font-size:1.1rem;color:var(--ink);margin-top:0.75rem;">${emptyMsg}</p>
        <p style="color:var(--muted);font-size:0.86rem;margin-top:0.25rem;">When customers drop off grains or place counter hold orders, create a task in Billing.</p>
        <div style="margin-top:1.1rem;display:flex;gap:0.6rem;justify-content:center;">
          <a href="index.html" class="btn btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:0.4rem;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            + New Intake / பில்லிங்
          </a>
        </div>
      </div>
    `;
    return;
  }

  // Partition tasks by category
  const serviceTasks = tasks.filter(t => (t.category || 'service') === 'service');
  const salesTasks   = tasks.filter(t => t.category === 'sales');

  let html = '';

  // 1. Service Section (if "all" or "service")
  if (currentCategory === 'all' || currentCategory === 'service') {
    html += renderFlashCardSection({
      type: 'service',
      icon: '🌾',
      title: 'Service Tasks — Milling & Grinding',
      subtitleTa: 'அரைவை பணிகள்',
      description: 'Grain milling, flour grinding & oil pressing work orders with bag tokens and ready countdowns.',
      tasks: serviceTasks
    });
  }

  // 2. Sales Section (if "all" or "sales")
  if (currentCategory === 'all' || currentCategory === 'sales') {
    html += renderFlashCardSection({
      type: 'sales',
      icon: '📦',
      title: 'Sales Orders — Counter & Pre-Orders',
      subtitleTa: 'விற்பனை ஆர்டர்கள்',
      description: 'Packaged oils, flours, grains & counter hold takeaway orders waiting for collection.',
      tasks: salesTasks
    });
  }

  container.innerHTML = html;
}

// ── Render Individual Section ─────────────────────────────────
function renderFlashCardSection(section) {
  const { type, icon, title, subtitleTa, description, tasks } = section;
  const isService = type === 'service';
  const accentClass = isService ? 'flash-section-service' : 'flash-section-sales';

  let bodyHtml = '';
  if (!tasks.length) {
    bodyHtml = `
      <div class="flash-empty-card card">
        <span class="empty-icon">${isService ? '🌾' : '📦'}</span>
        <div>
          <p class="empty-title">No ${isService ? 'Service' : 'Sales'} tasks right now</p>
          <p class="empty-desc">${isService ? 'No grains or oil seeds currently being processed.' : 'No counter pre-orders or hold packages in queue.'}</p>
        </div>
      </div>
    `;
  } else {
    bodyHtml = `
      <div class="tasks-grid">
        ${tasks.map(t => renderFlashCard(t)).join('')}
      </div>
    `;
  }

  return `
    <section class="flash-section ${accentClass}">
      <div class="flash-section-header">
        <div class="flash-section-title-wrap">
          <div class="flash-section-icon">${icon}</div>
          <div>
            <div class="flash-section-heading">
              <h3>${title}</h3>
              <span class="flash-section-ta">/ ${subtitleTa}</span>
              <span class="flash-section-badge ${type}">${tasks.length}</span>
            </div>
            <p class="flash-section-desc">${description}</p>
          </div>
        </div>
      </div>
      ${bodyHtml}
    </section>
  `;
}

// ── Render Flash Card ─────────────────────────────────────────
function renderFlashCard(task) {
  const isCompleted = task.status === 'completed';
  const isPending   = task.status === 'pending';
  const isBilled    = task.status === 'billed';
  const isSales     = task.category === 'sales';

  const categoryLabel = isSales ? '📦 Sales / விற்பனை' : '🌾 Service / அரைவை';
  const categoryTagClass = isSales ? 'cat-tag-sales' : 'cat-tag-service';
  const avatarBg = isSales ? 'var(--sky)' : 'var(--mill)';

  return `
    <div class="task-card card flash-card ${task.isOverdue ? 'card-overdue' : ''} ${isCompleted ? 'card-completed' : ''} ${isSales ? 'card-sales' : 'card-service'}" id="task-card-${task.id}">
      
      <!-- CARD HEADER: Token & Status -->
      <div class="task-card-header">
        <div class="task-token-wrap">
          <span class="task-category-tag ${categoryTagClass}">${categoryLabel}</span>
          <span class="task-token-tag">
            <span class="token-icon">${isSales ? '🧾' : '🏷️'}</span>
            <strong>${escapeHtml(task.tokenNo)}</strong>
          </span>
        </div>
        <div class="task-countdown-wrap">
          ${getCountdownBadge(task)}
        </div>
      </div>

      <!-- CARD BODY: Customer & Product details -->
      <div class="task-card-body">
        <div class="task-cust-row">
          <div class="task-cust-avatar" style="background:${avatarBg}">
            ${escapeHtml((task.customerName || 'C')[0].toUpperCase())}
          </div>
          <div class="task-cust-info">
            <strong class="task-cust-name">${escapeHtml(task.customerName)}</strong>
            ${task.phone ? `<a href="tel:${escapeHtml(task.phone)}" class="task-cust-phone">📞 ${escapeHtml(task.phone)}</a>` : '<span class="task-cust-no-phone">No phone registered</span>'}
          </div>
        </div>

        <div class="task-product-box ${isSales ? 'product-box-sales' : 'product-box-service'}">
          <div class="task-product-title">
            <span class="product-name-txt">${isSales ? '📦' : '🌾'} ${escapeHtml(task.productName)}</span>
            <strong class="task-product-total">${fmt(task.total)}</strong>
          </div>
          <div class="task-product-meta">
            <span>Quantity: <strong>${Number(task.quantity).toFixed(2)} ${escapeHtml(task.unit)}</strong> @ ${fmt(task.rate)}/${task.unit}</span>
          </div>
          ${task.notes ? `<div class="task-notes-callout">📝 <strong>Note:</strong> ${escapeHtml(task.notes)}</div>` : ''}
        </div>

        <div class="task-timing-grid">
          <div class="timing-item">
            <span class="timing-label">Intake time:</span>
            <span class="timing-val">${formatTimeOnly(task.createdAt)}</span>
          </div>
          <div class="timing-item">
            <span class="timing-label">Ready Target:</span>
            <span class="timing-val highlight-ready"><strong>${formatTimeOnly(task.readyBy)}</strong></span>
          </div>
          ${task.completedAt ? `
            <div class="timing-item" style="grid-column: span 2;">
              <span class="timing-label">Finished ready:</span>
              <span class="timing-val" style="color:var(--sprout)">✓ Completed at ${formatTimeOnly(task.completedAt)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- CARD FOOTER: Action Buttons -->
      <div class="task-card-footer">
        <div class="task-btn-group">
          ${isPending ? `
            <button type="button" class="btn btn-success btn-mark-complete" onclick="markTaskCompleted(${task.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
              Mark as Completed / முடிந்தது
            </button>
            <button type="button" class="btn btn-secondary btn-slip" onclick="openTokenSlip(${task.id})" title="Print Drop-off Bag Token Slip">
              🏷️ Slip
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
            <button type="button" class="btn btn-secondary" onclick="revertToPending(${task.id})" title="Move back to in-progress">
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

// 1. Mark task completed (Ready for Pickup)
async function markTaskCompleted(id) {
  const btn = document.querySelector(`#task-card-${id} .btn-mark-complete`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="rotating" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      Updating...
    `;
  }

  try {
    const res = await apiFetch(`/tasks/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'completed' })
    });
    showToast(`✓ Task ${res.task?.tokenNo || '#' + id} is now ready for pickup / தயார்!`);
    await loadTasks(true);
  } catch (err) {
    showToast('Failed to update task: ' + err.message, true);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
        Mark as Completed / முடிந்தது
      `;
    }
  }
}

// 2. Customer arrived! Bill the task & record order
async function billTaskNow(id) {
  const btn = document.querySelector(`#task-card-${id} .btn-generate-bill-now`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="rotating" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      Billing...
    `;
  }

  try {
    const res = await apiFetch(`/tasks/${id}/bill`, {
      method: 'POST'
    });

    showToast(`✓ Bill generated for ${res.order?.name || 'Customer'}! Saved to sales.`);
    activeModalOrder = res.order;
    displayBilledReceiptModal(res.order);
    await loadTasks(true);
  } catch (err) {
    showToast('Billing error: ' + err.message, true);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Generate Bill &amp; Deliver / பில் போடு
      `;
    }
  }
}

// 3. Revert completed task back to pending if needed
async function revertToPending(id) {
  if (!confirm('Revert this task back to "In Progress" / மீண்டும் பணியில் வைக்க வேண்டுமா?')) return;
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
  if (!confirm('Are you sure you want to cancel this task? / இந்த பணியை ரத்து செய்ய வேண்டுமா?')) return;
  try {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    showToast('Task removed from queue.');
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

  const isSales = task.category === 'sales';
  const prefix = isSales ? 'Order #' : 'Bag #';

  document.getElementById('slipTokenNo').textContent = task.tokenNo || `${prefix}${task.id}`;
  document.getElementById('slipCustomer').textContent = task.customerName || '-';

  const phoneRow = document.getElementById('slipPhoneRow');
  if (task.phone) {
    phoneRow.style.display = '';
    document.getElementById('slipPhone').textContent = task.phone;
  } else {
    phoneRow.style.display = 'none';
  }

  document.getElementById('slipProduct').textContent = task.productName || '-';
  document.getElementById('slipQuantity').textContent = `${Number(task.quantity).toFixed(2)} ${task.unit} (@ ${fmt(task.rate)})`;
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
  document.getElementById('taskBillQuantity').textContent = `${Number(order.quantity).toFixed(2)} ${order.unit}`;
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

// ── Setup Listeners ───────────────────────────────────────────
function setupEventListeners() {
  // 1. Category Switcher Pills (All / Service / Sales)
  document.querySelectorAll('.category-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.dataset.category || 'all';
      loadTasks();
    });
  });

  // 2. Status Filter Tabs (Active / Pending / Completed / Billed / All)
  document.querySelectorAll('.task-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter || 'active';
      loadTasks();
    });
  });

  // 3. Search input debounce
  let searchTimer = null;
  const taskSearchInput = document.getElementById('taskSearchInput');
  if (taskSearchInput) {
    taskSearchInput.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchQuery = e.target.value;
      searchTimer = setTimeout(() => {
        loadTasks();
      }, 250);
    });
  }

  // 4. Refresh button
  const btnRefreshTasks = document.getElementById('btnRefreshTasks');
  if (btnRefreshTasks) {
    btnRefreshTasks.addEventListener('click', () => loadTasks());
  }

  // 5. Modal close buttons
  document.getElementById('btnCloseTokenModal')?.addEventListener('click', closeTokenSlipModal);
  document.getElementById('btnCancelTokenModal')?.addEventListener('click', closeTokenSlipModal);
  document.getElementById('btnCloseBilledModal')?.addEventListener('click', closeBilledReceiptModal);
  document.getElementById('btnDismissBilledModal')?.addEventListener('click', closeBilledReceiptModal);

  // 6. Print slip button
  document.getElementById('btnPrintTokenSlip')?.addEventListener('click', () => {
    window.print();
  });

  // 7. Print billed receipt button
  document.getElementById('btnPrintBilledReceipt')?.addEventListener('click', () => {
    window.print();
  });
}

// ── Timers ────────────────────────────────────────────────────
function startTimers() {
  if (taskPollInterval) clearInterval(taskPollInterval);
  if (taskCountdownInterval) clearInterval(taskCountdownInterval);

  // Auto-refresh poll every 20 seconds
  taskPollInterval = setInterval(() => {
    loadTasks(true);
  }, 20000);

  // Live countdown timer re-render every 30 seconds
  taskCountdownInterval = setInterval(() => {
    if (allTasks.length) {
      renderTasksList(allTasks);
    }
  }, 30000);
}

// ── App Boot ──────────────────────────────────────────────────
(async function initTasksPage() {
  // 1. Setup UI interaction listeners right away
  setupEventListeners();

  // 2. Authenticate & load tasks
  try {
    const token = getToken();
    if (!token) {
      window.location.href = 'login.html';
      return;
    }

    let user = null;
    try {
      user = await requireAuth();
    } catch (e) {
      console.warn('requireAuth warning:', e);
    }

    if (!user) {
      user = getCachedUser();
      if (user) {
        renderUserChip(user);
      }
    }

    // Always trigger tasks load
    await loadTasks();
    startTimers();
  } catch (err) {
    console.error('Initialization error:', err);
    const container = getContainer();
    if (container) {
      container.innerHTML = `
        <div class="task-empty-state card" style="text-align:center;padding:2.5rem 1.5rem;">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--clay-wash);color:var(--clay);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 style="color:var(--clay);font-size:1.15rem;margin-bottom:0.4rem;">Could not initialize page / பக்கத்தை ஏற்ற முடியவில்லை</h3>
          <p style="color:var(--muted);font-size:0.88rem;max-width:440px;margin:0 auto 1.2rem;">${escapeHtml(err.message || 'Cannot reach mill server at http://localhost:4000')}</p>
          <button type="button" class="btn btn-primary" onclick="window.location.reload()">Reload Page / பக்கத்தை புதுப்பிக்க</button>
        </div>
      `;
    }
  }
})();
