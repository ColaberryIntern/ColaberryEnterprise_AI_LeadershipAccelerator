import { LifecycleStage } from './lifecycle';

/**
 * The metric registry — one definition per metric key, for the whole portal.
 *
 * WHY THIS EXISTS. Discovery found at least six services independently computing
 * visitor metrics, and the Visitors dashboard alone shipped three different
 * denominators for "conversion" in one week. When the same word means different
 * things on two screens, the disagreement is invisible: both look authoritative
 * and nothing reconciles them.
 *
 * A metric may only appear on a dashboard if it is registered here. The registry
 * carries the definition, the formula, the source, the trust status and the
 * drill-through target, so a KPI can always answer "what exactly are you
 * counting, how fresh is it, and show me the rows".
 */

/**
 * Trust status. `unavailable` and `invalid` are NOT zero.
 *
 * This distinction is the whole point. Every silent defect found during
 * discovery rendered a plausible number instead of an error — a missing field
 * became 0, a 500 became "no data", a NULL column became "Direct". A metric that
 * cannot be computed must say so and be excluded from health scores, AI
 * narrative and executive summary, rather than contributing a zero that drags an
 * average down and looks like a real result.
 */
export type MetricStatus = 'trusted' | 'partial' | 'stale' | 'unavailable' | 'invalid';

export type MetricDomain = 'growth' | 'learning' | 'revenue' | 'people' | 'operations';

/** Unit determines rendering and forbids nonsense like summing percentages. */
export type MetricUnit = 'count' | 'percent' | 'currency' | 'duration_seconds' | 'ratio';

export interface DrilldownContract {
  /** The roster or ledger this metric opens into. */
  target: string;
  /** Filters that MUST be carried into the drill-through so the count reconciles. */
  requiredFilters: readonly string[];
}

export interface MetricDef {
  key: string;
  name: string;
  domain: MetricDomain;
  unit: MetricUnit;
  /** Plain language, as a manager would say it. */
  definition: string;
  /** The arithmetic, explicitly including the denominator. */
  formula: string;
  /** Tables and events it reads. */
  sources: readonly string[];
  /** Who or what the metric counts, when it counts people. */
  grain: 'visitor' | 'session' | 'person' | 'enrollment' | 'transaction' | 'event';
  /** Dimensions the metric may legitimately be split by. */
  dimensions: readonly string[];
  status: MetricStatus;
  /** Required whenever status is not 'trusted'. Enforced by test. */
  statusReason?: string;
  lifecycleStage?: LifecycleStage;
  drilldown?: DrilldownContract;
}

/**
 * Bots are excluded from every people-counting metric by default.
 *
 * Measured during discovery: 74% of sessions over 30 days were self-identifying
 * crawlers, and the reported bounce rate of 93.7% was really 62.2%. A registry
 * that let one dashboard include crawlers while another excluded them would
 * reproduce the exact contradiction this whole consolidation exists to remove.
 */
const HUMAN_ONLY = 'crawlers excluded (user-agent and behavioural rules)';

export const METRICS: Record<string, MetricDef> = {
  'growth.unique_visitors': {
    key: 'growth.unique_visitors',
    name: 'Unique visitors',
    domain: 'growth',
    unit: 'count',
    definition: `Distinct people who visited any property in the period, ${HUMAN_ONLY}.`,
    formula: 'COUNT(DISTINCT visitor_sessions.visitor_id) over the window',
    sources: ['visitor_sessions', 'visitors'],
    grain: 'visitor',
    dimensions: ['site', 'source', 'device', 'period'],
    status: 'trusted',
    lifecycleStage: 'anonymous_visitor',
    drilldown: { target: 'people.roster', requiredFilters: ['period', 'site', 'includeBots'] },
  },

  'growth.engaged_visitors': {
    key: 'growth.engaged_visitors',
    name: 'Engaged visitors',
    domain: 'growth',
    unit: 'count',
    definition:
      'Visitors who did something deliberate — stayed beyond ten seconds, viewed more than one ' +
      'page, took an action such as a CTA click or form submission, or converted.',
    formula: 'COUNT(DISTINCT visitor_id) WHERE dwell OR interaction OR converted',
    sources: ['visitor_sessions', 'page_events', 'visitors'],
    grain: 'visitor',
    dimensions: ['site', 'source', 'period'],
    status: 'trusted',
    drilldown: { target: 'people.roster', requiredFilters: ['period', 'engaged'] },
  },

  'growth.visitor_to_lead': {
    key: 'growth.visitor_to_lead',
    name: 'Visitor → lead conversion',
    domain: 'growth',
    unit: 'percent',
    definition: 'Share of ENGAGED visitors who became a lead. Denominator is people, never sessions.',
    // Stated explicitly because getting it wrong is silent: at ~4.5 sessions per
    // person, a session denominator reports 0.5% where the truth is 2.3%.
    formula: 'converted_visitors / engaged_visitors',
    sources: ['visitors', 'leads', 'visitor_sessions'],
    grain: 'visitor',
    dimensions: ['site', 'source', 'campaign', 'period'],
    status: 'partial',
    statusReason:
      'Identity resolution was only wired on 2026-09-04; before that a form submission never ' +
      'linked a fingerprint to a lead, so historic conversion is understated. Improves forward.',
    drilldown: { target: 'people.roster', requiredFilters: ['period', 'stage'] },
  },

  'growth.source_attribution': {
    key: 'growth.source_attribution',
    name: 'Traffic source',
    domain: 'growth',
    unit: 'count',
    definition: 'Visitors grouped by the referrer or UTM that brought them.',
    formula: 'COUNT(DISTINCT visitor_id) GROUP BY COALESCE(referrer_domain, utm_source)',
    sources: ['visitor_sessions', 'visitors'],
    grain: 'visitor',
    dimensions: ['source', 'site', 'period'],
    status: 'partial',
    statusReason:
      'Referrer capture shipped 2026-09-04 and document.referrer cannot be backfilled. Sessions ' +
      'before that have no recorded source and are EXCLUDED rather than bucketed as Direct — ' +
      'a 100%-Direct chart would describe an empty column, not the audience.',
    drilldown: { target: 'people.roster', requiredFilters: ['period', 'source'] },
  },

  'learning.active_learners': {
    key: 'learning.active_learners',
    name: 'Active learners',
    domain: 'learning',
    unit: 'count',
    definition: 'Enrolled students with recent genuine learning activity across multiple signals.',
    formula: 'multi-signal; NOT attendance alone',
    sources: ['enrollments', 'attendance_records', 'assessments', 'projects'],
    grain: 'enrollment',
    dimensions: ['cohort', 'programme', 'period'],
    status: 'invalid',
    statusReason:
      'attendance_records is flagged unreliable and carries a backup table from 2026-08-25. Until ' +
      'a validated multi-signal definition exists this metric renders as unavailable and is ' +
      'excluded from health scores and AI narrative. It must NOT be substituted with zero.',
    lifecycleStage: 'active_learner',
  },

  'revenue.net_revenue': {
    key: 'revenue.net_revenue',
    name: 'Net revenue',
    domain: 'revenue',
    unit: 'currency',
    definition: 'Gross revenue less refunds and adjustments in the period.',
    formula: 'gross - refunds - adjustments',
    sources: ['refunds', 'external payment processor'],
    grain: 'transaction',
    dimensions: ['plan', 'cohort', 'source', 'period'],
    status: 'unavailable',
    statusReason:
      'Discovery found no local payments table; payment records live outside this database, and ' +
      'refunds holds only 3 rows with the latest dated 2026-08-06. The source must be confirmed ' +
      'before any net-revenue figure is published.',
    drilldown: { target: 'revenue.transactions', requiredFilters: ['period'] },
  },

  'people.identity_coverage': {
    key: 'people.identity_coverage',
    name: 'Identity coverage',
    domain: 'people',
    unit: 'percent',
    definition: 'Share of enrolled students who can be traced back to their acquisition history.',
    formula: 'enrollments matching a lead / total enrollments',
    sources: ['enrollments', 'leads'],
    grain: 'person',
    dimensions: ['cohort', 'period'],
    // Deliberately registered even though it is uncomfortable: it is the honest
    // measure of whether the 360 profile can keep its promise, and it should be
    // visible on the trust strip rather than discovered again later.
    status: 'partial',
    statusReason:
      'Measured 2026-09-05: 431 of 517 enrolments (83.4%) match a lead by email. 86 students ' +
      'cannot be traced to acquisition at all. Email is the only bridge and it is mutable.',
    drilldown: { target: 'people.roster', requiredFilters: ['unmatched'] },
  },
};

/** Every metric a dashboard may render, by domain. */
export function metricsForDomain(domain: MetricDomain): MetricDef[] {
  return Object.values(METRICS).filter((m) => m.domain === domain);
}

/**
 * Whether a metric may contribute to a health score, executive narrative or AI
 * recommendation. `partial` and `stale` may be SHOWN with their caveat; only
 * trusted figures may be computed with.
 */
export function mayComputeWith(key: string): boolean {
  const metric = METRICS[key];
  if (!metric) return false;
  return metric.status === 'trusted';
}

export function getMetric(key: string): MetricDef | undefined {
  return METRICS[key];
}
