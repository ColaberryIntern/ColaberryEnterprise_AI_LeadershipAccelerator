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

export interface RosterPerson {
  /** The subscription or refund row, so a reader can be pointed at the exact record. */
  rowId: string;
  /** The person's name, or null when the row does not resolve to one. Never a placeholder. */
  name: string | null;
  email: string | null;
  /** What this row is in the stage's own terms: plan, amount, and the date that matters. */
  detail: string;
  /** Said plainly when the row carries no person, instead of printing a dash. */
  unresolvedReason: string | null;
}

export interface StageRoster {
  stageKey: MembershipStageKey;
  label: string;
  /** Always equal to `people.length`. The funnel's count is produced the same way. */
  count: number;
  people: RosterPerson[];
  /** Why the list is empty, when it is. Null when there is nothing to explain. */
  emptyNote: string | null;
  provenance: string;
}

interface SubRosterRow extends ClassifiableSubscription {
  id: string;
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
  full_name: string | null;
  enrollment_email: string | null;
  customer_email: string | null;
}

const dollars = (cents: number): string =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

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
      count: 0,
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
            e.full_name,
            e.email
       FROM subscriptions s
       LEFT JOIN enrollments e ON e.id = s.enrollment_id`,
    { type: QueryTypes.SELECT },
  );

  const todayIso = day(now.toISOString()) as string;
  const people: RosterPerson[] = rows
    .filter((r) => stagesForSubscription(r, todayIso).includes(stage))
    .map((r) => ({
      rowId: r.id,
      name: r.full_name,
      email: r.email,
      detail: detailFor(r, stage),
      unresolvedReason: r.full_name
        ? null
        : 'This subscription does not resolve to an enrollment, so no name is recorded for it.',
    }));

  // Sorted by name so the list is stable between reads. Unresolved rows last, where they read
  // as the exception they are rather than as the start of the list.
  people.sort((a, b) => {
    if (!a.name && b.name) return 1;
    if (a.name && !b.name) return -1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  return {
    stageKey: stage,
    label,
    count: people.length,
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
      count: 0,
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
            e.full_name,
            e.email       AS enrollment_email,
            r.customer_email
       FROM refunds r
       LEFT JOIN enrollments e ON e.id = r.enrollment_id
      WHERE r.status::text <> 'failed'`,
    { type: QueryTypes.SELECT },
  );

  const people: RosterPerson[] = rows.map((r) => ({
    rowId: r.id,
    name: r.full_name,
    // The refund's own customer_email is a real fallback rather than a guess: it is the
    // address the refund was issued against.
    email: r.enrollment_email ?? r.customer_email,
    detail: `${dollars(r.amount_cents)} refunded ${day(r.created_at) ?? 'on an unrecorded date'}`
      + `${r.reason ? `. Reason: ${r.reason}` : '.'}`,
    unresolvedReason: r.full_name
      ? null
      : 'This refund does not resolve to an enrollment, so no name is recorded for it.',
  }));

  people.sort((a, b) => (a.name ?? '￿').localeCompare(b.name ?? '￿'));

  return {
    stageKey: 'refunded',
    label,
    count: people.length,
    people,
    emptyNote: people.length === 0
      ? 'No settled refund has been recorded. That is a measured zero.'
      : null,
    provenance,
  };
}
