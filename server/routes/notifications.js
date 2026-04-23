import { Router } from 'express';
import { sendTestNotification } from '../notifications/notifier.js';
import { testTelegram } from '../notifications/telegram.js';

const router = Router();

/**
 * POST /api/notifications/test
 * Send a test notification via a specific channel.
 * Body: { channel: 'email' | 'telegram' }
 */
router.post('/test', async (req, res) => {
  const { channel } = req.body;

  if (!channel || !['email', 'telegram'].includes(channel)) {
    return res.status(400).json({ error: 'Invalid channel. Use "email" or "telegram".' });
  }

  try {
    const result = await sendTestNotification(channel);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/test-telegram-bot
 * Test if a Telegram bot token is valid.
 * Body: { botToken: string }
 */
router.post('/test-telegram-bot', async (req, res) => {
  const { botToken } = req.body;

  if (!botToken) {
    return res.status(400).json({ error: 'Bot token is required' });
  }

  try {
    const result = await testTelegram(botToken);
    res.json({ success: true, botName: result.botName });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

export default router;
