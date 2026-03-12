// ─── Risk Assessment Engine ──────────────────────────────────────────────────
// Composite Strategic Stability Score (0–100).
// Deterministic computation from metrics, trends, and anomalies.

import { StrategicMetrics } from './metricCollector';
import { TrendReport } from './trendAnalyzer';
import { AnomalyReport } from './anomalyDetectionEngine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RiskAssessment {
  stabilityScore: number;
  components: {
    autonomyExposure: number;
    financialRisk: number;
    conversionFragility: number;
    campaignDependency: number;
    operationalOverload: number;
    governanceInstability: number;
  };
  riskLevel: 'stable' | 'watch' | 'elevated' | 'critical';
  topRisks: string[];
}

// ─── Component Calculators ──────────────────────────────────────────────────

function computeAutonomyExposure(metrics: StrategicMetrics): number {
  // Higher when more agents are auto-executing
  const totalAgents = metrics.operations.totalAgents || 1;
  const activeRatio = metrics.governance.activeAgents / totalAgents;
  // Mode penalty
  const modePenalty = metrics.governance.autonomyMode === 'full' ? 20 : metrics.governance.autonomyMode === 'safe' ? 10 : 0;
  return Math.min(100, Math.round(activeRatio * 60 + modePenalty));
}

function computeFinancialRisk(metrics: StrategicMetrics, trends: TrendReport): number {
  let risk = 0;
  const revenueWow = trends.weekOverWeek['revenue.totalRevenue'] || 0;
  if (revenueWow < -5) risk += Math.min(40, Math.abs(revenueWow));
  if (metrics.revenue.pendingInvoice > metrics.revenue.totalRevenue * 0.3) risk += 20;
  if (metrics.opportunities.stalledCount > 3) risk += Math.min(25, metrics.opportunities.stalledCount * 5);
  return Math.min(100, Math.round(risk));
}

function computeConversionFragility(metrics: StrategicMetrics, trends: TrendReport): number {
  let risk = 0;
  const convWow = trends.weekOverWeek['funnel.conversionRate'] || 0;
  if (convWow < -10) risk += Math.min(40, Math.abs(convWow));
  if (metrics.funnel.conversionRate < 3) risk += 30;
  if ((trends.weekOverWeek['funnel.highIntent'] || 0) < -20) risk += 20;
  return Math.min(100, Math.round(risk));
}

function computeCampaignDependency(metrics: StrategicMetrics, trends: TrendReport): number {
  let risk = 0;
  const openRateWow = trends.weekOverWeek['campaign.avgOpenRate'] || 0;
  if (openRateWow < -10) risk += Math.min(30, Math.abs(openRateWow));
  if (metrics.campaign.avgOpenRate < 15) risk += 25;
  if (metrics.campaign.activeCampaigns < 2) risk += 20;
  if (metrics.campaign.avgReplyRate < 1) risk += 15;
  return Math.min(100, Math.round(risk));
}

function computeOperationalOverload(metrics: StrategicMetrics, anomalies: AnomalyReport): number {
  let risk = 0;
  const errorRatio = metrics.operations.totalAgents > 0
    ? metrics.operations.erroredAgents / metrics.operations.totalAgents
    : 0;
  risk += errorRatio * 60;
  if (metrics.operations.errors24h > 10) risk += Math.min(25, metrics.operations.errors24h);
  if (metrics.operations.avgErrorRate > 0.1) risk += 20;
  // Anomaly count contributes
  risk += Math.min(20, anomalies.anomalies.length * 5);
  return Math.min(100, Math.round(risk));
}

function computeGovernanceInstability(metrics: StrategicMetrics): number {
  let risk = 0;
  if (metrics.governance.systemStatus === 'degraded') risk += 30;
  if (metrics.governance.systemStatus === 'critical') risk += 60;
  // Full autonomy mode adds some risk
  if (metrics.governance.autonomyMode === 'full') risk += 10;
  return Math.min(100, Math.round(risk));
}

// ─── Risk Level Classification ──────────────────────────────────────────────

function classifyRiskLevel(score: number): RiskAssessment['riskLevel'] {
  if (score >= 80) return 'stable';
  if (score >= 60) return 'watch';
  if (score >= 40) return 'elevated';
  return 'critical';
}

// ─── Assess ─────────────────────────────────────────────────────────────────

export async function assessStrategicRisk(
  metrics: StrategicMetrics,
  trends: TrendReport,
  anomalies: AnomalyReport,
): Promise<RiskAssessment> {
  const components = {
    autonomyExposure: computeAutonomyExposure(metrics),
    financialRisk: computeFinancialRisk(metrics, trends),
    conversionFragility: computeConversionFragility(metrics, trends),
    campaignDependency: computeCampaignDependency(metrics, trends),
    operationalOverload: computeOperationalOverload(metrics, anomalies),
    governanceInstability: computeGovernanceInstability(metrics),
  };

  // Equal weight across 6 components. Stability = 100 - weightedAvg
  const values = Object.values(components);
  const avgRisk = values.reduce((a, b) => a + b, 0) / values.length;
  const stabilityScore = Math.round(Math.max(0, Math.min(100, 100 - avgRisk)));

  // Top risks: components above 30, sorted desc
  const topRisks: string[] = [];
  const labels: Record<string, string> = {
    autonomyExposure: 'High autonomy exposure — many agents auto-executing',
    financialRisk: 'Financial risk — revenue decline or pending invoices',
    conversionFragility: 'Conversion fragility — dropping conversion rate',
    campaignDependency: 'Campaign dependency — degrading campaign metrics',
    operationalOverload: 'Operational overload — elevated error rates',
    governanceInstability: 'Governance instability — system health concerns',
  };

  for (const [key, val] of Object.entries(components)) {
    if (val > 30) {
      topRisks.push(labels[key] || key);
    }
  }
  topRisks.sort(); // alphabetical for consistency

  return {
    stabilityScore,
    components,
    riskLevel: classifyRiskLevel(stabilityScore),
    topRisks,
  };
}
