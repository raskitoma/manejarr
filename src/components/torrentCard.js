/**
 * Torrent Card Component
 */

import { formatSize, formatDuration, formatRatio, formatDate, getLabelBadgeClass } from '../utils/formatters.js';

export function renderTorrentRow(torrent) {
  const labelClass = getLabelBadgeClass(torrent.label);

  return `
    <tr>
      <td class="text-primary-col" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${torrent.name}">
        ${torrent.name}
      </td>
      <td><span class="badge ${labelClass}">${torrent.label || 'none'}</span></td>
      <td class="text-mono">${formatRatio(torrent.ratio)}</td>
      <td class="text-mono">${formatDuration(torrent.seedingTime)}</td>
      <td>${formatSize(torrent.totalSize)}</td>
      <td>${formatDate(torrent.timeAdded)}</td>
      <td class="text-mono" style="max-width: 120px; overflow: hidden; text-overflow: ellipsis;" title="${torrent.trackerHost || ''}">${torrent.trackerHost || '—'}</td>
      <td><span class="badge badge-${torrent.state === 'Seeding' ? 'success' : torrent.state === 'Paused' ? 'warning' : 'info'}">${torrent.state || '—'}</span></td>
    </tr>
  `;
}
