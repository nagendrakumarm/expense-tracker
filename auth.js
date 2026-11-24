import { getCurrentYearMonth } from './comparison.js';

const API_BASE_URL = 'https://expense-api-6nkw.onrender.com';
const TOKEN_KEY = 'expense_auth_token';

const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const logoutBtn = document.getElementById('logoutBtn');

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function setLogoutButtonVisible(visible) {
  if (logoutBtn) {
    logoutBtn.style.display = visible ? 'inline-block' : 'none';
  }
}

function showLoginModal(message = '') {
  if (loginError) {
    loginError.textContent = message;
  }
  if (loginPassword) {
    loginPassword.value = '';
  }
  if (loginModal) {
    loginModal.style.display = 'flex';
  }
  setLogoutButtonVisible(Boolean(getToken()));
  setTimeout(() => loginUsername?.focus(), 0);
}

function hideLoginModal() {
  if (loginError) {
    loginError.textContent = '';
  }
  if (loginModal) {
    loginModal.style.display = 'none';
  }
  setLogoutButtonVisible(Boolean(getToken()));
}

export async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    setToken(null);
    showLoginModal('Session expired. Please sign in again.');
    throw new Error('Unauthorized (401)');
  }

  return response;
}

export async function refreshDashboardData(month = getCurrentYearMonth()) {
  const [catRes, sumRes, payRes] = await Promise.all([
    authFetch('/api/categories'),
    authFetch(`/api/summary?month=${encodeURIComponent(month)}`),
    authFetch(`/api/payments?month=${encodeURIComponent(month)}`).catch(() => null),
  ]);

  if (!catRes.ok) {
    throw new Error(`Failed to load categories (${catRes.status})`);
  }
  if (!sumRes.ok) {
    throw new Error(`Failed to load summary (${sumRes.status})`);
  }

  const catData = await catRes.json();
  const summary = await sumRes.json();

  const categories = Array.isArray(catData) ? catData 
    : Array.isArray(catData?.categories) ? catData.categories : [];

  let accounts = null;
  let payments = null;
  if (payRes && payRes.ok) {
    const payData = await payRes.json();
    accounts = payData.accounts ?? null;
    payments = payData.payments ?? (Array.isArray(payData) ? payData : null);
  }

  if (typeof window.app?.applyBackendDashboard === 'function') {
    window.app.applyBackendDashboard({ categories, summary, month, accounts, payments });
  }
}

export async function createTransactionViaApi({ date, store, description, amount, categoryId }) {
  const res = await authFetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      store,
      description: description || null,
      amount: Number(amount),
      category: Number(categoryId),
    }),
  });

  if (!res.ok) {
    let detail = `Create failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.detail) detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch (_) {}
    throw new Error(detail);
  }

  const created = await res.json();
  const month = String(date || '').slice(0, 7) || getCurrentYearMonth();
  await refreshDashboardData(month);
  return created;
}

export async function updateTransactionViaApi(id, { date, store, description, amount, categoryId }) {
  const res = await authFetch(`/api/transactions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      store,
      description: description || null,
      amount: Number(amount),
      category: Number(categoryId),
    }),
  });

  if (!res.ok) {
    let detail = `Update failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.detail) detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch (_) {}
    throw new Error(detail);
  }

  const updated = await res.json();
  const month = String(date || '').slice(0, 7) || getCurrentYearMonth();
  await refreshDashboardData(month);
  return updated;
}

export async function deleteTransactionViaApi(id) {
  const res = await authFetch(`/api/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    let detail = `Delete failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.detail) detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch (_) {}
    throw new Error(detail);
  }

  await refreshDashboardData();
}

export async function fetchCategoryComparison(anchorMonth = getCurrentYearMonth(), months = 3) {
  const res = await authFetch(
    `/api/comparison?month=${encodeURIComponent(anchorMonth)}&months=${encodeURIComponent(months)}`
  );
  if (!res.ok) {
    throw new Error(`Comparison request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchPaymentsAndAccounts(yearMonth = getCurrentYearMonth()) {
  const res = await authFetch(`/api/payments?month=${encodeURIComponent(yearMonth)}`);
  if (!res.ok) {
    throw new Error(`GET /api/payments failed (${res.status})`);
  }
  return res.json();
}

export async function createMonthlyPaymentsViaApi(payments) {
  const res = await authFetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payments }),
  });
  if (!res.ok) {
    throw new Error(`POST /api/payments failed (${res.status})`);
  }
  return res.json();
}

export async function toggleMonthlyPaymentPaidViaApi(id, isPaid) {
  const res = await authFetch(`/api/payments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_paid: Boolean(isPaid) }),
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/payments/${id} failed (${res.status})`);
  }
  return res.json();
}

export async function deleteMonthlyPaymentViaApi(id) {
  const res = await authFetch(`/api/payments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`DELETE /api/payments/${id} failed (${res.status})`);
  }
}

window.authFetch = authFetch;
window.refreshDashboardData = refreshDashboardData;
window.createTransactionViaApi = createTransactionViaApi;
window.updateTransactionViaApi = updateTransactionViaApi;
window.deleteTransactionViaApi = deleteTransactionViaApi;
window.fetchCategoryComparison = fetchCategoryComparison;
window.fetchPaymentsAndAccounts = fetchPaymentsAndAccounts;
window.createMonthlyPaymentsViaApi = createMonthlyPaymentsViaApi;
window.toggleMonthlyPaymentPaidViaApi = toggleMonthlyPaymentPaidViaApi;
window.deleteMonthlyPaymentViaApi = deleteMonthlyPaymentViaApi;

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (loginError) loginError.textContent = '';

  const username = loginUsername?.value.trim() || '';
  const password = loginPassword?.value || '';

  if (!username || !password) {
    if (loginError) loginError.textContent = 'Please enter both username and password.';
    return;
  }

  if (loginSubmitBtn) {
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Signing in...';
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      let detail = 'Invalid username or password.';
      try {
        const data = await response.json();
        if (data && typeof data.detail === 'string') {
          detail = data.detail;
        }
      } catch (_) {}
      throw new Error(detail);
    }

    const data = await response.json();
    const token = data.access_token || data.token;
    if (!token) {
      throw new Error('Login succeeded but no token was returned.');
    }

    setToken(token);
    hideLoginModal();
    await refreshDashboardData(getCurrentYearMonth());
  } catch (err) {
    const msg = err?.message || 'Sign-in or dashboard load failed.';
    if (loginError) {
      loginError.textContent = msg;
    }
    if (typeof window.app?.showToast === 'function') {
      window.app.showToast(msg, true);
    }
  } finally {
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Sign In';
    }
  }
}

function handleLogout() {
  setToken(null);
  setLogoutButtonVisible(false);
  if (typeof window.app?.useLocalPreview === 'function') {
    window.app.useLocalPreview();
  }
  showLoginModal('');
}

loginForm?.addEventListener('submit', handleLoginSubmit);
logoutBtn?.addEventListener('click', handleLogout);

window.addEventListener('DOMContentLoaded', async () => {
  const existingToken = getToken();
  setLogoutButtonVisible(Boolean(existingToken));

  if (!existingToken) {
    showLoginModal('');
    return;
  }

  try {
    await refreshDashboardData(getCurrentYearMonth());
    hideLoginModal();
  } catch (_) {
    setToken(null);
    setLogoutButtonVisible(false);
    showLoginModal('');
  }
});