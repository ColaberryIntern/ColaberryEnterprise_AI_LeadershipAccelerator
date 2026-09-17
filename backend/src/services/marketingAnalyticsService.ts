import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';
import { logAgentExecution } from './governanceService';
import { mayComputeWith, getMetric } from './adminOs/metricRegistry';

/**
 * MARKETING ANALYTICS - what this service will and will not claim to know.
 *
 * Every figure here is gated on the metric registry. The registry's own header describes the
 * failure this guards: "a missing field became 0, a 500 became 'no data', a NULL column became
 * 'Direct'". This file previously did all three.
 *
 * WHAT WAS REMOVED AND WHY:
 *
 * 1. REVENUE. This service used to compute `total_revenue = enrollments x 4500` from a
 *    hardcoded constant and present it on a tab labelled "Revenue Intelligence". That number was
 *    an assumption wearing a measurement's clothes, and it was wrong three ways at once: the
 *    price is not 4500 (the current offer is $149/mo), an enrollment is not a payment, and the
 *    operating rule for this business is that revenue means app-originated checkout ONLY. A
 *    campaign with ten enrollments and zero collected dollars reported $45,000.
 *
 *    It is now reported as `unavailable` with the reason attached, because "we do not have
 *    payment data joined to campaigns" is a true and useful statement, and "$45,000" is not.
 *
 * 2. platform / creative. The query selected `NULL AS platform, NULL AS creative` - declaring
 *    two dimensions it never populated. Every row came back null, so any consumer grouping by
 *    platform got one bucket holding everything, labelled as though it were a finding. A
 *    dimension we cannot populate is removed from the contract rather than served empty.
 *
 * WHAT WAS DELIBERATELY LEFT ALONE: `visitors_count` is GREATEST(site visitors, email clickers),
 * which is not a count of any real population. It is registered as `invalid` rather than
 * silently corrected, because changing it changes numbers people have been reading for months.
 * See metricRegistry 'marketing.campaign_visitors' and
 * docs/marketing/ESCALATION-002-fabricated-metrics.md. Escalated, not patched.
 */

/** A figure the registry says we cannot honestly report, and the reason. */
export interface UnavailableMetric {
  key: string;
  name: string;
  reason: string;
}

export interface CampaignMetric {
  campaign_id: string;
  visitors_count: number;
  high_intent_count: number;
  leads_count: number;
  strategy_calls: number;
  enrollments_count: number;
  high_intent_pct: number;
  conversion_rate: number;
  visitor_to_lead_pct: number;
  lead_to_call_pct: number;
  call_to_enroll_pct: number;
  campaign_type: string | null;
  /** The objective the ranking ladder is chosen by. Null when never set. */
  funnel_stage: string | null;
  /** opens + clicks + replies (distinct leads each). The 'governed engagement' a consideration
   * campaign ranks on. A plain sum of three trusted counts, so trusted itself. */
  engagement_count: number;
  /**
   * Metrics that CANNOT be computed, with the reason - never a zero standing in for one.
   * Callers must render these as an explicit unavailable state and must not feed them to a
   * health score, an average, or an AI narrative.
   */
  unavailable: UnavailableMetric[];
}

/**
 * The metrics this surface would like to show and the registry forbids computing.
 *
 * Derived by ASKING the registry, not by hand-listing - so when an ad-spend connector lands and
 * `marketing.roas` flips to trusted, this list shrinks on its own. A hand-written list would
 * keep saying "unavailable" after the data arrived, which is the same class of lie in the
 * opposite direction.
 */
const REVENUE_METRIC_KEYS = ['marketing.roas', 'marketing.ad_spend', 'marketing.cost_per_lead'] as const;

function buildUnavailable(): UnavailableMetric[] {
  const out: UnavailableMetric[] = [];
  for (const key of REVENUE_METRIC_KEYS) {
    if (mayComputeWith(key)) continue; // trusted now - the caller may compute it for real
    const def = getMetric(key);
    out.push({
      key,
      name: def?.name ?? key,
      // A registered metric always carries a reason when it is not trusted (the registry's own
      // test enforces that). The fallback exists only so an unregistered key cannot produce an
      // empty explanation, which would read as "no reason" rather than "not registered".
      reason: def?.statusReason ?? 'Not registered in the metric registry.',
    });
  }
  return out;
}



/**
 * The timestamp column of each activity source the date range applies to. Named here, in one
 * place, and asserted against the models' declared attributes by
 * marketingCampaignScope.test.ts - because the previous clause named `v."createdAt"`, a column
 * `visitors` has never had (it is `created_at`, `timestamps: false`), and a test that only
 * mocked sequelize.query pinned the wrong literal and passed. A column name the model does not
 * declare cannot pass that suite now.
 */
export const ACTIVITY_DATE_COLUMNS = {
  interaction_outcomes: 'created_at',
  visitors: 'created_at',
} as const;

export interface CampaignMetricFilters {
  start?: string;
  end?: string;
  /** Scope to one brand. Omitted = every brand the caller may see (the route decides that). */
  brandId?: string;
}

export async function getCampaignMetrics(filters?: CampaignMetricFilters): Promise<CampaignMetric[]> {
  const startTime = Date.now();
  const dateFilter = buildDateFilter(filters);
  // Brand is a WHERE on campaigns, not a join: a campaign with no brand belongs to no brand
  // scope and drops out when one is chosen. That is the truthful answer, not a leak.
  const brandClause = filters?.brandId ? 'AND c.brand_id = :brandId' : '';
  const replacements: Record<string, string> = { ...dateFilter.replacements };
  if (filters?.brandId) replacements.brandId = filters.brandId;

  // Combine visitor tracking data with interaction outcome data for full picture
  const query = `
    WITH campaign_engagement AS (
      SELECT
        io.campaign_id,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'sent')::int AS emails_sent,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'opened')::int AS unique_opens,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'clicked')::int AS unique_clicks,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'replied')::int AS replies,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'booked_meeting')::int AS meetings,
        COUNT(*) FILTER (WHERE io.outcome = 'opened')::int AS total_opens,
        COUNT(*) FILTER (WHERE io.outcome = 'clicked')::int AS total_clicks
      FROM interaction_outcomes io
      WHERE io.campaign_id IS NOT NULL
        ${dateFilter.clauseFor(`io.${ACTIVITY_DATE_COLUMNS.interaction_outcomes}`)}
      GROUP BY io.campaign_id
    ),
    visitor_data AS (
      SELECT
        v.campaign_id,
        COUNT(DISTINCT v.id)::int AS visitors_count,
        COUNT(DISTINCT CASE WHEN i.intent_level IN ('high', 'very_high') THEN v.id END)::int AS high_intent_count
      FROM visitors v
      LEFT JOIN intent_scores i ON i.visitor_id = v.id
      WHERE v.campaign_id IS NOT NULL AND v.campaign_id != ''
        ${dateFilter.clauseFor(`v.${ACTIVITY_DATE_COLUMNS.visitors}`)}
      GROUP BY v.campaign_id
    )
    SELECT
      c.id AS campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      c.funnel_stage AS funnel_stage,
      GREATEST(COALESCE(vd.visitors_count, 0), COALESCE(ce.unique_clicks, 0))::int AS visitors_count,
      COALESCE(vd.high_intent_count, 0)::int AS high_intent_count,
      COALESCE(ce.emails_sent, 0)::int AS leads_count,
      COALESCE(ce.unique_opens, 0)::int AS opens_count,
      COALESCE(ce.unique_clicks, 0)::int AS clicks_count,
      COALESCE(ce.replies, 0)::int AS replies_count,
      COALESCE(ce.meetings, 0)::int AS strategy_calls,
      COALESCE(ce.total_opens, 0)::int AS total_opens,
      COALESCE(ce.total_clicks, 0)::int AS total_clicks,
      COUNT(DISTINCT e.id)::int AS enrollments_count
    FROM campaigns c
    LEFT JOIN campaign_engagement ce ON ce.campaign_id = c.id
    LEFT JOIN visitor_data vd ON vd.campaign_id = c.id::text
    LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id AND cl.status = 'active'
    LEFT JOIN leads l ON l.id = cl.lead_id
    LEFT JOIN enrollments e ON LOWER(e.email) = LOWER(l.email) AND e.status = 'active'
    WHERE c.status = 'active'
      ${brandClause}
      AND (ce.emails_sent > 0 OR vd.visitors_count > 0)
    GROUP BY c.id, c.name, c.type, c.funnel_stage, vd.visitors_count, vd.high_intent_count,
      ce.emails_sent, ce.unique_opens, ce.unique_clicks, ce.replies, ce.meetings,
      ce.total_opens, ce.total_clicks
    ORDER BY COALESCE(ce.emails_sent, 0) DESC
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  }) as any[];

  // Computed per call, NOT memoised at module load. The comment on buildUnavailable claims
  // this list "shrinks on its own" once a metric flips to trusted; with a module-level constant
  // that was true only after a process restart, which makes the claim misleading in exactly the
  // way this file exists to avoid. campaignLinkService already recomputes per call; this now
  // matches it. The cost is a five-element array per request.
  const unavailable_ = buildUnavailable();

  const result = rows.map((row) => {
    const visitors = Number(row.visitors_count) || 0;
    const highIntent = Number(row.high_intent_count) || 0;
    const leads = Number(row.leads_count) || 0;
    const opens = Number(row.opens_count) || 0;
    const clicks = Number(row.clicks_count) || 0;
    const strategyCalls = Number(row.strategy_calls) || 0;
    const enrollments = Number(row.enrollments_count) || 0;

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name || row.campaign_id,
      visitors_count: visitors,
      high_intent_count: highIntent,
      leads_count: leads,
      opens_count: opens,
      clicks_count: clicks,
      replies_count: Number(row.replies_count) || 0,
      total_opens: Number(row.total_opens) || 0,
      total_clicks: Number(row.total_clicks) || 0,
      strategy_calls: strategyCalls,
      enrollments_count: enrollments,
      open_rate: leads > 0 ? Math.round((opens / leads) * 10000) / 100 : 0,
      click_rate: leads > 0 ? Math.round((clicks / leads) * 10000) / 100 : 0,
      high_intent_pct: visitors > 0 ? Math.round((highIntent / visitors) * 100) : 0,
      conversion_rate: leads > 0 ? Math.round((enrollments / leads) * 10000) / 100 : 0,
      visitor_to_lead_pct: visitors > 0 ? Math.round((leads / visitors) * 10000) / 100 : 0,
      lead_to_call_pct: leads > 0 ? Math.round((strategyCalls / leads) * 10000) / 100 : 0,
      call_to_enroll_pct: strategyCalls > 0 ? Math.round((enrollments / strategyCalls) * 10000) / 100 : 0,
      campaign_type: row.campaign_type || null,
      funnel_stage: row.funnel_stage || null,
      engagement_count: opens + clicks + (Number(row.replies_count) || 0),
      unavailable: unavailable_,
    };
  });

  // Governance logging (fire-and-forget)
  logAgentExecution('revenue_aggregator', 'success', Date.now() - startTime).catch(() => {});

  return result;
}


/* ── Growth Journey dimension (Phase 4 T411) ──────────────────────────────── */

/**
 * One programme x path row of the campaign table: the same counts, grouped by the
 * Growth Journey dimension instead of by campaign.
 *
 * ─── MISSING IS `null`, NOT 0 ───────────────────────────────────────────────
 *
 * A programme no lead is on has no open rate, no conversion rate and no
 * engagement - it has no leads. Reporting 0% would state a fact the data does
 * not contain (the same rule T409's handoff rates follow), so every rate and
 * every count is `null` for such a row and `has_leads` says which kind of row
 * this is. The programme still APPEARS, from `journey_programs`, because "the
 * programme is not running yet" is the answer the page needs.
 */
export interface JourneyMetricRow {
  brand_id: string;
  program_slug: string;
  program_name: string;
  program_status: string;
  /** The classification's primary path, or null for the programme's row with no path chosen. */
  path_slug: string | null;
  has_leads: boolean;
  leads_count: number | null;
  classified_count: number | null;
  campaigns_count: number | null;
  emails_sent: number | null;
  opens_count: number | null;
  clicks_count: number | null;
  replies_count: number | null;
  meetings_count: number | null;
  enrollments_count: number | null;
  open_rate: number | null;
  click_rate: number | null;
  reply_rate: number | null;
  conversion_rate: number | null;
}

/**
 * A percentage over a population that could have produced it, or `null` when
 * that population is empty. Both counts are DISTINCT LEADS, so the ratio cannot
 * exceed 100% unless the two counts disagree about what they count - and the
 * ceiling is applied here as well, because an impossible number on a dashboard
 * is a model bug the reader cannot see.
 */
const pct = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.min(100, Math.round((numerator / denominator) * 10000) / 100) : null;

/**
 * The campaigns table, one dimension over: brand x programme x path.
 *
 * Reads the Growth Journey rows the graph dimension reads (the LATEST
 * classification per lead, by `created_at`) and joins the campaign interaction
 * outcomes the campaign table already counts. The COUNTING UNIT is the one the
 * campaign table uses for these field names - DISTINCT LEADS, not event rows
 * (`interaction_outcomes` has no unique index on (lead_id, campaign_id,
 * outcome), which is why the campaign table keeps `total_opens` separately from
 * `unique_opens`). Counting rows here would let `open_rate` exceed 100% - an
 * impossible number, and the T411 verifier found it before anybody read one.
 * `campaigns_count` is likewise DISTINCT campaigns, not lead-campaign pairs.
 * Brand is a WHERE on the journey rows here rather than on campaigns, because a
 * journey belongs to a brand directly.
 *
 * The date range applies to the OUTCOMES, not to the classification: a lead
 * classified in August whose campaign replied in September belongs in
 * September's engagement, which is how the campaign table already reads.
 */
export async function getCampaignMetricsByJourney(filters?: CampaignMetricFilters): Promise<JourneyMetricRow[]> {
  const startTime = Date.now();
  const dateFilter = buildDateFilter(filters);
  const brandClause = filters?.brandId ? 'AND p.brand_id = :brandId' : '';
  const replacements: Record<string, string> = { ...dateFilter.replacements };
  if (filters?.brandId) replacements.brandId = filters.brandId;

  const query = `
    WITH latest_classification AS (
      SELECT DISTINCT ON (c.lead_id)
        c.lead_id, c.brand_id, c.journey_program_slug, c.primary_path
      FROM growth_journey_classifications c
      WHERE c.lead_id IS NOT NULL
      ORDER BY c.lead_id, c.created_at DESC
    ),
    journey_leads AS (
      SELECT
        lc.brand_id, lc.journey_program_slug, lc.primary_path,
        COUNT(DISTINCT lc.lead_id) AS leads,
        COUNT(DISTINCT io.campaign_id) AS campaigns,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'sent') AS sent,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'opened') AS opened,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'clicked') AS clicked,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'replied') AS replied,
        COUNT(DISTINCT io.lead_id) FILTER (WHERE io.outcome = 'booked_meeting') AS booked
      FROM latest_classification lc
      LEFT JOIN interaction_outcomes io
        ON io.lead_id = lc.lead_id
        AND io.campaign_id IS NOT NULL
        ${dateFilter.clauseFor(`io.${ACTIVITY_DATE_COLUMNS.interaction_outcomes}`)}
      GROUP BY lc.brand_id, lc.journey_program_slug, lc.primary_path
    ),
    journey_enrollments AS (
      SELECT lc.brand_id, lc.journey_program_slug, lc.primary_path,
        COUNT(DISTINCT e.id) AS enrollments
      FROM latest_classification lc
      JOIN leads l ON l.id = lc.lead_id
      JOIN enrollments e ON LOWER(e.email) = LOWER(l.email) AND e.status = 'active'
      GROUP BY lc.brand_id, lc.journey_program_slug, lc.primary_path
    )
    SELECT
      p.brand_id,
      p.slug AS program_slug,
      p.name AS program_name,
      p.status AS program_status,
      jl.primary_path AS path_slug,
      COALESCE(MAX(jl.leads), 0)::int AS leads_count,
      COALESCE(MAX(jl.campaigns), 0)::int AS campaigns_count,
      COALESCE(MAX(jl.sent), 0)::int AS emails_sent,
      COALESCE(MAX(jl.opened), 0)::int AS opens_count,
      COALESCE(MAX(jl.clicked), 0)::int AS clicks_count,
      COALESCE(MAX(jl.replied), 0)::int AS replies_count,
      COALESCE(MAX(jl.booked), 0)::int AS meetings_count,
      COALESCE(MAX(je.enrollments), 0)::int AS enrollments_count
    FROM journey_programs p
    LEFT JOIN journey_leads jl
      ON jl.journey_program_slug = p.slug AND jl.brand_id = p.brand_id
    LEFT JOIN journey_enrollments je
      ON je.journey_program_slug = p.slug AND je.brand_id = p.brand_id
      AND (je.primary_path = jl.primary_path OR (je.primary_path IS NULL AND jl.primary_path IS NULL))
    WHERE p.status <> 'retired'
      ${brandClause}
    GROUP BY p.brand_id, p.slug, p.name, p.status, jl.primary_path
    ORDER BY p.slug ASC, jl.primary_path ASC NULLS LAST
  `;

  const rows = await sequelize.query(query, { replacements, type: QueryTypes.SELECT }) as any[];

  const result = rows.map((row) => {
    const leads = Number(row.leads_count) || 0;
    if (leads === 0) {
      // A programme with no classified lead: every number is null, and the row still exists.
      return {
        brand_id: row.brand_id, program_slug: row.program_slug, program_name: row.program_name || row.program_slug,
        program_status: row.program_status, path_slug: row.path_slug ?? null, has_leads: false,
        leads_count: null, classified_count: null, campaigns_count: null, emails_sent: null, opens_count: null,
        clicks_count: null, replies_count: null, meetings_count: null, enrollments_count: null,
        open_rate: null, click_rate: null, reply_rate: null, conversion_rate: null,
      };
    }
    const sent = Number(row.emails_sent) || 0;
    const opens = Number(row.opens_count) || 0;
    const clicks = Number(row.clicks_count) || 0;
    const replies = Number(row.replies_count) || 0;
    const enrollments = Number(row.enrollments_count) || 0;
    return {
      brand_id: row.brand_id, program_slug: row.program_slug, program_name: row.program_name || row.program_slug,
      program_status: row.program_status, path_slug: row.path_slug ?? null, has_leads: true,
      leads_count: leads, classified_count: leads, campaigns_count: Number(row.campaigns_count) || 0,
      emails_sent: sent, opens_count: opens, clicks_count: clicks, replies_count: replies,
      meetings_count: Number(row.meetings_count) || 0, enrollments_count: enrollments,
      // Rates over the population that could have produced them; null when that population is empty.
      open_rate: pct(opens, sent), click_rate: pct(clicks, sent), reply_rate: pct(replies, sent),
      conversion_rate: pct(enrollments, leads),
    };
  });

  logAgentExecution('revenue_aggregator', 'success', Date.now() - startTime).catch(() => {});
  return result;
}

/**
 * The date range, as a clause for WHICHEVER timestamp column the CTE has. Until this build the
 * builder returned one clause hard-wired to a column that does not exist and nothing
 * interpolated it, so the range the scope strip stated was never applied - the verifier's
 * finding, and true on main before this branch. The column is a caller-supplied identifier
 * from ACTIVITY_DATE_COLUMNS, never user input.
 *
 * `end` is INCLUSIVE, as the scope strip promises (`DateRange.end` is documented inclusive):
 * a `YYYY-MM-DD` literal compared with `<=` is midnight at the START of that day and would
 * drop the whole last day from both the current and the prior window. So the upper bound is
 * strictly less than the day after.
 */
export function buildDateFilter(filters?: { start?: string; end?: string }): {
  clauseFor: (column: string) => string;
  replacements: Record<string, string>;
} {
  const replacements: Record<string, string> = {};
  if (filters?.start) replacements.start = filters.start;
  if (filters?.end) replacements.end = filters.end;
  return {
    clauseFor: (column) => [
      filters?.start ? `AND ${column} >= CAST(:start AS date)` : '',
      filters?.end ? `AND ${column} < (CAST(:end AS date) + INTERVAL '1 day')` : '',
    ].filter(Boolean).join(' '),
    replacements,
  };
}

/** Totals of the trusted counts, for a period-over-period comparison. Pure. */
export interface CampaignTotals {
  campaigns: number;
  visitors_count: number;
  leads_count: number;
  engagement_count: number;
  enrollments_count: number;
}

export function totalCampaignMetrics(rows: readonly Pick<CampaignMetric, 'visitors_count' | 'leads_count' | 'engagement_count' | 'enrollments_count'>[]): CampaignTotals {
  return rows.reduce<CampaignTotals>((acc, r) => ({
    campaigns: acc.campaigns + 1,
    visitors_count: acc.visitors_count + r.visitors_count,
    leads_count: acc.leads_count + r.leads_count,
    engagement_count: acc.engagement_count + r.engagement_count,
    enrollments_count: acc.enrollments_count + r.enrollments_count,
  }), { campaigns: 0, visitors_count: 0, leads_count: 0, engagement_count: 0, enrollments_count: 0 });
}
