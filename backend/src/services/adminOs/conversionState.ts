/**
 * T210 — one definition of "has this person converted", and one lifecycle-stage
 * derivation built on it.
 *
 * THE DEFECT THIS FIXES. Both stage derivations — `peopleService.STAGE_SQL` and
 * the inline CASE in `personProfileService` — read:
 *
 *     WHEN e.email IS NOT NULL THEN 'enrolled_student'
 *
 * The mere EXISTENCE of an enrollments row staged a person as an enrolled
 * student. Every free AI Explorer was therefore represented as converted because
 * a row existed, which is the opposite of what the row says: those accounts carry
 * `payment_status: 'pending'` and have paid nothing. Conversion is now derived
 * from authoritative paid/subscription state instead.
 *
 * TWO QUESTIONS, NOT ONE, AND CONFLATING THEM IS THE TRAP. A `plan: 'comp'`
 * subscription is an admin-granted seat — `Subscription.ts:13-17`, "Free Access —
 * full program access at $0, never billed":
 *
 *   - "Is this person a paying customer?"  comp => NO.  Revenue must not count a
 *     granted seat as conversion. This is `IS_CONVERTED_SQL` / `isConverted`.
 *   - "Does this person have program access?" comp => YES. They are a student by
 *     entitlement and belong in the student-facing stage. This is the extra
 *     `has_comp_seat` term in `STAGE_CASE_SQL`.
 *
 * T207's backfill asks the FIRST question's mirror image — "does this row hold
 * granted access, so must it not be demoted?" — and there comp counts as paid.
 * Both are correct. They are one `git grep` apart, so if you are about to unify
 * them into a single predicate: don't. Read this paragraph again instead.
 *
 * WHY THE SQL AND THE TS PREDICATE BOTH LIVE HERE. The stage is computed in SQL
 * over an aggregate of every enrolment for an email; `subjectResolver`'s customer
 * fact is computed in TypeScript over one enrolment. They cannot share an
 * implementation, so they share a MODULE and a documented rule, and a drift
 * tripwire asserts neither file restates the rule inline.
 */

/**
 * Fact aggregates to add inside an `enrollments` subquery that groups by
 * lowercased email. Requires the subquery to alias `enrollments` as `e` and to
 * LEFT JOIN `subscriptions s ON s.enrollment_id = e.id` (see
 * `ENROLLMENT_FACTS_JOIN`).
 *
 * `bool_or` rather than `max()` throughout, for the reason both call sites
 * already carry in a comment: `max()` on text is ALPHABETICAL, which is how
 * 'withdrawn' once beat 'active' and mislabelled 29 people as lapsed.
 */
export const ENROLLMENT_FACTS_SQL = `
             bool_or(e.payment_status = 'paid' AND e.tier <> 'guest') AS has_paid_enrollment,
             bool_or(s.id IS NOT NULL AND s.plan <> 'comp') AS has_paid_subscription,
             bool_or(s.id IS NOT NULL AND s.plan = 'comp') AS has_comp_seat,
             bool_or(e.enrollment_type = 'explorer') AS has_explorer`;

/**
 * The join the facts need. Restricted to subscriptions that actually hold access
 * open; `past_due` counts because a failed charge is a billing problem, not a
 * reason to re-stage somebody out of the programme.
 */
export const ENROLLMENT_FACTS_JOIN =
  `LEFT JOIN subscriptions s ON s.enrollment_id = e.id AND s.status IN ('active','past_due')`;

/**
 * ONE conversion definition, as SQL over the aggregated facts.
 *
 * Deliberately excludes `has_comp_seat`: a granted seat is not revenue. The
 * stage derivation adds that term separately and says why.
 */
export const IS_CONVERTED_SQL = `(e.has_paid_enrollment OR e.has_paid_subscription)`;

/** Program access = converted, or holding a granted comp seat. */
export const HAS_PROGRAM_ACCESS_SQL = `(${IS_CONVERTED_SQL} OR e.has_comp_seat)`;

/**
 * The single lifecycle-stage derivation. Both roster and profile import this.
 *
 * Branch order is load-bearing:
 *  1. `withdrawn` first, so somebody who paid and then left is LAPSED, not a
 *     current student. The `e.status` aggregate already prefers active over
 *     withdrawn, so reaching here means every enrolment for this email ended.
 *  2. Program access next — the fix. Paid, or a granted seat.
 *  3. Explorer: an account on the free AI programme. Evidenced by
 *     `enrollment_type = 'explorer'`, which is what Explorer Growth itself
 *     filters on (`explorerIdentityBridge` loadActiveExplorers).
 *  4. An unpaid, non-Explorer account holder — an org teammate or an AI Flotation
 *     prospect — falls through to the lead/applicant branches ON PURPOSE. They
 *     have a free account, not a programme: calling them an Explorer would
 *     undo exactly what T207 protected, and calling them a student is the bug
 *     being fixed.
 */
export const STAGE_CASE_SQL = `
  CASE
    WHEN e.status = 'withdrawn' THEN 'lapsed'
    WHEN e.email IS NOT NULL AND ${HAS_PROGRAM_ACCESS_SQL} THEN 'enrolled_student'
    WHEN e.email IS NOT NULL AND e.has_explorer THEN 'explorer'
    WHEN l.pipeline_stage IS NOT NULL AND l.pipeline_stage <> 'new_lead' THEN 'applicant'
    ELSE 'lead'
  END`;

/** The facts the TS predicate needs, named exactly as the SQL aggregates. */
export interface ConversionFacts {
  has_paid_enrollment: boolean;
  has_paid_subscription: boolean;
  has_comp_seat?: boolean;
}

/**
 * The SAME conversion rule in TypeScript, for callers holding one enrolment
 * rather than a SQL aggregate.
 *
 * `subjectResolver.customerFactFor` is the caller. Before T210 it had no comp
 * term at all, so an admin-granted $0 seat read as a paying customer and the
 * strategy brief addressed them as one.
 */
export function isConverted(facts: ConversionFacts): boolean {
  return Boolean(facts.has_paid_enrollment || facts.has_paid_subscription);
}

/** Program access in TypeScript — converted, or a granted comp seat. */
export function hasProgramAccess(facts: ConversionFacts): boolean {
  return isConverted(facts) || Boolean(facts.has_comp_seat);
}
