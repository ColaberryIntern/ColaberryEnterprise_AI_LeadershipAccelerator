/**
 * LINKING A REVENUE ENROLLMENT TO THE MARKETING LEAD IT CAME FROM (R18).
 *
 * `enrollments.lead_id` is the edge added by `db/ensureEnrollmentLeadIdSchema.ts`. This module is
 * the decision that fills it: given the `leads` rows matching a person's email, which one is the
 * lead this enrollment came from. The decision is pulled out of the model hook so it can be tested
 * without a database, a request or a clock, matching how `utmBackfill.ts` sits beside
 * `/api/t/identify`.
 *
 * ── WHY EMAIL, AND WHY THAT IS ENOUGH HERE ───────────────────────────────────────────
 *
 * Email is the only identifier the two sides share. That is normally a weak join, and on this
 * data it is not: measured against production on 2026-11-17, of 1,436 distinct enrollment emails,
 * 1,336 match exactly one `leads` row, 100 match none, and **zero match more than one**. There is
 * no ambiguity to resolve in the live book.
 *
 * `pickLeadForEnrollment` still handles multiplicity rather than asserting it away, because the
 * database does not enforce it: `leads` has no unique index on email, so a duplicate is a future
 * data-entry event, not an impossibility. What it must never do is pick differently on two runs
 * over the same rows — a link that moves is worse than a link that is missing, because a revenue
 * figure built on it would change without anything happening.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────────────
 *
 * The OLDEST matching lead row wins, and this is deliberately NOT the rule `utmBackfill` uses.
 *
 * `pickAttributionSession` picks the NEWEST session carrying a campaign, because it is choosing
 * among repeated visits by one known person and wants the touch nearest the signup. This function
 * is choosing among duplicate *identities* for one person, where the oldest row is the person's
 * first appearance in the system — the acquisition event the enrollment actually descends from.
 * Picking the newest here would re-attribute a paying member to whichever marketing list imported
 * their address most recently, which is the "quietly turns last-touch into first-touch" failure
 * ADS-3 removed, pointed the other way.
 *
 * It is also the only choice that is stable: the oldest row cannot change as more rows arrive,
 * so re-running the backfill, or creating a second enrollment for the same person years later,
 * yields the same lead. `created_at` ties break on the lower `id`, so the rule is total.
 *
 * ── WHAT THIS DOES NOT CLAIM ─────────────────────────────────────────────────────────
 *
 * A link is not an attribution. It says which lead row this enrollment belongs to; whether that
 * lead carries a campaign, and whether that campaign deserves the credit, stays with
 * `campaignAttributionService` and its four models — which already report identity coverage
 * rather than assuming it. A member whose lead has no UTM tags is linked and still unattributed,
 * and that is the honest state, not a gap to paper over.
 *
 * Pure: rows in, an id out.
 */

/** The fields of a `leads` row this decision reads. Anything carrying them will do. */
export interface LinkableLead {
  id: number;
  created_at?: Date | string | null;
}

/** Milliseconds for a `created_at`, or `null` when it cannot be read. */
function createdAtMs(lead: LinkableLead): number | null {
  const raw = lead?.created_at;
  if (!raw) return null;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The lead this enrollment came from, or `null` when there is none.
 *
 * A row whose `created_at` cannot be read sorts AFTER every readable one rather than being
 * dropped. Dropping it would mean a single unreadable timestamp could cost the link entirely when
 * it is the only candidate; sorting it last means it is used only when nothing better exists.
 * That matches how `utmBackfill` treats an unreadable session stamp: a missing field must not
 * silently lose an attribution.
 */
export function pickLeadForEnrollment(candidates: readonly LinkableLead[] | null | undefined): number | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const usable = candidates.filter((c) => c && Number.isInteger(c.id));
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => {
    const am = createdAtMs(a);
    const bm = createdAtMs(b);
    if (am !== bm) {
      if (am === null) return 1;
      if (bm === null) return -1;
      return am - bm;
    }
    return a.id - b.id;
  });

  return sorted[0].id;
}

/**
 * The email form both sides must agree on before they can be compared.
 *
 * Lowercased and trimmed. `enrollmentService` already stores some emails that way and not others
 * (`createPendingEnrollment` stores what the form sent; `createManualEnrollment` lowercases and
 * trims), and `leads` has the same mix, so neither column can be compared raw. Returns `null`
 * for anything that is not a usable address, so a caller cannot accidentally match every row
 * whose email is the empty string.
 */
export function normalizeEmailForLink(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized === '' ? null : normalized;
}
