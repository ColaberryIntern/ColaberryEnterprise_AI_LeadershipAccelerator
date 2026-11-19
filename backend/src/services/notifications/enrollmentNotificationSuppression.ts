/**
 * Whether a given enrollment may be sent cohort-scoped notification mail.
 *
 * Pure: rows in, decisions out. No database, no clock, no transport. The whole
 * point is that "does this person get mailed" becomes something a unit test can
 * assert, instead of something discovered when a student complains twice.
 *
 * Scope: this governs the ACCELERATOR senders — the ones keyed on
 * `enrollments.id` that never touch the campaign engine's lead-keyed safety
 * layer (session reminders, missed-session mail). It is deliberately NOT a
 * replacement for communicationSafetyService.evaluateSend(), which continues to
 * govern the lead-keyed campaign path. The two systems address different
 * recipients and both need a gate; this supplies the one that was missing.
 *
 * Semantics: `notifications_paused_at` is a nullable instant, read as a flag
 * plus its own audit trail (same shape as live_sessions.reminder_24h_sent_at).
 *   NULL      -> notifiable. This is every pre-existing row, so switching this
 *                on changes nothing until somebody deliberately pauses someone.
 *   NOT NULL  -> suppressed, and the value records when the pause was applied.
 * Un-pausing is setting it back to NULL. There is no auto-expiry: a pause that
 * silently lapses would recreate exactly the failure this module exists to
 * prevent.
 */

/** The subset of an enrollment this module needs. Structural, so both a
 *  Sequelize instance and a plain fixture satisfy it. */
export interface SuppressibleEnrollment {
  id?: string;
  email?: string | null;
  notifications_paused_at?: Date | string | null;
  notifications_paused_reason?: string | null;
}

/** Column name, exported so the schema guard, the model and the query
 *  fragment cannot drift apart on a typo. */
export const SUPPRESSION_COLUMN = 'notifications_paused_at' as const;

/**
 * True when this enrollment must not be sent notification mail.
 *
 * Anything other than NULL/undefined/empty suppresses. An unparseable value
 * suppresses too: a garbled timestamp in this column means somebody tried to
 * pause this person, and the safe reading of "we cannot tell" is to withhold
 * the mail rather than send it. Withholding is recoverable; a wrong send to a
 * student who already complained is not.
 */
export function isNotificationSuppressed(enrollment: SuppressibleEnrollment | null | undefined): boolean {
  if (!enrollment) return false;
  const raw = enrollment.notifications_paused_at;
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  return true;
}

/**
 * Split a cohort roster into who gets mailed and who does not.
 *
 * Returns both halves rather than just the sendable ones, because the caller
 * needs the suppressed list to log what it withheld — a suppression nobody can
 * see in the logs is the next version of this same bug.
 */
export function partitionNotifiable<T extends SuppressibleEnrollment>(
  enrollments: readonly T[]
): { notifiable: T[]; suppressed: T[] } {
  const notifiable: T[] = [];
  const suppressed: T[] = [];
  for (const e of enrollments) {
    if (isNotificationSuppressed(e)) suppressed.push(e);
    else notifiable.push(e);
  }
  return { notifiable, suppressed };
}

/**
 * Convenience wrapper for callers that only want the sendable half.
 */
export function filterNotifiable<T extends SuppressibleEnrollment>(enrollments: readonly T[]): T[] {
  return partitionNotifiable(enrollments).notifiable;
}

/**
 * Per-SESSION opt-out: true when a live session must send no student mail at
 * all — the 24 h / 1 h reminders, the post-session missed-session mail, and the
 * absence alert those misses would raise.
 *
 * Stored as `live_sessions.email_trigger_config = {"student_email": false}`.
 * That JSONB column already exists and nothing read it before this, so the
 * switch needs no migration and every existing session (NULL) is unaffected.
 * Only an explicit boolean `false` opts out: a missing key, `true`, or any
 * other value keeps today's behaviour, so a malformed config can never silence
 * a real class by accident.
 *
 * Attendance is still recorded for an opted-out session; only the mail stops.
 * Ali, 2026-11-19: the November cohort's roster needs cleaning up before it is
 * emailed, and post-Open-House follow-up belongs to the campaign engine.
 */
export function isSessionStudentEmailOff(
  session: { email_trigger_config?: unknown } | null | undefined
): boolean {
  const cfg = session?.email_trigger_config;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
  return (cfg as Record<string, unknown>).student_email === false;
}
