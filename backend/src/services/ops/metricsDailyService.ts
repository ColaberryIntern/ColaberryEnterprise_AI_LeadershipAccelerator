/**
 * metricsDailyService — nightly rollup of ops_approval_queue + sync
 * stats into the pre-aggregated ops_metrics_daily table.
 *
 * Runs at 23:55 local each day (cron in server.ts) and also on demand
 * via POST /api/admin/ops/metrics/rollup.
 *
 * v0 fills only the fields we have signal for: approvals_completed,
 * approvals_open_at_end, approvals_avg_seconds, downstream_unblocked
 * (placeholder 0 until Phase 2). hours_saved estimated from
 * approvals_completed * 0.25 (15 min saved per decision is the
 * conservative starting estimate). Other columns stay 0 until we
 * have the upstream signal wired.
 */
import { sequelize } from '../../config/database';
import OpsMetricsDaily from '../../models/OpsMetricsDaily';
import { QueryTypes } from 'sequelize';

const HOURS_SAVED_PER_DECISION = 0.25; // 15 min

export interface RollupResult {
  date: string;
  approvals_completed: number;
  approvals_open_at_end: number;
  approvals_avg_seconds: number | null;
  hours_saved_estimated: number;
}

export async function rollupMetricsForDate(dateIso: string): Promise<RollupResult> {
  // dateIso = 'YYYY-MM-DD' (local). Bound the query to that calendar day.
  const dayStart = `${dateIso}T00:00:00Z`;
  const dayEnd = `${dateIso}T23:59:59.999Z`;

  const rows = await sequelize.query<{
    approvals_completed: string;
    approvals_avg_seconds: string | null;
  }>(
    `SELECT COUNT(*)::text AS approvals_completed,
            CASE WHEN COUNT(*) > 0
                 THEN AVG(EXTRACT(EPOCH FROM (decided_at - enqueued_at)))::int::text
                 ELSE NULL
            END AS approvals_avg_seconds
       FROM ops_approval_queue
      WHERE decided_at IS NOT NULL
        AND decided_at BETWEEN :day_start AND :day_end`,
    {
      type: QueryTypes.SELECT,
      replacements: { day_start: dayStart, day_end: dayEnd },
    },
  );
  const stats = rows[0];

  // open_at_end = approvals not decided as of end-of-day (rare in v0 since
  // we lazy-create on decide, but counts queue items enqueued today that
  // never got decided)
  const openRows = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM ops_approval_queue
      WHERE decided_at IS NULL
        AND enqueued_at <= :day_end`,
    { type: QueryTypes.SELECT, replacements: { day_end: dayEnd } },
  );

  const approvalsCompleted = parseInt(stats.approvals_completed, 10);
  const approvalsAvgSeconds = stats.approvals_avg_seconds ? parseInt(stats.approvals_avg_seconds, 10) : null;
  const approvalsOpenAtEnd = parseInt(openRows[0].count, 10);
  const hoursSaved = approvalsCompleted * HOURS_SAVED_PER_DECISION;

  await OpsMetricsDaily.upsert({
    date: dateIso,
    approvals_completed: approvalsCompleted,
    approvals_open_at_end: approvalsOpenAtEnd,
    approvals_avg_seconds: approvalsAvgSeconds,
    approvals_p95_seconds: null,
    downstream_unblocked: 0,
    hours_saved_estimated: hoursSaved,
    hours_blocked_estimated: 0,
    revenue_at_risk_estimated: null,
    revenue_protected_estimated: null,
    meetings_eliminated: 0,
    skills_created: 0,
    skills_used: 0,
    automations_fired: 0,
    agent_calls_count: 0,
    agent_total_cost_usd: 0,
  } as any);

  return {
    date: dateIso,
    approvals_completed: approvalsCompleted,
    approvals_open_at_end: approvalsOpenAtEnd,
    approvals_avg_seconds: approvalsAvgSeconds,
    hours_saved_estimated: hoursSaved,
  };
}

/**
 * Roll up today (live, for the dashboard tile). Idempotent.
 */
export async function rollupToday(): Promise<RollupResult> {
  const today = new Date().toISOString().slice(0, 10);
  return rollupMetricsForDate(today);
}
