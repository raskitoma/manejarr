/**
 * Formatting Utilities
 *
 * Human-readable formatters for dates, sizes, durations, and ratios.
 */

/**
 * Format bytes to human-readable size.
 */
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format seconds to human-readable duration.
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);

  return parts.join(' ') || '< 1m';
}

/**
 * Format a ratio number.
 */
export function formatRatio(ratio) {
  if (ratio === undefined || ratio === null) return '—';
  return ratio.toFixed(2);
}

/**
 * Format a Unix timestamp to a readable date string.
 */
export function formatDate(timestamp) {
  if (!timestamp) return '—';

  // Handle both Unix timestamps (seconds) and ISO strings
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  if (isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a timestamp to a readable date+time string.
 */
export function formatDateTime(timestamp) {
  if (!timestamp) return '—';

  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  if (isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a relative time (e.g., "3 hours ago").
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '—';

  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);

  if (isNaN(date.getTime())) return '—';

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Format a cron expression to a human-readable string.
 */
export function formatCron(cronExpr) {
  if (!cronExpr) return '—';

  const presets = {
    '0 */6 * * *': 'Every 6 hours',
    '0 */12 * * *': 'Every 12 hours',
    '0 0 * * *': 'Daily at midnight',
    '0 2 * * *': 'Daily at 2:00 AM',
    '0 0 */2 * *': 'Every 2 days',
    '0 0 * * 0': 'Weekly (Sunday)',
    '0 0 * * 1': 'Weekly (Monday)',
  };

  return presets[cronExpr] || cronExpr;
}

/**
 * Format speed (bytes/s) to readable string.
 */
export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '—';
  return `${formatSize(bytesPerSec)}/s`;
}

/**
 * Get the badge class for a label.
 */
export function getLabelBadgeClass(label) {
  const map = {
    media: 'badge-media',
    ignore: 'badge-ignore',
    fordeletion: 'badge-fordeletion',
  };
  return map[label] || 'badge-info';
}

/**
 * Get the badge class for a log level.
 */
export function getLevelBadgeClass(level) {
  const map = {
    info: 'badge-info',
    warn: 'badge-warning',
    error: 'badge-error',
  };
  return map[level] || 'badge-info';
}
