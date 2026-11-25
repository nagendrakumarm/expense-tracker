export function getCurrentYearMonth(now = new Date()) {
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return `${yr}-${mo}`;
}

export function getRecentYearMonths(anchorYearMonth, count = 3) {
  const [yr, mo] = String(anchorYearMonth || getCurrentYearMonth()).split('-').map(Number);
  const list = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(yr, mo - 1 - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return list;
}

export function buildCategoryMonthComparison(rows, months) {
  const allCategories = new Set();
  const totalsByMonth = {};

  for (const ym of months) {
    totalsByMonth[ym] = {};
  }

  for (const row of rows || []) {
    const ym = String(row.date || '').slice(0, 7);
    if (!totalsByMonth[ym]) continue;

    const isIncome = String(row.categoryType || '').toLowerCase().includes('income');
    if (isIncome) continue;

    const subtype = String(row.subtype || 'Uncategorized').trim();
    const amt = Math.abs(Number(row.amount) || 0);
    allCategories.add(subtype);
    totalsByMonth[ym][subtype] = (totalsByMonth[ym][subtype] || 0) + amt;
  }

  const categories = Array.from(allCategories).sort((a, b) => a.localeCompare(b));
  for (const ym of months) {
    for (const cat of categories) {
      totalsByMonth[ym][cat] = Number((totalsByMonth[ym][cat] || 0).toFixed(2));
    }
  }

  return { months, categories, totals_by_month: totalsByMonth };
}

export function formatMonthShort(ym) {
  const [yr, mo] = String(ym).split('-').map(Number);
  return new Date(yr, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function renderComparisonMatrix({
  months = [],
  categories = [],
  totals_by_month = {},
  incomeCategoryNames = [],
  existingChart = null,
  formatCurrency,
  escapeHtml
}) {
  const incomeSet = new Set(
    (incomeCategoryNames || []).map((name) => String(name || '').trim().toLowerCase())
  );

  const filteredCategories = (categories || []).filter(
    (cat) => !incomeSet.has(String(cat || '').trim().toLowerCase())
  );

  const palette = ['#6750A4', '#0F766E', '#E11D48', '#D97706', '#0284C7', '#4F46E5'];
  const datasets = months.map((ym, idx) => ({
    label: formatMonthShort(ym),
    data: filteredCategories.map((cat) => Number(totals_by_month?.[ym]?.[cat] || 0)),
    backgroundColor: palette[idx % palette.length],
    borderRadius: 6
  }));

  let chartInstance = existingChart;
  const ctx = document.getElementById('categoryCompareChart')?.getContext('2d');
  if (ctx) {
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: filteredCategories.length ? filteredCategories : ['No Expenses'],
        datasets: filteredCategories.length
          ? datasets
          : [{ label: 'Expenses', data: months.map(() => 0), backgroundColor: '#CBD5E1' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `$${v}` }
          }
        }
      }
    });
  }

  const tableEl = document.getElementById('categoryCompareTable');
  if (tableEl) {
    if (filteredCategories.length === 0) {
      tableEl.innerHTML = `<p class="text-xs text-slate-400 italic py-3">No expense transactions in the selected months.</p>`;
    } else {
      const headerCells = months
        .map((ym) => `<th class="py-2 px-3 text-right">${escapeHtml(formatMonthShort(ym))}</th>`)
        .join('');
      const bodyRows = filteredCategories
        .map((cat) => {
          const cells = months
            .map((ym) => `<td class="py-2 px-3 text-right font-medium">${formatCurrency(totals_by_month?.[ym]?.[cat] || 0)}</td>`)
            .join('');
          return `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2 px-3 font-semibold">${escapeHtml(cat)}</td>${cells}</tr>`;
        })
        .join('');
      const totalCells = months
        .map((ym) => {
          const monthTotal = filteredCategories.reduce(
            (sum, cat) => sum + (Number(totals_by_month?.[ym]?.[cat]) || 0),
            0
          );
          return `<td class="py-2 px-3 text-right font-extrabold text-slate-900 dark:text-slate-100">${formatCurrency(monthTotal)}</td>`;
        })
        .join('');

      tableEl.innerHTML = `
        <table class="w-full text-xs">
          <thead>
            <tr class="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <th class="py-2 px-3 text-left">Category</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr class="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60">
              <td class="py-2.5 px-3 font-extrabold text-slate-900 dark:text-slate-100">Total</td>
              ${totalCells}
            </tr>
          </tfoot>
        </table>
      `;
    }
  }

  return chartInstance;
}