// ─── Insight Discovery Service ────────────────────────────────────────────
// Detects patterns and anomalies across system data. Scores each insight by
// confidence, impact, urgency, and data strength.

import { ReportingInsight } from '../../models';
import type { InsightType, InsightEntityType, AlertSeverity, InsightStatus } from '../../models/ReportingInsight';
import { sequelize } from '../../config/database';
import { QueryTypes, Op } from 'sequelize';

// ─── Insight Scoring ──────────────────────────────────────────────────────

export interface RawInsight {
  insight_type: InsightType;
  source_agent: string;
  entity_type: InsightEntityType;
  entity_id?: string;
  department?: string;
  title: string;
  narrative?: string;
  confidence: number;   // 0-1
  impact: number;       // 0-1
  urgency: number;      // 0-1
  data_strength: number; // 0-1
  evidence?: Record<string, any>;
  recommendations?: Record<string, any>;
  visualization_spec?: Record<string, any>;
}

export function scoreInsight(raw: RawInsight): number {
  return 0.3 * raw.confidence + 0.3 * raw.impact + 0.2 * raw.urgency + 0.2 * raw.data_strength;
}

export function getAlertSeverity(finalScore: number, insightType: InsightType): AlertSeverity {
  if (insightType === 'risk' && finalScore >= 0.7) return 'critical';
  if (insightType === 'risk') return 'warning';
  if (insightType === 'opportunity') return 'opportunity';
  if (finalScore >= 0.8) return 'insight';
  return 'info';
}

// ─── Persist Insights ─────────────────────────────────────────────────────

export async function persistInsights(rawInsights: RawInsight[]): Promise<number> {
  let created = 0;
  for (const raw of rawInsights) {
    const finalScore = scoreInsight(raw);
    const alertSeverity = getAlertSeverity(finalScore, raw.insight_type);

    await ReportingInsight.create({
      insight_type: raw.insight_type,
      source_agent: raw.source_agent,
      entity_type: raw.entity_type,
      entity_id: raw.entity_id,
      department: raw.department,
      title: raw.title,
      narrative: raw.narrative,
      confidence: raw.confidence,
      impact: raw.impact,
      urgency: raw.urgency,
      data_strength: raw.data_strength,
      final_score: finalScore,
      evidence: raw.evidence,
      recommendations: raw.recommendations,
      visualization_spec: raw.visualization_spec,
      status: 'new',
      alert_severity: alertSeverity,
    });
    created++;
  }
  return created;
}

// ─── Anomaly Detection ────────────────────────────────────────────────────

export async function detectAnomalies(entityType: string, lookbackDays = 30): Promise<RawInsight[]> {
  const insights: RawInsight[] = [];

  // Detect agent error rate spikes
  if (entityType === 'agent' || entityType === 'system') {
    const results = await sequelize.query<any>(`
      SELECT agent_id, COUNT(*) FILTER (WHERE result = 'failed') as fail_count,
             COUNT(*) as total_count
      FROM ai_agent_activity_logs
      WHERE created_at >= NOW() - INTERVAL '${lookbackDays} days'
      GROUP BY agent_id
      HAVING COUNT(*) >= 5
      AND COUNT(*) FILTER (WHERE result = 'failed')::float / COUNT(*) > 0.3
    `, { type: QueryTypes.SELECT });

    for (const r of results) {
      const errorRate = r.fail_count / r.total_count;
      insights.push({
        insight_type: 'anomaly',
        source_agent: 'InsightDiscoveryAgent',
        entity_type: 'agent',
        entity_id: r.agent_id,
        title: `High error rate detected (${(errorRate * 100).toFixed(0)}%)`,
        confidence: Math.min(r.total_count / 50, 1),
        impact: errorRate,
        urgency: errorRate > 0.5 ? 0.9 : 0.6,
        data_strength: Math.min(r.total_count / 100, 1),
        evidence: { fail_count: r.fail_count, total_count: r.total_count, error_rate: errorRate },
      });
    }
  }

  // Detect campaign performance drops
  if (entityType === 'campaign' || entityType === 'system') {
    const results = await sequelize.query<any>(`
      SELECT campaign_id, outcome,
             COUNT(*) as count
      FROM interaction_outcomes
      WHERE created_at >= NOW() - INTERVAL '${lookbackDays} days'
      GROUP BY campaign_id, outcome
    `, { type: QueryTypes.SELECT });

    const byCampaign: Record<string, Record<string, number>> = {};
    for (const r of results) {
      if (!byCampaign[r.campaign_id]) byCampaign[r.campaign_id] = {};
      byCampaign[r.campaign_id][r.outcome] = r.count;
    }

    for (const [campaignId, outcomes] of Object.entries(byCampaign)) {
      const sent = outcomes['sent'] || 0;
      const replied = outcomes['replied'] || 0;
      if (sent >= 20 && replied / sent < 0.02) {
        insights.push({
          insight_type: 'anomaly',
          source_agent: 'InsightDiscoveryAgent',
          entity_type: 'campaign',
          entity_id: campaignId,
          title: `Very low reply rate (${((replied / sent) * 100).toFixed(1)}%)`,
          confidence: Math.min(sent / 100, 1),
          impact: 0.7,
          urgency: 0.6,
          data_strength: Math.min(sent / 50, 1),
          evidence: { sent, replied, reply_rate: replied / sent },
          recommendations: { action: 'Review campaign messaging and send timing' },
        });
      }
    }
  }

  return insights;
}

// ─── Pattern Detection ────────────────────────────────────────────────────

export async function detectPatterns(entityType: string): Promise<RawInsight[]> {
  const insights: RawInsight[] = [];

  // Detect top-performing campaign types
  if (entityType === 'campaign' || entityType === 'system') {
    const results = await sequelize.query<any>(`
      SELECT c.campaign_type,
             COUNT(DISTINCT io.id) as interactions,
             COUNT(DISTINCT io.id) FILTER (WHERE io.outcome = 'replied') as replies,
             COUNT(DISTINCT io.id) FILTER (WHERE io.outcome = 'booked_meeting') as meetings
      FROM campaigns c
      JOIN interaction_outcomes io ON io.campaign_id = c.id
      WHERE io.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY c.campaign_type
      HAVING COUNT(DISTINCT io.id) >= 10
    `, { type: QueryTypes.SELECT });

    for (const r of results) {
      const replyRate = r.replies / r.interactions;
      if (replyRate > 0.1) {
        insights.push({
          insight_type: 'pattern',
          source_agent: 'InsightDiscoveryAgent',
          entity_type: 'campaign',
          department: 'Marketing',
          title: `${r.campaign_type} campaigns show strong ${(replyRate * 100).toFixed(0)}% reply rate`,
          confidence: Math.min(r.interactions / 100, 1),
          impact: 0.6,
          urgency: 0.3,
          data_strength: Math.min(r.interactions / 200, 1),
          evidence: { campaign_type: r.campaign_type, interactions: r.interactions, replies: r.replies, meetings: r.meetings },
        });
      }
    }
  }

  return insights;
}

// ─── Listing ──────────────────────────────────────────────────────────────

export async function listInsights(filters: {
  insight_type?: string;
  entity_type?: string;
  department?: string;
  status?: string;
  alert_severity?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: any[]; count: number }> {
  const where: any = {};
  if (filters.insight_type) where.insight_type = filters.insight_type;
  if (filters.entity_type) where.entity_type = filters.entity_type;
  if (filters.department) where.department = filters.department;
  if (filters.status) where.status = filters.status;
  if (filters.alert_severity) where.alert_severity = filters.alert_severity;

  const page = filters.page || 1;
  const limit = filters.limit || 20;

  const { rows, count } = await ReportingInsight.findAndCountAll({
    where,
    order: [['final_score', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return { rows, count };
}

export async function updateInsightStatus(insightId: string, status: string): Promise<void> {
  await ReportingInsight.update({ status: status as InsightStatus }, { where: { id: insightId } });
}
