/**
 * Status Indicator Component
 */

export function statusDot(connected, checking = false) {
  if (checking) return '<span class="status-dot status-dot-checking"></span>';
  return connected
    ? '<span class="status-dot status-dot-connected"></span>'
    : '<span class="status-dot status-dot-disconnected"></span>';
}
