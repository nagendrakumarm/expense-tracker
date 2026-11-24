const API_BASE = 'https://expense-api-6nkw.onrender.com/';
const TOKEN_KEY = 'expense_auth_token';

const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const logoutBtn = document.getElementById('logoutBtn');

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthenticatedUI(isAuthenticated) {
  if (loginModal) {
    loginModal.style.display = isAuthenticated ? 'none' : 'flex';
  }
  if (logoutBtn) {
    logoutBtn.style.display = isAuthenticated ? 'inline-block' : 'none';
  }
}

export function getSelectedYearMonth(fallback = '2026-11') {
  const label = document.getElementById('currentMonthDisplay')?.textContent?.trim();
  if (!label) return fallback;
  const parsed = new Date(`${label} 1`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  const yr = parsed.getFullYear();
  const mo = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${yr}-${mo}`;
}

export async function signIn(username, password) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: String(username || '').trim(),
      password: String(password || '')
    })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || 'Invalid username or password');
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Login response missing access token');
  }

  localStorage.setItem(TOKEN_KEY, data.access_token);
  return data.access_token;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  if (loginPassword) loginPassword.value = '';
  setAuthenticatedUI(false);
  if (window.app && typeof window.app.useLocalPreview === 'function') {
    window.app.useLocalPreview();
  }
}

export async function authFetch(path, options = {}) {
  const token = getAuthToken();
  if (!token) {
    setAuthenticatedUI(false);
    throw new Error('Not signed in');
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Session expired; please sign in again');
  }
  return res;
}

export async function refreshDashboardData(month = getSelectedYearMonth()) {
  const [catsRes, summaryRes] = await Promise.all([
    authFetch('/api/categories'),
    authFetch(`/api/summary?month=${encodeURIComponent(month)}`)
  ]);

  if (!catsRes.ok || !summaryRes.ok) {
    throw new Error('Failed to load dashboard data');
  }

  const categoriesData = await catsRes.json();
  const summaryData = await summaryRes.json();

  if (window.app && typeof window.app.applyBackendDashboard === 'function') {
    window.app.applyBackendDashboard({
      categories: categoriesData.categories || [],
      summary: summaryData,
      month
    });
  }

  return { categoriesData, summaryData };
}

export async function createTransactionViaApi({ date, store, description, amount, categoryId }) {
  const payload = {
    date: String(date || '').trim(),
    store: String(store || '').trim(),
    description: description && String(description).trim() ? String(description).trim() : null,
    amount: Math.abs(Number(amount)),
    category: Number(categoryId)
  };

  const res = await authFetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || 'Failed to save transaction');
  }

  const created = await res.json();
  await refreshDashboardData(getSelectedYearMonth());
  return created;
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginError) loginError.textContent = '';
    if (loginSubmitBtn) loginSubmitBtn.disabled = true;

    try {
      await signIn(loginUsername?.value || '', loginPassword?.value || '');
      if (loginPassword) loginPassword.value = '';
      setAuthenticatedUI(true);
      await refreshDashboardData(getSelectedYearMonth());
    } catch (err) {
      if (loginError) loginError.textContent = err.message || 'Sign in failed';
      setAuthenticatedUI(false);
    } finally {
      if (loginSubmitBtn) loginSubmitBtn.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    logout();
  });
}

window.refreshDashboardData = refreshDashboardData;
window.createTransactionViaApi = createTransactionViaApi;
window.logoutApp = logout;

window.addEventListener('DOMContentLoaded', () => {
  if (getAuthToken()) {
    setAuthenticatedUI(true);
    refreshDashboardData(getSelectedYearMonth()).catch(() => {
      setAuthenticatedUI(false);
    });
  } else {
    setAuthenticatedUI(false);
  }
});