import { Op } from 'sequelize';
import { sequelize } from '../../../config/database';

// Models loaded via require with try/catch since they may not be compiled yet
let SkoolTask: any;
let SkoolSignal: any;
let SkoolResponse: any;

try {
  SkoolTask = require('../../../models').SkoolTask;
  SkoolSignal = require('../../../models').SkoolSignal;
  SkoolResponse = require('../../../models').SkoolResponse;
} catch (err: any) {
  console.warn('[Skool][Supervisor] Failed to load models:', err.message);
}

const SKOOL_DAILY_LIMIT = parseInt(process.env.SKOOL_DAILY_LIMIT || '10', 10);

/**
 * Skool Supervisor Agent
 *
 * Queue management and health monitoring for the Skool engagement pipeline.
 * Handles stuck tasks, expired signals, failed task retries, and cleanup.
 */
export async function runSkoolSupervisor(): Promise<{ cleaned: number }> {
  let cleaned = 0;

  if (!SkoolTask || !SkoolSignal || !SkoolResponse) {
    console.error('[Skool][Supervisor] Models not available, skipping run');
    return { cleaned };
  }

  console.log('[Skool][Supervisor] Starting supervisor run...');

  // 1. Cancel stuck tasks: status='running' and started_at > 10 minutes ago
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  try {
    const [stuckCount] = await SkoolTask.update(
      {
        status: 'failed',
        error_message: 'Supervisor: stuck task timed out (running > 10 min)',
        completed_at: new Date(),
      },
      {
        where: {
          status: 'running',
          started_at: { [Op.lt]: tenMinutesAgo },
        },
      },
    );
    if (stuckCount > 0) {
      console.log(`[Skool][Supervisor] Cancelled ${stuckCount} stuck task(s)`);
      cleaned += stuckCount;
    }
  } catch (err: any) {
    console.error('[Skool][Supervisor] Error cancelling stuck tasks:', err.message);
  }

  // 2. Expire old signals: status='new' and created_at > 48h ago
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  try {
    const [expiredCount] = await SkoolSignal.update(
      { status: 'expired' },
      {
        where: {
          status: 'new',
          created_at: { [Op.lt]: fortyEightHoursAgo },
        },
      },
    );
    if (expiredCount > 0) {
      console.log(`[Skool][Supervisor] Expired ${expiredCount} old signal(s)`);
      cleaned += expiredCount;
    }
  } catch (err: any) {
    console.error('[Skool][Supervisor] Error expiring old signals:', err.message);
  }

  // 3. Check daily limit using America/Chicago day boundary
  try {
    const [{ count: todayCountRaw }] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM skool_responses
       WHERE posted_at IS NOT NULL
         AND posted_at AT TIME ZONE 'America/Chicago' >= DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Chicago')`,
      { type: 'SELECT' as any }
    ) as any;
    const todayCount = Number(todayCountRaw) || 0;
    if (todayCount >= SKOOL_DAILY_LIMIT) {
      console.warn(`[Skool][Supervisor] WARNING: Daily post limit reached (${todayCount}/${SKOOL_DAILY_LIMIT})`);
    } else {
      console.log(`[Skool][Supervisor] Daily post count: ${todayCount}/${SKOOL_DAILY_LIMIT}`);
    }
  } catch (err: any) {
    console.error('[Skool][Supervisor] Error checking daily limit:', err.message);
  }

  // 4. Retry failed tasks: status='failed' and attempts < max_attempts
  try {
    const failedTasks = await SkoolTask.findAll({
      where: {
        status: 'failed',
      },
    });

    let retried = 0;
    for (const task of failedTasks) {
      const attempts = task.attempts || 0;
      const maxAttempts = task.max_attempts || 3;
      if (attempts < maxAttempts) {
        await task.update({
          status: 'pending',
          error_message: null,
          started_at: null,
          completed_at: null,
        });
        retried++;
      }
    }
    if (retried > 0) {
      console.log(`[Skool][Supervisor] Retried ${retried} failed task(s)`);
      cleaned += retried;
    }
  } catch (err: any) {
    console.error('[Skool][Supervisor] Error retrying failed tasks:', err.message);
  }

  // 5. Clean up: delete completed tasks older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const deletedCount = await SkoolTask.destroy({
      where: {
        status: 'completed',
        created_at: { [Op.lt]: sevenDaysAgo },
      },
    });
    if (deletedCount > 0) {
      console.log(`[Skool][Supervisor] Cleaned up ${deletedCount} old completed task(s)`);
      cleaned += deletedCount;
    }
  } catch (err: any) {
    console.error('[Skool][Supervisor] Error cleaning up old tasks:', err.message);
  }

  // 6. Log summary
  console.log(`[Skool][Supervisor] Run complete: ${cleaned} total items cleaned/updated`);
  return { cleaned };
}
