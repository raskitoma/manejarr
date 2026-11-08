import { api } from '../utils/api.js';
import { t } from '../utils/i18n.js';
import { formatDuration, formatSize } from '../utils/formatters.js';
import { showModal } from '../components/modal.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export async function renderEncodingCleanup(results = []) {
  const container = document.getElementById('page-content');
  const page = document.createElement('section');
  container.replaceChildren(page);
  page.innerHTML = `<p>${t('cleanup_loading')}</p>`;

  try {
    const { enabled } = await api.get('/encoding-cleanup/status');
    if (!enabled) {
      page.textContent = t('cleanup_disabled');
      return;
    }
    const { files } = await api.get('/encoding-cleanup');
    if (!page.isConnected) return;

    files.sort((a, b) => a.modified - b.modified || a.relative.localeCompare(b.relative));
    page.innerHTML = `
      ${results.length ? `<details ${results.some(row => row.status === 'skipped') ? 'open' : ''}>
        <summary>${t('cleanup_results')} (${results.length})</summary>
        <ul>${results.map(row => `<li>${escapeHtml(row.relative)} — ${t(`cleanup_${row.status}`)}</li>`).join('')}</ul>
      </details>` : ''}
      <div class="flex gap-sm mb-md">
        <button class="btn btn-secondary" id="encoding-refresh">${t('cleanup_refresh')}</button>
        <button class="btn btn-danger" id="encoding-delete" disabled>${t('cleanup_delete')}</button>
      </div>
      ${files.length ? `
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th><input type="checkbox" id="encoding-select-all" aria-label="${t('cleanup_select_batch')}"></th>
            <th>${t('name')}</th><th>${t('size')}</th><th>${t('cleanup_modified')}</th>
            <th>${t('cleanup_status')}</th><th>${t('cleanup_destination')}</th>
          </tr></thead>
          <tbody>${files.map((file, index) => `
            <tr>
              <td>${file.token ? `<input type="checkbox" data-file="${index}" aria-label="${escapeHtml(file.relative)}">` : ''}</td>
              <td style="overflow-wrap: anywhere">${escapeHtml(file.relative)}</td>
              <td>${formatSize(file.size)}</td>
              <td>${t('cleanup_age').replace('{age}', escapeHtml(formatDuration((Date.now() - file.modified) / 1000)))}</td>
              <td>${t(`cleanup_${file.status}`)}</td>
              <td style="overflow-wrap: anywhere">${escapeHtml(file.app || '')} ${escapeHtml(file.destination || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<p>${t('cleanup_empty')}</p>`}`;

    const refresh = page.querySelector('#encoding-refresh');
    refresh.onclick = () => renderEncodingCleanup();
    const remove = page.querySelector('#encoding-delete');
    const boxes = [...page.querySelectorAll('[data-file]')];
    const selectAll = page.querySelector('#encoding-select-all');
    if (!selectAll) return;
    selectAll.disabled = !boxes.length;
    const selected = () => boxes.filter(box => box.checked).map(box => files[Number(box.dataset.file)]);
    const updateSelection = () => {
      const count = selected().length;
      remove.disabled = !count || count > 100;
      remove.textContent = count > 100 ? t('cleanup_limit') : `${t('cleanup_delete')} (${count})`;
      selectAll.checked = count > 0 && count === Math.min(boxes.length, 100);
      selectAll.indeterminate = count > 0 && !selectAll.checked;
    };
    boxes.forEach(box => { box.onchange = updateSelection; });
    selectAll.onchange = () => {
      boxes.forEach((box, index) => { box.checked = selectAll.checked && index < 100; });
      updateSelection();
    };
    remove.onclick = () => {
      const chosen = selected();
      const total = formatSize(chosen.reduce((sum, file) => sum + file.size, 0));
      const { close, overlay } = showModal({
        title: t('cleanup_delete'),
        closeOnOutsideClick: false,
        content: `<p>${t('cleanup_confirm')} (${chosen.length}, ${total})</p>
          <ul>${chosen.map(file => `<li>${escapeHtml(file.relative)} → ${escapeHtml(file.destination)}</li>`).join('')}</ul>
          <p id="encoding-delete-error" role="alert"></p>`,
        footer: `<button class="btn btn-danger" id="encoding-confirm">${t('cleanup_delete')}</button>`,
      });
      const confirm = overlay.querySelector('#encoding-confirm');
      confirm.onclick = async () => {
        if (!page.isConnected) return close();
        confirm.disabled = true;
        try {
          const response = await api.post('/encoding-cleanup/delete', {
            confirmed: true, tokens: chosen.map(file => file.token),
          });
          if (confirm.isConnected) close();
          if (page.isConnected) await renderEncodingCleanup(response.results);
        } catch {
          const error = overlay.querySelector('#encoding-delete-error');
          if (error) error.textContent = t('cleanup_delete_error');
          confirm.disabled = false;
        }
      };
    };
  } catch {
    page.textContent = t('cleanup_storage_unavailable');
  }
}
