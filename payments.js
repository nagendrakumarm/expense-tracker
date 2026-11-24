export const FALLBACK_ACCOUNTS = [
  { id: 1, name: 'Chase Checking', type: 1, duedate: 1, isactive: true },
  { id: 2, name: 'Costco Anywhere Visa', type: 2, duedate: 15, isactive: true },
  { id: 3, name: 'Potomac Edison / Utilities', type: 3, duedate: 22, isactive: true },
  { id: 4, name: 'Washington Gas', type: 3, duedate: 18, isactive: true },
  { id: 5, name: 'Xfinity', type: 3, duedate: 10, isactive: true }
];

export function normalizePaymentRow(row, accounts = []) {
  const accountMap = new Map(
    accounts.map((a) => [Number(a.id), a])
  );
  const accountId = Number(row.account_id ?? row.accountId ?? 0) || null;
  const acct = accountId !== null ? accountMap.get(accountId) : null;
  const accountName =
    row.account_name ||
    row.accountName ||
    acct?.name ||
    (accountId !== null ? `Account #${accountId}` : 'Unassigned Account');
  const dueDay = Math.min(
    28,
    Math.max(1, Number(row.duedate ?? row.due_day ?? row.dueDay ?? acct?.duedate ?? 15) || 15)
  );
  const cleanAmount = Math.abs(Number(row.amount) || 0);

  return {
    id: row.id,
    accountId,
    accountName,
    title: String(row.title || acct?.name || accountName).trim(),
    amount: cleanAmount,
    dueDay,
    yearMonth: String(row.month ?? row.year_month ?? row.yearMonth ?? '').trim(),
    paid: cleanAmount === 0 ? true : Boolean(row.is_paid ?? row.paid)
  };
}

export function buildMonthlyPaymentPayloads({ amount, months, selectedAccounts }) {
  const cleanAmount = Math.abs(Number(amount) || 0);
  const payloads = [];

  for (const month of months) {
    for (const acc of selectedAccounts) {
      payloads.push({
        account_id: Number(acc.id),
        amount: cleanAmount,
        month,
        is_paid: cleanAmount === 0
      });
    }
  }

  return payloads;
}

export function getDefaultPayments(anchorYearMonth, accounts = FALLBACK_ACCOUNTS) {
  const [yr, mo] = String(anchorYearMonth).split('-').map(Number);
  const nextDate = new Date(yr, mo, 1);
  const nextYm = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  const firstAcc = accounts[0] || { id: 1, name: 'Checking', duedate: 1 };
  const secondAcc = accounts[1] || firstAcc;
  const thirdAcc = accounts[2] || firstAcc;

  return [
    normalizePaymentRow(
      { id: 'pay-1', account_id: firstAcc.id, amount: 1650.00, month: anchorYearMonth, is_paid: true },
      accounts
    ),
    normalizePaymentRow(
      { id: 'pay-2', account_id: secondAcc.id, amount: 420.00, month: anchorYearMonth, is_paid: false },
      accounts
    ),
    normalizePaymentRow(
      { id: 'pay-3', account_id: thirdAcc.id, amount: 135.50, month: nextYm, is_paid: false },
      accounts
    )
  ];
}

export function renderPaymentsView({ payments, currentYearMonth, formatCurrency, escapeHtml }) {
  const listEl = document.getElementById('paymentsList');
  const paidTotalEl = document.getElementById('paymentsPaidTotal');
  const unpaidTotalEl = document.getElementById('paymentsUnpaidTotal');
  if (!listEl) return;

  const filterMode = document.getElementById('paymentStatusFilter')?.value || 'ALL';
  const monthOnly = document.getElementById('paymentMonthScope')?.value || 'ALL';

  const scoped = payments.filter((p) => {
    const matchesMonth = monthOnly === 'ALL' || p.yearMonth === currentYearMonth;
    const matchesStatus =
      filterMode === 'ALL' ||
      (filterMode === 'PAID' && p.paid) ||
      (filterMode === 'UNPAID' && !p.paid);
    return matchesMonth && matchesStatus;
  });

  const paidSum = scoped.filter((p) => p.paid).reduce((acc, p) => acc + p.amount, 0);
  const unpaidSum = scoped.filter((p) => !p.paid).reduce((acc, p) => acc + p.amount, 0);

  if (paidTotalEl) paidTotalEl.textContent = formatCurrency(paidSum);
  if (unpaidTotalEl) unpaidTotalEl.textContent = formatCurrency(unpaidSum);

  if (scoped.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 italic py-8 text-center">No rows in monthly_payments match this filter.</p>`;
    return;
  }

  listEl.innerHTML = scoped
    .map((p) => {
      const statusBadge = p.paid
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

      return `
        <div class="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold ${p.paid ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}">${escapeHtml(p.accountName)}</span>
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge}">${p.paid ? 'Paid' : 'Unpaid'}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span><i class="fa-regular fa-calendar mr-1"></i>${escapeHtml(p.yearMonth)} (Due Day ${escapeHtml(p.dueDay)})</span>
              <span>•</span>
              <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                <i class="fa-solid fa-building-columns mr-1"></i>Account #${escapeHtml(p.accountId)}
              </span>
            </div>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-3">
            <span class="text-sm font-extrabold text-slate-900 dark:text-slate-100">${formatCurrency(p.amount)}</span>
            <button
              type="button"
              onclick="app.togglePaymentPaid('${escapeHtml(p.id)}')"
              class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                p.paid
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
              }"
            >
              ${p.paid ? 'Mark Unpaid' : 'Mark Paid'}
            </button>
            <button
              type="button"
              onclick="app.deletePayment('${escapeHtml(p.id)}')"
              title="Delete payment"
              class="w-8 h-8 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center justify-center text-xs"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}