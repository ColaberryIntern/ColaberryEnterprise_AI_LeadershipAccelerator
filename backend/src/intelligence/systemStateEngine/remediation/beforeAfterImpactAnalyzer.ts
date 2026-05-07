/**
 * beforeAfterImpactAnalyzer — pure metric-delta analysis for a UX
 * remediation cycle. Compares before/after measurements (cognition,
 * UX debt, behavioral pressure, friction, CTA prominence, hierarchy
 * clarity) and buckets each dimension into improvement / regression /
 * unresolved.
 *
 * No image processing — screenshot paths flow through untouched. The
 * frontend's BeforeAfterReplayView handles the visual overlay.
 *
 * Phase 10.5 §A.3.
 */

export interface BeforeAfterMetrics {
  readonly cognition_score: number | null;       // 0-100, higher = healthier
  readonly ux_debt_score: number | null;         // 0-100, lower = healthier
  readonly behavioral_pressure: number | null;   // 0-100, lower = healthier
  readonly workflow_friction: number | null;     // 0-100, lower = healthier
  readonly cta_prominence: number | null;        // 0-100, higher = healthier
  readonly hierarchy_clarity: number | null;     // 0-100, higher = healthier
}

export interface BeforeAfterUXImpactReport {
  readonly improvements: ReadonlyArray<DeltaEntry>;
  readonly regressions: ReadonlyArray<DeltaEntry>;
  readonly unresolved: ReadonlyArray<string>;
  readonly net_delta: number;          // -100..+100, weighted blend
  readonly summary: string;
  readonly screenshot_before_path: string | null;
  readonly screenshot_after_path: string | null;
  /** Convenience deltas the persistence layer writes to UXRemediationOutcome. */
  readonly cognition_delta: number | null;
  readonly ux_debt_delta: number | null;
  readonly behavioral_delta: number | null;
  readonly friction_delta: number | null;
}

export interface DeltaEntry {
  readonly dimension: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;     // signed; positive means "improved"
  readonly note: string;
}

interface DimSpec {
  readonly key: keyof BeforeAfterMetrics;
  readonly label: string;
  /** True if higher is better; false if lower is better. */
  readonly higherIsBetter: boolean;
  readonly weight: number;     // contribution to net_delta
}

const DIMS: ReadonlyArray<DimSpec> = [
  { key: 'cognition_score',     label: 'cognition',         higherIsBetter: true,  weight: 0.25 },
  { key: 'ux_debt_score',       label: 'ux_debt',           higherIsBetter: false, weight: 0.20 },
  { key: 'behavioral_pressure', label: 'behavioral_pressure', higherIsBetter: false, weight: 0.15 },
  { key: 'workflow_friction',   label: 'workflow_friction',   higherIsBetter: false, weight: 0.15 },
  { key: 'cta_prominence',      label: 'cta_prominence',      higherIsBetter: true,  weight: 0.15 },
  { key: 'hierarchy_clarity',   label: 'hierarchy_clarity',   higherIsBetter: true,  weight: 0.10 },
];

const NOISE_FLOOR = 2;   // |signed_delta| ≤ 2 = unresolved (noise)

export function analyzeBeforeAfterImpact(input: {
  before: BeforeAfterMetrics;
  after: BeforeAfterMetrics;
  before_screenshot_path?: string | null;
  after_screenshot_path?: string | null;
}): BeforeAfterUXImpactReport {
  const improvements: DeltaEntry[] = [];
  const regressions: DeltaEntry[] = [];
  const unresolved: string[] = [];
  let weightedSignedDelta = 0;
  let totalWeight = 0;

  for (const dim of DIMS) {
    const before = input.before[dim.key];
    const after = input.after[dim.key];
    if (before == null || after == null) {
      unresolved.push(dim.label);
      continue;
    }
    const raw = after - before;
    // signed delta = "improvement amount" (always positive = better)
    const signed = dim.higherIsBetter ? raw : -raw;

    if (Math.abs(signed) <= NOISE_FLOOR) {
      unresolved.push(dim.label);
      totalWeight += dim.weight;
      continue;
    }

    const entry: DeltaEntry = {
      dimension: dim.label,
      before,
      after,
      delta: Math.round(signed * 10) / 10,
      note: signed > 0
        ? `${dim.label} improved by ${Math.round(signed)} points (${before} → ${after}).`
        : `${dim.label} regressed by ${Math.round(-signed)} points (${before} → ${after}).`,
    };
    if (signed > 0) improvements.push(entry);
    else regressions.push(entry);
    weightedSignedDelta += signed * dim.weight;
    totalWeight += dim.weight;
  }

  const net_delta = totalWeight > 0
    ? Math.max(-100, Math.min(100, Math.round(weightedSignedDelta / totalWeight)))
    : 0;

  let summary: string;
  if (improvements.length > 0 && regressions.length === 0) {
    summary = `Net positive (${net_delta > 0 ? '+' : ''}${net_delta}). ${improvements.length} dimension(s) improved, no regressions.`;
  } else if (regressions.length > 0 && improvements.length === 0) {
    summary = `Net regression (${net_delta}). ${regressions.length} dimension(s) regressed.`;
  } else if (improvements.length > 0 && regressions.length > 0) {
    summary = `Mixed (${net_delta > 0 ? '+' : ''}${net_delta}). ${improvements.length} improved, ${regressions.length} regressed.`;
  } else {
    summary = 'No measurable change above noise floor.';
  }

  return {
    improvements,
    regressions,
    unresolved,
    net_delta,
    summary,
    screenshot_before_path: input.before_screenshot_path ?? null,
    screenshot_after_path: input.after_screenshot_path ?? null,
    cognition_delta: deltaFor(input.before.cognition_score, input.after.cognition_score, true),
    ux_debt_delta: deltaFor(input.before.ux_debt_score, input.after.ux_debt_score, false),
    behavioral_delta: deltaFor(input.before.behavioral_pressure, input.after.behavioral_pressure, false),
    friction_delta: deltaFor(input.before.workflow_friction, input.after.workflow_friction, false),
  };
}

function deltaFor(before: number | null, after: number | null, higherIsBetter: boolean): number | null {
  if (before == null || after == null) return null;
  const raw = after - before;
  // Persistence: store the SIGNED delta where positive = "improvement".
  return Math.round((higherIsBetter ? raw : -raw) * 10) / 10;
}
