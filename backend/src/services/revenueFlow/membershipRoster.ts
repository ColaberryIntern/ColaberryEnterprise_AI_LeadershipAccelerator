import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { tableExists } from './tableExists';
import {
  ClassifiableSubscription,
  MembershipStageKey,
  day,
  stagesForSubscription,
} from './membershipStages';

/**
 * R26 — who is actually in a membership funnel stage.
 *
 * Taiwo Oludimimu, 25 Nov 2026: "can you make the data points clickable so they show a list of
 * students or leads that fall within each category?" This is the list behind the count.
 *
 * ── THE LIST IS FILTERED BY THE SAME CLASSIFIER THAT PRODUCED THE COUNT ──────────────────
 *
 * Not by a per-stage SQL WHERE clause. `membershipStages` holds the rules once, the funnel
 * tallies them and this filters by them, so a count of 27 cannot sit above a list of 32. The
 * rules are fiddly enough — overlapping stages, the comp check running before the payment
 * check, a lapsed term still reading `active` — that a second implementation would drift, and
 * the drift would be invisible until somebody counted the rows on screen.
 *
 * ── NOBODY IS INVENTED, AND NOBODY IS DROPPED ────────────────────────────────────────────
 *
 * Every subscription row carries a NOT NULL `enrollment_id`, and all 296 resolved to an
 * enrollment on 2026-11-25, so a missing name is not expected. It is still handled: an
 * unresolved row is listed with its absence stated rather than silently omitted, because a
 * roster quietly shorter than its own count is the exact failure this module is built to
 * prevent.
 */

export const MEMBERSHIP_STAGE_LABELS: Record<MembershipStageKey, string> = {
  signed_up: 'Signed up',
  never_paid: 'Never paid',
  failed: 'Payment failed',
  comped: 'Comped',
  paying: 'Paying now',
  lapsed: 'Term ran out',
  renewal_due: 'Renewal ahead',
  churned: 'Canceled after paying',
  refunded: 'Refunded',
};

/** One subscription or refund row, under the person who holds it. */
export interface RosterRow {
  rowId: string;
  /** What this row is in the stage's own terms: plan, amount, and the date that matters. */
  detail: string;
}

/**
 * One PERSON in a stage, with every row they hold in it. R27.
 *
 * ── WHY THIS IS GROUPED, AND WHY THE ROWS ARE KEPT ───────────────────────────────────────
 *
 * Ali, 25 Nov 2026, testing the stage roster: "Looks like a lot of duplicates in the list. If
 * they are legit, group them and show information pertinent to what she would want to know."
 *
 * They are legitimate. Measured on production the same day: 296 subscription rows belong to
 * 115 distinct people, one enrollment carries 18 of them, and 57 people hold exactly one. A
 * renewal, a plan change and a retried payment each write another `subscriptions` row, so a
 * row is a SUBSCRIPTION and listing rows shows the same name eight times to a reader who came
 * looking for people.
 *
 * The rows are kept rather than collapsed away, because `rowCount` is the finding a support
 * reader needs: four rows at "Payment failed" is somebody who tried four times, and deduping
 * to one name would delete exactly the fact worth acting on.
 */
export interface RosterPerson {
  /** Stable within a stage: the email where there is one, so two enrolments merge into one human. */
  personKey: string;
  /** The person's name, or null when the row does not resolve to one. Never a placeholder. */
  name: string | null;
  email: string | null;
  /** For the 360 link when no email exists. The frontend prefers email; this is the fallback. */
  enrollmentId: string | null;
  /** How many rows this person holds IN THIS STAGE. The reason grouping does not lose anything. */
  rowCount: number;
  rows: RosterRow[];
  /** What differs between those rows, in words, when there is more than one. */
  summary: string | null;
  /** Said plainly when the row carries no person, instead of printing a dash. */
  unresolvedReason: string | null;
}

export interface StageRoster {
  stageKey: MembershipStageKey;
  label: string;
  /**
   * The number the FUNNEL shows, which counts subscription rows.
   *
   * Kept and reported alongside `personCount` rather than replaced by it. Grouping by person
   * broke the old "count equals the number of rows listed" invariant, and the honest fix is
   * to show both numbers and say which is which, not to quietly start reporting a different
   * one under the same name. Always equal to the sum of every person's `rowCount`.
   */
  subscriptionCount: number;
  /** How many PEOPLE those rows belong to. Always equal to `people.length`. */
  personCount: number;
  people: RosterPerson[];
  /** Why the list is empty, when it is. Null when there is nothing to explain. */
  emptyNote: string | null;
  provenance: string;
}

interface SubRosterRow extends ClassifiableSubscription {
  id: string;
  enrollment_id: string | null;
  full_name: string | null;
  email: string | null;
  started_at: string | null;
  canceled_at: string | null;
}

interface RefundRosterRow {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string | null;
  reason: string | null;
  enrollment_id: string | null;
  full_name: string | null;
  enrollment_email: string | null;
  customer_email: string | null;
}

/**
 * Fold rows into people, preserving every row.
 *
 * The key is the EMAIL where there is one, so the same human holding two enrolments appears
 * once; a reader chasing a support question does not care that the billing system filed them
 * twice. Where there is no email the enrolment is the key, and where there is neither the row
 * is its own group — which keeps an unresolved row visible instead of collapsing several
 * unrelated ones into a single nameless entry.
 */
function groupByPerson(
  entries: Array<{
    rowId: string;
    detail: string;
    name: string | null;
    email: string | null;
    enrollmentId: string | null;
    unresolvedReason: string | null;
  }>,
  summarize: (rows: RosterRow[]) => string | null,
): RosterPerson[] {
  const byKey = new Map<string, RosterPerson>();

  for (const e of entries) {
    const key = (e.email && e.email.includes('@') ? e.email.toLowerCase() : null)
      ?? e.enrollmentId
      ?? `row:${e.rowId}`;

    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push({ rowId: e.rowId, detail: e.detail });
      existing.rowCount += 1;
      // A name can be missing on one row and present on another; take the first real one
      // rather than letting row order decide whether this person has a name.
      if (!existing.name && e.name) existing.name = e.name;
      if (!existing.email && e.email) existing.email = e.email;
      if (!existing.enrollmentId && e.enrollmentId) existing.enrollmentId = e.enrollmentId;
      if (existing.name) existing.unresolvedReason = null;
      continue;
    }

    byKey.set(key, {
      personKey: key,
      name: e.name,
      email: e.email,
      enrollmentId: e.enrollmentId,
      rowCount: 1,
      rows: [{ rowId: e.rowId, detail: e.detail }],
      summary: null,
      unresolvedReason: e.unresolvedReason,
    });
  }

  const people = Array.from(byKey.values());
  for (const p of people) p.summary = p.rowCount > 1 ? summarize(p.rows) : null;

  // Most rows first: a person with eight subscriptions in one stage is the one a support
  // reader needs to see, and burying them alphabetically is how it gets missed. Named people
  // before unnamed, then by name, so the order is stable between reads.
  people.sort((a, b) => {
    if (a.rowCount !== b.rowCount) return b.rowCount - a.rowCount;
    if (!a.name && b.name) return 1;
    if (a.name && !b.name) return -1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
  return people;
}

const dollars = (cents: number): string =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/**
 * Why one person holds several rows in this stage, in words.
 *
 * Facts read off the rows, never a guess at intent: a renewal, a plan change and a retried
 * payment all look like "another row" and the detail lines are what tell them apart. Said once
 * per person rather than repeated on every row.
 */
function summarizeSubscriptions(rows: RosterRow[]): string {
  return `${rows.length} subscription rows for this person in this stage. Each is a separate `
    + 'record: a renewal, a plan change or a retried payment all write another row, so the '
    + 'count is the history rather than a duplicate.';
}

/** What this row is, in the terms the stage cares about. Facts from the row, never a judgment. */
function detailFor(r: SubRosterRow, stage: MembershipStageKey): string {
  const amount = r.amount_cents === 0 ? '$0' : dollars(r.amount_cents);
  const plan = `${r.plan} plan, ${amount}`;
  const end = day(r.current_period_end);

  if (stage === 'lapsed') {
    return end
      ? `${plan}. Paid term ended ${end} and the row is still marked active.`
      : `${plan}. No period end is recorded, so no running term can be shown.`;
  }
  if (stage === 'paying' || stage === 'renewal_due') {
    return end ? `${plan}. Term runs to ${end}.` : `${plan}. No period end recorded.`;
  }
  if (stage === 'churned') {
    return `${plan}. Canceled ${day(r.canceled_at) ?? 'on an unrecorded date'}, after paying.`;
  }
  if (stage === 'comped') return `${plan}. An active comp seat, so no revenue.`;
  if (stage === 'failed') return `${plan}. The payment failed, so this seat was never paid for.`;
  if (stage === 'never_paid') {
    return `${plan}. No payment id was ever recorded against this row.`;
  }
  return `${plan}. Started ${day(r.started_at) ?? 'on an unrecorded date'}.`;
}

/**
 * The people in one membership stage.
 *
 * Returns null for a stage this stream does not have, so the caller can 404 rather than
 * render an empty list that implies the stage exists and is empty.
 */
export async function getMembershipStageRoster(
  stageKey: string,
  now: Date = new Date(),
): Promise<StageRoster | null> {
  if (!(stageKey in MEMBERSHIP_STAGE_LABELS)) return null;
  const stage = stageKey as MembershipStageKey;
  const label = MEMBERSHIP_STAGE_LABELS[stage];

  if (stage === 'refunded') return refundRoster(label);

  if (!(await tableExists('subscriptions'))) {
    return {
      stageKey: stage,
      label,
      subscriptionCount: 0,
      personCount: 0,
      people: [],
      emptyNote:
        'subscriptions is not present in this database, so nobody can be listed. That is a '
        + 'missing source, not an empty stage.',
      provenance: 'subscriptions, joined to enrollments for the name.',
    };
  }

  // LEFT JOIN, deliberately: an INNER JOIN would silently shorten this list relative to the
  // count beside it, which is the one failure this module exists to prevent.
  const rows = await sequelize.query<SubRosterRow>(
    `SELECT s.id,
            s.plan::text              AS plan,
            s.status::text            AS status,
            COALESCE(s.amount_cents, 0)::int AS amount_cents,
            (s.paysimple_payment_id IS NOT NULL) AS has_payment,
            s.current_period_end::text,
            s.started_at::text,
            s.canceled_at::text,
            s.enrollment_id::text,
            e.full_name,
            e.email
       FROM subscriptions s
       LEFT JOIN enrollments e ON e.id = s.enrollment_id`,
    { type: QueryTypes.SELECT },
  );

  const todayIso = day(now.toISOString()) as string;
  const matched = rows.filter((r) => stagesForSubscription(r, todayIso).includes(stage));

  const people = groupByPerson(
    matched.map((r) => ({
      rowId: r.id,
      detail: detailFor(r, stage),
      name: r.full_name,
      email: r.email,
      enrollmentId: r.enrollment_id,
      unresolvedReason: r.full_name
        ? null
        : 'This subscription does not resolve to an enrollment, so no name is recorded for it.',
    })),
    summarizeSubscriptions,
  );

  return {
    stageKey: stage,
    label,
    // From the rows, not from a second query: this is the number the funnel shows, and the two
    // cannot disagree because both are the same filtered list.
    subscriptionCount: matched.length,
    personCount: people.length,
    people,
    emptyNote: people.length === 0
      ? `Nobody is at "${label}" right now. That is a measured zero: the table was read and no `
        + 'row matched this stage.'
      : null,
    provenance:
      'subscriptions, classified by the same rules that produce the count above, and joined '
      + 'to enrollments for the name. No row is excluded for failing to resolve.',
  };
}

/**
 * Refunds are a different population with their own link to a person, so they are read
 * separately rather than classified from a subscription row.
 */
async function refundRoster(label: string): Promise<StageRoster> {
  const provenance =
    'refunds that are not status=failed, joined to enrollments where the row records one, '
    + 'falling back to the customer email the refund itself carries.';

  if (!(await tableExists('refunds'))) {
    return {
      stageKey: 'refunded',
      label,
      subscriptionCount: 0,
      personCount: 0,
      people: [],
      emptyNote:
        'refunds is not present in this database, so nobody can be listed. That is a missing '
        + 'source, not an absence of refunds.',
      provenance,
    };
  }

  const rows = await sequelize.query<RefundRosterRow>(
    `SELECT r.id,
            COALESCE(r.amount_cents, 0)::int AS amount_cents,
            r.status::text AS status,
            r.created_at::text,
            r.reason,
            r.enrollment_id::text,
            e.full_name,
            e.email       AS enrollment_email,
            r.customer_email
       FROM refunds r
       LEFT JOIN enrollments e ON e.id = r.enrollment_id
      WHERE r.status::text <> 'failed'`,
    { type: QueryTypes.SELECT },
  );

  const people = groupByPerson(
    rows.map((r) => ({
      rowId: r.id,
      detail: `${dollars(r.amount_cents)} refunded ${day(r.created_at) ?? 'on an unrecorded date'}`
        + `${r.reason ? `. Reason: ${r.reason}` : '.'}`,
      name: r.full_name,
      // The refund's own customer_email is a real fallback rather than a guess: it is the
      // address the refund was issued against.
      email: r.enrollment_email ?? r.customer_email,
      enrollmentId: r.enrollment_id,
      unresolvedReason: r.full_name
        ? null
        : 'This refund does not resolve to an enrollment, so no name is recorded for it.',
    })),
    (rs) => `${rs.length} separate refunds to this person.`,
  );

  return {
    stageKey: 'refunded',
    label,
    subscriptionCount: rows.length,
    personCount: people.length,
    people,
    emptyNote: people.length === 0
      ? 'No settled refund has been recorded. That is a measured zero.'
      : null,
    provenance,
  };
}
