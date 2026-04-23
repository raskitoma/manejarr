/**
 * Theme Manager
 */

export function initTheme() {
  const savedTheme = localStorage.getItem('manejarr_theme') || 'dark';
  applyTheme(savedTheme);
  return savedTheme;
}

export function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light-theme');
  } else {
    document.documentElement.classList.remove('light-theme');
  }
}

export function toggleTheme() {
  const current = localStorage.getItem('manejarr_theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('manejarr_theme', newTheme);
  applyTheme(newTheme);
  return newTheme;
}

export function getCurrentTheme() {
  return localStorage.getItem('manejarr_theme') || 'dark';
}
