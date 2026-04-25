import { Router } from 'express';
import { runFull, getRunStatus } from '../engine/orchestrator.js';
import { getRunLogs, getRunLog } from '../db/database.js';

const router = Router();

/**
 * POST /api/run
 * Trigger a manual run of the full orchestration flow.
 * Body: { dryRun?: boolean }
 */
router.post('/run', async (req, res) => {
  const { dryRun = false } = req.body || {};

  try {
    // Check if already running
    const status = getRunStatus();
    if (status.running) {
      return res.status(409).json({
        error: 'A run is already in progress',
        runId: status.runId,
      });
    }

    // Start the run (non-blocking — send response immediately)
    const runPromise = runFull({
      dryRun,
      runType: dryRun ? 'dry-run' : 'manual',
    });

    // Return immediately with the run ID
    // The client can poll /api/run/status for progress
    res.json({
      started: true,
      runType: dryRun ? 'dry-run' : 'manual',
      message: `${dryRun ? 'Dry run' : 'Run'} started. Poll /api/run/status for progress.`,
    });

    // Let the run continue in the background
    runPromise.catch(err => {
      console.error('[RUN] Background run failed:', err.message);
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/run/status
 * Get current run status (running/idle).
 */
router.get('/run/status', (req, res) => {
  const status = getRunStatus();
  res.json(status);
});

/**
 * GET /api/runs
 * List run history with pagination.
 * Query: ?page=1&pageSize=20
 */
router.get('/runs', (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const { runType, status } = req.query;
    const result = getRunLogs({ page, pageSize, runType, status });

    // Parse JSON summary for each row
    result.rows = result.rows.map(row => ({
      ...row,
      summary: row.summary ? JSON.parse(row.summary) : null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/runs/:id
 * Get detailed run result.
 */
router.get('/runs/:id', (req, res) => {
  try {
    const run = getRunLog(parseInt(req.params.id, 10));

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    run.summary = run.summary ? JSON.parse(run.summary) : null;
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
