// ─── Anomaly Detection Engine ────────────────────────────────────────────────
// Configurable anomaly detection using snapshot history.
// Thresholds read from ExecutiveNotificationPolicy.severity_rules.
// Anomalies auto-emit via emitExecutiveEvent().

import { getSnapshotHistory } from './strategicStateStore';
import { getStrategicMetrics, StrategicMetrics } from './metricCollector';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Anomaly {
  metric: string;
  current: number;
  baseline: number;
  deviation: number;
  severity: 'info' | 'important' | 'high' | 'critical';
  direction: 'above' | 'below';
}

export interface AnomalyReport {
  anomalies: Anomaly[];
  scanTimestamp: string;
}

// ─── Default Thresholds ─────────────────────────────────────────────────────

interface AnomalyThresholds {
  info: number;
  important: number;
  high: number;
  critical: number;
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  info: 20,
  important: 40,
  high: 60,
  critical: 80,
};

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

function classifySeverity(deviationPct: number, thresholds: AnomalyThresholds): Anomaly['severity'] | null {
  const abs = Math.abs(deviationPct);
  if (abs >= thresholds.critical) return 'critical';
  if (abs >= thresholds.high) return 'high';
  if (abs >= thresholds.important) return 'important';
  if (abs >= thresholds.info) return 'info';
  return null; // Below threshold — not an anomaly
}

async function loadThresholds(): Promise<AnomalyThresholds> {
  try {
    const ExecutiveNotificationPolicy = (await import('../../models/ExecutiveNotificationPolicy')).default;
    const policy = await ExecutiveNotificationPolicy.findOne({ where: { scope: 'global' } });
    if (policy?.severity_rules?.anomaly_thresholds) {
      return { ...DEFAULT_THRESHOLDS, ...policy.severity_rules.anomaly_thresholds };
    }
  } catch { /* use defaults */ }
  return DEFAULT_THRESHOLDS;
}

// ─── Tracked Metrics ────────────────────────────────────────────────────────

const ANOMALY_METRICS = [
  { path: 'revenue.totalRevenue', label: 'Total Revenue', invertDrop: true },
  { path: 'revenue.totalEnrollments', label: 'Enrollments', invertDrop: true },
  { path: 'funnel.totalLeads', label: 'Total Leads', invertDrop: false },
  { path: 'funnel.conversionRate', label: 'Conversion Rate', invertDrop: true },
  { path: 'funnel.highIntent', label: 'High Intent Leads', invertDrop: true },
  { path: 'campaign.avgOpenRate', label: 'Campaign Open Rate', invertDrop: true },
  { path: 'campaign.avgReplyRate', label: 'Campaign Reply Rate', invertDrop: true },
  { path: 'visitors.total', label: 'Total Visitors', invertDrop: false },
  { path: 'visitors.bounceRate', label: 'Bounce Rate', invertDrop: false },
  { path: 'operations.erroredAgents', label: 'Errored Agents', invertDrop: false },
  { path: 'operations.avgErrorRate', label: 'Avg Error Rate', invertDrop: false },
  { path: 'operations.errors24h', label: 'Errors (24h)', invertDrop: false },
  { path: 'opportunities.pipelineValue', label: 'Pipeline Value', invertDrop: true },
  { path: 'opportunities.stalledCount', label: 'Stalled Opportunities', invertDrop: false },
];

// ─── Detector ───────────────────────────────────────────────────────────────

export async function detectAnomalies(): Promise<AnomalyReport> {
  const thresholds = await loadThresholds();
  const snapshots = await getSnapshotHistory(7);
  const current = await getStrategicMetrics();
  const anomalies: Anomaly[] = [];

  for (const metric of ANOMALY_METRICS) {
    const currentVal = extractMetricValue(current, metric.path);

    // Compute 7-day baseline from snapshots
    const historicalValues = snapshots
      .map((s: any) => extractMetricValue(s.metrics, metric.path))
      .filter((v) => v !== 0);

    if (historicalValues.length < 2) continue; // Not enough data

    const baseline = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    if (baseline === 0) continue;

    const deviationPct = ((currentVal - baseline) / baseline) * 100;
    const severity = classifySeverity(deviationPct, thresholds);

    if (!severity) continue;

    anomalies.push({
      metric: metric.path,
      current: Math.round(currentVal * 100) / 100,
      baseline: Math.round(baseline * 100) / 100,
      deviation: Math.round(deviationPct * 100) / 100,
      severity,
      direction: deviationPct > 0 ? 'above' : 'below',
    });
  }

  return {
    anomalies,
    scanTimestamp: new Date().toISOString(),
  };
}

// ─── Emit Anomalies to Executive Awareness ──────────────────────────────────

export async function detectAndEmitAnomalies(): Promise<AnomalyReport> {
  const report = await detectAnomalies();

  if (report.anomalies.length === 0) return report;

  // Only emit high and critical anomalies
  const emittable = report.anomalies.filter((a) => a.severity === 'high' || a.severity === 'critical');

  if (emittable.length > 0) {
    try {
      const { emitExecutiveEvent } = await import('../executiveAwarenessService');
      for (const anomaly of emittable) {
        await emitExecutiveEvent({
          category: 'system',
          severity: anomaly.severity,
          title: `Anomaly: ${anomaly.metric} ${anomaly.direction} baseline by ${Math.abs(anomaly.deviation).toFixed(0)}%`,
          description: `Current: ${anomaly.current}, Baseline (7d avg): ${anomaly.baseline}. Deviation: ${anomaly.deviation > 0 ? '+' : ''}${anomaly.deviation.toFixed(1)}%.`,
          clusterKey: `anomaly:${anomaly.metric}`,
          impactArea: anomaly.metric.split('.')[0],
          metadata: { anomaly },
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error('[AnomalyDetection] Failed to emit anomaly events:', err.message);
    }
  }

  return report;
}
