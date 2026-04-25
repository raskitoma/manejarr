/**
 * Cron Schedule Manager
 *
 * Manages in-process cron jobs using node-cron.
 * Loads schedules from the database on startup and dynamically
 * adds/removes/updates jobs as schedules are modified.
 */

import cron from 'node-cron';
import { getSchedules } from '../db/database.js';
import { runFull } from '../engine/orchestrator.js';
import { runMaintenance } from '../engine/maintenance.js';

// Active cron job instances keyed by schedule ID
const activeJobs = new Map();

/**
 * Initialize the cron manager by loading all enabled schedules from the database.
 */
export function initScheduler() {
  const schedules = getSchedules();

  for (const schedule of schedules) {
    if (schedule.enabled) {
      addCronJob(schedule.id, schedule.cron_expr, schedule.task_type);
    }
  }

  console.log(`[SCHEDULER] Initialized ${activeJobs.size} active schedule(s)`);
}

/**
 * Register a new cron job for a schedule.
 */
export function addCronJob(scheduleId, cronExpr, taskType = 'run') {
  // Remove existing job if any
  removeCronJob(scheduleId);

  // Validate cron expression
  if (!cron.validate(cronExpr)) {
    console.error(`[SCHEDULER] Invalid cron expression for schedule ${scheduleId}: ${cronExpr}`);
    return false;
  }

  const job = cron.schedule(cronExpr, async () => {
    console.log(`[SCHEDULER] Triggering scheduled task "${taskType}" (schedule ${scheduleId})`);

    try {
      if (taskType === 'compact') {
        await runMaintenance();
      } else {
        await runFull({ runType: 'scheduled' });
      }
    } catch (err) {
      console.error(`[SCHEDULER] Scheduled task "${taskType}" failed:`, err.message);
    }
  }, {
    timezone: process.env.TZ || 'UTC',
  });

  activeJobs.set(scheduleId, job);
  console.log(`[SCHEDULER] Registered cron job for schedule ${scheduleId}: ${cronExpr}`);
  return true;
}

/**
 * Remove a cron job for a schedule.
 */
export function removeCronJob(scheduleId) {
  const existing = activeJobs.get(scheduleId);
  if (existing) {
    existing.stop();
    activeJobs.delete(scheduleId);
    console.log(`[SCHEDULER] Removed cron job for schedule ${scheduleId}`);
  }
}

/**
 * Update a cron job (re-register with new expression or enable/disable).
 */
export function updateCronJob(scheduleId, cronExpr, enabled, taskType = 'run') {
  if (enabled) {
    addCronJob(scheduleId, cronExpr, taskType);
  } else {
    removeCronJob(scheduleId);
  }
}

/**
 * Get the number of active cron jobs.
 */
export function getActiveJobCount() {
  return activeJobs.size;
}
