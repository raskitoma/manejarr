import { Router } from 'express';
import { getEventLogs, getRunLogs, clearAllLogs } from '../db/database.js';

const router = Router();

/**
 * GET /api/logs/events
 * Query event logs with filtering and pagination.
 */
router.get('/events', (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      level,
      category,
      runId,
      startDate,
      endDate,
    } = req.query;

    const result = getEventLogs({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      level,
      category,
      runId: runId ? parseInt(runId, 10) : undefined,
      startDate,
      endDate,
    });

    // Parse metadata JSON for each row
    result.rows = result.rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/logs/runs
 * Query run logs with pagination.
 */
router.get('/runs', (req, res) => {
  try {
    const { page = 1, pageSize = 20, runType, status } = req.query;
    
    const result = getRunLogs({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      runType,
      status,
    });

    // Parse summary JSON for each row
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
 * DELETE /api/logs/clear
 * Clear all event logs and run logs.
 */
router.delete('/clear', (req, res) => {
  try {
    clearAllLogs();
    res.json({ success: true, message: 'All logs cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias for backwards compatibility with UI before refresh
router.get('/', (req, res) => {
  res.redirect(301, '/api/logs/events' + req.url.substring(1));
});

export default router;
