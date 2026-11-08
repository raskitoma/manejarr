import { api } from '../utils/api.js';
import { t } from '../utils/i18n.js';
import { formatDuration, formatSize } from '../utils/formatters.js';
import { showModal } from '../components/modal.js';

const PAGE_SIZE = 25;

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

    const statuses = [...new Set(files.map(file => file.status))].sort();
    const sorters = {
      modified: (a, b) => a.modified - b.modified,
      name: (a, b) => a.relative.localeCompare(b.relative, undefined, { numeric: true }),
      size: (a, b) => a.size - b.size,
      cleanup_status: (a, b) => t(`cleanup_${a.status}`).localeCompare(t(`cleanup_${b.status}`)),
      cleanup_destination: (a, b) => (a.destination || '').localeCompare(b.destination || ''),
    };
    page.innerHTML = `
      ${results.length ? `<details ${results.some(row => row.status === 'skipped') ? 'open' : ''}>
        <summary>${t('cleanup_results')} (${results.length})</summary>
        <ul>${results.map(row => `<li>${escapeHtml(row.relative)} — ${t(`cleanup_${row.status}`)}</li>`).join('')}</ul>
      </details>` : ''}
      <div class="flex gap-sm mb-md">
        <button class="btn btn-secondary" id="encoding-refresh">${t('cleanup_refresh')}</button>
        <button class="btn btn-danger" id="encoding-delete" disabled>${t('cleanup_delete')}</button>
      </div>
      <div class="cleanup-filters mb-md">
        <label>${t('cleanup_search')}<input type="search" class="form-input" id="encoding-search"></label>
        <label>${t('cleanup_status')}<select class="form-input" id="encoding-status">
          <option value="">${t('cleanup_all_statuses')}</option>
          ${statuses.map(status => `<option value="${escapeHtml(status)}">${t(`cleanup_${status}`)}</option>`).join('')}
        </select></label>
        <label>${t('cleanup_app')}<select class="form-input" id="encoding-app">
          <option value="">${t('cleanup_all_apps')}</option>
          <option value="radarr">Radarr</option><option value="sonarr">Sonarr</option>
        </select></label>
        <label>${t('cleanup_sort')}<select class="form-input" id="encoding-sort">
          ${Object.keys(sorters).map(key => `<option value="${key}">${t(key === 'modified' ? 'cleanup_modified' : key)}</option>`).join('')}
        </select></label>
        <label>${t('cleanup_direction')}<select class="form-input" id="encoding-direction">
          <option value="1">${t('cleanup_ascending')}</option>
          <option value="-1">${t('cleanup_descending')}</option>
        </select></label>
      </div>
      <div id="encoding-list"></div>`;

    const refresh = page.querySelector('#encoding-refresh');
    refresh.onclick = () => renderEncodingCleanup();
    const remove = page.querySelector('#encoding-delete');
    const list = page.querySelector('#encoding-list');
    const search = page.querySelector('#encoding-search');
    const status = page.querySelector('#encoding-status');
    const app = page.querySelector('#encoding-app');
    const sort = page.querySelector('#encoding-sort');
    const direction = page.querySelector('#encoding-direction');
    let pageIndex = 0;
    let selected = [];

    const renderList = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = files.filter(file =>
        (!status.value || file.status === status.value) &&
        (!app.value || file.app === app.value) &&
        (!query || `${file.relative} ${file.destination || ''}`.toLocaleLowerCase().includes(query))
      );
      filtered.sort((a, b) => Number(direction.value) * sorters[sort.value](a, b) || sorters.name(a, b));

      selected = [];
      remove.disabled = true;
      remove.textContent = t('cleanup_delete');
      if (!filtered.length) {
        list.innerHTML = `<p>${t(files.length ? 'cleanup_no_matches' : 'cleanup_empty')}</p>`;
        return;
      }

      const start = pageIndex * PAGE_SIZE;
      const visible = filtered.slice(start, start + PAGE_SIZE);
      list.innerHTML = `
        <div class="table-container">
          <table class="table">
            <thead><tr>
              <th><input type="checkbox" id="encoding-select-all" aria-label="${t('cleanup_select_page')}"></th>
              <th>${t('name')}</th><th>${t('size')}</th><th>${t('cleanup_modified')}</th>
              <th>${t('cleanup_status')}</th><th>${t('cleanup_destination')}</th>
            </tr></thead>
            <tbody>${visible.map((file, index) => `
              <tr ${file.token ? 'class="cleanup-selectable"' : ''}>
                <td>${file.token ? `<input type="checkbox" data-file="${index}" aria-label="${escapeHtml(file.relative)}">` : ''}</td>
                <td style="overflow-wrap: anywhere">${escapeHtml(file.relative)}</td>
                <td>${formatSize(file.size)}</td>
                <td>${t('cleanup_age').replace('{age}', escapeHtml(formatDuration((Date.now() - file.modified) / 1000)))}</td>
                <td>${t(`cleanup_${file.status}`)}</td>
                <td style="overflow-wrap: anywhere">${escapeHtml(file.app || '')} ${escapeHtml(file.destination || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button class="pagination-btn" id="encoding-prev" ${pageIndex === 0 ? 'disabled' : ''}>${t('cleanup_prev')}</button>
          <span class="pagination-info">${start + 1}–${start + visible.length} / ${filtered.length}</span>
          <button class="pagination-btn" id="encoding-next" ${start + visible.length >= filtered.length ? 'disabled' : ''}>${t('cleanup_next')}</button>
        </div>`;

      const boxes = [...list.querySelectorAll('[data-file]')];
      const selectAll = list.querySelector('#encoding-select-all');
      selectAll.disabled = !boxes.length;
      const updateSelection = () => {
        selected = boxes.filter(box => box.checked).map(box => visible[Number(box.dataset.file)]);
        remove.disabled = !selected.length;
        remove.textContent = selected.length ? `${t('cleanup_delete')} (${selected.length})` : t('cleanup_delete');
        selectAll.checked = boxes.length > 0 && selected.length === boxes.length;
        selectAll.indeterminate = selected.length > 0 && !selectAll.checked;
        boxes.forEach(box => box.closest('tr').classList.toggle('cleanup-selected', box.checked));
      };
      for (const box of boxes) {
        box.onchange = updateSelection;
        box.closest('tr').onclick = event => {
          if (event.target !== box && !window.getSelection()?.toString()) box.click();
        };
      }
      selectAll.onchange = () => {
        boxes.forEach(box => { box.checked = selectAll.checked; });
        updateSelection();
      };
      list.querySelector('#encoding-prev').onclick = () => { pageIndex--; renderList(); };
      list.querySelector('#encoding-next').onclick = () => { pageIndex++; renderList(); };
    };

    const resetPage = () => { pageIndex = 0; renderList(); };
    search.oninput = resetPage;
    [status, app, sort, direction].forEach(control => { control.onchange = resetPage; });
    renderList();
    remove.onclick = () => {
      const chosen = selected;
      const total = formatSize(chosen.reduce((sum, file) => sum + file.size, 0));
      const { close, overlay } = showModal({
        title: t('cleanup_delete'),
        closeOnOutsideClick: false,
        content: `<p>${t('cleanup_confirm')} (${chosen.length}, ${total})</p>
          <ul class="cleanup-terminal" tabindex="0" aria-label="${t('cleanup_delete')}">${chosen.map(file => `
            <li><span>${escapeHtml(file.relative)}</span><span>→ ${escapeHtml(file.destination)}</span></li>
          `).join('')}</ul>
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
