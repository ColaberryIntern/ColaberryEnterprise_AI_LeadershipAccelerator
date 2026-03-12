// ─── Trend Analyzer ─────────────────────────────────────────────────────────
// Reads snapshot history, computes trend signals and velocities.
// Deterministic — no LLM calls.

import { getSnapshotHistory } from './strategicStateStore';
import { getStrategicMetrics, StrategicMetrics } from './metricCollector';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrendSignal {
  metric: string;
  type: 'improving' | 'declining' | 'stable' | 'volatile';
  magnitude: number;
  confidence: number;
  period: string;
}

export interface TrendReport {
  signals: TrendSignal[];
  weekOverWeek: Record<string, number>;
  rollingAverages7d: Record<string, number>;
  velocities: {
    conversionVelocity: number;
    revenueSlope: number;
    enrollmentVelocity: number;
    leadQualityTrend: number;
  };
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractMetricValue(metrics: any, path: string): number {
  const parts = path.split('.');
  let val: any = metrics;
  for (const p of parts) {
    if (val == null) return 0;
    val = val[p];
  }
  return typeof val === 'number' ? val : 0;
}

function classifyTrend(change: number): TrendSignal['type'] {
  const abs = Math.abs(change);
  if (abs < 5) return 'stable';
  return change > 0 ? 'improving' : 'declining';
}

function computeConfidence(sampleCount: number, variance: number): number {
  // More data and less variance = higher confidence
  const dataPenalty = Math.min(sampleCount / 10, 1);
  const variancePenalty = Math.max(0, 1 - variance / 100);
  return Math.round(dataPenalty * variancePenalty * 100) / 100;
}

// ─── Analyzer ───────────────────────────────────────────────────────────────

const TRACKED_METRICS = [
  'revenue.totalRevenue',
  'revenue.totalEnrollments',
  'revenue.paidEnrollments',
  'funnel.totalLeads',
  'funnel.conversionRate',
  'funnel.highIntent',
  'campaign.activeCampaigns',
  'campaign.avgOpenRate',
  'campaign.avgReplyRate',
  'campaign.totalMeetings',
  'visitors.total',
  'visitors.sessions',
  'visitors.bounceRate',
  'operations.erroredAgents',
  'operations.avgErrorRate',
  'operations.errors24h',
  'opportunities.pipelineValue',
  'opportunities.projectedRevenue',
  'opportunities.stalledCount',
];

export async function analyzeStrategicTrends(): Promise<TrendReport> {
  const snapshots = await getSnapshotHistory(14); // 14 days of data
  const current = await getStrategicMetrics();

  const signals: TrendSignal[] = [];
  const weekOverWeek: Record<string, number> = {};
  const rollingAverages7d: Record<string, number> = {};

  // Split snapshots into recent 7d and prior 7d
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  const recentSnapshots = snapshots.filter((s: any) => new Date(s.created_at).getTime() > sevenDaysAgo);
  const priorSnapshots = snapshots.filter((s: any) => {
    const t = new Date(s.created_at).getTime();
    return t > fourteenDaysAgo && t <= sevenDaysAgo;
  });

  for (const metricPath of TRACKED_METRICS) {
    const currentVal = extractMetricValue(current, metricPath);

    // Compute 7-day rolling average from recent snapshots
    const recentValues = recentSnapshots.map((s: any) => extractMetricValue(s.metrics, metricPath)).filter((v) => v !== 0);
    const priorValues = priorSnapshots.map((s: any) => extractMetricValue(s.metrics, metricPath)).filter((v) => v !== 0);

    const recentAvg = recentValues.length > 0 ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length : currentVal;
    const priorAvg = priorValues.length > 0 ? priorValues.reduce((a, b) => a + b, 0) / priorValues.length : recentAvg;

    rollingAverages7d[metricPath] = Math.round(recentAvg * 100) / 100;

    // Week-over-week change %
    const wow = priorAvg !== 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;
    weekOverWeek[metricPath] = Math.round(wow * 100) / 100;

    // Compute variance for confidence scoring
    const allValues = [...recentValues, ...priorValues];
    const mean = allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;
    const variance = allValues.length > 0
      ? allValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / allValues.length
      : 0;
    const normalizedVariance = mean !== 0 ? (Math.sqrt(variance) / Math.abs(mean)) * 100 : 0;

    // Determine if volatile (high coefficient of variation)
    const isVolatile = normalizedVariance > 30;
    const trendType = isVolatile ? 'volatile' as const : classifyTrend(wow);

    signals.push({
      metric: metricPath,
      type: trendType,
      magnitude: Math.round(wow * 100) / 100,
      confidence: computeConfidence(allValues.length, normalizedVariance),
      period: '7d',
    });
  }

  // Compute velocities
  const recentEnrollAvg = rollingAverages7d['revenue.totalEnrollments'] || 0;
  const priorEnrollAvg = priorSnapshots.length > 0
    ? priorSnapshots.reduce((sum: number, s: any) => sum + extractMetricValue(s.metrics, 'revenue.totalEnrollments'), 0) / priorSnapshots.length
    : recentEnrollAvg;

  const recentRevenueAvg = rollingAverages7d['revenue.totalRevenue'] || 0;
  const priorRevenueAvg = priorSnapshots.length > 0
    ? priorSnapshots.reduce((sum: number, s: any) => sum + extractMetricValue(s.metrics, 'revenue.totalRevenue'), 0) / priorSnapshots.length
    : recentRevenueAvg;

  return {
    signals,
    weekOverWeek,
    rollingAverages7d,
    velocities: {
      conversionVelocity: weekOverWeek['funnel.conversionRate'] || 0,
      revenueSlope: Math.round((recentRevenueAvg - priorRevenueAvg) * 100) / 100,
      enrollmentVelocity: Math.round((recentEnrollAvg - priorEnrollAvg) * 100) / 100,
      leadQualityTrend: weekOverWeek['funnel.highIntent'] || 0,
    },
    generatedAt: new Date().toISOString(),
  };
}
