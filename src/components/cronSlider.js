/**
 * Cron Slider Component
 *
 * Slider-based schedule time picker that maps to common intervals.
 */

import cronstrue from 'cronstrue';

const PRESETS = [
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily (midnight)', value: '0 0 * * *' },
  { label: 'Daily (2 AM)', value: '0 2 * * *' },
  { label: 'Every 2 days', value: '0 0 */2 * *' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1' },
];

export function renderCronSlider(containerId, currentValue = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentIndex = PRESETS.findIndex(p => p.value === currentValue);
  const sliderVal = currentIndex >= 0 ? currentIndex : 2;

  container.innerHTML = `
    <div class="form-group">
      <label class="form-label">Schedule Interval</label>
      <input 
        type="range" 
        id="cron-slider" 
        min="0" 
        max="${PRESETS.length - 1}" 
        value="${sliderVal}" 
        class="form-input"
        style="padding: 0; background: transparent; border: none;"
      />
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-sm);">
        <span id="cron-slider-label" style="font-size: 0.9rem; font-weight: 500;">${PRESETS[sliderVal].label}</span>
        <code id="cron-slider-value" class="text-mono text-muted" style="font-size: 0.8rem;">${PRESETS[sliderVal].value}</code>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">
        <label class="toggle" style="display: inline-flex; vertical-align: middle; margin-right: var(--space-sm);">
          <input type="checkbox" id="cron-custom-toggle" />
          <span class="toggle-slider"></span>
        </label>
        Custom Expression
      </label>
      <input 
        type="text" 
        id="cron-custom-input" 
        class="form-input form-input-mono" 
        placeholder="e.g., 0 */4 * * *" 
        value="${currentIndex < 0 ? currentValue : ''}"
        ${currentIndex >= 0 ? 'disabled' : ''}
      />
      <div id="cron-custom-hint" class="form-hint" style="margin-top: var(--space-xs); font-style: italic;"></div>
    </div>
  `;

  // Slider change
  const slider = document.getElementById('cron-slider');
  const label = document.getElementById('cron-slider-label');
  const value = document.getElementById('cron-slider-value');

  slider?.addEventListener('input', () => {
    const i = parseInt(slider.value, 10);
    label.textContent = PRESETS[i].label;
    value.textContent = PRESETS[i].value;
  });

  // Custom toggle
  const toggle = document.getElementById('cron-custom-toggle');
  const customInput = document.getElementById('cron-custom-input');

  toggle?.addEventListener('change', () => {
    if (toggle.checked) {
      slider.disabled = true;
      customInput.disabled = false;
      customInput.focus();
      updateCustomHint();
    } else {
      slider.disabled = false;
      customInput.disabled = true;
      document.getElementById('cron-custom-hint').textContent = '';
    }
  });

  customInput?.addEventListener('input', updateCustomHint);

  function updateCustomHint() {
    const hint = document.getElementById('cron-custom-hint');
    if (!hint || customInput.disabled) return;
    
    const val = customInput.value.trim();
    if (!val) {
      hint.textContent = '';
      return;
    }

    try {
      hint.textContent = cronstrue.toString(val);
      hint.style.color = 'var(--status-success)';
    } catch (err) {
      hint.textContent = 'Invalid cron expression';
      hint.style.color = 'var(--status-error)';
    }
  }

  if (currentIndex < 0 && currentValue) {
    toggle.checked = true;
    slider.disabled = true;
    customInput.disabled = false;
    updateCustomHint();
  }
}

/**
 * Get the current cron value from the slider/custom input.
 */
export function getCronValue() {
  const toggle = document.getElementById('cron-custom-toggle');
  if (toggle?.checked) {
    return document.getElementById('cron-custom-input')?.value || '';
  }
  const slider = document.getElementById('cron-slider');
  const i = parseInt(slider?.value || '2', 10);
  return PRESETS[i]?.value || '0 0 * * *';
}
