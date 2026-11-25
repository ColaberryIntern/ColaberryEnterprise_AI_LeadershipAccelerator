/**
 * R26 — which funnel stages one subscription row belongs to.
 *
 * Taiwo Oludimimu, Admissions and Support Supervisor, 25 Nov 2026, on the Revenue Room:
 * "can you make the data points clickable so they show a list of students or leads that fall
 * within each category?" Ali's call the same day: build it for every stage.
 *
 * ── WHY THE RULES MOVED OUT OF THE TALLY LOOP ────────────────────────────────────────────
 *
 * The counts were computed by a loop in `membershipFlow` that classified each row inline. To
 * also LIST the people in a stage, something has to answer "which rows are in stage X", and
 * there were two ways to do it:
 *
 *   1. Write a SQL WHERE clause per stage.
 *   2. Extract the classification once and derive both the count and the list from it.
 *
 * The first is how a page ends up showing a count of 27 above a list of 32. The rules here
 * are genuinely fiddly — one row can be in several stages, the comp check runs before the
 * payment check, and a lapsed term still reads `active` in the database — so a second
 * implementation in another language would drift, and the drift would be invisible until
 * someone counted the rows on screen. A number that disagrees with the list beneath it
 * discredits the whole page, which is the one thing this surface cannot afford.
 *
 * So there is ONE classifier. `membershipFlow` tallies it, `membershipRoster` filters by it,
 * and a test asserts that for every stage the roster length equals the count. That invariant
 * is true by construction rather than by maintenance.
 *
 * ── WHAT IS REPRODUCED EXACTLY, INCLUDING ITS ODDITIES ───────────────────────────────────
 *
 * This is a move, not a redesign. Two behaviours look like bugs and are preserved deliberately,
 * because changing them here would silently move the numbers on a page people already read:
 *
 *   - **A row can be in more than one stage.** A `failed` row is counted under BOTH
 *     "Payment failed" and "Never paid", which is why the Count column does not sum to the
 *     number of rows. The stages answer different questions: one is "what went wrong", the
 *     other is "how much of the plan is fiction".
 *   - **`renewal_due` does not exclude comps.** It came from a separate `.filter()` over the
 *     same rows that checks only `active + has_payment + term ahead`, while the tally loop
 *     catches comps first and stops. So a comp row carrying a payment id lands in BOTH
 *     "Comped" and "Renewal ahead". That is the existing behaviour; correcting it is a change
 *     to a published number and belongs in its own ticket.
 */

/** The nine stages the membership funnel reports, in the page's reading order. */
export type MembershipStageKey =
  | 'signed_up'
  | 'never_paid'
  | 'failed'
  | 'comped'
  | 'paying'
  | 'lapsed'
  | 'renewal_due'
  | 'churned'
  | 'refunded';

/**
 * The eight stages decided by a subscription row.
 *
 * `refunded` is NOT one of them: it comes from the `refunds` table, which is a different
 * population with its own link to a person, so it is resolved by the roster service instead.
 */
export const SUBSCRIPTION_STAGES: readonly MembershipStageKey[] = [
  'signed_up', 'never_paid', 'failed', 'comped', 'paying', 'lapsed', 'renewal_due', 'churned',
];

/** The fields the classification actually reads. Narrow on purpose, so it stays pure. */
export interface ClassifiableSubscription {
  plan: string;
  status: string;
  amount_cents: number;
  has_payment: boolean;
  current_period_end: string | null;
}

/**
 * Day precision, matching the funnel's own comparison.
 *
 * ISO day strings sort lexicographically in date order, so the comparison needs no Date
 * parsing per row — which is also why the caller passes ONE `todayIso` rather than letting
 * each check read the clock. Two clock reads microseconds apart are harmless every day of the
 * year except across midnight, where one row could be counted as lapsed AND renewal-ahead.
 */
export function day(iso: string | null): string | null {
  return iso ? String(iso).slice(0, 10) : null;
}

/**
 * Every stage this row belongs to.
 *
 * Returns an array rather than one key because the stages overlap by design (see the header).
 * The order inside the array is not meaningful; membership in it is.
 */
export function stagesForSubscription(
  s: ClassifiableSubscription,
  todayIso: string,
): MembershipStageKey[] {
  const out: MembershipStageKey[] = ['signed_up'];
  const isComp = s.plan === 'comp' || s.amount_cents === 0;
  const end = day(s.current_period_end);

  // Evaluated BEFORE the branches below, because in the original this was a separate filter
  // over the same rows and therefore saw rows the tally loop had already stopped on. Moving
  // it inside the branches would quietly drop the comp-with-a-payment-id case.
  if (s.status === 'active' && s.has_payment && end !== null && end >= todayIso) {
    out.push('renewal_due');
  }

  if (s.status === 'active' && isComp) {
    out.push('comped');
    return out;
  }

  if (s.status === 'active' && s.has_payment) {
    // `status = 'active'` alone was read as "paying" until 2026-11-16, and that was wrong for
    // 9 of 29 monthly rows, one of them 79 days past its period end. Nothing in this system
    // cancels a lapse: the row stays active and nobody is billed. Counting those as revenue
    // overstated the annualized figure by $26,268 a year. They are not churn either, because
    // the member never said anything, so they get their own stage.
    //
    // A missing current_period_end lands here too: a different cause with the same
    // consequence, since no term can be shown to be running.
    out.push(end === null || end < todayIso ? 'lapsed' : 'paying');
    return out;
  }

  if (s.status === 'canceled') {
    out.push(s.has_payment ? 'churned' : 'never_paid');
    return out;
  }

  if (s.status === 'failed') {
    // Counted in BOTH, deliberately. See the header.
    out.push('failed', 'never_paid');
    return out;
  }

  if (!s.has_payment) out.push('never_paid');
  return out;
}

/**
 * Count the rows in each stage, from the same classification the roster uses.
 *
 * Exported so `membershipFlow` cannot tally by any other route: if the counts came from one
 * place and the lists from another, the guarantee this module exists for would be gone.
 */
export function tallyStages(
  rows: readonly ClassifiableSubscription[],
  todayIso: string,
): Record<MembershipStageKey, number> {
  const counts = {
    signed_up: 0,
    never_paid: 0,
    failed: 0,
    comped: 0,
    paying: 0,
    lapsed: 0,
    renewal_due: 0,
    churned: 0,
    refunded: 0,
  } as Record<MembershipStageKey, number>;

  for (const r of rows) {
    for (const stage of stagesForSubscription(r, todayIso)) counts[stage] += 1;
  }
  return counts;
}
