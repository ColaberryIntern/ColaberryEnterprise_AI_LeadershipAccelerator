// Policy for expiring scheduled email/SMS/voice actions that are so far past
// their scheduled_for that they should never fire. A months-old sequence step
// sending today is wrong, not merely late.
//
// Why this exists: without expiry, the per-lead daily cap in
// processScheduledActions re-defers any such action to "tomorrow" indefinitely
// (a lead already touched today gets bumped a day, every day), so the action
// never drains. A backlog of 730 March-May "zombie" actions accumulated this
// way, and the send_throughput health check read it as "scheduler stalled" and
// stayed permanently red (observed 2026-06-23, CC-20260623-q8m4).
//
// Kept pure (no I/O) so the cutoff/expiry decision is unit-testable in isolation
// from the I/O-heavy scheduler.

export const DEFAULT_MAX_AGE_DAYS = 14;

// The instant before which a still-pending action is considered no longer timely.
export function staleCutoff(now: Date, maxAgeDays: number = DEFAULT_MAX_AGE_DAYS): Date {
  return new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);
}

// True when an action scheduled for `scheduledFor` is older than the cutoff and
// should be expired rather than sent or re-deferred.
export function isExpiredScheduledAction(
  scheduledFor: Date | string | null | undefined,
  now: Date,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): boolean {
  if (!scheduledFor) return false;
  const t = new Date(scheduledFor).getTime();
  if (Number.isNaN(t)) return false;
  return t < staleCutoff(now, maxAgeDays).getTime();
}

// Resolve the configured max age (setting `scheduled_action_max_age_days`),
// falling back to the default. 0 / negative / non-numeric disables expiry.
export function resolveMaxAgeDays(rawSetting: string | null | undefined): number {
  const parsed = parseInt(rawSetting || '', 10);
  if (Number.isNaN(parsed)) return DEFAULT_MAX_AGE_DAYS;
  return parsed;
}

// ── OH1s (Nov 19 Open House): claim size and retryable refusals ─────────────

// Rows per campaign per scheduler run. A drip campaign takes 10, so one big
// campaign cannot starve the others. An Open House countdown step is timed to an
// event, and 10 per 5-minute run delivered the Nov 19 4-hours-before email an
// average of 57 minutes late (max 116) and the 30-minutes-before text 22 minutes
// late. Countdown rows may take the whole run (the scheduler's 40-row ceiling).
export const PER_CAMPAIGN_CLAIM = 10;
export const COUNTDOWN_CLAIM = 40;
export const RUN_CLAIM = 40;

// The candidate query for one scheduler run. Countdown rows sort first so a timed
// reminder is never queued behind a drip email. The real claim (the lock) is the
// `status = 'pending'` UPDATE that follows it in processScheduledActions.
export const CLAIM_CANDIDATES_SQL = `
        SELECT id FROM (
          SELECT id, scheduled_for,
                 (metadata->>'event_countdown') = 'true' AS countdown,
                 ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY scheduled_for ASC) as rn
          FROM scheduled_emails
          WHERE status = 'pending'
            AND scheduled_for <= NOW()
            AND attempts_made < max_attempts
        ) ranked
        WHERE rn <= ${PER_CAMPAIGN_CLAIM} OR (countdown IS TRUE AND rn <= ${COUNTDOWN_CLAIM})
        ORDER BY (countdown IS TRUE) DESC, rn, scheduled_for ASC
        LIMIT ${RUN_CLAIM}
      `;

// A send-gate refusal that says "not now" rather than "not this person". Such a
// row goes back to pending and is sent on a later run. Before OH1s it was
// cancelled for good, so a burst past the 20-per-minute global limit silently
// dropped real messages.
const RETRYABLE_GATE_REASONS = new Set(['global_rate_limit_exceeded', 'scheduler_paused']);

export function isRetryableGateBlock(reason: string | null | undefined): boolean {
  return !!reason && RETRYABLE_GATE_REASONS.has(reason);
}
