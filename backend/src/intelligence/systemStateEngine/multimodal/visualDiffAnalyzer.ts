/**
 * visualDiffAnalyzer — compares two snapshots of the same route and reports
 * structural visual diffs:
 *
 *   - hierarchy shifts
 *   - CTA movement (above-fold ↔ below-fold)
 *   - density change
 *   - regressions vs improvements
 *   - accessibility delta
 *
 * Pure: takes two `VisionAnalysisReport` objects + (optional) two
 * `MultimodalVisionAnalysis` objects, returns a structured diff.
 *
 * Phase 7 §4.
 */
import type { VisionAnalysisReport } from '../vision/visionAnalysisEngine';
import type { MultimodalVisionAnalysis } from './visionResponseNormalizer';

export interface VisualDiffEntry {
  readonly dimension: string;
  readonly previous: number | string;
  readonly current: number | string;
  readonly delta: number;
  readonly direction: 'improved' | 'regressed' | 'shifted';
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface VisualDiffReport {
  readonly entries: ReadonlyArray<VisualDiffEntry>;
  readonly net_score_delta: number;
  readonly is_regression: boolean;
  readonly is_improvement: boolean;
  readonly summary: string;
}

const NUMERIC_DIMENSIONS: ReadonlyArray<{ key: string; get: (r: VisionAnalysisReport) => number; min_delta: number }> = [
  { key: 'cognition_score', get: r => r.cognition_score, min_delta: 4 },
  { key: 'hierarchy_score', get: r => r.hierarchy.hierarchy_score, min_delta: 5 },
  { key: 'cta_score', get: r => r.cta.cta_score, min_delta: 5 },
  { key: 'density_health', get: r => r.density.density_health, min_delta: 6 },
];

export function analyzeVisualDiff(
  prev: VisionAnalysisReport,
  curr: VisionAnalysisReport,
  prevLLM?: MultimodalVisionAnalysis | null,
  currLLM?: MultimodalVisionAnalysis | null,
): VisualDiffReport {
  const entries: VisualDiffEntry[] = [];

  // Heuristic numeric dimensions
  for (const dim of NUMERIC_DIMENSIONS) {
    const a = dim.get(prev);
    const b = dim.get(curr);
    const delta = b - a;
    if (Math.abs(delta) < dim.min_delta) continue;
    entries.push({
      dimension: dim.key,
      previous: a,
      current: b,
      delta,
      direction: delta > 0 ? 'improved' : 'regressed',
      description: `${dim.key} went from ${a} to ${b} (${delta > 0 ? '+' : ''}${delta}).`,
      severity: severityFromDelta(Math.abs(delta)),
    });
  }

  // CTA position shift
  if (prev.cta.primary_position !== curr.cta.primary_position && prev.cta.primary_position !== 'unknown' && curr.cta.primary_position !== 'unknown') {
    entries.push({
      dimension: 'cta_position',
      previous: prev.cta.primary_position,
      current: curr.cta.primary_position,
      delta: curr.cta.primary_position === 'above_fold' ? 1 : -1,
      direction: curr.cta.primary_position === 'above_fold' ? 'improved' : 'regressed',
      description: `Primary CTA moved from ${prev.cta.primary_position} to ${curr.cta.primary_position}.`,
      severity: curr.cta.primary_position === 'below_fold' ? 'high' : 'medium',
    });
  }

  // Density category shift
  if (prev.density.category !== curr.density.category) {
    const prevRank = densityRank(prev.density.category);
    const currRank = densityRank(curr.density.category);
    entries.push({
      dimension: 'density_category',
      previous: prev.density.category,
      current: curr.density.category,
      delta: prevRank - currRank,    // positive = moved toward overloaded
      direction: currRank > prevRank ? 'regressed' : 'improved',
      description: `Density category shifted from ${prev.density.category} to ${curr.density.category}.`,
      severity: curr.density.category === 'overloaded' ? 'high' : 'medium',
    });
  }

  // Accessibility (count of missing aria + competing primaries)
  const prevA11y = (prev.dom_semantic.missing_aria_labels?.length ?? 0) + prev.hierarchy.competing_primaries;
  const currA11y = (curr.dom_semantic.missing_aria_labels?.length ?? 0) + curr.hierarchy.competing_primaries;
  if (currA11y !== prevA11y) {
    const delta = prevA11y - currA11y;     // positive = improvement (fewer issues)
    entries.push({
      dimension: 'accessibility_issues',
      previous: prevA11y,
      current: currA11y,
      delta,
      direction: delta > 0 ? 'improved' : 'regressed',
      description: `Accessibility issues went from ${prevA11y} to ${currA11y} (${delta > 0 ? -delta : -delta}).`,
      severity: severityFromDelta(Math.abs(delta) * 5),
    });
  }

  // LLM dimensions (when both LLM reports exist)
  if (prevLLM && currLLM) {
    const llmDims: Array<[string, keyof MultimodalVisionAnalysis]> = [
      ['llm_cognition', 'cognition_score'],
      ['llm_hierarchy', 'visual_hierarchy_score'],
      ['llm_cta', 'cta_prominence_score'],
      ['llm_aesthetic', 'aesthetic_harmony_score'],
      ['llm_workflow', 'workflow_intuitiveness_score'],
      ['llm_accessibility', 'accessibility_score'],
    ];
    for (const [key, prop] of llmDims) {
      const a = prevLLM[prop] as number;
      const b = currLLM[prop] as number;
      const delta = b - a;
      if (Math.abs(delta) < 5) continue;
      entries.push({
        dimension: key,
        previous: a,
        current: b,
        delta,
        direction: delta > 0 ? 'improved' : 'regressed',
        description: `LLM ${key} went from ${a} to ${b} (${delta > 0 ? '+' : ''}${delta}).`,
        severity: severityFromDelta(Math.abs(delta)),
      });
    }
  }

  const net = entries.reduce((s, e) => s + (typeof e.delta === 'number' ? e.delta : 0), 0);
  const regressions = entries.filter(e => e.direction === 'regressed');
  const improvements = entries.filter(e => e.direction === 'improved');
  const summary = entries.length === 0
    ? 'No meaningful diff detected between snapshots.'
    : `${improvements.length} improvement(s), ${regressions.length} regression(s); net ${net > 0 ? '+' : ''}${net}.`;

  return {
    entries,
    net_score_delta: net,
    is_regression: regressions.length > 0 && improvements.length <= regressions.length,
    is_improvement: improvements.length > regressions.length,
    summary,
  };
}

function densityRank(category: string): number {
  if (category === 'sparse') return 0;
  if (category === 'comfortable') return 1;
  if (category === 'busy') return 2;
  return 3;
}

function severityFromDelta(delta: number): 'low' | 'medium' | 'high' {
  if (delta >= 20) return 'high';
  if (delta >= 10) return 'medium';
  return 'low';
}
