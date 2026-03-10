import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

export interface CampaignMetric {
  campaign_id: string;
  visitors_count: number;
  high_intent_count: number;
  leads_count: number;
  strategy_calls: number;
  enrollments_count: number;
  high_intent_pct: number;
  conversion_rate: number;
}

export async function getCampaignMetrics(filters?: {
  start?: string;
  end?: string;
}): Promise<CampaignMetric[]> {
  const dateFilter = buildDateFilter(filters);

  const query = `
    SELECT
      v.campaign_id,
      COUNT(DISTINCT v.id)::int AS visitors_count,
      COUNT(DISTINCT CASE WHEN i.intent_level = 'high' THEN v.id END)::int AS high_intent_count,
      COUNT(DISTINCT l.id)::int AS leads_count,
      COUNT(DISTINCT CASE WHEN l.form_type = 'strategy_call' THEN l.id END)::int AS strategy_calls,
      COUNT(DISTINCT e.id)::int AS enrollments_count
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

  return rows.map((row) => {
    const visitors = Number(row.visitors_count) || 0;
    const highIntent = Number(row.high_intent_count) || 0;
    const leads = Number(row.leads_count) || 0;
    const enrollments = Number(row.enrollments_count) || 0;

    return {
      campaign_id: row.campaign_id,
      visitors_count: visitors,
      high_intent_count: highIntent,
      leads_count: leads,
      strategy_calls: Number(row.strategy_calls) || 0,
      enrollments_count: enrollments,
      high_intent_pct: visitors > 0 ? Math.round((highIntent / visitors) * 100) : 0,
      conversion_rate: visitors > 0 ? Math.round((enrollments / visitors) * 10000) / 100 : 0,
    };
  });
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
