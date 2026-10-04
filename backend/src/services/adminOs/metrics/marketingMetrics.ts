import type { MetricDef } from '../metricRegistry';

/**
 * The Marketing Operations metrics (extracted, T605).
 *
 * MOVED VERBATIM out of `metricRegistry.ts`, which had reached 552 lines - past
 * CLAUDE.md's 500-line hard ceiling - so the rule that a file over the ceiling
 * is split before anything is added applied before the Growth Journey group
 * could go in. Seventeen of the registry's twenty-four keys were this one
 * contiguous group, which makes it the split that needs no judgement: every
 * definition, formula, status, reason and comment below is byte-for-byte what
 * the registry carried, and `adminOs/__tests__/metricRegistry.extraction.test.ts`
 * pins that against a committed snapshot taken before the move.
 *
 * It is spread back into `METRICS` in the registry, so there is still ONE
 * registry, one `mayComputeWith`, one `metricsForDomain`, and every consumer
 * imports what it always did.
 */

export const MARKETING_METRICS: Record<string, MetricDef> = {
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

  // The three signals the Needs-Attention queue may raise. All `trusted`, and it is worth
  // being precise about why: each is a COUNT OF ROWS in a table this system owns and writes.
  // That is a fact, not an estimate - there is no sampling, no heuristic and no external
  // source that could be stale. Contrast marketing.bot_click_share, which is a count too but
  // of a HEURISTIC classification, and is therefore only partial.
  //
  // The queue consults mayComputeWith() before raising anything, so if one of these is ever
  // downgraded (say the approval table gains a second writer with different semantics) the
  // signal disappears from the queue automatically rather than raising on a number nobody
  // can vouch for.

  'marketing.pending_approvals': {
    key: 'marketing.pending_approvals',
    name: 'Content awaiting approval',
    domain: 'marketing',
    unit: 'count',
    definition: 'Content approval requests currently in the pending state.',
    formula: "COUNT(*) FROM content_approval_requests WHERE status = 'pending'",
    sources: ['content_approval_requests'],
    grain: 'event',
    dimensions: ['brand', 'period'],
    status: 'trusted',
    drilldown: { target: 'marketing.content', requiredFilters: ['status'] },
  },

  'marketing.failed_publishing_jobs': {
    key: 'marketing.failed_publishing_jobs',
    name: 'Failed or overdue publishing jobs',
    domain: 'marketing',
    unit: 'count',
    definition:
      'Publishing jobs that failed, were dead-lettered, or are past their publish time and ' +
      'still unpublished.',
    formula:
      "COUNT(*) FROM publishing_jobs WHERE state IN ('failed','dead_lettered') OR " +
      "(state IN ('pending','retrying') AND publish_at < now() - grace)",
    sources: ['publishing_jobs'],
    grain: 'event',
    dimensions: ['brand', 'provider', 'period'],
    status: 'trusted',
    drilldown: { target: 'marketing.publishing', requiredFilters: ['state'] },
  },

  'marketing.broken_tracked_links': {
    key: 'marketing.broken_tracked_links',
    name: 'Broken tracking links',
    domain: 'marketing',
    unit: 'count',
    definition:
      'Active tracked links whose stored destination no longer passes the allowlist, so the ' +
      'public redirect refuses them and a click lands on a 410.',
    formula: 'COUNT(active tracked_links WHERE validateDestination(destination_url) fails)',
    sources: ['tracked_links'],
    grain: 'event',
    dimensions: ['brand', 'campaign'],
    status: 'trusted',
    drilldown: { target: 'marketing.links', requiredFilters: ['status'] },
  },

  // The two columns objective-aware ranking may sort by TODAY. Both trusted, and both for the
  // same reason as the queue metrics above: they are counts of rows in interaction_outcomes,
  // a table this system writes. Cost-per-lead and ROAS would be the right measure for an
  // acquisition campaign and are registered unavailable, so the ranking ladder falls through
  // to these with the fallback stated - see campaignRanking.ts.

  'marketing.campaign_leads': {
    key: 'marketing.campaign_leads',
    name: 'Campaign leads',
    domain: 'marketing',
    unit: 'count',
    definition: 'Distinct leads a campaign has sent to.',
    formula: "COUNT(DISTINCT lead_id) FROM interaction_outcomes WHERE outcome = 'sent' GROUP BY campaign_id",
    sources: ['interaction_outcomes'],
    grain: 'person',
    dimensions: ['campaign', 'brand', 'period'],
    status: 'trusted',
    drilldown: { target: 'people.roster', requiredFilters: ['campaign'] },
  },

  'marketing.campaign_engagement': {
    key: 'marketing.campaign_engagement',
    name: 'Campaign engagement',
    domain: 'marketing',
    unit: 'count',
    definition: 'Distinct leads who opened, clicked or replied, summed across the three.',
    formula: 'unique_opens + unique_clicks + replies FROM interaction_outcomes GROUP BY campaign_id',
    sources: ['interaction_outcomes'],
    grain: 'person',
    dimensions: ['campaign', 'brand', 'period'],
    status: 'trusted',
    drilldown: { target: 'people.roster', requiredFilters: ['campaign', 'engaged'] },
  },

  'marketing.campaign_lead_status': {
    key: 'marketing.campaign_lead_status',
    name: 'Campaign leads by status',
    domain: 'marketing',
    unit: 'count',
    definition: 'Leads enrolled in a campaign, sliced by their enrolment status.',
    formula: 'COUNT(*) FROM campaign_leads GROUP BY campaign_id, status',
    sources: ['campaign_leads'],
    grain: 'person',
    dimensions: ['campaign', 'status'],
    status: 'trusted',
    // The Campaign 360 Overview KPIs drill into this. `campaign` is required on every one so
    // the roster can never open unscoped; `status` is added by the sliced KPIs.
    drilldown: { target: 'people.roster', requiredFilters: ['campaign'] },
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
