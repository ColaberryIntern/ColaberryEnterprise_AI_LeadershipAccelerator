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

  const query = `
    SELECT
      v.campaign_id,
      COUNT(DISTINCT v.id)::int AS visitors_count,
      COUNT(DISTINCT CASE WHEN i.intent_level IN ('high', 'very_high') THEN v.id END)::int AS high_intent_count,
      COUNT(DISTINCT l.id)::int AS leads_count,
      COUNT(DISTINCT CASE WHEN l.form_type = 'strategy_call' THEN l.id END)::int AS strategy_calls,
      COUNT(DISTINCT e.id)::int AS enrollments_count,
      MAX(v.campaign_type) AS campaign_type,
      MAX(v.platform) AS platform,
      MAX(v.creative) AS creative
    FROM visitors v
    LEFT JOIN intent_scores i ON i.visitor_id = v.id
    LEFT JOIN leads l ON l.id = v.lead_id
    LEFT JOIN enrollments e ON LOWER(e.email) = LOWER(l.email)
    WHERE v.campaign_id IS NOT NULL
      AND v.campaign_id != ''
      ${dateFilter.clause}
    GROUP BY v.campaign_id
    ORDER BY visitors_count DESC
  `;

  const rows = await sequelize.query(query, {
    replacements: dateFilter.replacements,
    type: QueryTypes.SELECT,
  }) as any[];

  const result = rows.map((row) => {
    const visitors = Number(row.visitors_count) || 0;
    const highIntent = Number(row.high_intent_count) || 0;
    const leads = Number(row.leads_count) || 0;
    const strategyCalls = Number(row.strategy_calls) || 0;
    const enrollments = Number(row.enrollments_count) || 0;
    const totalRevenue = enrollments * PRICE_PER_ENROLLMENT;

    return {
      campaign_id: row.campaign_id,
      visitors_count: visitors,
      high_intent_count: highIntent,
      leads_count: leads,
      strategy_calls: strategyCalls,
      enrollments_count: enrollments,
      high_intent_pct: visitors > 0 ? Math.round((highIntent / visitors) * 100) : 0,
      conversion_rate: visitors > 0 ? Math.round((enrollments / visitors) * 10000) / 100 : 0,
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
