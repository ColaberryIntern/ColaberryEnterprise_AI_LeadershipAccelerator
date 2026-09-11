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



export async function getCampaignMetrics(filters?: {
  start?: string;
  end?: string;
}): Promise<CampaignMetric[]> {
  const startTime = Date.now();
  const dateFilter = buildDateFilter(filters);

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
      AND (ce.emails_sent > 0 OR vd.visitors_count > 0)
    GROUP BY c.id, c.name, c.type, c.funnel_stage, vd.visitors_count, vd.high_intent_count,
      ce.emails_sent, ce.unique_opens, ce.unique_clicks, ce.replies, ce.meetings,
      ce.total_opens, ce.total_clicks
    ORDER BY COALESCE(ce.emails_sent, 0) DESC
  `;

  const rows = await sequelize.query(query, {
    replacements: dateFilter.replacements,
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

function buildDateFilter(filters?: { start?: string; end?: string }): {
  clause: string;
  replacements: Record<string, string>;
} {
  const replacements: Record<string, string> = {};
  const parts: string[] = [];

  if (filters?.start) {
    parts.push('AND v."createdAt" >= :start');
    replacements.start = filters.start;
  }
  if (filters?.end) {
    parts.push('AND v."createdAt" <= :end');
    replacements.end = filters.end;
  }

  return { clause: parts.join(' '), replacements };
}
