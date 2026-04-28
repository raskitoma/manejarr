import { Router } from 'express';
import dashboardRouter from './dashboard.js';
import settingsRouter from './settings.js';
import schedulerRouter from './scheduler.js';
import runsRouter from './runs.js';
import logsRouter from './logs.js';
import { torrentsRouter } from './torrents.js';
import authRouter from './auth.js';

import jwt from 'jsonwebtoken';
import config from '../config.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/dashboard', dashboardRouter);
router.use('/settings', settingsRouter);
router.use('/schedules', schedulerRouter);
router.use('/', runsRouter);        // /api/run, /api/runs
router.use('/logs', logsRouter);
router.use('/torrents', torrentsRouter);

// Auth verification endpoint (auth required)
router.get('/verify', (req, res) => {
  // Generate a JWT to "upgrade" the Basic Auth session to a Bearer session
  // This prevents having to send 2FA codes with every request
  const token = jwt.sign(
    { username: req.user.username },
    config.encryptionKey,
    { expiresIn: '7d' }
  );
  
  res.json({ success: true, user: req.user, token });
});

export default router;
