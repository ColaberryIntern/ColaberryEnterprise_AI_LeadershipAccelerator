import type { JourneyProgramKind } from '../governor/types';

/**
 * The score dimensions, one registry entry each (§5.3, §5.4; Phase 3 T306).
 *
 * ─── THE POINT OF THIS FILE IS THE `source: 'none'` ENTRIES ─────────────────
 *
 * §5.3 names ten dimensions for a business journey and §5.4 names nine for a
 * consulting one. **Seven of those ten and six of those nine have no source in
 * this codebase** — a finding from the Phase 3 discovery, not an implementation
 * shortcut. This registry states which, so the absence is a declared fact that a
 * test can pin rather than a silence a reader has to notice.
 *
 * A `source: 'none'` dimension scores `null`, contributes nothing to the summary
 * and appears in `ScoreVector.gaps` with its reason. It is never defaulted to a
 * number: `0` reads as "measured, and bad" and `50` as "measured, and average",
 * and both are claims about a subject nobody has measured.
 *
 * ─── WHY THE SOURCED ONES ARE THE ONES THEY ARE ─────────────────────────────
 *
 * Only fields that are POPULATED for real leads today are treated as sources.
 * Three per programme qualify. Everything else either does not exist, or exists
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
   * A source that EXISTS and is deliberately not wired here.
   *
   * Explorer's `DEFERRED_RULES` precedent. T306's verifier found
   * `relationship_engagement` declared sourceless while
   * `interaction_outcomes.outcome` and `appointments.status` already power a
   * per-lead engagement score in `opportunityScoringService` — a hidden
   * capability, and a false reason. This field records the conflict in the
   * registry instead of in a comment: the plan's acceptance pins the sourceless
   * count at 7 of 10 and 6 of 9, so wiring these is a declared follow-up rather
   * than something to smuggle in against a stated criterion.
   */
  deferred_source?: string;
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
  {
    key: 'fit',
    label: 'Fit',
    programs: ['business'],
    source: 'lead_firmographics',
    weight: 0.4,
    cap: 100,
  },
  {
    key: 'intent',
    label: 'Intent',
    programs: ['business'],
    source: 'observed_visitor_signals',
    weight: 0.3,
    cap: 100,
  },
  {
    key: 'authority_stakeholder_readiness',
    label: 'Authority and stakeholder readiness',
    programs: ['business'],
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      'the only authority signal in the repo is a title regex inside `leadScoringEngine`, which scores an Apollo person before import and never a journey subject; `departments_impacted` is a self-declared list with no role data',
    deferred_source:
      '`leads.title` IS populated, and `leadScoringEngine`\u2019s C-suite/VP/Director regex is a deterministic function of exactly that string, so this is "exists, deliberately not wired" on the same footing as relationship engagement rather than a true absence. Deferred for the same pinned-count reason, and declared here because naming two of the three and staying silent on the third would be misleading.',
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
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      'the outbound-side candidates (`communication_logs`, `activities`, `leads.pipeline_stage`, which advances on a send) record what WE did rather than where the relationship stands — but a counterparty-side source does exist, so this entry is deferred rather than absent',
    deferred_source:
      '`interaction_outcomes.outcome` (`replied`, `booked_meeting`, `answered`, `declined`, keyed on `lead_id`, written live by the Mandrill, GHL and Synthflow webhooks) and `appointments.status`; `opportunityScoringService` already computes an engagement score from exactly those. Wiring it changes the sourceless count this task pins at 7 of 10, so it is T310 with the count amended deliberately.',
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
    source: 'none',
    weight: 0,
    cap: 100,
    reason:
      'no deal-risk model exists: nothing records a stalled decision, a competing vendor or a lost deal, and `leads.pipeline_stage` cannot express "lost" at all (`advancePipelineStage` refuses it)',
    deferred_source:
      '`interaction_outcomes.outcome` also carries `declined` and `no_response`, which ARE deal risk and need none of the opt-out status literals T304 bans. Deferred for the same pinned-count reason as relationship engagement, not because the data is missing.',
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
