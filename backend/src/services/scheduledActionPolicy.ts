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
