import type { JourneyProgramKind } from '../governor/types';

/**
 * The score dimensions, one registry entry each (§5.3, §5.4; Phase 3 T306).
 *
 * ─── THE POINT OF THIS FILE IS THE `source: 'none'` ENTRIES ─────────────────
 *
 * §5.3 names ten dimensions for a business journey and §5.4 names nine for a
 * consulting one. **Four of those ten and six of those nine have no source in
 * this codebase** — seven of ten at the Phase 3 discovery, until T407 wired the
 * three that had a source all along (`interaction_outcomes` + `appointments` for
 * engagement and friction, `leads.title` for authority). This registry states
 * which, so the absence is a declared fact that a test can pin rather than a
 * silence a reader has to notice.
 *
 * A `source: 'none'` dimension scores `null`, contributes nothing to the summary
 * and appears in `ScoreVector.gaps` with its reason. It is never defaulted to a
 * number: `0` reads as "measured, and bad" and `50` as "measured, and average",
 * and both are claims about a subject nobody has measured.
 *
 * ─── WHY THE SOURCED ONES ARE THE ONES THEY ARE ─────────────────────────────
 *
 * Only fields that are POPULATED for real leads today are treated as sources.
 * Six for business and three for consulting qualify. Everything else either does not exist, or exists
 * and measures something else — and the `reason` on each sourceless entry says
 * which, because "no source" is a much weaker statement than "the nearest
 * candidate measures our own outbound activity".
 *
 * ─── THREE SCORES IN THIS REPO ARE SIGNALS, NEVER DIMENSIONS ────────────────
 *
 * `leads.lead_temperature` has four writers with disjoint vocabularies,
 * `opportunity_scores` is overwritten in place with no history, and
 * `recommended_offer` comes from a router whose own vocabulary competes with
 * §4's offer families. They are recorded as labelled signals on the vector's
 * factors where relevant and never as a dimension's value: a number assembled
 * from four disagreeing writers is not a measurement.
 *
 * ─── LEARNER JOURNEYS ARE NOT HERE, DELIBERATELY ────────────────────────────
 *
 * CPN and Colaberry Training score through Explorer's own three learner scores
 * (`explorer_journey_profiles`), which T309's strategies read. A learner set of
 * dimensions here would be a second learner scorer — the thing this phase exists
 * to avoid — so `scoreSubject` answers `available: false` for `learner` with a
 * gap naming where those scores live.
 */

/** The real sources, by the name of the thing that holds the data. */
export type SignalSource =
  | 'lead_firmographics'
  | 'declared_timeline'
  | 'declared_systems'
  /**
   * NOT a declared answer. `leads.maturity_score` is written by the advisory
   * sync as `Math.round(recommendation.confidence * 100)`
   * (`advisoryLeadMapperService.ts`, `advisorySyncController.ts`), so this
   * dimension is AI-DERIVED and named that way rather than as "declared".
   *
   * It stays a source: AI may rank and recommend, and this touches no cohort
   * date, price, seat, consent state or brand boundary — the things AI may never
   * be authoritative for. What it may not be is invisible, which is what calling
   * it `declared_maturity` made it.
   */
  | 'advisory_ai_maturity'
  | 'observed_visitor_signals'
  /** T407: `interaction_outcomes.outcome` and `appointments.status`, counted per lead - the counterparty's side of the relationship. */
  | 'interaction_outcomes'
  /** T407: `leads.title` through `normalizeTitleCategory` - the one deterministic authority signal in the repo. */
  | 'lead_title'
  | 'none';

export interface ScoreDimensionSpec {
  key: string;
  label: string;
  programs: JourneyProgramKind[];
  source: SignalSource;
  /** Share of the summary, among the dimensions that have a source. */
  weight: number;
  /** The highest value this dimension can take. */
  cap: number;
  /**
   * Required when `source` is `'none'`: WHY there is no source. A bare "no
   * source" invites someone to invent one; naming the nearest candidate and what
   * it actually measures is what stops that.
   */
  reason?: string;
  /**
   * A higher value is WORSE (friction and risk). The dimension keeps its own
   * meaning on the vector; the summary counts `cap - value` for it, so a subject
   * with more friction ranks lower, not higher.
   */
  inverse?: boolean;
}

/**
 * §5.3 and §5.4 share three dimension names exactly — problem clarity, urgency
 * and qualification completeness — so those carry both programmes rather than
 * being duplicated. Where the two specs use DIFFERENT words for adjacent ideas
 * (§5.3's "solution alignment" versus §5.4's "solution fit"; §5.3's
 * "authority/stakeholder readiness" versus §5.4's "stakeholder readiness";
 * §5.3's "delivery feasibility" versus §5.4's "technical feasibility") they stay
 * separate entries under the spec's own names. Merging them would be inventing a
 * vocabulary neither section uses.
 */
const ENTRIES: ScoreDimensionSpec[] = [
  /* ── shared by both programmes ─────────────────────────────────────────── */
  {
    key: 'problem_clarity',
    label: 'Problem clarity',
    programs: ['business', 'consulting'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      'nothing captures a stated problem: `leads.idea_input` is unparsed free text, and parsing it would be an AI judgement, which may never be authoritative for a score',
  },
  {
    key: 'urgency',
    label: 'Urgency',
    programs: ['business', 'consulting'],
    source: 'declared_timeline',
    weight: 0.3,
    cap: 100,
  },
  {
    key: 'qualification_completeness',
    label: 'Qualification completeness',
    programs: ['business', 'consulting'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      'there is no qualification questionnaire schema; counting populated lead columns would be a proxy for completeness that nobody specified',
  },

  /* ── §5.3, the business journey ────────────────────────────────────────── */
  // The six sourced business weights sum to 1: fit 0.2, intent 0.15, urgency 0.3
  // (shared with consulting, where 0.4 + 0.3 + 0.3 also sum to 1), engagement
  // 0.15, friction 0.1 (inverse), authority 0.1. Rebalanced in T407.
  {
    key: 'fit',
    label: 'Fit',
    programs: ['business'],
    source: 'lead_firmographics',
    weight: 0.2,
    cap: 100,
  },
  {
    key: 'intent',
    label: 'Intent',
    programs: ['business'],
    source: 'observed_visitor_signals',
    weight: 0.15,
    cap: 100,
  },
  {
    key: 'authority_stakeholder_readiness',
    label: 'Authority and stakeholder readiness',
    programs: ['business'],
    source: 'lead_title',
    weight: 0.1,
    cap: 100,
  },
  {
    key: 'solution_alignment',
    label: 'Solution alignment',
    programs: ['business'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason: 'no mapping exists between a stated need and the offer catalogue',
  },
  {
    key: 'relationship_engagement',
    label: 'Relationship engagement',
    programs: ['business'],
    source: 'interaction_outcomes',
    weight: 0.15,
    cap: 100,
  },
  {
    key: 'delivery_feasibility',
    label: 'Delivery feasibility',
    programs: ['business'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      'the only capacity algorithm in the repo is delivery-side and per-capability (`delivery_opportunities`); nothing scores whether a lead could be delivered to',
  },
  {
    key: 'friction_risk',
    label: 'Friction and risk',
    programs: ['business'],
    source: 'interaction_outcomes',
    weight: 0.1,
    cap: 100,
    inverse: true,
  },

  /* ── §5.4, the consulting journey ──────────────────────────────────────── */
  {
    key: 'solution_fit',
    label: 'Solution fit',
    programs: ['consulting'],
    source: 'declared_systems',
    weight: 0.4,
    cap: 100,
  },
  {
    key: 'technical_feasibility',
    label: 'Technical feasibility',
    programs: ['consulting'],
    source: 'advisory_ai_maturity',
    weight: 0.3,
    cap: 100,
  },
  {
    key: 'stakeholder_readiness',
    label: 'Stakeholder readiness',
    programs: ['consulting'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason: 'same absence as the business journey: a title regex on a pre-import Apollo person is not a stakeholder map',
  },
  {
    key: 'budget_payment_readiness',
    label: 'Budget and payment readiness',
    programs: ['consulting'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      '`leads.estimated_roi` is a self-reported expected return, not a budget; no payment-readiness field exists and a payment record would be a conversion, not a readiness signal',
  },
  {
    key: 'concept_engagement',
    label: 'Engagement with generated concepts',
    programs: ['consulting'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason: 'nothing records a generated concept for a consulting lead, so there is no engagement with one to measure',
  },
  {
    key: 'integration_security_complexity',
    label: 'Integration and security complexity',
    programs: ['consulting'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      '`technology_stack` and `selected_systems` name systems but carry no integration or security attributes, and nothing else in the repo models either',
  },
];

/**
 * Deep-frozen, not shallow.
 *
 * `Object.freeze` on the array alone left every entry writable — T306's
 * verifier set `SCORE_DIMENSIONS[0].source` at runtime and nothing objected. A
 * registry whose entries can be edited in place is a registry that can disagree
 * with the test that pins it.
 */
export const SCORE_DIMENSIONS: readonly ScoreDimensionSpec[] = Object.freeze(
  ENTRIES.map((entry) => Object.freeze({ ...entry, programs: Object.freeze([...entry.programs]) as JourneyProgramKind[] })),
);

/** The dimensions one programme declares, in registry order. */
export function dimensionsFor(program: JourneyProgramKind): ScoreDimensionSpec[] {
  return SCORE_DIMENSIONS.filter((d) => d.programs.includes(program));
}

/** The keys of the dimensions that have a source — the only ones that can score. */
export function sourcedKeys(program: JourneyProgramKind): string[] {
  return dimensionsFor(program)
    .filter((d) => d.source !== 'none')
    .map((d) => d.key);
}
