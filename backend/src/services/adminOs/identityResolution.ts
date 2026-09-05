import { LifecycleStage } from './lifecycle';

/**
 * Identity resolution — how a record becomes a person, and when it refuses to.
 *
 * THE RULE THAT GOVERNS THIS FILE: an ambiguous match is never merged. Two
 * people wrongly joined cannot be told apart afterwards — their sessions,
 * enrolments and payments are one history from that moment on, and no later
 * query can separate them. An unresolved record loses nothing by waiting; a
 * wrongly merged pair loses the truth permanently. The failure mode is
 * deliberately asymmetric.
 *
 * ── WHAT THE PRODUCTION DATA ACTUALLY SUPPORTS (measured 2026-09-05) ────────
 *
 * The rules below are not a guess at what might work. They are what survived
 * measurement against accelerator_prod:
 *
 *   leads         24,673 rows, 24,673 distinct normalised emails
 *                 -> email is already unique, so an email match is 1:1
 *   enrollments   517 rows, 477 distinct emails
 *                 -> one person legitimately holds several enrolments
 *   email join    431 of 517 enrolments (83.4%) match a lead
 *
 * And, decisively, for the 86 that do NOT match:
 *
 *   phone         0 of 86 carry a usable (10+ digit) phone, though 337 of all
 *                 517 enrolments do. Phone is not a bridge for the records that
 *                 would need one.
 *   name          0 of 86 match exactly one lead by name. Exactly 1 matches
 *                 SEVERAL leads, so the only name-based candidate that exists
 *                 is ambiguous and, under the rule above, must not be merged.
 *
 * That is why there is no fuzzy matcher here. A similarity pass over names would
 * produce zero additional true joins on this data and a non-zero number of wrong
 * ones. The 86 are not a matching failure — they were never captured as leads.
 */

/** Normalised email, or null when the input cannot serve as an identity key. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Case and whitespace only. This is NOT validation, and it deliberately stops
  // short of stripping dots or plus-addressing: those rules merge addresses that
  // are genuinely different mailboxes at some providers, and merging is the
  // irreversible direction. Enrollments contains exactly one email that differs
  // from another only by case, so this much normalisation is load-bearing.
  if (!trimmed.includes('@')) return null;
  return trimmed;
}

/**
 * How a record was joined to a person.
 *
 * `exact_email` is the only automatic method, because it is the only one the
 * data supports. `manual_review` exists so a queue item can record that a human
 * made the call rather than a rule.
 */
export type MatchMethod = 'exact_email' | 'manual_review';

export type ResolutionStatus =
  /** Exactly one candidate. Safe to join. */
  | 'resolved'
  /** More than one candidate. Must NOT be merged; goes to the queue. */
  | 'ambiguous'
  /** No candidate at all. Not an error — this person has no acquisition history. */
  | 'no_candidate'
  /** The record carries no usable identity key. */
  | 'unidentifiable';

export interface IdentityCandidate {
  candidateId: string;
  method: MatchMethod;
}

export interface ResolutionOutcome {
  status: ResolutionStatus;
  /** Set only when status is 'resolved'. Never set for 'ambiguous'. */
  personRef?: string;
  /** Everything considered, so a reviewer sees what the machine saw. */
  candidates: IdentityCandidate[];
  /** Plain language, shown in the queue and on the profile. */
  reason: string;
  needsReview: boolean;
}

/**
 * Resolve one record against a candidate lookup.
 *
 * `lookup` is injected rather than queried here so the decision logic stays pure
 * and provable without a database. The part that must never drift is the
 * decision, not the query.
 */
export function resolveByEmail(
  rawEmail: string | null | undefined,
  lookup: (normalizedEmail: string) => string[],
): ResolutionOutcome {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return {
      status: 'unidentifiable',
      candidates: [],
      reason: 'No usable email on the record, so there is no identity key to match on.',
      needsReview: false,
    };
  }

  const candidates: IdentityCandidate[] = lookup(email).map((candidateId) => ({
    candidateId,
    method: 'exact_email' as const,
  }));

  if (candidates.length === 1) {
    return {
      status: 'resolved',
      personRef: candidates[0].candidateId,
      candidates,
      reason: 'Matched exactly one record by email.',
      needsReview: false,
    };
  }

  if (candidates.length > 1) {
    // Should not happen while lead emails are unique, but the code must not
    // depend on a database invariant staying true. If it ever does, the answer
    // is a queue item, never a coin flip.
    return {
      status: 'ambiguous',
      candidates,
      reason:
        `Email matched ${candidates.length} records. Not merged: a wrong merge cannot be undone.`,
      needsReview: true,
    };
  }

  return {
    status: 'no_candidate',
    candidates: [],
    reason:
      'No acquisition record for this email. The person enrolled without ever being captured ' +
      'as a lead, which is a capture gap rather than a matching failure.',
    // Deliberately false. 86 enrolments are in this state and none can be
    // resolved by any available rule, so routing them to a human would build a
    // queue of 86 items a reviewer can do nothing about. It is reported as
    // coverage instead.
    needsReview: false,
  };
}

/**
 * Whether an outcome may be written as a join.
 *
 * One place, so that no caller gets to decide for itself that "probably the same
 * person" is good enough.
 */
export function mayJoin(outcome: ResolutionOutcome): boolean {
  return outcome.status === 'resolved' && !!outcome.personRef;
}

/** Outcomes that belong in the admin resolution queue. */
export function needsHumanReview(outcome: ResolutionOutcome): boolean {
  return outcome.needsReview;
}

/**
 * Identity coverage, reported as a rate and a trend rather than one number.
 *
 * WHY. Coverage is 83.4% lifetime, which reads as a settled historical gap. It
 * is not. By month, enrolments matching a lead ran at 98% in July, 66% in August
 * and 56% in September 2026 — the funnel is getting worse, and a single lifetime
 * figure hides that completely.
 */
export interface CoverageReport {
  total: number;
  resolved: number;
  ambiguous: number;
  noCandidate: number;
  unidentifiable: number;
  /** resolved / total, or null when there is nothing to divide. */
  coverageRate: number | null;
}

export function summariseCoverage(outcomes: readonly ResolutionOutcome[]): CoverageReport {
  const count = (s: ResolutionStatus) => outcomes.filter((o) => o.status === s).length;
  const total = outcomes.length;
  const resolved = count('resolved');
  return {
    total,
    resolved,
    ambiguous: count('ambiguous'),
    noCandidate: count('no_candidate'),
    unidentifiable: count('unidentifiable'),
    // null, not 0. An empty set has no coverage rate, and 0% would read as total
    // failure — the exact substitution this consolidation exists to stop.
    coverageRate: total === 0 ? null : resolved / total,
  };
}

/**
 * Stages that resolution makes joinable.
 *
 * Resolution establishes that two records are the same person. It does not by
 * itself establish a stage — that still comes from the evidence in lifecycle.ts.
 */
export const RESOLUTION_UNLOCKS: readonly LifecycleStage[] = [
  'enrolled_student',
  'active_learner',
  'graduate',
];
