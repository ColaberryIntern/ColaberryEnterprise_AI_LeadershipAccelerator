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

const WINDOW_MINUTES = 15;
const MIN_SAMPLE_SIZE = 20; // below this, a single-digit failure count would swing the % wildly — skip alerting, not enough signal
const ERROR_RATE_THRESHOLD_PCT = 25;

/**
 * Event types that are written ONLY when a request is rejected, and whose rejection
 * means the authorization layer did its job — not that anything was unreliable.
 *
 * These must not reach the error-rate denominator OR numerator. Two properties make
 * them poison for a ratio:
 *
 *   1. They have no success row. `admin_auth_failed` is 100% "failures" by construction,
 *      so every one of them drags the rate toward 100 and none can ever pull it back.
 *   2. One expired session emits many of them at once, because an open dashboard fans
 *      out parallel API calls and each rejected call logs its own row.
 *
 * Measured on production 2026-11-21: `admin_auth_failed` alone held 91,897 rows (all
 * "failures"), the second-largest event type in `ai_events`, against 520 genuine
 * `llm.call` failures out of 188,691 — so the metric was dominated roughly 200:1 by
 * correct authorization behavior. A 15-minute window containing two people whose JWTs
 * expired reported a 91% "AI event failure rate" while every actual AI operation in
 * that window succeeded (41 of 41).
 *
 * This is an EXCLUSION list rather than an allowlist on purpose. An alert should fail
 * OPEN: a new event type we have not seen must still be able to raise an alarm. An
 * allowlist would silently drop new failure types, which is the worse direction to be
 * wrong in for an alerting path.
 *
 * Note what is deliberately NOT here: `basecamp_request_failed`, `ghl_request_failed`
 * and `synthflow_call_failed`. Those are genuine upstream reliability failures
 * (TimeoutError, UpstreamUnavailable) and should keep counting. The line this list
 * draws is "a rejection that is the correct outcome" versus "a call that did not work".
 */
export const NON_RELIABILITY_EVENT_TYPES = [
  'admin_auth_failed',
  'participant_auth_failed',
  'sales_or_admin_auth_failed',
  'delivery_client_auth_failed',
  'gov_project_access_denied',
  'delivery_client_link_no_membership',
] as const;
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
       AND (event_type IS NULL OR event_type NOT IN (:excludedEventTypes))`,
    {
      type: QueryTypes.SELECT,
      // IN with an array replacement, not = ANY(:x): Sequelize does not bind an array
      // to ANY() correctly on this driver and the query throws at runtime.
      replacements: { excludedEventTypes: [...NON_RELIABILITY_EVENT_TYPES] },
    }
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
      description: `${failures} of ${total} ai_events rows failed in the last ${WINDOW_MINUTES} minutes (threshold: ${ERROR_RATE_THRESHOLD_PCT}%).`,
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
