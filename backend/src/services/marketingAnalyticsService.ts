import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';
import { logAgentExecution } from './governanceService';

const PRICE_PER_ENROLLMENT = 4500;

export interface CampaignMetric {
  campaign_id: string;
  visitors_count: number;
  high_intent_count: number;
  leads_count: number;
  strategy_calls: number;
  enrollments_count: number;
  high_intent_pct: number;
  conversion_rate: number;
  total_revenue: number;
  revenue_per_visitor: number;
  revenue_per_lead: number;
  visitor_to_lead_pct: number;
  lead_to_call_pct: number;
  call_to_enroll_pct: number;
  campaign_type: string | null;
  platform: string | null;
  creative: string | null;
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
      GREATEST(COALESCE(vd.visitors_count, 0), COALESCE(ce.unique_clicks, 0))::int AS visitors_count,
      COALESCE(vd.high_intent_count, 0)::int AS high_intent_count,
      COALESCE(ce.emails_sent, 0)::int AS leads_count,
      COALESCE(ce.unique_opens, 0)::int AS opens_count,
      COALESCE(ce.unique_clicks, 0)::int AS clicks_count,
      COALESCE(ce.replies, 0)::int AS replies_count,
      COALESCE(ce.meetings, 0)::int AS strategy_calls,
      COALESCE(ce.total_opens, 0)::int AS total_opens,
      COALESCE(ce.total_clicks, 0)::int AS total_clicks,
      COUNT(DISTINCT e.id)::int AS enrollments_count,
      NULL AS platform,
      NULL AS creative
    FROM campaigns c
    LEFT JOIN campaign_engagement ce ON ce.campaign_id = c.id
    LEFT JOIN visitor_data vd ON vd.campaign_id = c.id::text
    LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id AND cl.status = 'active'
    LEFT JOIN leads l ON l.id = cl.lead_id
    LEFT JOIN enrollments e ON LOWER(e.email) = LOWER(l.email) AND e.status = 'active'
    WHERE c.status = 'active'
      AND (ce.emails_sent > 0 OR vd.visitors_count > 0)
    GROUP BY c.id, c.name, c.type, vd.visitors_count, vd.high_intent_count,
      ce.emails_sent, ce.unique_opens, ce.unique_clicks, ce.replies, ce.meetings,
      ce.total_opens, ce.total_clicks
    ORDER BY COALESCE(ce.emails_sent, 0) DESC
  `;

  const rows = await sequelize.query(query, {
    replacements: dateFilter.replacements,
    type: QueryTypes.SELECT,
  }) as any[];

  const result = rows.map((row) => {
    const visitors = Number(row.visitors_count) || 0;
    const highIntent = Number(row.high_intent_count) || 0;
    const leads = Number(row.leads_count) || 0;
    const opens = Number(row.opens_count) || 0;
    const clicks = Number(row.clicks_count) || 0;
    const strategyCalls = Number(row.strategy_calls) || 0;
    const enrollments = Number(row.enrollments_count) || 0;
    const totalRevenue = enrollments * PRICE_PER_ENROLLMENT;

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
      total_revenue: totalRevenue,
      revenue_per_visitor: visitors > 0 ? Math.round(totalRevenue / visitors) : 0,
      revenue_per_lead: leads > 0 ? Math.round(totalRevenue / leads) : 0,
      visitor_to_lead_pct: visitors > 0 ? Math.round((leads / visitors) * 10000) / 100 : 0,
      lead_to_call_pct: leads > 0 ? Math.round((strategyCalls / leads) * 10000) / 100 : 0,
      call_to_enroll_pct: strategyCalls > 0 ? Math.round((enrollments / strategyCalls) * 10000) / 100 : 0,
      campaign_type: row.campaign_type || null,
      platform: row.platform || null,
      creative: row.creative || null,
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
