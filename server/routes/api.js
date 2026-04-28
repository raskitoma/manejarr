import { Router } from 'express';
import dashboardRouter from './dashboard.js';
import settingsRouter from './settings.js';
import schedulerRouter from './scheduler.js';
import runsRouter from './runs.js';
import logsRouter from './logs.js';
import { torrentsRouter } from './torrents.js';
import authRouter from './auth.js';

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
  res.json({ success: true, user: req.user });
});

export default router;
