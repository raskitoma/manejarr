import { Router } from 'express';
import {
  getSchedules,
  getSchedule,
  insertSchedule,
  updateSchedule,
  deleteSchedule,
} from '../db/database.js';
import {
  addCronJob,
  removeCronJob,
  updateCronJob,
} from '../scheduler/cronManager.js';

const router = Router();

/**
 * GET /api/schedules
 * List all schedules.
 */
router.get('/', (req, res) => {
  try {
    const schedules = getSchedules();
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schedules
 * Create a new schedule.
 * Body: { name: string, cron_expr: string }
 */
router.post('/', (req, res) => {
  try {
    const { name, cron_expr, task_type = 'run' } = req.body;

    if (!name || !cron_expr) {
      return res.status(400).json({ error: 'Name and cron expression are required' });
    }

    const id = insertSchedule(name, cron_expr, task_type);

    // Register the cron job
    addCronJob(id, cron_expr, task_type);

    const schedule = getSchedule(id);
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/schedules/:id
 * Update a schedule.
 * Body: { name?, cron_expr?, enabled? }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const schedule = getSchedule(parseInt(id, 10));

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    updateSchedule(parseInt(id, 10), req.body);

    // Update the cron job
    const updated = getSchedule(parseInt(id, 10));
    updateCronJob(parseInt(id, 10), updated.cron_expr, updated.enabled, updated.task_type);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/schedules/:id
 * Delete a schedule.
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const schedule = getSchedule(parseInt(id, 10));

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Remove the cron job first
    removeCronJob(parseInt(id, 10));

    deleteSchedule(parseInt(id, 10));
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/schedules/:id/toggle
 * Enable or disable a schedule.
 * Body: { enabled: boolean }
 */
router.patch('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const schedule = getSchedule(parseInt(id, 10));
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    updateSchedule(parseInt(id, 10), { enabled });
    const updated = getSchedule(parseInt(id, 10));

    updateCronJob(parseInt(id, 10), updated.cron_expr, updated.enabled, updated.task_type);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
