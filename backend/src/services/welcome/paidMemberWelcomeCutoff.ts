/**
 * Who counts as a NEW paying member for the paid-member welcome (C10.18). Pure: no DB, no clock.
 *
 * Ali, 2026-11-09 (option A): the welcome goes only to members who pay AFTER it is switched on.
 * A dry run against production that day showed why: without a cutoff the sweep would have mailed
 * every paid, active member who had never had it, 50 per run, including the July 2026 batch
 * ("your first live session is Monday, August 3, 2026", three months gone), two canceled
 * members, staff and test accounts.
 *
 * The cutoff is `PAID_MEMBER_WELCOME_SINCE`, an ISO timestamp. A member is new when their FIRST
 * paid subscription row was created at or after it (so a renewal or a second row never makes an
 * old member new), or, for a member with no subscription row at all, when they enrolled at or
 * after it. `created_at` and not `started_at`: the realign script moves `started_at` to a class
 * date, which would turn an old member new.
 *
 * Failure stance: no readable cutoff means the sweep does not send. Sending to everyone is the
 * failure this module exists to prevent, so the absence of a cutoff can never mean "no cutoff".
 */

/** The cutoff as a Date, or null when it is missing or not a real ISO timestamp. */
export function parseWelcomeSince(raw: string | null | undefined): Date | null {
  const text = String(raw ?? '').trim();
  // A full date-time with an explicit zone, so the cutoff cannot silently shift with the host's TZ.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * True when a first-session date ('YYYY-MM-DD', Central) is already behind `todayCentral`.
 * The session on today's date is still ahead (it is an evening session), so today is not past.
 */
export function isFirstSessionPast(date: string | null | undefined, todayCentral: string): boolean {
  const d = String(date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(todayCentral)) return false;
  return d < todayCentral;
}

/**
 * Enrollment ids of paid, active, placed members who are new since `:since`. Parameterized; the
 * caller supplies `since` as a replacement, never by interpolation.
 */
export const NEW_PAID_MEMBERS_SQL = `
  SELECT e.id
    FROM enrollments e
    LEFT JOIN (SELECT enrollment_id, MIN(created_at) AS first_paid
                 FROM subscriptions
                WHERE plan <> 'comp' AND status NOT IN ('pending', 'failed')
                GROUP BY enrollment_id) s
      ON s.enrollment_id = e.id
   WHERE e.payment_status = 'paid' AND e.status = 'active'
     AND e.cohort_id IS NOT NULL AND e.email IS NOT NULL
     AND ( s.first_paid >= :since
        OR (s.first_paid IS NULL
            AND NOT EXISTS (SELECT 1 FROM subscriptions x WHERE x.enrollment_id = e.id)
            AND e.enrolled_at >= :since) )
   ORDER BY e.enrolled_at ASC, e.id ASC
   LIMIT :limit`;
