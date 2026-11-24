import {
  getCurrentYearMonth,
  getRecentYearMonths,
  buildCategoryMonthComparison,
  renderComparisonMatrix
} from './comparison.js';
import {
  FALLBACK_ACCOUNTS,
  normalizePaymentRow,
  getDefaultPayments,
  buildMonthlyPaymentPayloads,
  renderPaymentsView
} from './payments.js';

const initialMonth = getCurrentYearMonth();

function normalizeAccountList(accounts = []) {
  return accounts.map((a) => ({
    id: Number(a.id),
    name: String(a.name || a.account_name || 'Account').trim(),
    type: a.type !== undefined && a.type !== null ? Number(a.type) : null,
    duedate: Math.min(28, Math.max(1, Number(a.duedate ?? a.due_day ?? 15) || 15)),
    isactive: a.isactive !== undefined && a.isactive !== null ? Boolean(a.isactive) : true
  }));
}

const state = {
  currentTab: 'overview',
  currentYearMonth: initialMonth,
  rawCategoryTypes: [],
  rawCategories: [],
  rawTransactions: [],
  enrichedRows: [],
  filteredHistoryRows: [],
  accounts: normalizeAccountList(FALLBACK_ACCOUNTS),
  payments: getDefaultPayments(initialMonth, FALLBACK_ACCOUNTS),
  activeFormType: 'Expense',
  editingTxId: null,
  incomeChart: null,
  expenseChart: null,
  compareChart: null,
  isApiLive: false
};

const SAMPLE_TYPES = [
  { id: 1, type: 'Expense' },
  { id: 2, type: 'Income' }
];

const SAMPLE_CATEGORIES = [
  { id: 101, type: 2, subtype: 'Salary & Wage' },
  { id: 102, type: 2, subtype: 'Freelance & Consulting' },
  { id: 103, type: 2, subtype: 'Investment Income' },
  { id: 201, type: 1, subtype: 'Housing & Rent' },
  { id: 202, type: 1, subtype: 'Groceries' },
  { id: 203, type: 1, subtype: 'Dining & Coffee' },
  { id: 204, type: 1, subtype: 'Utilities & Internet' }
];

function getSampleTransactions(anchorYearMonth = getCurrentYearMonth()) {
  const [yr, mo] = String(anchorYearMonth).split('-').map(Number);
  const fmt = (day) => `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return [
    { id: 1, date: fmt(1), store: 'Tech Corp Direct', description: 'Bi-weekly Payroll', amount: 3850.00, category: 101 },
    { id: 2, date: fmt(3), store: 'Metro Realty', description: 'Monthly Apartment Rent', amount: 1650.00, category: 201 },
    { id: 3, date: fmt(5), store: 'Whole Foods Market', description: 'Weekly Produce & Pantry', amount: 184.50, category: 202 },
    { id: 4, date: fmt(12), store: 'Blue Bottle Coffee', description: 'Coffee', amount: 18.25, category: 203 }
  ];
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function processLocalData() {
  state.isApiLive = false;
  state.rawCategoryTypes = [...SAMPLE_TYPES];
  state.rawCategories = [...SAMPLE_CATEGORIES];
  state.rawTransactions = getSampleTransactions(state.currentYearMonth);

  const typeMap = new Map(state.rawCategoryTypes.map(t => [Number(t.id), t.type]));
  const catMap = new Map(state.rawCategories.map(c => [
    Number(c.id),
    { subtype: c.subtype, categoryType: typeMap.get(Number(c.type)) }
  ]));

  state.enrichedRows = state.rawTransactions.map(row => {
    const catInfo = catMap.get(Number(row.category)) || { subtype: 'Other', categoryType: 'Expense' };
    return {
      ...row,
      store: String(row.store || '').trim(),
      description: row.description ? String(row.description).trim() : '',
      amount: Math.abs(Number(row.amount) || 0),
      subtype: catInfo.subtype,
      categoryType: catInfo.categoryType
    };
  });

  if (!Array.isArray(state.payments) || state.payments.length === 0) {
    state.payments = getDefaultPayments(state.currentYearMonth, state.accounts);
  }

  updateStatusBadge(false, 'Local Preview Mode');
  renderAll();
}

function summarizeMonth(rows, yearMonth = getCurrentYearMonth()) {
  const monthRows = rows.filter(r => String(r.date || '').startsWith(yearMonth));

  const incomeByCategory = {};
  const expenseByCategory = {};
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const row of monthRows) {
    const amt = Math.abs(Number(row.amount) || 0);
    const subtype = String(row.subtype || 'Uncategorized').trim();
    const isIncome = String(row.categoryType || '').toLowerCase().includes('income');

    if (isIncome) {
      totalIncome += amt;
      incomeCount++;
      incomeByCategory[subtype] = (incomeByCategory[subtype] || 0) + amt;
    } else {
      totalExpenses += amt;
      expenseCount++;
      expenseByCategory[subtype] = (expenseByCategory[subtype] || 0) + amt;
    }
  }

  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? Math.max(0, ((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

  return {
    yearMonth,
    totalIncome,
    totalExpenses,
    netBalance,
    savingsRate,
    incomeCount,
    expenseCount,
    incomeByCategory,
    expenseByCategory,
    transactions: monthRows
  };
}

function renderAll() {
  const summary = summarizeMonth(state.enrichedRows, state.currentYearMonth);
  renderHeaderAndKPIs(summary);
  renderIncomeBreakdown(summary);
  renderExpenseBreakdown(summary);
  renderRecentTransactions(summary.transactions);
  renderHistoryTab();
  renderCategoriesTab();
  window.app.renderPayments();
  window.app.loadComparison();
}

function renderHeaderAndKPIs(summary) {
  const [yr, mo] = state.currentYearMonth.split('-');
  const dateObj = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1);
  const monthStr = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('currentMonthDisplay').textContent = monthStr;

  document.getElementById('kpiIncome').textContent = formatCurrency(summary.totalIncome);
  document.getElementById('kpiIncomeCount').textContent = summary.incomeCount;

  document.getElementById('kpiExpense').textContent = formatCurrency(summary.totalExpenses);
  document.getElementById('kpiExpenseCount').textContent = summary.expenseCount;

  const kpiNetEl = document.getElementById('kpiNet');
  kpiNetEl.textContent = formatCurrency(summary.netBalance);
  kpiNetEl.className = `text-2xl font-extrabold ${summary.netBalance >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400'}`;

  document.getElementById('kpiSavingsRate').textContent = `${summary.savingsRate.toFixed(1)}%`;
}

function renderIncomeBreakdown(summary) {
  const container = document.getElementById('incomeCategoryList');
  const badge = document.getElementById('incomeCatTotalBadge');
  badge.textContent = formatCurrency(summary.totalIncome);

  const entries = Object.entries(summary.incomeByCategory || {});

  if (entries.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic py-4">No income recorded for this month.</p>`;
    renderDonut('incomeDonutChart', ['No Data'], [1], ['#E2E8F0'], 'incomeChart');
    return;
  }

  const colors = ['#0F766E', '#14B8A6', '#2DD4BF', '#5EEAD4', '#99F6E4', '#CCFBF1'];
  const labels = [];
  const values = [];

  let html = '';
  entries.sort((a, b) => b[1] - a[1]).forEach(([subtype, amount], i) => {
    labels.push(subtype);
    values.push(amount);
    const percent = summary.totalIncome > 0 ? ((amount / summary.totalIncome) * 100).toFixed(1) : 0;
    const color = colors[i % colors.length];

    html += `
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 truncate pr-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
          <span class="font-medium truncate text-slate-700 dark:text-slate-200">${escapeHtml(subtype)}</span>
        </div>
        <div class="text-right flex-shrink-0 font-semibold">
          <span class="text-slate-900 dark:text-slate-100">${formatCurrency(amount)}</span>
          <span class="text-[10px] text-slate-400 ml-1">(${percent}%)</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  renderDonut('incomeDonutChart', labels, values, colors, 'incomeChart');
}

function renderExpenseBreakdown(summary) {
  const container = document.getElementById('expenseCategoryList');
  const badge = document.getElementById('expenseCatTotalBadge');
  badge.textContent = formatCurrency(summary.totalExpenses);

  const entries = Object.entries(summary.expenseByCategory || {});

  if (entries.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic py-4">No expenses recorded for this month.</p>`;
    renderDonut('expenseDonutChart', ['No Data'], [1], ['#E2E8F0'], 'expenseChart');
    return;
  }

  const colors = ['#E11D48', '#F43F5E', '#FB7185', '#FDA4AF', '#F472B6', '#C084FC', '#A855F7'];
  const labels = [];
  const values = [];

  let html = '';
  entries.sort((a, b) => b[1] - a[1]).forEach(([subtype, amount], i) => {
    labels.push(subtype);
    values.push(amount);
    const percent = summary.totalExpenses > 0 ? ((amount / summary.totalExpenses) * 100).toFixed(1) : 0;
    const color = colors[i % colors.length];

    html += `
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 truncate pr-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
          <span class="font-medium truncate text-slate-700 dark:text-slate-200">${escapeHtml(subtype)}</span>
        </div>
        <div class="text-right flex-shrink-0 font-semibold">
          <span class="text-slate-900 dark:text-slate-100">${formatCurrency(amount)}</span>
          <span class="text-[10px] text-slate-400 ml-1">(${percent}%)</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  renderDonut('expenseDonutChart', labels, values, colors, 'expenseChart');
}

function renderDonut(canvasId, labels, data, colors, chartStateKey) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (state[chartStateKey]) {
    state[chartStateKey].destroy();
  }

  state[chartStateKey] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.label}: $${Number(context.raw).toLocaleString()}`;
            }
          }
        }
      },
      cutout: '72%'
    }
  });
}

function renderRecentTransactions(monthTransactions) {
  const container = document.getElementById('recentTransactionsList');
  if (!monthTransactions || monthTransactions.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic py-6 text-center">No transactions found for this month.</p>`;
    return;
  }

  container.innerHTML = monthTransactions.slice(0, 5).map(r => renderTransactionRowHtml(r)).join('');
}

function renderHistoryTab() {
  const catSelect = document.getElementById('categoryFilter');
  const currentCatVal = catSelect.value;
  const categories = Array.from(new Set(state.enrichedRows.map(r => r.subtype))).sort();

  catSelect.innerHTML = `<option value="ALL">All Categories</option>` +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  catSelect.value = currentCatVal || 'ALL';

  filterHistory();
}

function filterHistory() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const typeF = document.getElementById('typeFilter').value;
  const catF = document.getElementById('categoryFilter').value;

  state.filteredHistoryRows = state.enrichedRows.filter(r => {
    const matchesQuery = !q ||
      r.store.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.subtype.toLowerCase().includes(q);

    const matchesType = typeF === 'ALL' || r.categoryType.toLowerCase() === typeF.toLowerCase();
    const matchesCat = catF === 'ALL' || r.subtype === catF;
    const matchesMonth = String(r.date || '').startsWith(state.currentYearMonth);

    return matchesQuery && matchesType && matchesCat && matchesMonth;
  });

  const container = document.getElementById('fullHistoryList');
  if (state.filteredHistoryRows.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic py-10 text-center">No transactions match your filters.</p>`;
    return;
  }

  container.innerHTML = state.filteredHistoryRows.map(r => renderTransactionRowHtml(r)).join('');
}

function renderTransactionRowHtml(r) {
  const isIncome = String(r.categoryType || '').toLowerCase().includes('income');
  const badgeClass = isIncome
    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
  const amountClass = isIncome
    ? 'text-teal-600 dark:text-teal-400 font-bold'
    : 'text-slate-900 dark:text-slate-100 font-bold';
  const icon = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';

  return `
    <div class="py-3 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition rounded-xl">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-2xl ${badgeClass} flex items-center justify-center text-xs flex-shrink-0">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(r.store)}</p>
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <span>${escapeHtml(r.date)}</span>
            <span>•</span>
            <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">${escapeHtml(r.subtype)}</span>
            ${r.description ? `<span>• ${escapeHtml(r.description)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="${amountClass} text-sm">${isIncome ? '+' : '-'}${formatCurrency(r.amount)}</span>
        <button type="button" onclick="app.editTransaction('${escapeHtml(r.id)}')" title="Edit transaction" class="w-7 h-7 rounded-lg text-slate-400 hover:text-m3-primary hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-xs">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" onclick="app.deleteTx('${escapeHtml(r.id)}')" title="Delete transaction" class="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center justify-center text-xs">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function renderCategoriesTab() {
  const typeMap = new Map(state.rawCategoryTypes.map(t => [Number(t.id), t.type]));
  const incomeList = document.getElementById('incomeCategoryManageList');
  const expenseList = document.getElementById('expenseCategoryManageList');

  const incomeCats = state.rawCategories.filter(c => String(typeMap.get(Number(c.type)) || '').toLowerCase().includes('income'));
  const expenseCats = state.rawCategories.filter(c => !String(typeMap.get(Number(c.type)) || '').toLowerCase().includes('income'));

  incomeList.innerHTML = incomeCats.map(c => `
    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs font-semibold">
      <span class="text-slate-800 dark:text-slate-200"><i class="fa-solid fa-tag text-teal-500 mr-2"></i>${escapeHtml(c.subtype)}</span>
      <span class="text-[10px] text-slate-400">ID: ${c.id}</span>
    </div>
  `).join('');

  expenseList.innerHTML = expenseCats.map(c => `
    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs font-semibold">
      <span class="text-slate-800 dark:text-slate-200"><i class="fa-solid fa-tag text-rose-500 mr-2"></i>${escapeHtml(c.subtype)}</span>
      <span class="text-[10px] text-slate-400">ID: ${c.id}</span>
    </div>
  `).join('');
}

function updateStatusBadge(isLive, text) {
  const pill = document.getElementById('statusPill');
  const label = document.getElementById('statusText');
  label.textContent = text;

  if (isLive) {
    pill.className = "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer";
  } else {
    pill.className = "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition cursor-pointer";
  }
}

window.app = {
  useLocalPreview() {
    processLocalData();
  },

  async loadComparison() {
    const count = Number(document.getElementById('compareMonthCount')?.value || 3);
    const months = getRecentYearMonths(state.currentYearMonth, count);

    let matrixData = null;
    if (state.isApiLive && typeof window.fetchCategoryComparison === 'function') {
      try {
        matrixData = await window.fetchCategoryComparison(state.currentYearMonth, count);
      } catch (err) {
        this.showToast(`Comparison sync error: ${err.message}`, true);
      }
    }

    if (!matrixData) {
      matrixData = buildCategoryMonthComparison(state.enrichedRows, months);
    }

    state.compareChart = renderComparisonMatrix({
      ...matrixData,
      existingChart: state.compareChart,
      formatCurrency,
      escapeHtml
    });
  },

  setPaymentsState({ accounts = null, payments = null }) {
    if (Array.isArray(accounts) && accounts.length > 0) {
      state.accounts = normalizeAccountList(accounts);
    }
    if (Array.isArray(payments)) {
      state.payments = payments.map((row) => normalizePaymentRow(row, state.accounts));
    }
    this.renderPayments();
  },

  renderPayments() {
    renderPaymentsView({
      payments: state.payments,
      currentYearMonth: state.currentYearMonth,
      formatCurrency,
      escapeHtml
    });
  },

  async togglePaymentPaid(id) {
    const item = state.payments.find((p) => String(p.id) === String(id));
    if (!item) return;
    const nextPaid = !item.paid;

    try {
      if (state.isApiLive && typeof window.toggleMonthlyPaymentPaidViaApi === 'function') {
        const updated = await window.toggleMonthlyPaymentPaidViaApi(id, nextPaid);
        const normalized = updated ? normalizePaymentRow(updated, state.accounts) : null;
        item.paid = normalized ? normalized.paid : nextPaid;
      } else {
        item.paid = nextPaid;
      }
      this.renderPayments();
      this.showToast(`Marked "${item.title}" as ${item.paid ? 'Paid' : 'Unpaid'}.`);
    } catch (err) {
      this.showToast(`Payment update error: ${err.message}`, true);
    }
  },

  async deletePayment(id) {
    try {
      if (state.isApiLive && typeof window.deleteMonthlyPaymentViaApi === 'function') {
        await window.deleteMonthlyPaymentViaApi(id);
      }
      state.payments = state.payments.filter((p) => String(p.id) !== String(id));
      this.renderPayments();
      this.showToast('Removed from monthly_payments.');
    } catch (err) {
      this.showToast(`Payment delete error: ${err.message}`, true);
    }
  },

  syncDueDayFromSelectedAccounts() {
    const dueInput = document.getElementById('payDueDay');
    if (!dueInput) return;
    const selectedIds = Array.from(document.querySelectorAll('input[name="payAccountId"]:checked')).map((el) => Number(el.value));
    const matched = state.accounts.filter((a) => selectedIds.includes(Number(a.id)));
    if (matched.length > 0) {
      dueInput.value = String(matched[0].duedate ?? 15);
    }
  },

  openPaymentModal() {
    document.getElementById('paymentForm')?.reset();

    const [yr, mo] = state.currentYearMonth.split('-').map(Number);
    const candidateMonths = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(yr, mo - 1 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    document.getElementById('payMonthCheckboxes').innerHTML = candidateMonths
      .map((ym) => `
        <label class="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input type="checkbox" name="payMonth" value="${escapeHtml(ym)}" ${ym === state.currentYearMonth ? 'checked' : ''} class="rounded text-m3-primary">
          <span>${escapeHtml(ym)}</span>
        </label>
      `)
      .join('');

    const activeAccounts = state.accounts.filter((a) => a.isactive !== false);
    const selectableAccounts = activeAccounts.length > 0 ? activeAccounts : state.accounts;

    document.getElementById('payAccountCheckboxes').innerHTML = selectableAccounts
      .map((acc, idx) => `
        <label class="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input type="checkbox" name="payAccountId" value="${escapeHtml(acc.id)}" onchange="app.syncDueDayFromSelectedAccounts()" ${idx === 0 ? 'checked' : ''} class="rounded text-m3-primary">
          <span>${escapeHtml(acc.name)} <span class="text-[10px] text-slate-400">(Day ${escapeHtml(acc.duedate ?? 15)})</span></span>
        </label>
      `)
      .join('');

    const dueInput = document.getElementById('payDueDay');
    if (dueInput) {
      dueInput.value = String(selectableAccounts[0]?.duedate ?? 15);
    }

    document.getElementById('paymentModal')?.classList.remove('hidden');
  },

  closePaymentModal() {
    document.getElementById('paymentModal')?.classList.add('hidden');
  },

  async handlePaymentSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('payTitle').value;
    const amount = document.getElementById('payAmount').value;
    const dueDay = Number(document.getElementById('payDueDay')?.value || 15);

    const months = Array.from(document.querySelectorAll('input[name="payMonth"]:checked')).map((el) => el.value);
    const selectedIds = Array.from(document.querySelectorAll('input[name="payAccountId"]:checked')).map((el) => Number(el.value));
    const selectedAccounts = state.accounts.filter((a) => selectedIds.includes(Number(a.id)));

    if (months.length === 0 || selectedAccounts.length === 0) {
      this.showToast('Select at least one month and one account.', true);
      return;
    }

    const payloads = buildMonthlyPaymentPayloads({ title, amount, dueDay, months, selectedAccounts });

    try {
      if (state.isApiLive && typeof window.createMonthlyPaymentsViaApi === 'function') {
        const savedRows = await window.createMonthlyPaymentsViaApi(payloads);
        const normalized = (Array.isArray(savedRows) ? savedRows : payloads).map((r) =>
          normalizePaymentRow({ ...r, title: title || r.title, duedate: dueDay }, state.accounts)
        );
        state.payments.unshift(...normalized);
      } else {
        const localRows = payloads.map((p, idx) =>
          normalizePaymentRow(
            { ...p, id: `pay-${Date.now()}-${idx}`, title, duedate: dueDay },
            state.accounts
          )
        );
        state.payments.unshift(...localRows);
      }

      this.renderPayments();
      this.closePaymentModal();
      this.showToast(`Saved ${payloads.length} row(s) to monthly_payments.`);
    } catch (err) {
      this.showToast(`Payment save error: ${err.message}`, true);
    }
  },

  applyBackendDashboard({ categories = [], summary = {}, month = null, accounts = null, payments = null }) {
    state.isApiLive = true;
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month).trim())) {
      state.currentYearMonth = String(month).trim();
    } else if (!state.currentYearMonth) {
      state.currentYearMonth = getCurrentYearMonth();
    }

    if (Array.isArray(accounts) && accounts.length > 0) {
      state.accounts = normalizeAccountList(accounts);
    }

    if (Array.isArray(payments)) {
      state.payments = payments.map((row) => normalizePaymentRow(row, state.accounts));
    }

    const categoryList = Array.isArray(categories)
      ? categories
      : Array.isArray(categories?.categories)
        ? categories.categories
        : [];

    state.rawCategories = categoryList.map((c) => ({
      id: Number(c.id),
      type: Number(c.typeId ?? c.type ?? 1),
      subtype: String(c.subtype || 'Uncategorized').trim(),
      categoryType: String(c.categoryType || 'Expense').trim()
    }));

    const derivedTypes = Array.from(
      new Map(
        state.rawCategories.map((c) => [
          c.type,
          { id: c.type, type: c.categoryType }
        ])
      ).values()
    );
    if (derivedTypes.length > 0) {
      state.rawCategoryTypes = derivedTypes;
    }

    const txRows = Array.isArray(summary.transactions) ? summary.transactions : [];
    state.enrichedRows = txRows.map((row) => ({
      id: row.id,
      date: String(row.date || '').trim(),
      store: String(row.store || '').trim(),
      description: row.description ? String(row.description).trim() : '',
      amount: Math.abs(Number(row.amount) || 0),
      category: Number(row.category),
      subtype: String(row.subtype || 'Uncategorized').trim(),
      categoryType: String(row.categoryType || 'Expense').trim()
    }));

    const totalIncome = Number(summary.totalIncome) || 0;
    const totalExpenses = Number(summary.totalExpenses) || 0;
    const netBalance = summary.netBalance !== undefined ? Number(summary.netBalance) : totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? Math.max(0, ((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

    const monthSummary = {
      yearMonth: summary.month || state.currentYearMonth,
      totalIncome,
      totalExpenses,
      netBalance,
      savingsRate,
      incomeCount: state.enrichedRows.filter((r) => String(r.categoryType || '').toLowerCase().includes('income')).length,
      expenseCount: state.enrichedRows.filter((r) => !String(r.categoryType || '').toLowerCase().includes('income')).length,
      incomeByCategory: summary.incomeByCategory || {},
      expenseByCategory: summary.expenseByCategory || {},
      transactions: state.enrichedRows
    };

    renderHeaderAndKPIs(monthSummary);
    renderIncomeBreakdown(monthSummary);
    renderExpenseBreakdown(monthSummary);
    renderRecentTransactions(monthSummary.transactions);
    renderHistoryTab();
    renderCategoriesTab();
    this.renderPayments();
    updateStatusBadge(true, `API Live (${state.enrichedRows.length} rows)`);
    this.loadComparison();
  },

  changeMonth(delta) {
    const [yr, mo] = state.currentYearMonth.split('-');
    const d = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1 + delta, 1);
    const newYr = d.getFullYear();
    const newMo = String(d.getMonth() + 1).padStart(2, '0');
    state.currentYearMonth = `${newYr}-${newMo}`;

    if (localStorage.getItem('expense_auth_token') && typeof window.refreshDashboardData === 'function') {
      window.refreshDashboardData(state.currentYearMonth).catch((err) => {
        app.showToast(`Sync error: ${err.message}`, true);
      });
    } else {
      renderAll();
    }
  },

  switchTab(tabId) {
    state.currentTab = tabId;
    ['overview', 'history', 'categories', 'payments'].forEach(t => {
      const viewEl = document.getElementById(`view-${t}`);
      const tabBtn = document.getElementById(`tab-${t}`);
      const navBtn = document.getElementById(`nav-${t}`);

      if (t === tabId) {
        viewEl?.classList.remove('hidden');
        if (tabBtn) tabBtn.className = "tab-btn px-4 py-2 rounded-full font-semibold text-sm transition flex items-center gap-2 bg-m3-primary text-white shadow-sm";
        if (navBtn) navBtn.className = "flex flex-col items-center gap-1 text-m3-primary font-bold";
      } else {
        viewEl?.classList.add('hidden');
        if (tabBtn) tabBtn.className = "tab-btn px-4 py-2 rounded-full font-semibold text-sm transition flex items-center gap-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200";
        if (navBtn) navBtn.className = "flex flex-col items-center gap-1 text-slate-500 dark:text-slate-400";
      }
    });
  },

  openTransactionModal(editingRow = null) {
    const modal = document.getElementById('transactionModal');
    const title = document.getElementById('txModalTitle');
    const form = document.getElementById('txForm');
    form.reset();

    if (editingRow) {
      state.editingTxId = editingRow.id;
      title.textContent = 'Edit Transaction';
      document.getElementById('txId').value = String(editingRow.id ?? '');
      document.getElementById('txDate').value = String(editingRow.date || '').slice(0, 10);
      document.getElementById('txStore').value = editingRow.store || '';
      document.getElementById('txDescription').value = editingRow.description || '';
      document.getElementById('txAmount').value = Math.abs(Number(editingRow.amount) || 0);
      this.setFormType(editingRow.categoryType || 'Expense');
      document.getElementById('txCategory').value = String(editingRow.category ?? '');
    } else {
      state.editingTxId = null;
      title.textContent = 'Add Transaction';
      document.getElementById('txId').value = '';
      document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
      this.setFormType('Expense');
    }

    modal.classList.remove('hidden');
  },

  editTransaction(id) {
    const row = state.enrichedRows.find((r) => String(r.id) === String(id));
    if (row) this.openTransactionModal(row);
  },

  async deleteTx(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      if (state.isApiLive && typeof window.deleteTransactionViaApi === 'function') {
        await window.deleteTransactionViaApi(id);
        this.showToast('Transaction deleted from Supabase.');
      } else {
        state.rawTransactions = state.rawTransactions.filter((t) => String(t.id) !== String(id));
        processLocalData();
        this.showToast('Transaction deleted in Local Preview Mode.');
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`, true);
    }
  },

  async handleTxSubmit(e) {
    e.preventDefault();
    const rawTxId = state.editingTxId ?? document.getElementById('txId')?.value;
    const hasEditingId = rawTxId !== null && rawTxId !== undefined && String(rawTxId).trim() !== '';
    const txId = hasEditingId ? rawTxId : null;

    const date = document.getElementById('txDate').value;
    const store = String(document.getElementById('txStore').value || '').trim();
    const rawDesc = document.getElementById('txDescription').value;
    const description = rawDesc && rawDesc.trim() ? rawDesc.trim() : null;
    const amount = Math.abs(Number(document.getElementById('txAmount').value));
    const categoryId = Number(document.getElementById('txCategory').value);

    try {
      if (state.isApiLive) {
        if (hasEditingId) {
          if (typeof window.updateTransactionViaApi !== 'function') {
            throw new Error('updateTransactionViaApi is not loaded');
          }
          await window.updateTransactionViaApi(txId, {
            date,
            store,
            description,
            amount,
            categoryId
          });
          this.showToast('Transaction updated via API!');
        } else {
          if (typeof window.createTransactionViaApi !== 'function') {
            throw new Error('createTransactionViaApi is not loaded');
          }
          await window.createTransactionViaApi({
            date,
            store,
            description,
            amount,
            categoryId
          });
          this.showToast('Transaction saved via API!');
        }
      } else if (hasEditingId) {
        const idx = state.rawTransactions.findIndex((t) => String(t.id) === String(txId));
        if (idx !== -1) {
          state.rawTransactions[idx] = {
            ...state.rawTransactions[idx],
            date,
            store,
            description,
            amount,
            category: categoryId
          };
        }
        processLocalData();
        this.showToast('Transaction updated in Local Preview Mode.');
      } else {
        state.rawTransactions.unshift({
          id: Date.now(),
          date,
          store,
          description,
          amount,
          category: categoryId
        });
        processLocalData();
        this.showToast('Transaction added in Local Preview Mode.');
      }

      state.editingTxId = null;
      document.getElementById('txId').value = '';
      this.closeTransactionModal();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, true);
    }
  },

  closeTransactionModal() {
    document.getElementById('transactionModal').classList.add('hidden');
  },

  setFormType(type) {
    state.activeFormType = type;
    const expBtn = document.getElementById('txTypeExpenseBtn');
    const incBtn = document.getElementById('txTypeIncomeBtn');
    const catSelect = document.getElementById('txCategory');

    if (type === 'Expense') {
      expBtn.className = "py-2.5 rounded-xl font-bold text-sm border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300";
      incBtn.className = "py-2.5 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
    } else {
      incBtn.className = "py-2.5 rounded-xl font-bold text-sm border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300";
      expBtn.className = "py-2.5 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
    }

    const isIncomeTab = type.toLowerCase() === 'income';
    const validCats = state.rawCategories.filter(c => {
      const catTypeLabel = String(c.categoryType || state.rawCategoryTypes.find(t => Number(t.id) === Number(c.type))?.type || 'Expense').toLowerCase();
      return isIncomeTab ? catTypeLabel.includes('income') : !catTypeLabel.includes('income');
    });

    catSelect.innerHTML = validCats.map(c => `
      <option value="${c.id}">${escapeHtml(c.subtype)}</option>
    `).join('');
  },

  openCategoryModal() {
    document.getElementById('categoryModal').classList.remove('hidden');
  },

  closeCategoryModal() {
    document.getElementById('categoryModal').classList.add('hidden');
  },

  async handleCatSubmit(e) {
    e.preventDefault();
    const typeName = document.getElementById('catTypeSelect').value;
    const subtype = String(document.getElementById('catSubtypeInput').value || '').trim();
    const typeObj = state.rawCategoryTypes.find(t => String(t.type || '').toLowerCase() === typeName.toLowerCase()) || state.rawCategoryTypes[0];
    const typeId = typeObj ? Number(typeObj.id) : 1;

    state.rawCategories.push({ id: Date.now(), type: typeId, subtype, categoryType: typeName });
    renderCategoriesTab();
    this.closeCategoryModal();
    this.showToast(`Category '${subtype}' added.`);
  },

  openConfigModal() {
    document.getElementById('configModal').classList.remove('hidden');
  },

  closeConfigModal() {
    document.getElementById('configModal').classList.add('hidden');
  },

  filterHistory() {
    filterHistory();
  },

  showToast(msg, isError = false) {
    const toast = document.getElementById('toastContainer');
    const content = document.getElementById('toastContent');
    document.getElementById('toastMessage').textContent = msg;

    if (isError) {
      content.className = "bg-rose-900 text-rose-100 px-4 py-3 rounded-2xl shadow-xl text-sm flex items-center justify-between pointer-events-auto border border-rose-700";
    } else {
      content.className = "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-3 rounded-2xl shadow-xl text-sm flex items-center justify-between pointer-events-auto";
    }

    toast.classList.remove('opacity-0', 'translate-y-[-10px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      this.hideToast();
    }, 4000);
  },

  hideToast() {
    const toast = document.getElementById('toastContainer');
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-[-10px]');
  },

  toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  state.currentYearMonth = getCurrentYearMonth();  
  processLocalData();
});