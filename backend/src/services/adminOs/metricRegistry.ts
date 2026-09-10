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

export type MetricDomain = 'growth' | 'learning' | 'revenue' | 'people' | 'operations' | 'marketing';

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
    sources: ['PaySimple (transactions)', 'CCPP SQL Server (plan and enrolment context)', 'refunds'],
    grain: 'transaction',
    dimensions: ['plan', 'cohort', 'source', 'period'],
    status: 'unavailable',
    statusReason:
      'Source IDENTIFIED but not yet wired (confirmed 2026-09-05): transactions from PaySimple, ' +
      'plan and enrolment context from CCPP. There is still no local payments table, and refunds ' +
      'holds 3 rows with the latest dated 2026-08-06, so nothing here can compute a figure yet. ' +
      'Knowing where the data lives is not the same as having read it — this stays unavailable, ' +
      'and renders as such, until the integration lands and is reconciled against app-originated ' +
      'checkouts only.',
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
    // 'period' is mandatory in practice, not optional: rendering this metric
    // without a time split reports a settled 83% for a funnel currently at 56%.
    dimensions: ['cohort', 'period', 'tier', 'enrollment_type'],
    // Deliberately registered even though it is uncomfortable: it is the honest
    // measure of whether the 360 profile can keep its promise, and it should be
    // visible on the trust strip rather than discovered again later.
    status: 'partial',
    statusReason:
      'Measured 2026-09-05: 431 of 517 enrolments (83.4%) match a lead by email. But the ' +
      'lifetime figure HIDES A TREND and must not be shown alone — by month, coverage ran at ' +
      '98% in July, 66% in August and 56% in September. The gap is widening, not settled. ' +
      'Concentrated in the guest tier introduced 2026-07-19, which is 88% untraceable (37 of ' +
      '42). Email is the only bridge that works: of the 86 unmatched, NONE carry a usable ' +
      'phone and NONE match exactly one lead by name, so no matching rule can recover them.',
    drilldown: { target: 'people.roster', requiredFilters: ['unmatched'] },
  },

  // ── Marketing Operations ────────────────────────────────────────────────────────────
  //
  // MOST OF THESE ARE `unavailable`, AND THAT IS THE DELIVERABLE.
  //
  // There is no ad-platform integration in this codebase - no Meta, Google, LinkedIn or
  // TikTok client, no spend import, and nothing anywhere writes `campaigns.budget_spent`. So
  // ROAS, cost-per-click, cost-per-lead and impressions cannot be computed at all. Registering
  // them as `unavailable` with the reason is what stops a dashboard rendering `0` or `-` for a
  // number that has no input, which is exactly the "a missing field became 0" failure this
  // registry's own header describes.
  //
  // An unavailable metric is a statement: "we cannot know this yet, and here is why." A zero is
  // a claim that the value is nothing. On spend, those are very different things to show an
  // operator deciding where to put next month's budget.

  'marketing.tracked_link_clicks': {
    key: 'marketing.tracked_link_clicks',
    name: 'Tracked link clicks',
    domain: 'marketing',
    unit: 'count',
    definition: 'Clicks recorded on a campaign tracked link, EXCLUDING bots.',
    formula: 'COUNT(*) FROM link_clicks WHERE is_bot = false',
    sources: ['link_clicks', 'tracked_links'],
    grain: 'event',
    dimensions: ['brand', 'campaign', 'creative', 'source', 'medium', 'period'],
    status: 'partial',
    statusReason:
      'link_clicks was created on 2026-09-10 and cannot be backfilled: before it, the platform ' +
      'held one tracking link per campaign and recorded no click at all. Any campaign that ran ' +
      'earlier reports zero clicks because none were captured, NOT because none happened. ' +
      'Trustworthy forward, meaningless backward.',
    drilldown: { target: 'marketing.clicks', requiredFilters: ['period', 'campaign'] },
  },

  'marketing.bot_click_share': {
    key: 'marketing.bot_click_share',
    name: 'Bot share of clicks',
    domain: 'marketing',
    unit: 'percent',
    definition:
      'Share of recorded clicks classified as non-human. Kept visible on purpose so the ' +
      'exclusion above is auditable rather than an invisible adjustment.',
    formula: 'clicks WHERE is_bot / all clicks',
    sources: ['link_clicks'],
    grain: 'event',
    dimensions: ['brand', 'campaign', 'period'],
    status: 'partial',
    statusReason:
      'Classification is a user-agent heuristic, so it is a good estimate and not a fact. It is ' +
      'reported rather than hidden because the adjustment is large: discovery measured 74% of ' +
      'sessions over 30 days as self-identifying crawlers, and social preview fetchers hit a ' +
      'marketing link the moment it is posted. A number this big should never move silently.',
    drilldown: { target: 'marketing.clicks', requiredFilters: ['period', 'is_bot'] },
  },

  'marketing.click_to_session_match_rate': {
    key: 'marketing.click_to_session_match_rate',
    name: 'Click-to-session match rate',
    domain: 'marketing',
    unit: 'percent',
    definition: 'Share of human clicks that can be tied to a visitor session on the landing page.',
    formula: 'matched_sessions / human_clicks',
    sources: ['link_clicks', 'visitor_sessions'],
    grain: 'event',
    dimensions: ['brand', 'campaign', 'period'],
    status: 'unavailable',
    statusReason:
      'The join does not exist yet. link_clicks records no visitor fingerprint, so a click and ' +
      'the session it produced cannot currently be matched. Until that lands this figure has no ' +
      'input, and showing a low percentage would report a measurement gap as poor performance.',
  },

  'marketing.ad_spend': {
    key: 'marketing.ad_spend',
    name: 'Ad spend',
    domain: 'marketing',
    unit: 'currency',
    definition: 'Money actually spent on paid placements, as reported by the ad platform.',
    formula: 'SUM(spend) FROM marketing_spend_facts',
    sources: ['(none yet)'],
    grain: 'transaction',
    dimensions: ['brand', 'campaign', 'provider', 'period'],
    status: 'unavailable',
    statusReason:
      'There is NO ad-platform integration in this system - no Meta, Google, LinkedIn or TikTok ' +
      'client, and no spend import of any kind. `campaigns.budget_total` and `budget_cap` are ' +
      'hand-entered plans, and NOTHING in the codebase ever writes `budget_spent`. Reading those ' +
      'columns as spend would report a budget as though it were an expenditure.',
  },

  'marketing.impressions': {
    key: 'marketing.impressions',
    name: 'Impressions',
    domain: 'marketing',
    unit: 'count',
    definition: 'Provider-reported served impressions.',
    formula: 'SUM(impressions) FROM marketing_metric_facts',
    sources: ['(none yet)'],
    grain: 'event',
    dimensions: ['brand', 'campaign', 'provider', 'creative', 'period'],
    status: 'unavailable',
    statusReason:
      'No provider metric ingestion exists. Impressions are only ever reported BY a platform - ' +
      'they cannot be derived from first-party data - so with no connector there is no source at ' +
      'all. Never sum reach across networks as unique people even once this lands.',
  },

  'marketing.cost_per_click': {
    key: 'marketing.cost_per_click',
    name: 'Cost per click',
    domain: 'marketing',
    unit: 'currency',
    definition: 'Ad spend divided by clicks attributed to paid placements.',
    formula: 'ad_spend / paid_clicks',
    sources: ['(none yet)', 'link_clicks'],
    grain: 'event',
    dimensions: ['brand', 'campaign', 'provider', 'period'],
    status: 'unavailable',
    statusReason:
      'Depends on marketing.ad_spend, which has no source. A cost-per-click computed against a ' +
      'zero or absent numerator is not a small number, it is a meaningless one.',
  },

  'marketing.cost_per_lead': {
    key: 'marketing.cost_per_lead',
    name: 'Cost per lead',
    domain: 'marketing',
    unit: 'currency',
    definition: 'Ad spend divided by leads attributed to the campaign.',
    formula: 'ad_spend / attributed_leads',
    sources: ['(none yet)', 'leads', 'lead_tenant_contexts'],
    grain: 'person',
    dimensions: ['brand', 'campaign', 'period'],
    status: 'unavailable',
    statusReason: 'Depends on marketing.ad_spend, which has no source.',
  },

  'marketing.roas': {
    key: 'marketing.roas',
    name: 'Return on ad spend',
    domain: 'marketing',
    unit: 'ratio',
    definition: 'Attributed revenue divided by ad spend. NOT the same thing as ROI.',
    formula: 'attributed_revenue / ad_spend',
    sources: ['(none yet)', 'enrollments'],
    grain: 'transaction',
    dimensions: ['brand', 'campaign', 'period'],
    status: 'unavailable',
    statusReason:
      'Both halves are missing. There is no ad-spend source at all, and there is no revenue ' +
      'source either: attributed revenue USED to be derived from a hardcoded $4,500 price times ' +
      'an enrollment count, which was removed rather than corrected, because an enrollment is ' +
      'not a payment and revenue here means app-originated checkout only. Nothing has replaced ' +
      'it, so both the numerator and the denominator are absent.',
  },

  'marketing.creative_performance': {
    key: 'marketing.creative_performance',
    name: 'Performance by creative',
    domain: 'marketing',
    unit: 'count',
    definition: 'Clicks and sessions grouped by the creative variant that produced them.',
    formula: 'COUNT(*) GROUP BY utm_content',
    sources: ['link_clicks', 'visitor_sessions', 'tracked_links'],
    grain: 'event',
    dimensions: ['brand', 'campaign', 'creative', 'period'],
    status: 'partial',
    statusReason:
      'utm_content was only persisted from 2026-09-10. Before that it was VALIDATED at the ' +
      'ingest boundary and then packed into a JSONB blob nothing could query, so historic ' +
      'creative-level data exists in a form no report can read. Forward-looking only.',
    drilldown: { target: 'marketing.clicks', requiredFilters: ['period', 'campaign', 'creative'] },
  },

  'marketing.campaign_visitors': {
    key: 'marketing.campaign_visitors',
    name: 'Campaign visitors',
    domain: 'marketing',
    unit: 'count',
    definition:
      'Intended as people who reached the site from a campaign. Currently NOT that - see the ' +
      'status reason. Registered so the defect is visible rather than implied by a column name.',
    formula: 'GREATEST(site_visitors, email_unique_clickers)  -- NOT a valid count',
    sources: ['visitors', 'interaction_outcomes'],
    grain: 'visitor',
    dimensions: ['campaign', 'period'],
    status: 'invalid',
    statusReason:
      'The query takes GREATEST() of two DIFFERENT populations - distinct site visitors, and ' +
      'distinct leads who clicked an email - and reports the larger as one visitor count. That ' +
      'is not a count of any real group: the two sets overlap by an unknown amount, so the true ' +
      'number lies somewhere between the max and the sum and this returns one endpoint. It then ' +
      'feeds the downstream percentages high_intent_pct, visitor_to_lead_pct and the overall ' +
      'conversion display, so the error propagates silently. ' +
      'LEFT UNCHANGED ON PURPOSE by the task that registered it: correcting the denominator ' +
      'changes numbers operators have been reading for months, which is a decision to make ' +
      'deliberately and not a side effect of a marketing build. See ' +
      'docs/marketing/ESCALATION-002-fabricated-metrics.md.',
  },

  'marketing.publish_success_rate': {
    key: 'marketing.publish_success_rate',
    name: 'Publish success rate',
    domain: 'marketing',
    unit: 'percent',
    definition: 'Share of scheduled publications that reached the provider successfully.',
    formula: 'published_jobs / attempted_jobs',
    sources: ['publishing_jobs', 'external_publications'],
    grain: 'event',
    dimensions: ['brand', 'provider', 'period'],
    status: 'unavailable',
    statusReason:
      'The queue tables exist but nothing publishes yet - there is no worker and no provider ' +
      'connector. A 0% or 100% success rate over zero attempts is not a measurement.',
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
