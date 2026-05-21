/**
 * uxDebtScorer — turn open critique items into a structured UX debt score.
 *
 * Pure: no I/O. Tested directly. The DB-backed wrapper that loads critique
 * items + decisions and computes the score for a project lives separately.
 *
 * Phase 5 §5.
 */
import type { CritiqueKind, CritiqueSeverity } from '../../../models/VisualCritiqueItem';

export interface CritiqueSnapshot {
  readonly id: string;
  readonly kind: CritiqueKind;
  readonly severity: CritiqueSeverity;
  /** True when the user accepted a suggestion or marked it resolved. */
  readonly resolved: boolean;
}

export interface UXDebtScore {
  readonly layout_debt: number;
  readonly workflow_debt: number;
  readonly navigation_debt: number;
  readonly accessibility_debt: number;
  readonly action_density_debt: number;
  readonly responsiveness_debt: number;
  readonly consistency_debt: number;
  readonly onboarding_debt: number;
  /** Aggregate score (0 = clean, 100 = severe debt). */
  readonly total_debt: number;
  /** UX health (100 - total_debt, clamped). Engine consumes this for sync_health. */
  readonly ux_health: number;
}

const SEVERITY_WEIGHT: Record<CritiqueSeverity, number> = {
  low: 1,
  medium: 3,
  high: 7,
};

// Map CritiqueKind to the debt dimension it primarily contributes to.
const KIND_TO_DIMENSION: Record<CritiqueKind, keyof Omit<UXDebtScore, 'total_debt' | 'ux_health'>> = {
  spacing: 'layout_debt',
  alignment: 'layout_debt',
  hierarchy: 'layout_debt',
  typography: 'consistency_debt',
  color: 'consistency_debt',
  responsiveness: 'responsiveness_debt',
  accessibility: 'accessibility_debt',
  interaction: 'action_density_debt',
  workflow: 'workflow_debt',
  copy: 'onboarding_debt',
  // 2026-05-21 Visual Scan additions.
  theme: 'consistency_debt',
  data_density: 'action_density_debt',
  mobile: 'responsiveness_debt',
};

export function scoreUXDebt(critiques: ReadonlyArray<CritiqueSnapshot>): UXDebtScore {
  const dims: Record<string, number> = {
    layout_debt: 0,
    workflow_debt: 0,
    navigation_debt: 0,
    accessibility_debt: 0,
    action_density_debt: 0,
    responsiveness_debt: 0,
    consistency_debt: 0,
    onboarding_debt: 0,
  };

  for (const c of critiques) {
    if (c.resolved) continue;
    const w = SEVERITY_WEIGHT[c.severity];
    const dim = KIND_TO_DIMENSION[c.kind];
    if (dim) dims[dim] += w;
  }

  // Convert raw counts into 0-100 debt scores: 0 = no debt; 30 raw points
  // = full debt for that dimension. (Calibrated to make a single high-sev
  // critique worth ~23 debt; three high-sev critiques saturate.)
  const norm = (raw: number): number => Math.min(100, Math.round((raw / 30) * 100));

  const layout_debt = norm(dims.layout_debt);
  const workflow_debt = norm(dims.workflow_debt);
  const navigation_debt = norm(dims.navigation_debt);
  const accessibility_debt = norm(dims.accessibility_debt);
  const action_density_debt = norm(dims.action_density_debt);
  const responsiveness_debt = norm(dims.responsiveness_debt);
  const consistency_debt = norm(dims.consistency_debt);
  const onboarding_debt = norm(dims.onboarding_debt);

  // Total debt: max of (weighted average, weighted max dimension). The
  // average alone dilutes a single-severe-dimension project too much; the
  // max alone ignores broad-but-shallow debt. We take the higher signal so
  // either pattern triggers attention.
  const weights: Record<string, number> = {
    layout_debt: 1.0, workflow_debt: 1.3, navigation_debt: 1.0,
    accessibility_debt: 1.4, action_density_debt: 1.0,
    responsiveness_debt: 1.0, consistency_debt: 0.8, onboarding_debt: 1.1,
  };
  const dimVals: Record<string, number> = {
    layout_debt, workflow_debt, navigation_debt, accessibility_debt,
    action_density_debt, responsiveness_debt, consistency_debt, onboarding_debt,
  };
  const weightedSum = Object.entries(dimVals).reduce((s, [k, v]) => s + v * weights[k], 0);
  const sumWeights = Object.values(weights).reduce((s, w) => s + w, 0);
  const weightedAvg = weightedSum / sumWeights;
  // Weighted max — multiply each dim by its weight (capped at 100), take the max.
  const weightedMax = Math.max(
    ...Object.entries(dimVals).map(([k, v]) => Math.min(100, v * weights[k])),
  );
  const total_debt = Math.min(100, Math.round(Math.max(weightedAvg, weightedMax)));

  return Object.freeze({
    layout_debt,
    workflow_debt,
    navigation_debt,
    accessibility_debt,
    action_density_debt,
    responsiveness_debt,
    consistency_debt,
    onboarding_debt,
    total_debt,
    ux_health: 100 - total_debt,
  });
}

/**
 * Convenience: which dimension carries the most debt?
 */
export function dominantDebtDimension(score: UXDebtScore): keyof Omit<UXDebtScore, 'total_debt' | 'ux_health'> {
  const entries = [
    ['layout_debt', score.layout_debt],
    ['workflow_debt', score.workflow_debt],
    ['navigation_debt', score.navigation_debt],
    ['accessibility_debt', score.accessibility_debt],
    ['action_density_debt', score.action_density_debt],
    ['responsiveness_debt', score.responsiveness_debt],
    ['consistency_debt', score.consistency_debt],
    ['onboarding_debt', score.onboarding_debt],
  ] as Array<[keyof Omit<UXDebtScore, 'total_debt' | 'ux_health'>, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
