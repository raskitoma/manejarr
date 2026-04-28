/**
 * Torrent Card Component
 */

import { formatSize, formatDuration, formatRatio, formatDate, getLabelBadgeClass } from '../utils/formatters.js';

export function renderTorrentRow(torrent) {
  const labelClass = getLabelBadgeClass(torrent.label);
  const managerClass = torrent.manager ? `badge-${torrent.manager.toLowerCase()}` : '';
  
  // Skip reason indicator
  const hasReason = torrent.reason && torrent.reason !== 'Criteria not met';
  const reasonHtml = hasReason ? `
    <div class="reason-indicator" title="${torrent.reason}">
      <span>i</span>
    </div>
  ` : '';

  // Metadata for hover
  const metadataAttr = torrent.metadata ? `data-metadata="${JSON.stringify(torrent.metadata).replace(/"/g, '&quot;')}"` : '';
  const managerAttr = torrent.manager ? `data-manager="${torrent.manager}"` : '';

  return `
    <tr data-hash="${torrent.hash}" ${metadataAttr} ${managerAttr}>
      <td class="text-primary-col">
        <div class="torrent-name-wrapper">
          <span class="torrent-name-text" title="${torrent.name}">${torrent.name}</span>
          ${reasonHtml}
        </div>
      </td>
      <td>
        <div class="manager-cell">
          ${torrent.manager 
            ? `<div class="manager-badge-container">
                 ${torrent.managerUrl 
                   ? `<a href="${torrent.managerUrl}" target="_blank" class="badge-link"><span class="badge ${managerClass}">${torrent.manager}</span></a>`
                   : `<span class="badge ${managerClass}">${torrent.manager}</span>`
                 }
                 <button class="btn-icon link-torrent-btn" data-hash="${torrent.hash}" data-name="${torrent.name.replace(/"/g, '&quot;')}" title="Rematch">
                   <span class="icon">🔄</span>
                 </button>
               </div>`
            : `<button class="btn btn-sm btn-secondary link-torrent-btn" data-hash="${torrent.hash}" data-name="${torrent.name.replace(/"/g, '&quot;')}">🔗 Link</button>`
          }
        </div>
      </td>
      <td><span class="badge ${labelClass}">${torrent.label || 'none'}</span></td>
      <td class="text-mono" data-val="${torrent.ratio}">${formatRatio(torrent.ratio)}</td>
      <td class="text-mono" data-val="${torrent.seedingTime}">${formatDuration(torrent.seedingTime)}</td>
      <td data-val="${torrent.totalSize}">${formatSize(torrent.totalSize)}</td>
      <td data-val="${torrent.timeAdded}">${formatDate(torrent.timeAdded)}</td>
      <td class="text-mono" style="max-width: 120px; overflow: hidden; text-overflow: ellipsis;" title="${torrent.trackerHost || ''}">${torrent.trackerHost || '—'}</td>
      <td><span class="badge badge-${torrent.state === 'Seeding' ? 'success' : torrent.state === 'Paused' ? 'warning' : 'info'}">${torrent.state || '—'}</span></td>
    </tr>
  `;
}
