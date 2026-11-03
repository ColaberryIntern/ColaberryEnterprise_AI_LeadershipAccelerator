import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureSignInLinkEventsSchema } from '../db/ensureSignInLinkEventsSchema';

/**
 * Record what happened to a sign-in link (C106). Called by GET /api/portal/verify after the token check.
 *
 * NEVER AFFECTS SIGN-IN. This is measurement; the session is the product. Every error is logged with an error_class
 * and swallowed here, deliberately, so the caller's response is the same whether or not the record was written.
 *
 * What is stored: the enrollment and the time for a success, at most one row per person per minute (a link stays
 * valid for reuse until it expires, so a replay loop on one valid link must not write a row per request); a per-day
 * count for an invalid or expired link. Never the token, the IP or the user agent (see ensureSignInLinkEventsSchema).
 *
 * Retention: rows older than RETENTION_DAYS are pruned at most once a day per process, from this same path (batched
 * and capped, so a backlog is spread over days). Keeping it here rather than in the scheduler keeps it next to the
 * only writer. A failed prune is logged and retried the next day.
 */
export const RETENTION_DAYS = 180;
export const PRUNE_BATCH = 5_000;

let lastPruneDay: string | null = null;

function logFailure(event: string, err: unknown): void {
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({
    level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: e?.name || 'SignInLinkEventError', context: { message: String(e?.message || err).slice(0, 200) },
  }));
}

async function pruneOncePerDay(now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  if (lastPruneDay === day) return;
  lastPruneDay = day;
  try {
    await sequelize.query(
      `DELETE FROM sign_in_link_uses WHERE id IN (
         SELECT id FROM sign_in_link_uses WHERE used_at < NOW() - make_interval(days => :days) ORDER BY id LIMIT :limit)`,
      { replacements: { days: RETENTION_DAYS, limit: PRUNE_BATCH } },
    );
    await sequelize.query(
      'DELETE FROM sign_in_link_invalid_daily WHERE day < CURRENT_DATE - :days',
      { replacements: { days: RETENTION_DAYS } },
    );
  } catch (err) {
    lastPruneDay = null; // try again on the next call
    logFailure('sign_in_link_prune_failed', err);
  }
}

/** A successful sign-in with a link. Never throws. */
export async function recordSignInLinkUse(enrollmentId: string, now: Date = new Date()): Promise<void> {
  try {
    await ensureSignInLinkEventsSchema();
    await sequelize.query(
      `INSERT INTO sign_in_link_uses (enrollment_id, used_at)
       SELECT :enrollmentId, NOW()
       WHERE NOT EXISTS (SELECT 1 FROM sign_in_link_uses u
                         WHERE u.enrollment_id = :enrollmentId AND u.used_at > NOW() - interval '1 minute')`,
      { replacements: { enrollmentId }, type: QueryTypes.INSERT },
    );
    await pruneOncePerDay(now);
  } catch (err) {
    logFailure('sign_in_link_use_record_failed', err);
  }
}

/** An invalid or expired link: one more on today's counter. Never throws. */
export async function recordSignInLinkInvalid(): Promise<void> {
  try {
    await ensureSignInLinkEventsSchema();
    await sequelize.query(
      `INSERT INTO sign_in_link_invalid_daily (day, invalid_count, updated_at) VALUES (CURRENT_DATE, 1, NOW())
       ON CONFLICT (day) DO UPDATE SET invalid_count = sign_in_link_invalid_daily.invalid_count + 1, updated_at = NOW()`,
      { type: QueryTypes.INSERT },
    );
  } catch (err) {
    logFailure('sign_in_link_invalid_record_failed', err);
  }
}

/** Test seam. */
export function __resetSignInLinkPruneForTests(): void { lastPruneDay = null; }
