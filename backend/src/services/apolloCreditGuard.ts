import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Apollo credit guard
// ---------------------------------------------------------------------------
// APOLLO_ENABLED is an on/off valve, not a brake. Once it is on, nothing in the
// codebase limits how many billable calls get made, and the retry helper backs off
// and RETRIES on 429 — so hitting the rate limit spends more, not less. This module
// is the brake: two independent ceilings and an alert.
//
//   1. DAILY CEILING, persisted. Survives a restart, because a runaway is exactly
//      the thing that restarts. Counted per UTC day in `apollo_credit_usage`.
//   2. PER-RUN CEILING, in memory. Caps one process so a single loop cannot drain
//      the whole day's allowance in a minute, which is the actual shape of the
//      original leak (CC-20260710-a9f2).
//   3. ALERT at a threshold of the daily ceiling, fired ONCE per day, so unusual
//      spend reaches us before it reaches the invoice.
//
// Both ceilings fail CLOSED on an error: if the counter cannot be read, the call is
// refused. A guard that fails open is not a guard. The one exception is the alert,
// which is best-effort and never blocks or fails a call.

export const APOLLO_GUARD_REASONS = {
  DAILY: 'apollo_daily_cap_reached',
  PER_RUN: 'apollo_per_run_cap_reached',
  COUNTER_UNAVAILABLE: 'apollo_counter_unavailable',
} as const;

export type ApolloGuardDecision =
  | { allowed: true; dailyCount: number; perRunCount: number }
  | { allowed: false; reason: string; detail: string };

// Per-process counter. Deliberately module-level: it resets when the process does,
// which is correct for a PER-RUN cap and wrong for a daily one, which is why the
// daily cap is in the database instead.
let perRunCount = 0;

/** Test seam only. Never called by production code. */
export function __resetPerRunCountForTests(): void {
  perRunCount = 0;
}

export function getPerRunCount(): number {
  return perRunCount;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function db() {
  // Lazy import, matching apolloService's own convention: the kill-switch tests
  // import that module without a database available, and this must not break them.
  const { sequelize } = await import('../config/database');
  return sequelize;
}

/**
 * Claim one billable Apollo call.
 *
 * Call this IMMEDIATELY BEFORE a billable request, never after: the counter has to
 * move before the credit is spent, or a crash between the two loses the record of
 * a call that Apollo has already charged for.
 *
 * Returns allowed:false when either ceiling is reached, or when the counter cannot
 * be read. The caller must not make the request in that case.
 */
export async function claimApolloCall(label: string): Promise<ApolloGuardDecision> {
  const perRunLimit = env.apolloMaxCallsPerRun;
  const dailyLimit = env.apolloMaxCallsPerDay;

  if (perRunCount >= perRunLimit) {
    return {
      allowed: false,
      reason: APOLLO_GUARD_REASONS.PER_RUN,
      detail: `per-run cap reached: ${perRunCount}/${perRunLimit} billable Apollo calls in this `
        + `process. Raise APOLLO_MAX_CALLS_PER_RUN deliberately if this is a legitimate batch.`,
    };
  }

  let dailyCount: number;
  try {
    const sequelize = await db();
    // Atomic claim: one statement does the insert-or-increment AND returns the new
    // value, so two concurrent processes cannot both read "99" and both proceed.
    // The WHERE clause is what enforces the ceiling; if it is already reached, no
    // row is updated and nothing comes back.
    const [rows]: any = await sequelize.query(
      `INSERT INTO apollo_credit_usage (usage_date, call_count, last_call_at, last_label)
       VALUES (:day, 1, now(), :label)
       ON CONFLICT (usage_date) DO UPDATE
         SET call_count   = apollo_credit_usage.call_count + 1,
             last_call_at = now(),
             last_label   = :label
         WHERE apollo_credit_usage.call_count < :limit
       RETURNING call_count`,
      { replacements: { day: todayUtc(), label: label.slice(0, 80), limit: dailyLimit } },
    );

    if (!rows || rows.length === 0) {
      // No row returned means the WHERE guard refused the increment: the ceiling is
      // already reached for today.
      return {
        allowed: false,
        reason: APOLLO_GUARD_REASONS.DAILY,
        detail: `daily cap reached: ${dailyLimit} billable Apollo calls already made today `
          + `(UTC). Resets at midnight UTC. Raise APOLLO_MAX_CALLS_PER_DAY deliberately.`,
      };
    }
    dailyCount = Number(rows[0].call_count);
  } catch (err: any) {
    // FAIL CLOSED. If the ceiling cannot be enforced, the call does not happen.
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'apollo_guard_counter_unavailable',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { label, message: err?.message },
    }));
    return {
      allowed: false,
      reason: APOLLO_GUARD_REASONS.COUNTER_UNAVAILABLE,
      detail: 'the Apollo spend counter could not be read, so the call was refused rather '
        + 'than made without a ceiling.',
    };
  }

  perRunCount += 1;
  void maybeAlert(dailyCount, dailyLimit);
  return { allowed: true, dailyCount, perRunCount };
}

/**
 * Fire one alert per day when usage crosses the threshold. Best effort: never
 * throws, never blocks the caller, and never fails a call. The `alerted_at` guard
 * makes it once-per-day rather than once-per-call past the threshold, because an
 * alert that fires three hundred times is an alert nobody reads.
 */
async function maybeAlert(dailyCount: number, dailyLimit: number): Promise<void> {
  try {
    const threshold = Math.floor(dailyLimit * env.apolloAlertFraction);
    if (dailyCount < threshold) return;

    const sequelize = await db();
    const [claimed]: any = await sequelize.query(
      `UPDATE apollo_credit_usage SET alerted_at = now()
        WHERE usage_date = :day AND alerted_at IS NULL
        RETURNING usage_date`,
      { replacements: { day: todayUtc() } },
    );
    if (!claimed || claimed.length === 0) return;  // already alerted today

    const { emitAiEvent } = await import('./aiEventService');
    await emitAiEvent({
      event_type: 'apollo_spend_threshold_crossed',
      severity: 'warning',
      source: 'apolloCreditGuard',
      payload: {
        daily_count: dailyCount,
        daily_limit: dailyLimit,
        threshold,
        message: `Apollo usage has reached ${dailyCount} of ${dailyLimit} billable calls today. `
          + `Calls are refused once the limit is hit; they resume at midnight UTC.`,
      },
    } as any);

    console.warn(JSON.stringify({
      level: 'warn', service: 'backend', event: 'apollo_spend_threshold_crossed',
      outcome: 'success', context: { daily_count: dailyCount, daily_limit: dailyLimit, threshold },
    }));
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'apollo_spend_alert_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
  }
}

/** Read-only view of today's usage, for an admin surface or a health check. */
export async function getApolloUsageToday(): Promise<{
  date: string; count: number; limit: number; perRun: number; perRunLimit: number;
}> {
  let count = 0;
  try {
    const sequelize = await db();
    const [rows]: any = await sequelize.query(
      `SELECT call_count FROM apollo_credit_usage WHERE usage_date = :day`,
      { replacements: { day: todayUtc() } },
    );
    count = rows?.[0] ? Number(rows[0].call_count) : 0;
  } catch {
    count = -1;  // unreadable, reported rather than guessed
  }
  return {
    date: todayUtc(),
    count,
    limit: env.apolloMaxCallsPerDay,
    perRun: perRunCount,
    perRunLimit: env.apolloMaxCallsPerRun,
  };
}
