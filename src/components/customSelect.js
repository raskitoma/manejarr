/**
 * Custom Select component.
 *
 * Mirrors the .match-actions pill+dropdown style so all selectors look the
 * same across the app. Replaces native <select> wherever option-list theming
 * matters (native <option> lists can't be themed cross-browser).
 *
 * Usage:
 *   container.innerHTML = renderCustomSelect({
 *     id: 'level-filter',
 *     value: currentLevel,
 *     options: [
 *       { value: '',     label: 'All' },
 *       { value: 'info', label: 'Info', icon: 'ℹ️' },
 *     ],
 *     minWidth: '140px',
 *   });
 *   attachCustomSelect('level-filter', (val) => { ... });
 */

const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');

export function renderCustomSelect({
  id,
  value,
  options,
  placeholder = 'Select...',
  minWidth = '140px',
  triggerIcon = null,
  showLabelInTrigger = true,
  triggerClass = '',
}) {
  const current = options.find(o => String(o.value) === String(value)) || { label: placeholder, value: '' };

  const triggerIconHtml = triggerIcon ? `<span class="custom-select-icon">${triggerIcon}</span>` : '';
  const currentIconHtml = current.icon ? `<span class="custom-select-icon">${current.icon}</span>` : '';
  const valueHtml = showLabelInTrigger ? `<span class="custom-select-value">${current.label}</span>` : '';

  const itemsHtml = options.map(o => {
    const isActive = String(o.value) === String(value);
    return `
      <button type="button" class="custom-select-item ${isActive ? 'active' : ''}" data-cs-value="${escAttr(o.value)}">
        ${o.icon ? `<span class="custom-select-icon">${o.icon}</span>` : ''}
        <span class="custom-select-item-label">${o.label}</span>
        ${isActive ? '<span class="custom-select-check">✓</span>' : ''}
      </button>
    `;
  }).join('');

  return `
    <div class="custom-select ${triggerClass}" data-cs-id="${escAttr(id)}" style="min-width: ${minWidth};">
      <button type="button" class="custom-select-toggle">
        ${triggerIconHtml}
        ${currentIconHtml}
        ${valueHtml}
        <span class="custom-select-chevron">▾</span>
      </button>
      <div class="custom-select-menu hidden">
        ${itemsHtml}
      </div>
    </div>
  `;
}

export function attachCustomSelect(id, onChange) {
  const wrapper = document.querySelector(`.custom-select[data-cs-id="${id}"]`);
  if (!wrapper) return;
  const toggle = wrapper.querySelector('.custom-select-toggle');
  const menu = wrapper.querySelector('.custom-select-menu');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = menu.classList.contains('hidden');
    closeAllCustomSelects();
    if (wasHidden) {
      menu.classList.remove('hidden');
      positionCustomSelectMenu(toggle, menu);
    }
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.custom-select-item');
    if (!item) return;
    const value = item.dataset.csValue;
    closeAllCustomSelects();
    if (typeof onChange === 'function') onChange(value);
  });
}

export function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-menu:not(.hidden)').forEach(m => {
    m.classList.add('hidden');
    m.classList.remove('custom-select-menu--up', 'custom-select-menu--right');
  });
}

function positionCustomSelectMenu(toggle, menu) {
  menu.classList.remove('custom-select-menu--up', 'custom-select-menu--right');
  const t = toggle.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const buffer = 8;
  if (t.bottom + m.height + buffer > vh && t.top - m.height - buffer > 0) {
    menu.classList.add('custom-select-menu--up');
  }
  if (t.left + m.width + buffer > vw) {
    menu.classList.add('custom-select-menu--right');
  }
}

// One-time global listeners — guarded so SPA re-renders don't stack.
if (typeof window !== 'undefined' && !window.__manejarrCustomSelectListener) {
  window.__manejarrCustomSelectListener = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select')) closeAllCustomSelects();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllCustomSelects();
  });
  window.addEventListener('scroll', () => closeAllCustomSelects(), { passive: true, capture: true });
  window.addEventListener('resize', () => closeAllCustomSelects());
}
