/**
 * Which subscriptions get a renewal reminder, and which kind.
 *
 * Pure: rows in, decisions out, no database and no clock of its own. Every
 * exclusion that keeps us from mailing the wrong person is decided here so it
 * can be asserted in a unit test rather than discovered in production.
 *
 * Background: this platform has no recurring billing. Each paid term is a
 * discrete one-time hosted checkout, and when `current_period_end` passes,
 * nothing charges the student and nobody is told. See
 * docs/RECURRING_BILLING_EXPOSURE.md. This module drives the stopgap: mail the
 * student a checkout link before their period ends so they can renew
 * themselves.
 */

export type ReminderKind = 'advance_7d' | 'final_1d' | 'after_lapse_1d' | 'after_lapse_7d';

/**
 * Lead times, chosen from the actual book (measured 2026-08-15 against prod).
 *
 * The 30-day exposure is not spread evenly, it sits in four clumps: 2026-08-30
 * (2), 2026-08-31 (7), 2026-09-12 (9), 2026-09-13 (4), with singletons around
 * them. Two things follow from that shape.
 *
 * First, the advance notice has to land on a day that is not the renewal day
 * itself, or a student who is busy that morning has no second chance. Seven
 * days puts the first email on a different weekday from the cluster in every
 * one of those four cases, and leaves a full week of runway.
 *
 * Second, it cannot be much longer than that. The monthly cadence is a calendar
 * month (28-31 days), so a lead time creeping toward two weeks starts to read as
 * "you just paid, pay again" and invites the student to file it and forget. A
 * week is long enough to act on and short enough to still feel current.
 *
 * The final nudge is at one day. Nothing revokes access when a period ends
 * (entitlement gates on enrollments.payment_status, never on
 * current_period_end), so a reminder sent on or after the date has no deadline
 * behind it. T-1 is the last point where the message still means something.
 *
 * These are inclusive upper bounds, not exact-day matches. That matters on day
 * one: the first renewal in the book is 2026-08-18 and this ships inside that
 * window, so an exact-day rule would silently skip the very subscription the
 * work was commissioned for.
 *
 * The final window is counted in CALENDAR days in Central, not in elapsed
 * hours, and that is not a detail. The job runs once a day at 9am Central; the
 * live period ends are scattered across the clock, several of them in the
 * evening UTC. Measuring "one day out" as 24 elapsed hours means a period
 * ending at 18:26Z is 1.19 days away at the 14:00Z run on the day before, which
 * misses the final window, and 0.19 days away at the next run, which is the
 * morning OF the renewal. The reminder would then say "tomorrow" on the day
 * itself. Counting calendar days makes the window land where a human would put
 * it regardless of what hour the cron happens to fire.
 */
export const ADVANCE_LEAD_DAYS = 7;
export const FINAL_LEAD_DAYS = 1;

/** The program's operating timezone. Renewal dates are read by people in Texas. */
export const BILLING_TIMEZONE = 'America/Chicago';

const centralYmd = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: BILLING_TIMEZONE,
});

/** Days since the epoch, as counted on a Central wall calendar. Differencing
 *  two of these gives "how many sleeps away", which is what the copy claims. */
export function centralDayNumber(ms: number): number {
  return Math.round(Date.parse(`${centralYmd.format(new Date(ms))}T00:00:00Z`) / DAY_MS);
}

export const REMINDER_KINDS: ReminderKind[] = ['advance_7d', 'final_1d', 'after_lapse_1d', 'after_lapse_7d'];

/**
 * How long after a missed date we keep asking, and then stop.
 *
 * Until this existed, a member who missed their date heard NOTHING further, ever:
 * the run reported them as `already_lapsed` and moved on. Three real members were
 * in exactly that state on 2026-08-23 and had to be chased by hand. Combined with
 * entitlement gating on `enrollments.payment_status` rather than the billing
 * period, a lapse was silent on both sides - they kept full access, we kept no
 * money, and nothing surfaced it.
 *
 * Two nudges, then silence. Past a week without a response the answer is either no
 * or something a human needs to handle, and a monthly membership that keeps
 * dunning forever is worse than one that lets go.
 */
export const LAPSE_FOLLOWUP_DAYS = [1, 7] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A subscription joined to the person it belongs to. Shaped as the loader
 *  returns it, with dates left loose because Sequelize and raw pg disagree. */
export interface RenewalSubscriptionRow {
  id: string;
  enrollment_id: string;
  plan: string;
  status: string;
  amount_cents: number;
  applied_credit_cents?: number | null;
  current_period_end: Date | string | null;
  canceled_at?: Date | string | null;
  email?: string | null;
  full_name?: string | null;
}

export type SkipReason =
  | 'not_active'
  | 'comped'
  | 'zero_amount'
  | 'no_period_end'
  | 'superseded'
  | 'already_lapsed'
  | 'unusable_email'
  | 'not_yet_due';

export interface DueReminder {
  subscription_id: string;
  enrollment_id: string;
  email: string;
  full_name: string | null;
  plan: string;
  amount_cents: number;
  /** ISO string. Half of the idempotency key, so it must be exact, not a date. */
  period_end: string;
  kind: ReminderKind;
  /** Fractional elapsed days, for the operator's benefit in a dry run. */
  days_until: number;
  /** Whole Central calendar days between today and the renewal date. 0 means
   *  the period ends today, 1 means tomorrow. This is what the copy speaks
   *  from, so the email can never claim "tomorrow" on the day itself. */
  day_delta: number;
}

export interface SkippedSubscription {
  subscription_id: string;
  email: string | null;
  reason: SkipReason;
  detail?: string;
}

export interface SelectionResult {
  due: DueReminder[];
  skipped: SkippedSubscription[];
}

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/** Deliverable enough to hand to a transport. Deliberately the same shape check
 *  the build-ready mailer uses, so the two agree on what an address is. */
export function isUsableEmail(email: string | null | undefined): boolean {
  return !!email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim());
}

/**
 * The subscription id per enrollment that actually represents "where this
 * person's billing stands right now" - the active row with the furthest period
 * end.
 *
 * This is how "already renewed" is detected. A renewal on this platform is a
 * fresh checkout, so it produces a NEW subscription row with a later period
 * end; the old row keeps its now-passed date and stays active forever because
 * nothing ever retires it. Reminding against the old row would mail somebody
 * who paid us last week. Ties break on id so the choice is stable across runs.
 */
export function latestActiveByEnrollment(rows: RenewalSubscriptionRow[]): Map<string, string> {
  const best = new Map<string, { id: string; endMs: number }>();
  for (const row of rows) {
    if (row.status !== 'active') continue;
    const endMs = toMs(row.current_period_end);
    if (endMs === null) continue;
    const current = best.get(row.enrollment_id);
    if (!current || endMs > current.endMs || (endMs === current.endMs && row.id > current.id)) {
      best.set(row.enrollment_id, { id: row.id, endMs });
    }
  }
  const out = new Map<string, string>();
  for (const [enrollmentId, v] of best) out.set(enrollmentId, v.id);
  return out;
}

/**
 * Which reminder a subscription is due for. Most urgent wins: a subscription
 * whose period ends today or tomorrow gets the final notice, not the advance
 * one, even though it satisfies both windows. The two are separate ledger keys,
 * so a subscription that got the advance notice at T-6 still gets the final one
 * on the eve.
 *
 * Both windows are measured in Central calendar days for the reason given
 * above; `daysUntil` is used only to reject a period that has already elapsed,
 * where hours genuinely matter (a period that ended two hours ago is lapsed
 * even though it is still "today").
 *
 * @param daysUntil  fractional elapsed days, used only for the lapsed gate
 * @param dayDelta   whole Central calendar days to the renewal date
 */
export function reminderKindFor(daysUntil: number, dayDelta: number): ReminderKind | null {
  if (daysUntil <= 0) return null;             // already lapsed, handled by the caller
  if (dayDelta <= FINAL_LEAD_DAYS) return 'final_1d';
  if (dayDelta <= ADVANCE_LEAD_DAYS) return 'advance_7d';
  return null;
}

/**
 * Which follow-up a member gets AFTER their date has passed, or null for silence.
 *
 * This does not reopen the retroactive-billing question, and it is worth being
 * explicit about why, because the original code refused to mail lapsed members on
 * exactly that ground. Two different things were being conflated:
 *
 *   - Charging for the period that already elapsed. That is retroactive billing,
 *     it is still forbidden, and nothing here does it.
 *   - Selling the NEXT period. That is just resuming, and it is the only way a
 *     lapsed member can come back.
 *
 * `startCheckout` mints a forward period anchored at activation, never a backdated
 * one, so the link in a post-lapse note buys the member a month starting when they
 * pay. That is not the trap the exposure doc warned about; going silent was.
 *
 * @param dayDeltaSinceEnd whole Central calendar days since the period ended
 */
export function lapseFollowupKindFor(dayDeltaSinceEnd: number): ReminderKind | null {
  if (dayDeltaSinceEnd === LAPSE_FOLLOWUP_DAYS[0]) return 'after_lapse_1d';
  if (dayDeltaSinceEnd === LAPSE_FOLLOWUP_DAYS[1]) return 'after_lapse_7d';
  return null;
}

/**
 * Split the active book into "mail this one now" and "here is why not".
 *
 * Every exclusion is reported rather than dropped, because the dry run is the
 * only review this gets before it touches a customer, and a silently filtered
 * row is indistinguishable from a row the query never returned.
 */
export function selectRenewalReminders(
  rows: RenewalSubscriptionRow[],
  nowMs: number,
  opts: { onlyEmail?: string | null } = {},
): SelectionResult {
  const onlyEmail = opts.onlyEmail ? opts.onlyEmail.toLowerCase().trim() : null;
  const latest = latestActiveByEnrollment(rows);

  const due: DueReminder[] = [];
  const skipped: SkippedSubscription[] = [];
  const skip = (row: RenewalSubscriptionRow, reason: SkipReason, detail?: string) =>
    skipped.push({ subscription_id: row.id, email: row.email ?? null, reason, detail });

  for (const row of rows) {
    if (onlyEmail && String(row.email || '').toLowerCase().trim() !== onlyEmail) continue;

    // Pending / canceled / failed rows are not a live obligation. 'canceled'
    // covers both a student who quit and a comp an admin revoked.
    if (row.status !== 'active') {
      skip(row, 'not_active', `status=${row.status}`);
      continue;
    }

    // The 10 Colaberry staff seats. $0, period ends in 2036, and PaySimple
    // cannot process a $0 charge, so this must never reach a checkout.
    if (row.plan === 'comp') {
      skip(row, 'comped', 'plan=comp');
      continue;
    }
    if (!(row.amount_cents > 0)) {
      skip(row, 'zero_amount', `amount_cents=${row.amount_cents}`);
      continue;
    }

    const endMs = toMs(row.current_period_end);
    if (endMs === null) {
      skip(row, 'no_period_end');
      continue;
    }

    if (latest.get(row.enrollment_id) !== row.id) {
      skip(row, 'superseded', 'a later active subscription exists for this enrollment');
      continue;
    }

    const daysUntil = (endMs - nowMs) / DAY_MS;

    // Past the date already. Reported so a human sees it, never mailed: the
    // period is written off, not collected. Charging for a period that already
    // elapsed is the retroactive-billing trap called out in the exposure doc,
    // and a checkout link for it would buy the student nothing.
    if (daysUntil <= 0) {
      // Past the date. We no longer go silent here (see lapseFollowupKindFor):
      // two nudges offering a FORWARD period, then we let go. The elapsed period
      // itself is still written off and is never charged for.
      const sinceEnd = centralDayNumber(nowMs) - centralDayNumber(endMs);
      const lapseKind = lapseFollowupKindFor(sinceEnd);
      if (!lapseKind) {
        skip(row, 'already_lapsed', `${Math.abs(daysUntil).toFixed(1)}d ago`);
        continue;
      }
      if (!isUsableEmail(row.email)) {
        skip(row, 'unusable_email', `"${row.email ?? ''}"`);
        continue;
      }
      due.push({
        subscription_id: row.id,
        enrollment_id: row.enrollment_id,
        email: row.email as string,
        full_name: row.full_name ?? null,
        plan: row.plan,
        amount_cents: row.amount_cents,
        applied_credit_cents: row.applied_credit_cents ?? 0,
        period_end: new Date(endMs).toISOString(),
        kind: lapseKind,
        days_until: daysUntil,
        day_delta: -sinceEnd,
      });
      continue;
    }

    const dayDelta = centralDayNumber(endMs) - centralDayNumber(nowMs);
    const kind = reminderKindFor(daysUntil, dayDelta);
    if (!kind) {
      skip(row, 'not_yet_due', `${daysUntil.toFixed(1)}d out`);
      continue;
    }

    if (!isUsableEmail(row.email)) {
      skip(row, 'unusable_email', `"${row.email ?? ''}"`);
      continue;
    }

    due.push({
      subscription_id: row.id,
      enrollment_id: row.enrollment_id,
      email: String(row.email).trim(),
      full_name: row.full_name ?? null,
      plan: row.plan,
      amount_cents: row.amount_cents,
      period_end: new Date(endMs).toISOString(),
      days_until: Math.round(daysUntil * 100) / 100,
      day_delta: dayDelta,
      kind,
    });
  }

  // Soonest first, so a truncated dry-run read still shows the urgent ones.
  due.sort((a, b) => a.period_end.localeCompare(b.period_end) || a.email.localeCompare(b.email));
  return { due, skipped };
}
