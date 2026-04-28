/**
 * Email Notification Agent (SMTP)
 *
 * Sends run summary notifications via SMTP email.
 * Uses Node's built-in capabilities — no external mail library needed.
 * We implement a minimal SMTP client using net/tls sockets.
 */

import { createConnection } from 'net';
import { connect as tlsConnect } from 'tls';

/**
 * Send an email notification via SMTP.
 *
 * @param {Object} config - SMTP configuration
 * @param {string} config.host - SMTP server hostname
 * @param {number} config.port - SMTP server port (587 for STARTTLS, 465 for SSL, 25 for plain)
 * @param {string} config.username - SMTP username
 * @param {string} config.password - SMTP password
 * @param {string} config.from - Sender email address
 * @param {string} config.to - Recipient email address(es), comma-separated
 * @param {string} subject - Email subject
 * @param {string} body - Email body (plain text)
 */
export async function sendEmail(config, subject, body) {
  const { host, port, username, password, from, to } = config;

  if (!host || !from || !to) {
    throw new Error('Email notification not configured: missing host, from, or to');
  }

  // Use nodemailer-like approach with raw fetch to an SMTP relay
  // For simplicity and reliability, we'll use a minimal HTTP-based approach
  // by constructing the email via SMTP socket commands

  return new Promise((resolve, reject) => {
    const smtpPort = parseInt(port, 10) || 587;
    const useSSL = smtpPort === 465;

    let socket;
    let responseBuffer = '';
    let commandQueue = [];
    let currentResolve = null;

    function sendCommand(cmd) {
      return new Promise((res) => {
        currentResolve = res;
        socket.write(cmd + '\r\n');
      });
    }

    function onData(data) {
      responseBuffer += data.toString();
      const lines = responseBuffer.split('\r\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        // Multi-line responses have '-' after code, final has space
        if (line.length >= 4 && line[3] === '-') continue;

        if (currentResolve) {
          const code = parseInt(line.substring(0, 3), 10);
          const resolve = currentResolve;
          currentResolve = null;
          resolve({ code, message: line });
        }
      }
      responseBuffer = lines[lines.length - 1];
    }

    async function runSmtp() {
      try {
        // Wait for greeting
        await new Promise((res) => { currentResolve = res; });

        await sendCommand(`EHLO manejarr`);

        // STARTTLS for port 587
        if (smtpPort === 587) {
          const starttls = await sendCommand('STARTTLS');
          if (starttls.code === 220) {
            // Upgrade to TLS
            await new Promise((res, rej) => {
              const tlsSocket = tlsConnect({ socket, servername: host }, () => {
                socket = tlsSocket;
                socket.on('data', onData);
                res();
              });
              tlsSocket.on('error', rej);
            });
            await sendCommand(`EHLO manejarr`);
          }
        }

        // Auth
        if (username && password) {
          await sendCommand('AUTH LOGIN');
          await sendCommand(Buffer.from(username).toString('base64'));
          const authResult = await sendCommand(Buffer.from(password).toString('base64'));
          if (authResult.code !== 235) {
            throw new Error(`SMTP auth failed: ${authResult.message}`);
          }
        }

        // Send email
        await sendCommand(`MAIL FROM:<${from}>`);

        const recipients = to.split(',').map(r => r.trim());
        for (const recipient of recipients) {
          await sendCommand(`RCPT TO:<${recipient}>`);
        }

        await sendCommand('DATA');

        const emailContent = [
          `From: Manejarr <${from}>`,
          `To: ${to}`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=utf-8`,
          `X-Mailer: Manejarr/1.0`,
          `Date: ${new Date().toUTCString()}`,
          '',
          body,
          '',
          '.',
        ].join('\r\n');

        const dataResult = await sendCommand(emailContent);
        await sendCommand('QUIT');

        socket.end();
        resolve({ success: true });

      } catch (err) {
        socket.destroy();
        reject(err);
      }
    }

    // Create connection
    if (useSSL) {
      socket = tlsConnect({ host, port: smtpPort }, () => {
        socket.on('data', onData);
        runSmtp();
      });
    } else {
      socket = createConnection({ host, port: smtpPort }, () => {
        socket.on('data', onData);
        runSmtp();
      });
    }

    socket.on('error', reject);
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });
  });
}

/**
 * Format a run summary for email.
 */
export function formatEmailBody(summary) {
  const runType = summary.runType || 'manual';
  const runLabel = runType === 'scheduled' ? '⏰ Scheduled Run' : runType === 'dry-run' ? '👁 Dry Run' : '▶ On-Demand Run';

  let body = `═══ Manejarr Run Report ═══\n`;
  body += `Type: ${runLabel}\n`;
  body += `Time: ${new Date().toLocaleString()} (Server TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone})\n\n`;

  if (summary.phase1) {
    body += `── Phase 1: Verification & Monitoring ──\n`;
    body += `  Processed: ${summary.phase1.processed}\n`;
    body += `  Matched: ${summary.phase1.matched}\n`;
    body += `  Unmatched: ${summary.phase1.unmatched}\n`;
    body += `  Relabeled: ${summary.phase1.relabeled}\n`;
    body += `  Errors: ${summary.phase1.errors}\n\n`;
  }

  if (summary.phase2) {
    body += `── Phase 2: Retention & Cleanup ──\n`;
    body += `  Processed: ${summary.phase2.processed}\n`;
    body += `  Transitioned: ${summary.phase2.transitioned}\n`;
    body += `  Retained: ${summary.phase2.retained}\n`;
    body += `  Errors: ${summary.phase2.errors}\n\n`;
  }

  if (summary.totals) {
    body += `── Totals ──\n`;
    body += `  Total Processed: ${summary.totals.processed}\n`;
    body += `  Total Actions: ${summary.totals.actions}\n`;
    body += `  Total Errors: ${summary.totals.errors}\n`;
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
    body += `\nTorrents Breakdown:\n`;
    if (ignoreTorrents.length > 0) {
      body += `\n  Moved to 'ignore' (${ignoreTorrents.length}):\n`;
      body += ignoreTorrents.map(t => `    - ${t}`).join('\n') + '\n';
    }
    if (forDeletionTorrents.length > 0) {
      body += `\n  Moved to 'fordeletion' (${forDeletionTorrents.length}):\n`;
      body += forDeletionTorrents.map(t => `    - ${t}`).join('\n') + '\n';
    }
    if (unmatchedTorrents.length > 0) {
      body += `\n  Unmatched (${unmatchedTorrents.length}):\n`;
      body += unmatchedTorrents.map(t => `    - ${t}`).join('\n') + '\n';
    }
  }

  body += `\n— Manejarr`;
  return body;
}
