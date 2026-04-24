import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { existsSync } from 'fs';
import { resolve } from 'path';
import config from './config.js';
import { initDatabase } from './db/database.js';
import { basicAuth } from './auth/middleware.js';
import apiRouter from './routes/api.js';
import { initScheduler } from './scheduler/cronManager.js';
import { startHealthMonitor } from './monitors/healthCheck.js';

const app = express();

// ── Security & Middleware ──
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for SPA
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(compression());
app.use(express.json());

// ── Health endpoint (no auth) ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Protected API routes ──
app.use('/api', basicAuth, apiRouter);

// ── Serve built frontend (production) ──
if (config.isProduction && existsSync(config.distDir)) {
  app.use(express.static(config.distDir));

  // SPA fallback — serve index.html for all non-API routes
  app.get('(.*)', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(resolve(config.distDir, 'index.html'));
    }
  });
}

// ── Start server ──
async function start() {
  try {
    // Initialize database
    await initDatabase();
    console.log(`[SERVER] Database ready`);

    // Initialize cron scheduler
    initScheduler();
    console.log(`[SERVER] Scheduler ready`);

    // Start connection health monitor (every 15 min)
    startHealthMonitor();
    console.log(`[SERVER] Health monitor ready`);

    // Start listening
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`[SERVER] Manejarr running on http://0.0.0.0:${config.port}`);
      console.log(`[SERVER] Environment: ${config.nodeEnv}`);
    });
  } catch (err) {
    console.error('[SERVER] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
