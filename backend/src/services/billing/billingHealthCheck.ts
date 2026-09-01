/**
 * Billing health check - the standing watch over the subscription book.
 *
 * Every check here exists because the thing it looks for ACTUALLY HAPPENED during
 * the 2026-08 billing work, and every one of them was found by a human poking
 * around rather than by the system saying anything. That is the gap this closes.
 *
 * Design rules, in order of importance:
 *
 *  1. READ ONLY. This never writes, never charges, never cancels. A watchdog that
 *     can act is a watchdog that can cause the incident it was meant to catch.
 *  2. Silence when healthy. It emails only when a human needs to know or do
 *     something. A daily "all clear" trains people to ignore it, and then the one
 *     that matters gets ignored too.
 *  3. Every finding says what to DO, not just what is wrong.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export type Severity = 'act_now' | 'soon' | 'watch';

export interface Finding {
  severity: Severity;
  code: string;
  headline: string;
  detail: string;
  action: string;
  rows?: string[];
}

const SEVERITY_ORDER: Record<Severity, number> = { act_now: 0, soon: 1, watch: 2 };

/* ------------------------------------------------------------------ */
/*  Individual checks                                                  */
/* ------------------------------------------------------------------ */

/**
 * Two active subscription rows for one person.
 *
 * A manual renewal leaves the old period AND the new one both active. Harmless
 * until something iterates rows instead of people: the schedule migration did
 * exactly that and would have billed Liza Ayele twice a month. The migration is
 * fixed, but the underlying duplicate is still produced by every renewal, so
 * anything new that reads this table can trip on it.
 */
async function checkDuplicateActive(): Promise<Finding | null> {
  const rows = await sequelize.query<{ full_name: string; email: string; n: string; ends: string }>(
    `SELECT e.full_name, e.email, COUNT(*)::text AS n,
            string_agg(s.current_period_end::date::text, ', ' ORDER BY s.current_period_end) AS ends
       FROM subscriptions s JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.status = 'active' AND s.plan <> 'comp'
      GROUP BY e.full_name, e.email
     HAVING COUNT(*) > 1`,
    { type: QueryTypes.SELECT },
  );
  if (!rows.length) return null;
  return {
    severity: 'watch',
    code: 'duplicate_active_rows',
    headline: `${rows.length} member(s) hold more than one active subscription row`,
    detail:
      'Normal right after a manual renewal: the period that ended and the new one are both active. '
      + 'It only becomes a problem if something iterates rows rather than people.',
    action: 'No action unless a new job reads subscriptions. Anything that does must key on the member, not the row.',
    rows: rows.map((r) => `${r.full_name} (${r.n} rows: ${r.ends})`),
  };
}

/**
 * Someone past their date with no follow-up on record.
 *
 * Before the post-lapse work, a member who missed their date heard nothing ever
 * again. Three real members were in that state on 2026-08-23 and were found by
 * accident. If this ever returns rows again, the follow-up path has broken.
 *
 * ── WHY AUTO-PAY MEMBERS ARE EXCLUDED ──────────────────────────────────────
 *
 * This check reads "period end is in the past" as "nobody is collecting", which
 * was true while every term was a manual checkout. It stopped being true on
 * 2026-09-01, when 20 members were migrated onto standing PaySimple schedules.
 *
 * Those members were promised automatic billing would start at their NEXT cycle,
 * not the one already collected by hand, so a member whose period ended 30 Aug
 * has a schedule that first fires 30 Sep. For a whole month they sit here looking
 * lapsed while a schedule is quietly holding them. Four real members were in
 * exactly that state the day the migration ran.
 *
 * Flagging them would be worse than noise: the stated action is "confirm these
 * members were mailed", which invites chasing someone for money a schedule is
 * about to take, and that is how a member gets charged twice for one month.
 *
 * A schedule is therefore treated as the follow-up. If the schedule itself is
 * wrong, that is checkSchedulesMatchBook's job, not this one.
 */
/**
 * Exported so the auto-pay exclusion is a testable contract rather than a line
 * anyone can delete while the suite stays green. Removing the
 * `paysimple_schedule_id IS NULL` predicate resumes chasing members whose
 * schedule is about to collect, which is a money bug, not a noisy email.
 */
export const LAPSED_WITHOUT_FOLLOWUP_SQL = `SELECT DISTINCT ON (s.enrollment_id)
            e.full_name, e.email, s.current_period_end::date::text AS was_due,
            (CURRENT_DATE - s.current_period_end::date)::text AS days
       FROM subscriptions s JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.status = 'active' AND s.plan <> 'comp'
        AND s.current_period_end < now()
        AND s.paysimple_schedule_id IS NULL
        AND NOT EXISTS (
              SELECT 1 FROM subscription_renewal_reminders r
               WHERE r.subscription_id = s.id
                 AND r.period_end = s.current_period_end
                 AND r.reminder_kind LIKE 'after_lapse%'
                 AND r.status = 'sent')
        AND NOT EXISTS (
              SELECT 1 FROM subscriptions s2
               WHERE s2.enrollment_id = s.enrollment_id
                 AND s2.status = 'active'
                 AND s2.current_period_end > s.current_period_end)
      ORDER BY s.enrollment_id, s.current_period_end DESC`;

async function checkLapsedWithoutFollowup(): Promise<Finding | null> {
  const rows = await sequelize.query<{ full_name: string; email: string; was_due: string; days: string }>(
    LAPSED_WITHOUT_FOLLOWUP_SQL,
    { type: QueryTypes.SELECT },
  );
  if (!rows.length) return null;
  const stale = rows.filter((r) => Number(r.days) >= 2);
  return {
    severity: stale.length ? 'act_now' : 'soon',
    code: 'lapsed_no_followup',
    headline: `${rows.length} member(s) are past their renewal date with no follow-up recorded`,
    detail:
      'The reminder job should send a follow-up one day after a missed date and again at a week. '
      + 'A member sitting here for two days or more means that path is not running.',
    action: 'Check the renewal reminder job ran today, then confirm these members were mailed.',
    rows: rows.map((r) => `${r.full_name} <${r.email}> due ${r.was_due}, ${r.days}d ago`),
  };
}

/**
 * The renewal reminder job has gone quiet.
 *
 * It shipped dark once already and nobody noticed for weeks, so silence here is
 * worth an email.
 *
 * It used to be the ONLY thing collecting money. Since 2026-09-01 it is not:
 * 21 members are on standing schedules that collect without it. That lowers the
 * blast radius of this job dying but does not remove it, because 10 members still
 * have no schedule and this job is the only thing that asks them to pay.
 */
async function checkReminderJobAlive(): Promise<Finding | null> {
  const [row] = await sequelize.query<{ last_sent: string | null; hours: string | null }>(
    `SELECT max(sent_at)::text AS last_sent,
            round(EXTRACT(EPOCH FROM (now() - max(sent_at))) / 3600)::text AS hours
       FROM subscription_renewal_reminders WHERE status = 'sent'`,
    { type: QueryTypes.SELECT },
  );
  const hours = Number(row?.hours ?? NaN);
  // Nothing to send is normal on a quiet day, so only a long gap is meaningful.
  if (!Number.isFinite(hours) || hours < 72) return null;
  return {
    severity: 'soon',
    code: 'reminder_job_quiet',
    headline: `No renewal reminder has been sent for ${Math.round(hours)} hours`,
    detail:
      'That can simply mean nobody was due. It can also mean the job is not running, '
      + 'which is how this system spent weeks collecting nothing.',
    action: 'Confirm the scheduler still registers RenewalReminders and that RENEWAL_REMINDERS_ENABLED is true.',
    rows: [`last successful send: ${row?.last_sent ?? 'never'}`],
  };
}

/**
 * A card that dies before the member's next charge.
 *
 * Shabana Zeeshan's card expired the month before her renewal and nothing said so.
 * On manual billing that is a failed click; on a schedule it is a decline on day
 * one, which is the worst possible first impression for automatic billing.
 */
async function checkExpiringCards(cardExpiryByEmail: Map<string, string>): Promise<Finding | null> {
  if (!cardExpiryByEmail.size) return null;
  const rows = await sequelize.query<{ full_name: string; email: string; next_charge: string }>(
    `SELECT DISTINCT ON (s.enrollment_id) e.full_name, e.email,
            s.current_period_end::date::text AS next_charge
       FROM subscriptions s JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.status = 'active' AND s.plan <> 'comp'
      ORDER BY s.enrollment_id, s.current_period_end DESC`,
    { type: QueryTypes.SELECT },
  );
  const bad: string[] = [];
  for (const r of rows) {
    const exp = cardExpiryByEmail.get(String(r.email).toLowerCase());
    if (!exp) continue;
    const m = exp.match(/(\d{1,2})\D+(\d{2,4})/);
    if (!m) continue;
    const yr = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    const endOfExpiryMonth = new Date(Date.UTC(yr, Number(m[1]), 0));
    if (endOfExpiryMonth < new Date(r.next_charge)) {
      bad.push(`${r.full_name} <${r.email}> card expires ${exp}, next charge ${r.next_charge}`);
    }
  }
  if (!bad.length) return null;
  return {
    severity: 'soon',
    code: 'card_expires_before_charge',
    headline: `${bad.length} member(s) have a card that expires before their next charge`,
    detail: 'The charge will decline. On a standing schedule it declines on the first attempt.',
    action: 'Ask them to enter a current card at their next renewal, and hold them out of any schedule migration.',
    rows: bad,
  };
}

/**
 * Money arrived that we cannot tie to anybody.
 *
 * A scheduled charge carries no checkout reference, so if the webhook matcher ever
 * regresses, payments land at the gateway and no member's period advances. It
 * looks exactly like having no recurring billing, which is the failure this whole
 * build exists to remove.
 */
async function checkSchedulesMatchBook(scheduleIdsAtGateway: string[]): Promise<Finding | null> {
  const rows = await sequelize.query<{ sid: string }>(
    `SELECT paysimple_schedule_id AS sid FROM subscriptions
      WHERE paysimple_schedule_id IS NOT NULL AND status IN ('active','past_due')`,
    { type: QueryTypes.SELECT },
  );
  const ours = new Set(rows.map((r) => String(r.sid)));
  const orphaned = scheduleIdsAtGateway.filter((id) => !ours.has(String(id)));
  const missing = [...ours].filter((id) => !scheduleIdsAtGateway.includes(String(id)));
  if (!orphaned.length && !missing.length) return null;
  return {
    severity: 'act_now',
    code: 'schedule_book_mismatch',
    headline: 'The schedules at PaySimple and the ones we think we have do not agree',
    detail:
      'A schedule the gateway has but we do not will charge someone with nothing on our side recording it. '
      + 'A schedule we think exists but the gateway does not means a member silently stops being billed.',
    action: 'Reconcile before anything else. Do not create more schedules until this is zero.',
    rows: [
      ...orphaned.map((id) => `at gateway but not in our book: ${id}`),
      ...missing.map((id) => `in our book but not at gateway: ${id}`),
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Milestones                                                         */
/* ------------------------------------------------------------------ */

export interface Milestone {
  on: string;           // YYYY-MM-DD
  what: string;
  why: string;
}

/**
 * Dates where something specific should have happened, so it gets checked on the
 * day rather than discovered later. These are the moments this build has never
 * been through before, which is exactly when a watch is worth having.
 */
export const MILESTONES: Milestone[] = [
  { on: '2026-08-31', what: 'The August renewal wave completes',
    why: '15 members were due 23-31 Aug on manual links. This is the first real read on how many pay without being chased.' },
  { on: '2026-09-04', what: 'THE FIRST AUTOMATIC CHARGE IN THIS PLATFORM\'S HISTORY',
    why: 'Two schedules fire today, $199 each. Nothing has ever taken money here without a member clicking a link, so this is the '
      + 'day that assumption stops holding. Confirm both charges settled, the periods advanced, and that neither member was ALSO '
      + 'sent a payment link for the same month.' },
  { on: '2026-09-13', what: 'The September wave completes',
    why: 'The remaining monthly members renew 3-13 Sep. The 35 without a schedule still pay by hand, so this reads whether manual '
      + 'collection is holding for the population auto-pay has not reached.' },
  { on: '2026-09-30', what: 'The August cohort\'s first automatic charge',
    why: 'Members whose period ended 30-31 Aug were promised auto-pay would start at their NEXT cycle, so their schedules first fire '
      + 'today rather than a month ago. If these do not land, the migration honoured the promise but not the collection.' },
  { on: '2026-12-12', what: 'Elizabeth Nzau schedule 4504746 fires',
    why: 'The first schedule this platform ever created, and the only one that predates the 2026-09-01 migration.' },
];

export function milestonesFor(todayIso: string): Milestone[] {
  return MILESTONES.filter((m) => m.on === todayIso);
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

export interface HealthResult {
  findings: Finding[];
  milestones: Milestone[];
  needsAttention: boolean;
  checkedAt: string;
}

/**
 * @param gateway optional live data. Passing nothing runs the database-only checks,
 *        which is what a plain local run does; the cron passes real gateway state.
 */
export async function runBillingHealthCheck(
  gateway: { scheduleIds?: string[]; cardExpiryByEmail?: Map<string, string> } = {},
  todayIso: string = new Date().toISOString().slice(0, 10),
): Promise<HealthResult> {
  const findings: Finding[] = [];
  const push = (f: Finding | null) => { if (f) findings.push(f); };

  // Each check is isolated: one failing query must not blind the rest.
  for (const [name, fn] of Object.entries({
    duplicateActive: () => checkDuplicateActive(),
    lapsedNoFollowup: () => checkLapsedWithoutFollowup(),
    reminderAlive: () => checkReminderJobAlive(),
    expiringCards: () => checkExpiringCards(gateway.cardExpiryByEmail ?? new Map()),
    scheduleMatch: () => (gateway.scheduleIds ? checkSchedulesMatchBook(gateway.scheduleIds) : Promise.resolve(null)),
  })) {
    try {
      push(await fn());
    } catch (err: any) {
      findings.push({
        severity: 'soon',
        code: 'check_failed',
        headline: `The "${name}" check could not run`,
        detail: String(err?.message || err),
        action: 'A check that cannot run is not a passing check. Fix it before trusting a quiet report.',
      });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const milestones = milestonesFor(todayIso);

  return {
    findings,
    milestones,
    // Silence when healthy: a milestone or a real finding is the only reason to write.
    needsAttention: findings.length > 0 || milestones.length > 0,
    checkedAt: new Date().toISOString(),
  };
}
