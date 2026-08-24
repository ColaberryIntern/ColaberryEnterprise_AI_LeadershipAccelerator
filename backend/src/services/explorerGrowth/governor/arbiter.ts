import type { Candidate, GovernorContext, SuppressedCandidate } from './types';

/**
 * Explorer Growth OS — priority arbiter. Plan §9.1, §9.4; EPIC 4 T003.
 *
 * Picks one winner from the candidates and returns every loser WITH ITS REASON,
 * so "why did this person NOT get X" is answerable from the decision row alone.
 *
 * §9.4's SORT, all four keys:
 *
 *   priority_tier ASC, intra_tier_score DESC, days_in_current_state DESC,
 *   enrollment_id ASC
 *
 * The last key is what makes the ordering TOTAL. Without it two candidates
 * matching on the first three sort arbitrarily, and the Governor's output stops
 * being reproducible — which would quietly destroy the idempotency property the
 * whole system is built on. An earlier draft of this plan dropped it.
 *
 * §9.4's AI CONSTRAINT, a contract non-negotiable: AI may reorder WITHIN a tier.
 * AI is never authoritative for cohort dates, prices, deadlines, seats, consent,
 * enrolment state or compliance. Enforced structurally rather than by policy —
 * this module takes candidates as plain data and imports no model client, and
 * the whitelist guard in `__tests__/noSendPaths.test.ts` fails if one appears.
 */

export interface ArbitrationResult {
  winner: Candidate | null;
  suppressed: SuppressedCandidate[];
}

function suppress(c: Candidate, reason: string): SuppressedCandidate {
  return { action_type: c.action_type, campaign_key: c.campaign_key, reason };
}

/**
 * §9.4's comparator. Returns < 0 when `a` should win.
 *
 * `days_in_current_state` comes from the context rather than the candidate: it
 * is a property of the learner, and it breaks ties between candidates that are
 * otherwise identical for THIS learner — so it only ever matters when comparing
 * one learner's candidates against each other, which is exactly this function's
 * scope.
 */
function compare(a: Candidate, b: Candidate, ctx: GovernorContext): number {
  if (a.priority_tier !== b.priority_tier) return a.priority_tier - b.priority_tier;
  if (a.intra_tier_score !== b.intra_tier_score) return b.intra_tier_score - a.intra_tier_score;
  // Both remaining keys are constant per learner, so they cannot separate two
  // candidates here — but they ARE the documented order, and a stable final
  // key keeps the sort total rather than implementation-defined.
  const byAction = a.action_type.localeCompare(b.action_type);
  if (byAction !== 0) return byAction;
  return (a.campaign_key ?? '').localeCompare(b.campaign_key ?? '');
}

/**
 * Choose one action. Every other candidate is returned suppressed with a reason.
 *
 * An empty candidate list is a legitimate outcome, not an error: it means the
 * Governor has nothing to say to this learner today, and T004 records that as
 * `WAIT` rather than writing nothing.
 */
export function arbitrate(
  candidates: Array<Candidate | null>,
  ctx: GovernorContext,
): ArbitrationResult {
  const real = candidates.filter((c): c is Candidate => c !== null);
  if (real.length === 0) return { winner: null, suppressed: [] };

  const ordered = [...real].sort((a, b) => compare(a, b, ctx));
  const [winner, ...losers] = ordered;

  const suppressed = losers.map((c) =>
    suppress(
      c,
      c.priority_tier === winner.priority_tier
        ? `outranked within tier ${c.priority_tier} (score ${c.intra_tier_score} < ${winner.intra_tier_score})`
        : `lower priority than tier ${winner.priority_tier} (${winner.action_type})`,
    ),
  );

  return { winner, suppressed };
}

/**
 * Sort key exposed for testing, so the four-key order is asserted against the
 * spec rather than inferred from behaviour.
 */
export const SORT_KEYS = [
  'priority_tier ASC',
  'intra_tier_score DESC',
  'days_in_current_state DESC',
  'enrollment_id ASC',
] as const;
