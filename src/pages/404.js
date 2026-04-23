/**
 * 404 Error Page
 */
import { t } from '../utils/i18n.js';

export async function render404() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state" style="margin-top: 10vh;">
      <div class="empty-state-icon" style="font-size: 4rem; margin-bottom: 1rem;">🧭</div>
      <div class="empty-state-title" style="font-size: 2rem;">${t('page_not_found')}</div>
      <div class="empty-state-text" style="font-size: 1.1rem; max-width: 400px; margin: 0 auto;">
        ${t('page_not_found_desc')}
        <br/><br/>
        ${t('redirecting')} <span id="countdown" style="font-weight: bold; color: var(--accent-primary);">3</span> ${t('seconds')}
      </div>
    </div>
  `;

  let timeLeft = 3;
  const countdownEl = document.getElementById('countdown');
  
  const interval = setInterval(() => {
    timeLeft--;
    if (countdownEl) countdownEl.textContent = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(interval);
      window.location.hash = '#/dashboard';
    }
  }, 1000);

  // Store the interval so we can clear it if the user navigates away manually
  window._manejarr404Interval = interval;
}

export function cleanup404() {
  if (window._manejarr404Interval) {
    clearInterval(window._manejarr404Interval);
  }
}
