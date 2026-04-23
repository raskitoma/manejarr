/**
 * Sidebar Navigation Component
 */
import { clearCredentials } from '../utils/api.js';
import { t, setLanguage, getLanguage } from '../utils/i18n.js';
import { toggleTheme, getCurrentTheme } from '../utils/theme.js';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', hash: '#/dashboard' },
  { id: 'settings', label: 'Settings', icon: '⚙️', hash: '#/settings' },
  { id: 'scheduler', label: 'Scheduler', icon: '🕐', hash: '#/scheduler' },
  { id: 'logs', label: 'Event Logs', icon: '📋', hash: '#/logs' },
];

export function renderSidebar(activeRoute) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const navLinks = NAV_ITEMS.map(item => `
    <a href="${item.hash}" class="sidebar-link ${activeRoute === item.id ? 'active' : ''}" data-page="${item.id}">
      <span class="sidebar-link-icon">${item.icon}</span>
      <span>${t(item.id)}</span>
    </a>
  `).join('');

  sidebar.innerHTML = `
    <a href="#/dashboard" class="sidebar-header" style="text-decoration: none; cursor: pointer;">
      <img src="/favicon.svg" alt="Manejarr Logo" style="width: 36px; height: 36px; border-radius: var(--radius-md); box-shadow: var(--accent-glow);" />
      <span class="sidebar-title">Manejarr</span>
    </a>
    <nav class="sidebar-nav">
      ${navLinks}
    </nav>
    <div class="sidebar-footer" style="display: flex; flex-direction: column; gap: var(--space-md);">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 var(--space-xs);">
        <select id="lang-select" class="lang-select-dropdown" style="background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 4px; font-size: 0.85rem; cursor: pointer;">
          <option value="en" ${getLanguage() === 'en' ? 'selected' : ''}>English</option>
          <option value="es" ${getLanguage() === 'es' ? 'selected' : ''}>Español</option>
        </select>
        <button id="theme-toggle-btn" class="btn btn-sm" style="background: transparent; border: 1px solid var(--border-color); padding: 4px 8px;" title="${getCurrentTheme() === 'dark' ? t('light_mode') : t('dark_mode')}">
          ${getCurrentTheme() === 'dark' ? '🌙' : '☀️'}
        </button>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 var(--space-xs);">
        <span class="sidebar-version text-muted">v1.0.0</span>
        <button id="logout-btn" class="btn btn-sm" style="background: transparent; color: var(--text-muted); border: none; padding: 0; cursor: pointer; display: flex; align-items: center; gap: 8px;" title="Logout">
          <span style="font-size: 0.85rem; font-weight: 500;">${t('logout') || 'Logout'}</span>
          <span style="font-size: 1.2rem;">🚪</span>
        </button>
      </div>
    </div>
  `;

  // Close sidebar on mobile when a link is clicked
  sidebar.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    clearCredentials();
    window.location.reload();
  });

  // Language
  document.getElementById('lang-select')?.addEventListener('change', (e) => {
    setLanguage(e.target.value);
  });

  // Theme
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    toggleTheme();
    // Re-render sidebar to update icon
    renderSidebar(activeRoute);
  });
}
