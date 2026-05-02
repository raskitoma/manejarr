/**
 * Custom Date Range Picker.
 *
 * Single pill that opens a calendar with two-click range selection plus
 * quick presets including time-precision ones (Right now, Last 6 hours).
 *
 * Click sequence:
 *   1) First click on a day → sets the pending start (highlights cell).
 *   2) Hovering other days  → previews the range.
 *   3) Second click → commits the range. If the second click is earlier
 *      than the first, the bounds are swapped automatically so the user
 *      can never end up with start > end.
 *
 * Output format: SQLite-compatible UTC timestamps (`YYYY-MM-DD HH:MM:SS`)
 * so `created_at >= ?` lexical comparisons work correctly. Manual date
 * picks span the full day (00:00:00 → 23:59:59 local, converted to UTC).
 *
 * Shares .date-picker / .date-picker-menu CSS so the global outside-click
 * and Escape handlers from datePicker.js apply here too.
 *
 * Usage:
 *   container.innerHTML = renderDateRangePicker({ id: 'event-range' });
 *   attachDateRangePicker('event-range', ({ start, end, label }) => { ... });
 */

const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const PAD = (n) => String(n).padStart(2, '0');

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(d) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function sameYMD(a, b) {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Format JS Date as SQLite UTC string `YYYY-MM-DD HH:MM:SS`. */
function toSqliteUtc(d) {
  if (!d) return '';
  return `${d.getUTCFullYear()}-${PAD(d.getUTCMonth()+1)}-${PAD(d.getUTCDate())} ${PAD(d.getUTCHours())}:${PAD(d.getUTCMinutes())}:${PAD(d.getUTCSeconds())}`;
}

/** Short display: "MM/DD/YYYY". */
function displayDate(d) {
  if (!d) return '';
  return `${PAD(d.getMonth()+1)}/${PAD(d.getDate())}/${d.getFullYear()}`;
}

/* ── Quick presets ─────────────────────────────────────────────────────
   Time-precision presets ("Right now", "Last 6 hours") use the actual
   wall-clock now; date-precision presets span the full day(s). All are
   converted to UTC SQLite strings at commit time. */
const PRESETS = [
  { id: 'now',       label: 'Right now',     time: true },
  { id: 'last6h',    label: 'Last 6 hours',  time: true },
  { id: 'today',     label: 'Today',         time: false },
  { id: 'yesterday', label: 'Yesterday',     time: false },
  { id: 'last7',     label: 'Last 7 days',   time: false },
  { id: 'last30',    label: 'Last 30 days',  time: false },
  { id: 'thismonth', label: 'This month',    time: false },
  { id: 'lastmonth', label: 'Last month',    time: false },
];

function applyPreset(id) {
  const now = new Date();
  const today = todayMidnight();
  switch (id) {
    case 'now': {
      // "Right now" — last 30 minutes through now.
      const s = new Date(now.getTime() - 30 * 60 * 1000);
      return { start: s, end: now };
    }
    case 'last6h': {
      const s = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      return { start: s, end: now };
    }
    case 'today':     return { start: today, end: endOfDay(today) };
    case 'yesterday': { const y = addDays(today, -1); return { start: y, end: endOfDay(y) }; }
    case 'last7':     return { start: addDays(today, -6),  end: endOfDay(today) };
    case 'last30':    return { start: addDays(today, -29), end: endOfDay(today) };
    case 'thismonth': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfDay(today) };
    case 'lastmonth': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
      return { start: s, end: e };
    }
    default: return null;
  }
}

export function renderDateRangePicker({
  id,
  placeholder = 'Date range',
  minWidth = '260px',
}) {
  return `
    <div class="date-picker date-range-picker" data-drp-id="${escAttr(id)}" style="min-width: ${minWidth};">
      <button type="button" class="date-picker-toggle">
        <span class="date-picker-icon">📅</span>
        <span class="date-picker-value placeholder">${escAttr(placeholder)}</span>
      </button>
      <div class="date-picker-menu date-range-menu hidden"></div>
    </div>
  `;
}

export function attachDateRangePicker(id, onChange) {
  const wrapper = document.querySelector(`.date-range-picker[data-drp-id="${id}"]`);
  if (!wrapper) return;
  const toggle = wrapper.querySelector('.date-picker-toggle');
  const menu = wrapper.querySelector('.date-range-menu');

  let viewYear, viewMonth;        // currently displayed month
  let pendingStart = null;        // first click during a manual pick
  let hoverDate = null;           // hover preview while picking
  let committedStart = null;
  let committedEnd = null;
  let presetLabel = null;         // shown in toggle when a preset is active

  const initView = () => {
    const anchor = committedStart || todayMidnight();
    viewYear = anchor.getFullYear();
    viewMonth = anchor.getMonth();
  };

  const renderMenu = () => {
    const today = todayMidnight();

    // Effective range for highlighting cells (committed range or in-progress).
    let rs = null, re = null;
    if (pendingStart) {
      rs = pendingStart;
      re = hoverDate || pendingStart;
      if (re && +re < +rs) { const tmp = rs; rs = re; re = tmp; }
    } else if (committedStart && committedEnd) {
      rs = committedStart;
      re = committedEnd;
    }

    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysPrevMonth - i, date: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, date: new Date(viewYear, viewMonth, d) });
    }
    while (cells.length < 42) {
      const tail = cells.length - (startOffset + daysInMonth) + 1;
      cells.push({ day: tail, date: null });
    }

    const headerRow = DAY_HEADERS.map(h => `<div class="date-picker-dayhead">${h}</div>`).join('');
    const cellsHtml = cells.map(c => {
      const cls = ['date-picker-day'];
      let attrs = '';
      if (!c.date) {
        cls.push('other-month');
      } else {
        const inRange = rs && re && +c.date >= +rs && +c.date <= +re;
        if (inRange) cls.push('in-range');
        if (rs && sameYMD(c.date, rs)) cls.push('range-start');
        if (re && sameYMD(c.date, re)) cls.push('range-end');
        if (sameYMD(c.date, today)) cls.push('today');
        attrs = `data-iso="${c.date.getFullYear()}-${PAD(c.date.getMonth()+1)}-${PAD(c.date.getDate())}"`;
      }
      return `<button type="button" class="${cls.join(' ')}" ${attrs} ${!c.date ? 'tabindex="-1"' : ''}>${c.day}</button>`;
    }).join('');

    const presetsHtml = PRESETS.map(p =>
      `<button type="button" class="date-range-preset" data-preset="${p.id}">${p.label}</button>`
    ).join('');

    let summary;
    if (pendingStart) {
      summary = `Pick end date · start ${displayDate(pendingStart)}`;
    } else if (presetLabel) {
      summary = presetLabel;
    } else if (committedStart && committedEnd) {
      summary = `${displayDate(committedStart)} → ${displayDate(committedEnd)}`;
    } else {
      summary = 'Click a day to start the range';
    }

    menu.innerHTML = `
      <div class="date-range-presets">${presetsHtml}</div>
      <div class="date-range-cal">
        <div class="date-picker-header">
          <button type="button" class="date-picker-nav" data-dp-nav="prev" title="Previous month">‹</button>
          <div class="date-picker-title">${MONTH_NAMES[viewMonth]} ${viewYear}</div>
          <button type="button" class="date-picker-nav" data-dp-nav="next" title="Next month">›</button>
        </div>
        <div class="date-picker-grid">
          ${headerRow}
          ${cellsHtml}
        </div>
        <div class="date-range-summary">${summary}</div>
        <div class="date-picker-footer">
          <button type="button" class="date-picker-action" data-action="clear">Clear</button>
          <button type="button" class="date-picker-action primary" data-action="close">Done</button>
        </div>
      </div>
    `;
  };

  const closeAll = () => {
    document.querySelectorAll('.date-picker-menu:not(.hidden)').forEach(m => {
      m.classList.add('hidden');
      m.classList.remove('date-picker-menu--up', 'date-picker-menu--right');
    });
    pendingStart = null;
    hoverDate = null;
  };

  const positionMenu = () => {
    menu.classList.remove('date-picker-menu--up', 'date-picker-menu--right');
    const t = toggle.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    if (t.bottom + m.height + 8 > window.innerHeight && t.top - m.height - 8 > 0) {
      menu.classList.add('date-picker-menu--up');
    }
    if (t.left + m.width + 8 > window.innerWidth) {
      menu.classList.add('date-picker-menu--right');
    }
  };

  const open = () => {
    initView();
    closeAll();
    renderMenu();
    menu.classList.remove('hidden');
    positionMenu();
  };

  const updateToggleText = () => {
    const valSpan = toggle.querySelector('.date-picker-value');
    if (!valSpan) return;
    let text = '';
    if (presetLabel) text = presetLabel;
    else if (committedStart && committedEnd) text = `${displayDate(committedStart)} → ${displayDate(committedEnd)}`;
    valSpan.textContent = text || 'Date range';
    valSpan.classList.toggle('placeholder', !text);

    const existingClear = toggle.querySelector('.date-picker-clear');
    if ((committedStart || committedEnd) && !existingClear) {
      toggle.insertAdjacentHTML('beforeend', '<span class="date-picker-clear" title="Clear">×</span>');
    } else if (!committedStart && !committedEnd && existingClear) {
      existingClear.remove();
    }
  };

  const commit = (s, e, label = null) => {
    committedStart = s;
    committedEnd = e;
    presetLabel = label;
    updateToggleText();
    if (typeof onChange === 'function') {
      onChange({
        start: s ? toSqliteUtc(s) : '',
        end: e ? toSqliteUtc(e) : '',
        label: label || null,
      });
    }
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.classList.contains('date-picker-clear')) {
      commit(null, null, null);
      closeAll();
      return;
    }
    if (menu.classList.contains('hidden')) open();
    else closeAll();
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

    const presetBtn = e.target.closest('[data-preset]');
    if (presetBtn) {
      const preset = PRESETS.find(p => p.id === presetBtn.dataset.preset);
      const r = preset && applyPreset(preset.id);
      if (r) {
        pendingStart = null;
        hoverDate = null;
        commit(r.start, r.end, preset.label);
        closeAll();
      }
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      if (actionBtn.dataset.action === 'clear') {
        pendingStart = null;
        hoverDate = null;
        commit(null, null, null);
        renderMenu();
      } else if (actionBtn.dataset.action === 'close') {
        closeAll();
      }
      return;
    }

    const dayBtn = e.target.closest('.date-picker-day[data-iso]');
    if (dayBtn) {
      const [y, m, d] = dayBtn.dataset.iso.split('-').map(Number);
      const picked = new Date(y, m - 1, d);
      if (!pendingStart) {
        // First click: clear any committed range, mark the start.
        pendingStart = picked;
        committedStart = null;
        committedEnd = null;
        presetLabel = null;
        hoverDate = picked;
        renderMenu();
      } else {
        // Second click: commit the range with full-day spans.
        let s = new Date(pendingStart);
        let eDay = new Date(picked);
        if (+eDay < +s) { const tmp = s; s = eDay; eDay = tmp; }
        s.setHours(0, 0, 0, 0);
        eDay = endOfDay(eDay);
        pendingStart = null;
        hoverDate = null;
        commit(s, eDay, null);
        closeAll();
      }
    }
  });

  // Hover preview for the in-progress range.
  menu.addEventListener('mousemove', (e) => {
    if (!pendingStart) return;
    const dayBtn = e.target.closest('.date-picker-day[data-iso]');
    if (!dayBtn) return;
    const [y, m, d] = dayBtn.dataset.iso.split('-').map(Number);
    const next = new Date(y, m - 1, d);
    if (hoverDate && sameYMD(hoverDate, next)) return;
    hoverDate = next;
    renderMenu();
  });

  menu.addEventListener('mouseleave', () => {
    if (pendingStart && hoverDate) {
      hoverDate = null;
      renderMenu();
    }
  });
}
