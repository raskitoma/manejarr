/**
 * Telegram Notification Agent
 *
 * Sends run summary notifications via a Telegram Bot.
 * Uses the Telegram Bot API (HTTPS) — no external library needed.
 */

/**
 * Send a Telegram message.
 *
 * @param {Object} config - Telegram configuration
 * @param {string} config.botToken - Bot API token (e.g., "123456:ABC-DEF...")
 * @param {string} config.chatId - Chat/channel ID or "channelId/topicId" for topic-based channels
 * @param {string} message - Message text (supports Markdown)
 */
export async function sendTelegram(config, message) {
  const { botToken, chatId } = config;

  if (!botToken || !chatId) {
    throw new Error('Telegram notification not configured: missing bot token or chat ID');
  }

  // Parse chatId for topic support: "channelId/topicId" or full URL "https://t.me/c/12345/67"
  let targetChatId = chatId.trim();
  let messageThreadId = null;

  // Handle direct URL paste
  if (targetChatId.includes('t.me/c/')) {
    const parts = targetChatId.split('t.me/c/')[1].split('/');
    targetChatId = parts[0];
    if (parts.length > 1 && parts[1]) {
      messageThreadId = parseInt(parts[1], 10);
    }
  } else if (targetChatId.includes('/')) {
    // Handle manual "channelId/topicId"
    const parts = targetChatId.split('/');
    targetChatId = parts[0];
    if (parts.length > 1 && parts[1]) {
      messageThreadId = parseInt(parts[1], 10);
    }
  }

  // Telegram supergroup IDs extracted from links are missing the "-100" prefix
  if (!targetChatId.startsWith('-') && /^\d{8,}$/.test(targetChatId)) {
    targetChatId = `-100${targetChatId}`;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body = {
    chat_id: targetChatId,
    text: message,
    parse_mode: 'Markdown',
  };

  if (messageThreadId) {
    body.message_thread_id = messageThreadId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
  }

  return { success: true, messageId: data.result?.message_id };
}

/**
 * Test Telegram bot connectivity.
 */
export async function testTelegram(botToken) {
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Telegram bot test failed: ${data.description}`);
  }

  return { success: true, botName: data.result.username };
}

/**
 * Format a run summary for Telegram (Markdown).
 */
export function formatTelegramMessage(summary) {
  const runType = summary.runType || 'manual';
  const runLabel = runType === 'scheduled' ? '⏰ *Scheduled Run*' : runType === 'dry-run' ? '👁 *Dry Run*' : '▶ *On-Demand Run*';

  let msg = `🦜 *Manejarr Run Report*\n`;
  msg += `${runLabel}\n`;
  msg += `📅 ${new Date().toLocaleString()} (Server TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone})\n\n`;

  if (summary.phase1) {
    msg += `*Phase 1 — Verification*\n`;
    msg += `├ Processed: \`${summary.phase1.processed}\`\n`;
    msg += `├ Matched: \`${summary.phase1.matched}\`\n`;
    msg += `├ Unmatched: \`${summary.phase1.unmatched}\`\n`;
    msg += `├ Relabeled: \`${summary.phase1.relabeled}\`\n`;
    msg += `└ Errors: \`${summary.phase1.errors}\`\n\n`;
  }

  if (summary.phase2) {
    msg += `*Phase 2 — Retention*\n`;
    msg += `├ Processed: \`${summary.phase2.processed}\`\n`;
    msg += `├ Transitioned: \`${summary.phase2.transitioned}\`\n`;
    msg += `├ Retained: \`${summary.phase2.retained}\`\n`;
    msg += `└ Errors: \`${summary.phase2.errors}\`\n\n`;
  }

  if (summary.totals) {
    const status = summary.totals.errors > 0 ? '⚠️' : '✅';
    msg += `${status} *Total:* \`${summary.totals.processed}\` processed, \`${summary.totals.actions}\` actions, \`${summary.totals.errors}\` errors`;
  }

  // Collect moved torrents
  const ignoreTorrents = [];
  const forDeletionTorrents = [];
  const unmatchedTorrents = [];

  if (summary.phase1?.details) {
    ignoreTorrents.push(...summary.phase1.details
      .filter(d => d.action === 'processed' || d.action === 'would_process')
      .map(d => d.name));
      
    unmatchedTorrents.push(...summary.phase1.details
      .filter(d => d.action === 'unmatched')
      .map(d => d.name));
  }
  if (summary.phase2?.details) {
    forDeletionTorrents.push(...summary.phase2.details
      .filter(d => d.action === 'transitioned' || d.action === 'would_transition')
      .map(d => d.name));
  }

  if (ignoreTorrents.length > 0 || forDeletionTorrents.length > 0 || unmatchedTorrents.length > 0) {
    let listStr = `\n\n*Torrents Breakdown:*\n`;
    let listItems = '';
    
    if (ignoreTorrents.length > 0) {
      listItems += `\n_Moved to 'ignore' (${ignoreTorrents.length}):_\n` + ignoreTorrents.map(t => `• \`${t}\``).join('\n') + '\n';
    }
    if (forDeletionTorrents.length > 0) {
      listItems += `\n_Moved to 'fordeletion' (${forDeletionTorrents.length}):_\n` + forDeletionTorrents.map(t => `• \`${t}\``).join('\n') + '\n';
    }
    if (unmatchedTorrents.length > 0) {
      listItems += `\n_Unmatched (${unmatchedTorrents.length}):_\n` + unmatchedTorrents.map(t => `• \`${t}\``).join('\n') + '\n';
    }
    
    // Check length for Telegram (limit is 4096, using 4000 as safe threshold)
    if (msg.length + listStr.length + listItems.length > 4000) {
      const maxLen = 4000 - msg.length - listStr.length - 100;
      if (maxLen > 0) {
        msg += listStr + listItems.substring(0, maxLen) + '\n_... (list truncated)_';
      } else {
        const total = ignoreTorrents.length + forDeletionTorrents.length + unmatchedTorrents.length;
        msg += `\n\n*Torrents Breakdown (${total})* _(list too long for Telegram)_`;
      }
    } else {
      msg += listStr + listItems;
    }
  }

  return msg;
}
