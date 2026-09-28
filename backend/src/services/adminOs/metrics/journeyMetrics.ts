import type { MetricDef } from '../metricRegistry';

/**
 * The Growth Journey metrics (Phase 6, T605).
 *
 * ─── WHAT THESE MEASURE, AND WHY THEY ARE HERE AND NOT IN A NEW REGISTRY ────
 *
 * §14 forbids a second metric registry, and for the reason the registry's own
 * header gives: the moment "conversion" means one thing on the Marketing screen
 * and another on the Journey screen, both look authoritative and nothing
 * reconciles them. So the journey's figures are registered here, keyed
 * `journey.*`, carrying the same definition/formula/sources/status contract as
 * every other metric - and, new in T605, a FRESHNESS RULE, because most of them
 * are produced by scheduled agents that are shipped disabled.
 *
 * ─── THE VOCABULARY IS PHASE 4'S, NOT A NEW ONE ─────────────────────────────
 *
 * Every rate below is computed in `outcomes/handoffRates.ts`'s vocabulary:
 * `{ value: null, reason: 'no_denominator' }` rather than `0` when nothing is
 * in the denominator, and a median below `MIN_MEDIAN_SAMPLES` is null with
 * `below_min_samples`. A brand that took no handoffs this month has no
 * acceptance rate, not a 0% one.
 *
 * ─── WHY SO MANY ARE `partial` ──────────────────────────────────────────────
 *
 * Two honest limits, both stated in each affected metric's `statusReason`:
 *
 *   1. ENROLMENT AND PAYMENT ARE JOINED BY E-MAIL EQUALITY. There is no
 *      identity key between a journey subject and an `enrollments` row; the
 *      join is `lower(email)`, which the people registry already measures at
 *      56-98% coverage by month (`people.identity_coverage`). Any journey
 *      metric whose denominator or numerator crosses that join is `partial`
 *      and says so - it is a floor, not a count.
 *   2. THE SYSTEM IS DARK. Every flag is off and both agents ship disabled, so
 *      these read `never` on freshness rather than `0`. That is the point of
 *      the freshness rule: "nothing has run" and "the rate is zero" must not
 *      look the same on a launch-readiness screen.
 */

/** The two scheduled agents that produce journey figures, as `agentRegistry/growthJourneyAgents` names them. */
export const JOURNEY_NIGHTLY_AGENT = 'GrowthJourneyShadowDecisions';
export const JOURNEY_EXECUTOR_AGENT = 'GrowthJourneyExecutor';

/** The e-mail-equality caveat, one sentence, shared by every metric that crosses that join. */
const EMAIL_JOIN_CAVEAT =
  'Crosses the journey-to-enrolment join, which is e-mail equality and nothing stronger - there is no ' +
  'identity key between a journey subject and an enrollments row, and people.identity_coverage measures ' +
  'that match at 56-98% by month. So this is a FLOOR, not a count, and it may never be computed with.';

export const JOURNEY_METRICS: Record<string, MetricDef> = {
  'journey.decisions_recorded': {
    key: 'journey.decisions_recorded',
    name: 'Decisions recorded',
    domain: 'journey',
    unit: 'count',
    definition: 'Governed decisions the journey recorded in the window, in every mode including shadow.',
    formula: 'COUNT(*) FROM growth_journey_decisions WHERE created_at IN window',
    sources: ['growth_journey_decisions'],
    grain: 'event',
    dimensions: ['brand', 'program', 'mode', 'period'],
    status: 'trusted',
    freshness: { source: 'live', max_age_hours: 26 },
    drilldown: { target: 'journey.decisions', requiredFilters: ['brand_id', 'period'] },
  },

  'journey.live_decision_share': {
    key: 'journey.live_decision_share',
    name: 'Live decision share',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the decisions recorded, the share the ladder released as live rather than shadow.',
    formula: "COUNT(mode = 'live') / COUNT(*), both from growth_journey_decisions in the window (the column is shadow|live; the ladder's review and limited both stamp live)",
    sources: ['growth_journey_decisions'],
    grain: 'event',
    dimensions: ['brand', 'program', 'period'],
    status: 'trusted',
    freshness: { source: 'live', max_age_hours: 26 },
    drilldown: { target: 'journey.decisions', requiredFilters: ['brand_id', 'mode', 'period'] },
  },

  'journey.nightly_recorded_decisions': {
    key: 'journey.nightly_recorded_decisions',
    name: 'Decisions recorded by the nightly pass',
    domain: 'journey',
    unit: 'count',
    definition: 'Decisions the scheduled shadow pass recorded on its last run, as opposed to those a request produced.',
    formula:
      'COUNT(*) FROM growth_journey_decisions WHERE created_at IN window, reported beside the last_run_at of ' +
      'the nightly agent, so that a zero can be read as nothing-ran rather than nothing-to-do',
    sources: ['growth_journey_decisions', `ai_agents (${JOURNEY_NIGHTLY_AGENT})`],
    grain: 'event',
    dimensions: ['brand', 'program', 'period'],
    status: 'trusted',
    freshness: { source: `nightly:${JOURNEY_NIGHTLY_AGENT}`, max_age_hours: 26 },
  },

  'journey.handoff_acceptance_rate': {
    key: 'journey.handoff_acceptance_rate',
    name: 'Handoff acceptance rate',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the handoffs raised to a human queue in the window, the share a human accepted.',
    formula: 'accepted_at IS NOT NULL / handoffs created in the window (outcomes/handoffRates.ts)',
    sources: ['growth_journey_handoffs'],
    grain: 'person',
    dimensions: ['brand', 'owner_queue', 'period'],
    status: 'trusted',
    freshness: { source: 'live', max_age_hours: 26 },
    drilldown: { target: 'journey.handoffs', requiredFilters: ['brand_id', 'owner_queue', 'period'] },
  },

  'journey.false_positive_handoff_rate': {
    key: 'journey.false_positive_handoff_rate',
    name: 'False-positive handoff rate',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the handoffs a human ruled on, the share they judged should not have been handoffs.',
    formula: "disposition IN ('disqualified','no_contact') / handoffs carrying any disposition (a human verdict)",
    sources: ['growth_journey_handoffs'],
    grain: 'person',
    dimensions: ['brand', 'owner_queue', 'period'],
    status: 'trusted',
    freshness: { source: 'live', max_age_hours: 26 },
    drilldown: { target: 'journey.handoffs', requiredFilters: ['brand_id', 'disposition', 'period'] },
  },

  'journey.time_to_first_human_touch_hours': {
    key: 'journey.time_to_first_human_touch_hours',
    name: 'Time to first human touch',
    domain: 'journey',
    unit: 'duration_seconds',
    definition: 'Median hours between a handoff being raised and a human accepting it.',
    formula: 'median(accepted_at - created_at) over accepted handoffs; null below MIN_MEDIAN_SAMPLES',
    sources: ['growth_journey_handoffs'],
    grain: 'person',
    dimensions: ['brand', 'owner_queue', 'period'],
    status: 'trusted',
    freshness: { source: 'live', max_age_hours: 26 },
  },

  'journey.receipts_completed': {
    key: 'journey.receipts_completed',
    name: 'Executions completed',
    domain: 'journey',
    unit: 'count',
    definition: 'Receipts that reached completed in the window - one per contact the journey actually made.',
    formula: "COUNT(*) FROM growth_journey_executions WHERE status = 'completed' AND updated_at IN window",
    sources: ['growth_journey_executions', `ai_agents (${JOURNEY_EXECUTOR_AGENT})`],
    grain: 'person',
    dimensions: ['brand', 'program', 'channel', 'period'],
    status: 'trusted',
    freshness: { source: `cron:${JOURNEY_EXECUTOR_AGENT}`, max_age_hours: 4 },
    drilldown: { target: 'journey.receipts', requiredFilters: ['brand_id', 'status', 'period'] },
  },

  'journey.send_block_rate': {
    key: 'journey.send_block_rate',
    name: 'Blocked send rate',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the receipts that reached the send step, the share a stop blocked before any contact.',
    formula: "COUNT(status = 'blocked') / COUNT(status IN ('blocked','completed','failed')), from growth_journey_executions in the window",
    sources: ['growth_journey_executions'],
    grain: 'person',
    dimensions: ['brand', 'program', 'channel', 'status_reason', 'period'],
    status: 'trusted',
    freshness: { source: `cron:${JOURNEY_EXECUTOR_AGENT}`, max_age_hours: 4 },
    drilldown: { target: 'journey.receipts', requiredFilters: ['brand_id', 'status', 'period'] },
  },

  'journey.plan_refusal_rate': {
    key: 'journey.plan_refusal_rate',
    name: 'Plan refusal rate',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the decisions the executor put to the planner, the share the planner refused rather than planned.',
    formula: 'refusals recorded in event_ledger (growth_journey.execution.refused) / decisions the executor considered in the window',
    sources: ['event_ledger', 'growth_journey_decisions'],
    grain: 'event',
    dimensions: ['brand', 'program', 'reason', 'period'],
    status: 'partial',
    statusReason:
      'The numerator is the ledger; the denominator is the executor\'s own candidate count, which is a LOG LINE rather ' +
      'than a row - a run that failed before it logged leaves a refusal with no denominator. Shown with its caveat, ' +
      'never computed with, until the executor writes a run row (a Phase 7 candidate, not this phase).',
    freshness: { source: `cron:${JOURNEY_EXECUTOR_AGENT}`, max_age_hours: 4 },
  },

  'journey.enrolment_conversion_rate': {
    key: 'journey.enrolment_conversion_rate',
    name: 'Enrolment conversion rate',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the subjects the journey contacted in the window, the share that went on to a paid enrolment.',
    formula: 'enrollments matched to a contacted subject / subjects with a completed receipt in the window',
    sources: ['growth_journey_executions', 'enrollments'],
    grain: 'person',
    dimensions: ['brand', 'program', 'period'],
    status: 'partial',
    statusReason: EMAIL_JOIN_CAVEAT,
    freshness: { source: `cron:${JOURNEY_EXECUTOR_AGENT}`, max_age_hours: 4 },
    drilldown: { target: 'journey.receipts', requiredFilters: ['brand_id', 'period'] },
  },

  'journey.qualified_opportunity_rate': {
    key: 'journey.qualified_opportunity_rate',
    name: 'Qualified opportunity rate',
    domain: 'journey',
    unit: 'percent',
    definition: 'Of the handoffs a human ruled on, the share they qualified or converted.',
    formula: "disposition IN ('qualified','converted') / handoffs carrying any disposition",
    sources: ['growth_journey_handoffs'],
    grain: 'person',
    dimensions: ['brand', 'owner_queue', 'period'],
    status: 'trusted',
    freshness: { source: 'live', max_age_hours: 26 },
    drilldown: { target: 'journey.handoffs', requiredFilters: ['brand_id', 'disposition', 'period'] },
  },
};
