/**
 * uxRegressionDetector — compares two vision reports and surfaces
 * regressions on the dimensions that matter (CTA, hierarchy, density,
 * accessibility).
 *
 * Pure: takes a previous + current report, returns regression findings.
 *
 * Phase 6 §15.
 */
import type { VisionAnalysisReport } from './visionAnalysisEngine';

export interface RegressionFinding {
  readonly dimension: 'cta_score' | 'hierarchy_score' | 'density_health' | 'cognition_score' | 'accessibility';
  readonly previous: number;
  readonly current: number;
  readonly delta: number;
  readonly severity: 'low' | 'medium' | 'high';
  readonly description: string;
}

export interface RegressionReport {
  readonly findings: ReadonlyArray<RegressionFinding>;
  readonly is_regression: boolean;
}

export function detectUXRegression(prev: VisionAnalysisReport, curr: VisionAnalysisReport): RegressionReport {
  const findings: RegressionFinding[] = [];
  const compareScore = (
    dimension: RegressionFinding['dimension'],
    prevVal: number,
    currVal: number,
  ) => {
    const delta = currVal - prevVal;
    if (delta >= -3) return;          // tolerance
    let severity: RegressionFinding['severity'] = 'low';
    if (delta <= -20) severity = 'high';
    else if (delta <= -10) severity = 'medium';
    findings.push({
      dimension,
      previous: prevVal,
      current: currVal,
      delta,
      severity,
      description: `${dimension} dropped from ${prevVal} to ${currVal} (${delta}).`,
    });
  };

  compareScore('cta_score', prev.cta.cta_score, curr.cta.cta_score);
  compareScore('hierarchy_score', prev.hierarchy.hierarchy_score, curr.hierarchy.hierarchy_score);
  compareScore('density_health', prev.density.density_health, curr.density.density_health);
  compareScore('cognition_score', prev.cognition_score, curr.cognition_score);

  // Accessibility: count missing aria labels and competing primaries.
  const prevA11y = (prev.dom_semantic.missing_aria_labels?.length ?? 0) + prev.hierarchy.competing_primaries;
  const currA11y = (curr.dom_semantic.missing_aria_labels?.length ?? 0) + curr.hierarchy.competing_primaries;
  if (currA11y > prevA11y) {
    const delta = -(currA11y - prevA11y);
    findings.push({
      dimension: 'accessibility',
      previous: prevA11y,
      current: currA11y,
      delta,
      severity: currA11y - prevA11y >= 3 ? 'high' : 'medium',
      description: `Accessibility issues went from ${prevA11y} to ${currA11y} (+${currA11y - prevA11y}).`,
    });
  }

  return {
    findings,
    is_regression: findings.length > 0,
  };
}
