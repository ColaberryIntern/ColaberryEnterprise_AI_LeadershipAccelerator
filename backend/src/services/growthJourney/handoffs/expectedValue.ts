import type { GrowthJourneyHandoffPriority } from '../../../models/GrowthJourneyHandoff';
import type { JourneyProgramKind } from '../../../models/JourneyProgram';
import type { OfferFamilySlug } from '../../../models/OfferFamily';
import { BUSINESS_STATES } from '../lifecycle/businessLifecycle';
import { FLOTATION_STATES } from '../lifecycle/aiFlotationLifecycle';

/**
 * Expected value of a handoff — a transparent, additive score (§11; Phase 4 T404).
 *
 * ─── THREE COMPONENTS, ADDED, EVERY ONE VISIBLE ON THE ROW ──────────────────
 *
 *   state_rank    where the subject stands in its programme's lifecycle, as the
 *                 index of the state in that lifecycle's own ordered list (the
 *                 terminal state ranks 0: a customer needs no handoff)
 *   path_weight   the offer family's weight, a fixed table
 *   engagement    the decision's score summary, 0-100 scaled to 0-10; NULL
 *                 (no scorer ran, or every dimension was a gap) counts 0
 *
 *   value = state_rank × 10 + path_weight × 5 + engagement
 *
 * Additive rather than multiplied so that one missing component (a subject
 * with no scores yet) cannot zero a strong state, and so a reviewer can read
 * the three numbers on the row and recompute the fourth by hand. The value
 * RANKS a queue; it is never authoritative for anything a person is told —
 * no price, no date, no promise is derived from it.
 *
 * `urgent` is not part of the value on purpose: an explicit request signal
 * outranks every value (`rankHandoffs`), so it is carried as its own flag.
 */

/** Explorer's own primary states, in journey order (`types/explorerGrowth.ts`'s union, ordered). */
export const LEARNER_STATE_ORDER = [
  'NEW_EXPLORER',
  'ACTIVATING',
  'ACTIVE_LEARNER',
  'ENGAGED_LEARNER',
  'CONNECTED_TO_COMMUNITY',
  'CONSIDERING_NEXT_STEP',
  'ENROLLMENT_READY',
  'CONVERTED',
] as const;

const STATE_ORDER: Readonly<Record<JourneyProgramKind, readonly string[]>> = Object.freeze({
  learner: LEARNER_STATE_ORDER,
  business: BUSINESS_STATES,
  consulting: FLOTATION_STATES,
});

/** The offer families' weights: what a conversion in that family is worth, coarsely, 1-5. */
export const PATH_WEIGHT: Readonly<Record<OfferFamilySlug, number>> = Object.freeze({
  application_build: 5,
  ai_project: 5,
  ai_consulting: 4,
  workflow_automation: 4,
  paid_discovery: 3,
  business_training: 3,
  learner_paid_training: 2,
  learner_certification: 2,
  learner_internship: 2,
  learner_community_subscription: 1,
  learner_free_training: 1,
});

export interface ExpectedValueInput {
  /** Null when no programme is known (a reply-routed handoff with no decision): the state cannot rank. */
  program_kind: JourneyProgramKind | null;
  state: string | null;
  path: string | null;
  score_summary: number | null;
}

export interface ExpectedValue {
  value: number;
  components: { state_rank: number; path_weight: number; engagement: number };
  formula: string;
}

export const EXPECTED_VALUE_FORMULA = 'state_rank*10 + path_weight*5 + engagement';

/** The state's rank in its lifecycle: its index, with the terminal state (the last) ranked 0, unknown 0. */
export function stateRank(kind: JourneyProgramKind | null, state: string | null): number {
  if (!kind || !state) return 0;
  const order = STATE_ORDER[kind];
  const i = order.indexOf(state);
  if (i < 0 || i === order.length - 1) return 0;
  return i;
}

export function computeExpectedValue(input: ExpectedValueInput): ExpectedValue {
  const state_rank = stateRank(input.program_kind, input.state);
  const path_weight = input.path && input.path in PATH_WEIGHT ? PATH_WEIGHT[input.path as OfferFamilySlug] : 0;
  const summary = typeof input.score_summary === 'number' && Number.isFinite(input.score_summary) ? input.score_summary : 0;
  const engagement = Math.max(0, Math.min(10, Math.round(summary / 10)));
  return {
    value: state_rank * 10 + path_weight * 5 + engagement,
    components: { state_rank, path_weight, engagement },
    formula: EXPECTED_VALUE_FORMULA,
  };
}

/** Priority for the tickets vocabulary: urgent is critical; otherwise by value. */
export function priorityFor(value: number, urgent: boolean): GrowthJourneyHandoffPriority {
  if (urgent) return 'critical';
  if (value >= 50) return 'high';
  if (value >= 25) return 'medium';
  return 'low';
}

/** The handoff row's ranking fields, as `rankHandoffs` reads them. */
export interface Rankable {
  urgent: boolean;
  expected_value: number | string | null;
  created_at: Date;
}

/**
 * Urgent first, regardless of value; then the higher expected value; ties by
 * age, older first (fair ageing). Pure and stable: equal rows keep their order.
 */
export function rankHandoffs<T extends Rankable>(rows: readonly T[]): T[] {
  const value = (r: T) => (r.expected_value === null ? 0 : Number(r.expected_value));
  return [...rows].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (value(a) !== value(b)) return value(b) - value(a);
    return a.created_at.getTime() - b.created_at.getTime();
  });
}
