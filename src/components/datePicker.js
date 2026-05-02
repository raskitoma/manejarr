/**
 * Custom Date Picker.
 *
 * Same pill+dropdown pattern as customSelect. Replaces native
 * <input type="date"> so the calendar matches the site theme — the OS
 * native picker (white background, alien chrome) ignores our CSS.
 *
 * Usage:
 *   container.innerHTML = renderDatePicker({
 *     id: 'filter-start-date',
 *     value: '2026-05-01',         // ISO YYYY-MM-DD or '' for empty
 *     placeholder: 'mm/dd/yyyy',
 *     minWidth: '160px',
 *   });
 *   attachDatePicker('filter-start-date', (isoValue) => { ... });
 */

const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function formatDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d }; // m is 0-indexed
}

function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function renderDatePicker({
  id,
  value = '',
  placeholder = 'mm/dd/yyyy',
  minWidth = '160px',
}) {
  const display = value ? formatDisplay(value) : '';
  return `
    <div class="date-picker" data-dp-id="${escAttr(id)}" data-dp-value="${escAttr(value)}" style="min-width: ${minWidth};">
      <button type="button" class="date-picker-toggle">
        <span class="date-picker-icon">📅</span>
        <span class="date-picker-value ${display ? '' : 'placeholder'}">${display || placeholder}</span>
        ${value ? '<span class="date-picker-clear" title="Clear">×</span>' : ''}
      </button>
      <div class="date-picker-menu hidden"></div>
    </div>
  `;
}

export function attachDatePicker(id, onChange) {
  const wrapper = document.querySelector(`.date-picker[data-dp-id="${id}"]`);
  if (!wrapper) return;
  const toggle = wrapper.querySelector('.date-picker-toggle');
  const menu = wrapper.querySelector('.date-picker-menu');

  let viewYear, viewMonth; // currently displayed month
  let selectedIso = wrapper.dataset.dpValue || '';

  const init = () => {
    const sel = parseIso(selectedIso) || parseIso(todayIso());
    viewYear = sel.y;
    viewMonth = sel.m;
  };

  const renderMenu = () => {
    const todayParts = parseIso(todayIso());
    const selParts = selectedIso ? parseIso(selectedIso) : null;

    // First day grid offset (Sunday=0)
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells = [];
    // Leading days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysPrevMonth - i, otherMonth: true, iso: null });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        otherMonth: false,
        iso: toIso(viewYear, viewMonth, d),
      });
    }
    // Trailing to fill 6 weeks (42 cells) so layout is stable
    while (cells.length < 42) {
      const d = cells.length - (startOffset + daysInMonth) + 1;
      cells.push({ day: d, otherMonth: true, iso: null });
    }

    const headerRow = DAY_HEADERS.map(h => `<div class="date-picker-dayhead">${h}</div>`).join('');

    const cellsHtml = cells.map(c => {
      const isToday = c.iso && todayParts && c.iso === toIso(todayParts.y, todayParts.m, todayParts.d);
      const isSelected = c.iso && selParts && c.iso === selectedIso;
      const cls = [
        'date-picker-day',
        c.otherMonth ? 'other-month' : '',
        isToday ? 'today' : '',
        isSelected ? 'selected' : '',
      ].filter(Boolean).join(' ');
      const dataAttr = c.iso ? `data-iso="${c.iso}"` : '';
      return `<button type="button" class="${cls}" ${dataAttr} ${c.otherMonth ? 'tabindex="-1"' : ''}>${c.day}</button>`;
    }).join('');

    menu.innerHTML = `
      <div class="date-picker-header">
        <button type="button" class="date-picker-nav" data-dp-nav="prev" title="Previous month">‹</button>
        <div class="date-picker-title">${MONTH_NAMES[viewMonth]} ${viewYear}</div>
        <button type="button" class="date-picker-nav" data-dp-nav="next" title="Next month">›</button>
      </div>
      <div class="date-picker-grid">
        ${headerRow}
        ${cellsHtml}
      </div>
      <div class="date-picker-footer">
        <button type="button" class="date-picker-action" data-dp-action="clear">Clear</button>
        <button type="button" class="date-picker-action primary" data-dp-action="today">Today</button>
      </div>
    `;
  };

  const open = () => {
    init();
    closeAllDatePickers();
    renderMenu();
    menu.classList.remove('hidden');
    positionMenu(toggle, menu);
  };

  const commitValue = (iso) => {
    selectedIso = iso || '';
    wrapper.dataset.dpValue = selectedIso;
    const display = formatDisplay(selectedIso);
    const valSpan = toggle.querySelector('.date-picker-value');
    valSpan.textContent = display || (toggle.querySelector('.date-picker-value').dataset.placeholder || 'mm/dd/yyyy');
    valSpan.classList.toggle('placeholder', !display);

    // Add or remove the inline clear button
    const existingClear = toggle.querySelector('.date-picker-clear');
    if (selectedIso && !existingClear) {
      toggle.insertAdjacentHTML('beforeend', '<span class="date-picker-clear" title="Clear">×</span>');
    } else if (!selectedIso && existingClear) {
      existingClear.remove();
    }

    if (typeof onChange === 'function') onChange(selectedIso);
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    // Inline clear button click — don't open the calendar.
    if (e.target.classList.contains('date-picker-clear')) {
      commitValue('');
      return;
    }
    if (menu.classList.contains('hidden')) {
      open();
    } else {
      closeAllDatePickers();
    }
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();

    const navBtn = e.target.closest('[data-dp-nav]');
    if (navBtn) {
      const dir = navBtn.dataset.dpNav === 'prev' ? -1 : 1;
      viewMonth += dir;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderMenu();
      return;
    }

    const actionBtn = e.target.closest('[data-dp-action]');
    if (actionBtn) {
      if (actionBtn.dataset.dpAction === 'clear') {
        commitValue('');
        closeAllDatePickers();
      } else if (actionBtn.dataset.dpAction === 'today') {
        commitValue(todayIso());
        closeAllDatePickers();
      }
      return;
    }

    const dayBtn = e.target.closest('.date-picker-day[data-iso]');
    if (dayBtn) {
      commitValue(dayBtn.dataset.iso);
      closeAllDatePickers();
    }
  });
}

export function closeAllDatePickers() {
  document.querySelectorAll('.date-picker-menu:not(.hidden)').forEach(m => {
    m.classList.add('hidden');
    m.classList.remove('date-picker-menu--up', 'date-picker-menu--right');
  });
}

function positionMenu(toggle, menu) {
  menu.classList.remove('date-picker-menu--up', 'date-picker-menu--right');
  const t = toggle.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  if (t.bottom + m.height + 8 > vh && t.top - m.height - 8 > 0) {
    menu.classList.add('date-picker-menu--up');
  }
  if (t.left + m.width + 8 > vw) {
    menu.classList.add('date-picker-menu--right');
  }
}

if (typeof window !== 'undefined' && !window.__manejarrDatePickerListener) {
  window.__manejarrDatePickerListener = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.date-picker')) closeAllDatePickers();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDatePickers();
  });
  window.addEventListener('scroll', () => closeAllDatePickers(), { passive: true, capture: true });
  window.addEventListener('resize', () => closeAllDatePickers());
}
