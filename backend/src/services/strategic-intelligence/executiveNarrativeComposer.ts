// ─── Executive Narrative Composer ────────────────────────────────────────────
// Executive-grade report generation. Concise, structured, decision-ready.
// Morning = forward-looking. Evening = retrospective.

import { StrategicMetrics } from './metricCollector';
import { TrendReport } from './trendAnalyzer';
import { AnomalyReport } from './anomalyDetectionEngine';
import { StrategicRecommendation } from './recommendationEngine';
import { RiskAssessment } from './riskAssessmentEngine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutiveNarrative {
  period: 'morning' | 'evening';
  sections: {
    revenueHealth: string;
    funnelPerformance: string;
    campaignEfficiency: string;
    operationalStability: string;
    governanceActivity: string;
    strategicRisks: string;
    recommendations: string;
  };
  stabilityScore: number;
  topActions: string[];
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function trendArrow(change: number): string {
  if (change > 5) return '+';
  if (change < -5) return '-';
  return '~';
}

function fmt(val: number): string {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

// ─── Composer ───────────────────────────────────────────────────────────────

export async function composeExecutiveNarrative(
  period: 'morning' | 'evening',
  metrics: StrategicMetrics,
  trends: TrendReport,
  anomalies: AnomalyReport,
  recommendations: StrategicRecommendation[],
  risk: RiskAssessment,
): Promise<ExecutiveNarrative> {
  const prefix = period === 'morning' ? 'Today\'s outlook' : 'Today\'s summary';
  const wow = trends.weekOverWeek;

  // Revenue Health
  const revenueHealth = [
    `${prefix}: Revenue at ${fmt(metrics.revenue.totalRevenue)} (${trendArrow(wow['revenue.totalRevenue'] || 0)} ${(wow['revenue.totalRevenue'] || 0).toFixed(1)}% WoW)`,
    `Enrollments: ${metrics.revenue.totalEnrollments} total, ${metrics.revenue.paidEnrollments} paid`,
    `Pending invoice: ${fmt(metrics.revenue.pendingInvoice)}`,
    `Seats remaining: ${metrics.revenue.seatsRemaining} across ${metrics.revenue.upcomingCohorts} upcoming cohort(s)`,
    metrics.opportunities.projectedRevenue > 0 ? `Projected revenue (pipeline): ${fmt(metrics.opportunities.projectedRevenue)}` : '',
  ].filter(Boolean).join('\n');

  // Funnel Performance
  const funnelPerformance = [
    `Leads: ${metrics.funnel.totalLeads} total (${metrics.funnel.thisMonth} this month)`,
    `Conversion rate: ${metrics.funnel.conversionRate}% (${trendArrow(wow['funnel.conversionRate'] || 0)} ${(wow['funnel.conversionRate'] || 0).toFixed(1)}% WoW)`,
    `High intent leads: ${metrics.funnel.highIntent}`,
    `Pipeline value: ${fmt(metrics.opportunities.pipelineValue)}, stalled: ${metrics.opportunities.stalledCount}`,
  ].join('\n');

  // Campaign Efficiency
  const campaignEfficiency = [
    `Active campaigns: ${metrics.campaign.activeCampaigns}`,
    `Open rate: ${metrics.campaign.avgOpenRate.toFixed(1)}% (${trendArrow(wow['campaign.avgOpenRate'] || 0)} WoW)`,
    `Reply rate: ${metrics.campaign.avgReplyRate.toFixed(1)}%`,
    `Meetings booked: ${metrics.campaign.totalMeetings}, Conversions: ${metrics.campaign.totalConversions}`,
  ].join('\n');

  // Operational Stability
  const operationalStability = [
    `Agent fleet: ${metrics.operations.totalAgents} total, ${metrics.operations.healthyAgents} healthy, ${metrics.operations.erroredAgents} errored`,
    `Error rate: ${(metrics.operations.avgErrorRate * 100).toFixed(1)}%, Errors 24h: ${metrics.operations.errors24h}`,
    `Visitors today: ${metrics.visitors.today}, Sessions: ${metrics.visitors.sessions}, Bounce: ${metrics.visitors.bounceRate.toFixed(1)}%`,
  ].join('\n');

  // Governance Activity
  const governanceActivity = [
    `Autonomy mode: ${metrics.governance.autonomyMode}`,
    `System status: ${metrics.governance.systemStatus}`,
    `Active agents: ${metrics.governance.activeAgents}`,
  ].join('\n');

  // Strategic Risks
  const strategicRisks = risk.topRisks.length > 0
    ? risk.topRisks.map((r) => `- ${r}`).join('\n')
    : 'No elevated risks detected.';

  // Recommendations
  const topRecs = recommendations.slice(0, 5);
  const recommendationsText = topRecs.length > 0
    ? topRecs.map((r) => `[${r.priority.toUpperCase()}] ${r.summary}\n  Action: ${r.recommendation}`).join('\n\n')
    : 'No actionable recommendations at this time.';

  // Top actions (for executive summary line)
  const topActions = topRecs.slice(0, 3).map((r) => r.recommendation);

  // Anomaly annotations
  const anomalyCount = anomalies.anomalies.length;
  if (anomalyCount > 0) {
    const criticalAnomalies = anomalies.anomalies.filter((a) => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      topActions.unshift(`CRITICAL: ${criticalAnomalies.length} anomaly alert(s) require attention`);
    }
  }

  return {
    period,
    sections: {
      revenueHealth,
      funnelPerformance,
      campaignEfficiency,
      operationalStability,
      governanceActivity,
      strategicRisks,
      recommendations: recommendationsText,
    },
    stabilityScore: risk.stabilityScore,
    topActions,
    generatedAt: new Date().toISOString(),
  };
}
