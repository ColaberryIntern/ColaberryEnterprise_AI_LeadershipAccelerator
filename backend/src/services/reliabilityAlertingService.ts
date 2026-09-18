// ─── Reliability Alerting Service (TBI T002 / P1-5) ───────────────────────
// Rolling error-rate check over ai_events + a Mandrill alert to ali@colaberry.com
// when it crosses a documented threshold. Closes the Trust Command Center's
// "metrics-alerting" criterion (trustRubric.ts, Reliability dimension) — the
// `metrics` criterion there already covers p50/p95/error-rate *measurement*;
// this is the missing *alerting* half.
//
// Cooldown is in-memory (module-scope), matching this repo's existing precedent
// (schedulerService.ts's SystemHealthMonitor, systemAutoResponseService.ts) —
// logged as an assumption per CLAUDE.md's default resolution strategy (simplest,
// lowest blast radius); see deadLetterService.ts for the same reasoning.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { sendAlertEmail } from './emailService';

// Event types that are written ONLY when something fails: there is no success
// counterpart row for them, so they cannot form a meaningful rate. Counting them
// makes the "AI failure rate" climb with traffic volume no matter how healthy the
// AI pipeline actually is. These are auth/security telemetry that happens to share
// the ai_events table with real AI pipeline events.
//
// This is not hypothetical. On 2026-09-01 this alert paged at "94% AI event failure
// rate" while the real model-call failure rate over the same 24h was 0% (854 calls,
// zero failures). The entire signal was two abandoned admin browser tabs re-polling
// once a minute with an expired JWT, writing one admin_auth_failed row each time.
//
// MAINTENANCE RULE: if you add an event_type that is only ever logged on failure,
// add it here too, or it will silently poison this alert.
export const FAILURE_ONLY_EVENT_TYPES = [
  'admin_auth_failed',
  'participant_auth_failed',
  'sales_or_admin_auth_failed',
  'delivery_client_auth_failed',
  'delivery_client_link_no_membership',
];

const WINDOW_MINUTES = 15;
const MIN_SAMPLE_SIZE = 20; // below this, a single-digit failure count would swing the % wildly — skip alerting, not enough signal
const ERROR_RATE_THRESHOLD_PCT = 25;
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h, matches SystemHealthMonitor's precedent
const ALERT_RECIPIENT = 'ali@colaberry.com';

let lastAlertAt = 0;

export interface ReliabilityCheckResult {
  total: number;
  failures: number;
  errorRatePct: number;
  breached: boolean;
  alertSent: boolean;
  suppressedByCooldown: boolean;
  suppressedBySampleSize: boolean;
}

async function computeRollingErrorRate(): Promise<{ total: number; failures: number; errorRatePct: number }> {
  const rows = (await sequelize.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE outcome = 'failure')::int AS failures
     FROM ai_events
     WHERE created_at >= NOW() - INTERVAL '${WINDOW_MINUTES} minutes'
       AND event_type NOT IN (:failureOnlyEventTypes)`,
    { type: QueryTypes.SELECT, replacements: { failureOnlyEventTypes: FAILURE_ONLY_EVENT_TYPES } }
  )) as Array<{ total: number; failures: number }>;
  const r = rows[0] || { total: 0, failures: 0 };
  const errorRatePct = r.total > 0 ? Math.round((r.failures / r.total) * 100) : 0;
  return { total: r.total, failures: r.failures, errorRatePct };
}

export async function runReliabilityAlertCheck(): Promise<ReliabilityCheckResult> {
  const { total, failures, errorRatePct } = await computeRollingErrorRate();

  const result: ReliabilityCheckResult = {
    total,
    failures,
    errorRatePct,
    breached: false,
    alertSent: false,
    suppressedByCooldown: false,
    suppressedBySampleSize: false,
  };

  if (total < MIN_SAMPLE_SIZE) {
    result.suppressedBySampleSize = true;
    return result;
  }

  if (errorRatePct < ERROR_RATE_THRESHOLD_PCT) {
    return result;
  }

  result.breached = true;

  const sinceLastAlert = Date.now() - lastAlertAt;
  if (sinceLastAlert <= COOLDOWN_MS) {
    result.suppressedByCooldown = true;
    return result;
  }

  try {
    await sendAlertEmail(ALERT_RECIPIENT, {
      type: 'reliability_error_rate',
      severity: 8,
      title: `Reliability Alert: ${errorRatePct}% AI event failure rate (last ${WINDOW_MINUTES}m)`,
      description: `${failures} of ${total} AI pipeline events failed in the last ${WINDOW_MINUTES} minutes (threshold: ${ERROR_RATE_THRESHOLD_PCT}%). Auth/security telemetry is excluded from this rate.`,
      impact_area: 'AI Reliability',
      source_type: 'ReliabilityAlertingService',
      urgency: 'high',
      created_at: new Date(),
    });
    lastAlertAt = Date.now();
    result.alertSent = true;
  } catch (err: any) {
    console.error('[ReliabilityAlerting] Alert email failed:', { error_class: err?.constructor?.name || 'Error', message: err?.message });
  }

  return result;
}

/** Test-only: reset the in-memory cooldown clock between test cases. */
export function __resetCooldownForTests(): void {
  lastAlertAt = 0;
}
