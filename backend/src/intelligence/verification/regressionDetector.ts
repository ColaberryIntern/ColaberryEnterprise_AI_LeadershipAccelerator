/**
 * Regression Detector — compares before/after metric snapshots to detect negative changes.
 * Uses configurable thresholds. Returns a list of regressions with severity.
 */
import { RegressionThresholds, DEFAULT_THRESHOLDS } from './verificationConfig';

export interface MetricSnapshot {
  reqCoverage: number;
  readiness: number;
  qualityScore: number;
  quality: Record<string, number>;
  maturityLevel: number;
}

export interface RegressionItem {
  metric: string;
  before: number;
  after: number;
  delta: number;
  severity: 'critical' | 'warning';
  message: string;
}

export function captureSnapshot(enriched: any): MetricSnapshot {
  return {
    reqCoverage: enriched.metrics?.requirements_coverage || 0,
    readiness: enriched.metrics?.system_readiness || 0,
    qualityScore: enriched.metrics?.quality_score || 0,
    quality: enriched.quality || {},
    maturityLevel: enriched.maturity?.level || 0,
  };
}

export function detectRegressions(
  before: MetricSnapshot,
  after: MetricSnapshot,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS
): RegressionItem[] {
  const regressions: RegressionItem[] = [];

  const checks: Array<{
    metric: string;
    before: number;
    after: number;
    threshold: number;
    criticalIf?: (delta: number) => boolean;
  }> = [
    {
      metric: 'requirements_coverage',
      before: before.reqCoverage,
      after: after.reqCoverage,
      threshold: thresholds.reqCoverage_min_delta,
      criticalIf: (d) => d < -10,
    },
    {
      metric: 'system_readiness',
      before: before.readiness,
      after: after.readiness,
      threshold: thresholds.readiness_min_delta,
    },
    {
      metric: 'quality_score',
      before: before.qualityScore,
      after: after.qualityScore,
      threshold: thresholds.qualityScore_min_delta,
      criticalIf: (d) => d < -15,
    },
    {
      metric: 'maturity_level',
      before: before.maturityLevel,
      after: after.maturityLevel,
      threshold: thresholds.maturityLevel_min_delta,
      criticalIf: () => true, // maturity drop is always critical
    },
  ];

  for (const c of checks) {
    const delta = c.after - c.before;
    if (delta < c.threshold) {
      const isCritical = c.criticalIf ? c.criticalIf(delta) : false;
      regressions.push({
        metric: c.metric,
        before: c.before,
        after: c.after,
        delta,
        severity: isCritical ? 'critical' : 'warning',
        message: `${c.metric} dropped from ${c.before} to ${c.after} (delta: ${delta})`,
      });
    }
  }

  // Check individual quality dimensions for drops > 2 points
  for (const dim of Object.keys(before.quality)) {
    const bVal = before.quality[dim] || 0;
    const aVal = after.quality[dim] || 0;
    if (aVal - bVal < -2) {
      regressions.push({
        metric: `quality.${dim}`,
        before: bVal,
        after: aVal,
        delta: aVal - bVal,
        severity: 'warning',
        message: `Quality dimension "${dim}" dropped from ${bVal} to ${aVal}`,
      });
    }
  }

  return regressions;
}
