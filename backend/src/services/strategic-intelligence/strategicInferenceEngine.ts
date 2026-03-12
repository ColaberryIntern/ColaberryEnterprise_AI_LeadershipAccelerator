// ─── Strategic Inference Engine ──────────────────────────────────────────────
// Rule-based + confidence-weighted hypothesis generation.
// Deterministic inference from metric signals — no LLM calls.

import { TrendReport } from './trendAnalyzer';
import { AnomalyReport } from './anomalyDetectionEngine';
import { StrategicMetrics } from './metricCollector';
import { v4 as uuid } from 'uuid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StrategicInference {
  id: string;
  hypothesis: string;
  domain: string;
  confidence: number;
  supportingSignals: string[];
  suggestedAction: string;
}

// ─── Inference Rules ────────────────────────────────────────────────────────

type InferenceRule = {
  domain: string;
  check: (m: StrategicMetrics, t: TrendReport, a: AnomalyReport) => boolean;
  hypothesis: string;
  action: string;
  confidence: (m: StrategicMetrics, t: TrendReport) => number;
  signals: (m: StrategicMetrics, t: TrendReport) => string[];
};

const RULES: InferenceRule[] = [
  // Visitor up + enrollment flat → traffic quality or conversion friction
  {
    domain: 'funnel',
    check: (m, t) =>
      (t.weekOverWeek['visitors.total'] || 0) > 10 &&
      Math.abs(t.weekOverWeek['revenue.totalEnrollments'] || 0) < 5,
    hypothesis: 'Visitor traffic is growing but enrollments are flat — possible conversion friction or traffic quality issue.',
    action: 'Audit landing page conversion paths and traffic source quality.',
    confidence: (_m, t) => Math.min(0.85, 0.5 + Math.abs(t.weekOverWeek['visitors.total'] || 0) / 100),
    signals: (_m, t) => [
      `Visitors WoW: +${(t.weekOverWeek['visitors.total'] || 0).toFixed(1)}%`,
      `Enrollments WoW: ${(t.weekOverWeek['revenue.totalEnrollments'] || 0).toFixed(1)}%`,
    ],
  },

  // Leads up + strategy calls flat → scheduling bottleneck
  {
    domain: 'funnel',
    check: (m, t) =>
      (t.weekOverWeek['funnel.totalLeads'] || 0) > 10 &&
      (t.weekOverWeek['campaign.totalMeetings'] || 0) < 5,
    hypothesis: 'Lead volume is rising but meeting bookings are not keeping pace — potential scheduling bottleneck.',
    action: 'Review calendar availability and booking flow friction.',
    confidence: () => 0.7,
    signals: (_m, t) => [
      `Leads WoW: +${(t.weekOverWeek['funnel.totalLeads'] || 0).toFixed(1)}%`,
      `Meetings WoW: ${(t.weekOverWeek['campaign.totalMeetings'] || 0).toFixed(1)}%`,
    ],
  },

  // Campaign open rate declining → deliverability issue
  {
    domain: 'campaign',
    check: (_m, t) =>
      (t.weekOverWeek['campaign.avgOpenRate'] || 0) < -15,
    hypothesis: 'Campaign open rates are declining significantly — possible deliverability issue or audience fatigue.',
    action: 'Check email deliverability metrics, domain reputation, and list hygiene.',
    confidence: (_m, t) => Math.min(0.8, 0.5 + Math.abs(t.weekOverWeek['campaign.avgOpenRate'] || 0) / 100),
    signals: (_m, t) => [
      `Open rate WoW: ${(t.weekOverWeek['campaign.avgOpenRate'] || 0).toFixed(1)}%`,
    ],
  },

  // Error rate increasing → infrastructure degradation
  {
    domain: 'operations',
    check: (m) => m.operations.avgErrorRate > 0.15 || m.operations.errors24h > 20,
    hypothesis: 'Agent error rates are elevated — potential infrastructure degradation.',
    action: 'Investigate error logs, check resource utilization and failing agent configurations.',
    confidence: (m) => Math.min(0.9, 0.5 + m.operations.avgErrorRate * 2),
    signals: (m) => [
      `Avg error rate: ${(m.operations.avgErrorRate * 100).toFixed(1)}%`,
      `Errors 24h: ${m.operations.errors24h}`,
      `Errored agents: ${m.operations.erroredAgents}`,
    ],
  },

  // Revenue declining
  {
    domain: 'revenue',
    check: (_m, t) => (t.weekOverWeek['revenue.totalRevenue'] || 0) < -10,
    hypothesis: 'Revenue is trending downward — requires attention.',
    action: 'Review enrollment pipeline, pricing strategy, and payment collection.',
    confidence: (_m, t) => Math.min(0.85, 0.5 + Math.abs(t.weekOverWeek['revenue.totalRevenue'] || 0) / 100),
    signals: (_m, t) => [
      `Revenue WoW: ${(t.weekOverWeek['revenue.totalRevenue'] || 0).toFixed(1)}%`,
    ],
  },

  // Conversion rate declining
  {
    domain: 'funnel',
    check: (_m, t) => (t.weekOverWeek['funnel.conversionRate'] || 0) < -15,
    hypothesis: 'Lead-to-enrollment conversion rate is dropping — messaging or qualification issue.',
    action: 'Review lead scoring accuracy, follow-up sequences, and sales process.',
    confidence: () => 0.75,
    signals: (_m, t) => [
      `Conversion rate WoW: ${(t.weekOverWeek['funnel.conversionRate'] || 0).toFixed(1)}%`,
    ],
  },

  // High stalled opportunities
  {
    domain: 'revenue',
    check: (m) => m.opportunities.stalledCount > 5,
    hypothesis: 'Multiple opportunities are stalling in the pipeline — risk of revenue leakage.',
    action: 'Trigger re-engagement sequences for stalled opportunities. Review stage progression blockers.',
    confidence: (m) => Math.min(0.8, 0.5 + m.opportunities.stalledCount / 20),
    signals: (m) => [
      `Stalled count: ${m.opportunities.stalledCount}`,
      `Pipeline value: $${m.opportunities.pipelineValue.toLocaleString()}`,
    ],
  },

  // Bounce rate spiking
  {
    domain: 'campaign',
    check: (m) => m.visitors.bounceRate > 70,
    hypothesis: 'Website bounce rate is above 70% — landing page effectiveness may be compromised.',
    action: 'Audit landing page load times, messaging alignment, and mobile experience.',
    confidence: (m) => Math.min(0.75, 0.4 + (m.visitors.bounceRate - 50) / 100),
    signals: (m) => [
      `Bounce rate: ${m.visitors.bounceRate.toFixed(1)}%`,
    ],
  },

  // Campaign budget burn without proportional conversions
  {
    domain: 'campaign',
    check: (m) =>
      m.campaign.totalBudgetAllocated > 0 &&
      (m.campaign.totalBudgetSpent / m.campaign.totalBudgetAllocated) > 0.8 &&
      m.campaign.totalConversions < 5,
    hypothesis: 'Campaign spend is near budget cap but conversions are not scaling — potential inefficiency.',
    action: 'Review campaign targeting, creative performance, and conversion paths. Consider reallocating budget to higher-performing channels.',
    confidence: (m) => Math.min(0.8, 0.5 + (m.campaign.totalBudgetSpent / m.campaign.totalBudgetAllocated) * 0.3),
    signals: (m) => [
      `Budget utilization: ${((m.campaign.totalBudgetSpent / m.campaign.totalBudgetAllocated) * 100).toFixed(0)}%`,
      `Total conversions: ${m.campaign.totalConversions}`,
      `Budget spent: $${m.campaign.totalBudgetSpent.toLocaleString()}`,
    ],
  },

  // Channel dependency risk
  {
    domain: 'campaign',
    check: (m) => m.campaign.liveCampaigns > 2 && m.campaign.activeCampaigns > 0,
    hypothesis: 'Multiple live campaigns detected — verify channel diversification to reduce single-channel dependency.',
    action: 'Review channel distribution across live campaigns. Ensure no single channel accounts for >70% of active campaigns.',
    confidence: () => 0.6,
    signals: (m) => [
      `Live campaigns: ${m.campaign.liveCampaigns}`,
      `Registered campaigns: ${m.campaign.registeredCampaigns}`,
    ],
  },
];

// ─── Generate Inferences ────────────────────────────────────────────────────

export async function generateInferences(
  trends: TrendReport,
  anomalies: AnomalyReport,
  metrics: StrategicMetrics,
): Promise<StrategicInference[]> {
  const inferences: StrategicInference[] = [];

  for (const rule of RULES) {
    try {
      if (rule.check(metrics, trends, anomalies)) {
        inferences.push({
          id: uuid(),
          hypothesis: rule.hypothesis,
          domain: rule.domain,
          confidence: rule.confidence(metrics, trends),
          supportingSignals: rule.signals(metrics, trends),
          suggestedAction: rule.action,
        });
      }
    } catch {
      // Rule evaluation failed — skip
    }
  }

  // Sort by confidence descending
  inferences.sort((a, b) => b.confidence - a.confidence);

  return inferences;
}
