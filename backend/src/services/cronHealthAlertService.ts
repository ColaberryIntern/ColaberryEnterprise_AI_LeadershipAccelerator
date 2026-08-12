/**
 * Cron Job Health Alerting — BC #10099862873 (P0, item 3).
 *
 * Extends alerting beyond the single scheduler-heartbeat special case in
 * systemHealthService.ts to all cron-triggered AiAgent registry entries,
 * using run/error data instrumentCronJob() (schedulerService.ts) already
 * collects — no new tracking, just a periodic evaluator over existing data.
 *
 * Two independent detectors, either or both may fire per agent per run:
 *   - error-rate spike: >= 50% of the last handful of runs failed
 *   - missed-run: last run is more than N× the cron's own expected interval
 */
import AiAgent from '../models/AiAgent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import { emitAlert } from './alertService';
import { calculateExpectedIntervalMs } from '../utils/cronNextRun';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CronRunSample {
  result: 'success' | 'failed' | 'skipped' | 'pending';
}

export interface CronJobHealthAlert {
  type: 'warning' | 'critical';
  severity: number;
  title: string;
  description: string;
  metadata: Record<string, any>;
}

export interface CronJobHealthInput {
  agentName: string;
  schedule: string | null;
  lastRunAt: Date | null;
  /** Most-recent-first, capped to RECENT_RUN_SAMPLE_SIZE by the caller. */
  recentRuns: CronRunSample[];
  now: Date;
  /** AiAgent.last_error — included in error-rate-spike alerts so the alert itself carries a concrete example, not just a count. */
  lastError: string | null;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────
// Starting defaults per Ali's decision on BC #10095928858 comment 2026-07-15 —
// Kes's discretion, tuned conservatively to avoid noise.

const RECENT_RUN_SAMPLE_SIZE = 10;
const MIN_SAMPLE_SIZE = 5;
const ERROR_RATE_WARNING_PERCENT = 50;
const ERROR_RATE_CRITICAL_PERCENT = 80;
const MISSED_RUN_WARNING_MULTIPLIER = 2;
const MISSED_RUN_CRITICAL_MULTIPLIER = 4;

// ─── Pure Evaluator ─────────────────────────────────────────────────────────

/** Pure function — no I/O — so every threshold branch is unit-testable directly. */
export function evaluateCronJobHealth(input: CronJobHealthInput): CronJobHealthAlert[] {
  const alerts: CronJobHealthAlert[] = [];

  if (input.recentRuns.length >= MIN_SAMPLE_SIZE) {
    const total = input.recentRuns.length;
    const failed = input.recentRuns.filter((r) => r.result === 'failed').length;
    const errorRate = Math.round((failed / total) * 100);

    if (errorRate >= ERROR_RATE_CRITICAL_PERCENT) {
      alerts.push({
        type: 'critical',
        severity: 5,
        title: `Cron Job Error Spike: ${input.agentName}`,
        description:
          `"${input.agentName}" has failed ${failed}/${total} (${errorRate}%) of its last ${total} runs. ` +
          'Whatever this job maintains is no longer being kept up to date — treat as effectively stopped.' +
          (input.lastError ? ` Last error: ${input.lastError}` : ''),
        metadata: { agent_name: input.agentName, error_rate: errorRate, failed, total, last_error: input.lastError },
      });
    } else if (errorRate >= ERROR_RATE_WARNING_PERCENT) {
      alerts.push({
        type: 'warning',
        severity: 3,
        title: `Cron Job Error Spike: ${input.agentName}`,
        description:
          `"${input.agentName}" has failed ${failed}/${total} (${errorRate}%) of its last ${total} runs — ` +
          `above the ${ERROR_RATE_WARNING_PERCENT}% noise threshold.` +
          (input.lastError ? ` Last error: ${input.lastError}` : ''),
        metadata: { agent_name: input.agentName, error_rate: errorRate, failed, total, last_error: input.lastError },
      });
    }
  }

  if (input.schedule && input.lastRunAt) {
    const expectedIntervalMs = calculateExpectedIntervalMs(input.schedule);
    if (expectedIntervalMs) {
      const overdueMs = input.now.getTime() - input.lastRunAt.getTime();
      const overdueMultiplier = overdueMs / expectedIntervalMs;
      const expectedMin = Math.round(expectedIntervalMs / 60000);
      const overdueMin = Math.round(overdueMs / 60000);

      if (overdueMultiplier >= MISSED_RUN_CRITICAL_MULTIPLIER) {
        alerts.push({
          type: 'critical',
          severity: 5,
          title: `Cron Job Missed Runs: ${input.agentName}`,
          description:
            `"${input.agentName}" was expected to run roughly every ${expectedMin}m but last ran ${overdueMin}m ago ` +
            `(~${overdueMultiplier.toFixed(1)}x overdue). It has likely stopped running entirely.`,
          metadata: {
            agent_name: input.agentName,
            expected_interval_ms: expectedIntervalMs,
            overdue_ms: overdueMs,
            overdue_multiplier: Number(overdueMultiplier.toFixed(2)),
          },
        });
      } else if (overdueMultiplier >= MISSED_RUN_WARNING_MULTIPLIER) {
        alerts.push({
          type: 'warning',
          severity: 3,
          title: `Cron Job Missed Runs: ${input.agentName}`,
          description:
            `"${input.agentName}" was expected to run roughly every ${expectedMin}m but last ran ${overdueMin}m ago ` +
            `(~${overdueMultiplier.toFixed(1)}x overdue).`,
          metadata: {
            agent_name: input.agentName,
            expected_interval_ms: expectedIntervalMs,
            overdue_ms: overdueMs,
            overdue_multiplier: Number(overdueMultiplier.toFixed(2)),
          },
        });
      }
    }
  }

  return alerts;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Evaluate every enabled cron-triggered agent and emit alerts for any that
 * are error-spiking or overdue. Called on a schedule from schedulerService.ts.
 * A failure evaluating or alerting for one agent must not block the rest.
 */
export async function checkAllCronJobHealth(): Promise<void> {
  const agents = await AiAgent.findAll({
    where: { trigger_type: 'cron', enabled: true },
  });

  const now = new Date();

  for (const agent of agents) {
    try {
      const recentLogs = await AiAgentActivityLog.findAll({
        where: { agent_id: agent.id },
        order: [['created_at', 'DESC']],
        limit: RECENT_RUN_SAMPLE_SIZE,
        attributes: ['result'],
        raw: true,
      });

      const alerts = evaluateCronJobHealth({
        agentName: agent.agent_name,
        schedule: agent.schedule || null,
        lastRunAt: agent.last_run_at || null,
        recentRuns: (recentLogs as unknown as CronRunSample[]),
        now,
        lastError: agent.last_error || null,
      });

      for (const alert of alerts) {
        await emitAlert({
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          sourceType: 'system',
          sourceAgentId: agent.id,
          impactArea: 'scheduled_jobs',
          urgency: alert.type === 'critical' ? 'immediate' : 'medium',
          metadata: alert.metadata,
        });
      }
    } catch (err: any) {
      console.error(`[CronHealthAlert] Failed evaluating ${agent.agent_name}: ${err.message}`);
    }
  }
}
