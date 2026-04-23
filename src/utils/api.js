/**
 * API Fetch Wrapper
 *
 * Handles authentication, error handling, and JSON parsing
 * for all frontend-to-backend API calls.
 */

// Store credentials after login
let authHeader = '';

/**
 * Set the Basic Auth credentials.
 */
export function setCredentials(username, password) {
  authHeader = 'Basic ' + btoa(`${username}:${password}`);
  localStorage.setItem('manejarr_auth', authHeader);
}

/**
 * Load stored credentials.
 */
export function loadCredentials() {
  authHeader = localStorage.getItem('manejarr_auth') || '';
  return !!authHeader;
}

/**
 * Clear stored credentials.
 */
export function clearCredentials() {
  authHeader = '';
  localStorage.removeItem('manejarr_auth');
}

/**
 * Check if credentials are stored.
 */
export function hasCredentials() {
  return !!authHeader;
}

/**
 * Make an authenticated API request.
 */
export async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  // Handle auth failure
  if (response.status === 401) {
    clearCredentials();
    showLoginPrompt();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const text = await response.text();
    let error;
    try {
      error = JSON.parse(text);
    } catch {
      error = { error: text };
    }
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * API convenience methods.
 */
export const api = {
  get: (endpoint) => apiFetch(endpoint),
  post: (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};

/**
 * Show the login prompt modal.
 */
function showLoginPrompt() {
  // Dispatch a custom event that the app can listen for
  window.dispatchEvent(new CustomEvent('auth:required'));
}
