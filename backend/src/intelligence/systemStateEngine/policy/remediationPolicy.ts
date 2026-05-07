/**
 * remediationPolicy — per-project policy state for the remediation
 * intelligence layer. Mirrors cognitivePolicyEngine but specialized to
 * the UX surface.
 *
 * Federation fallback: getPolicy(projectId) returns the project's
 * stored override if one exists, otherwise falls back to a federated
 * default computed from cross-project UXRemediationOutcome aggregates,
 * otherwise the hardcoded baseline. This ensures fresh projects inherit
 * the org's learned defaults instead of starting cold.
 *
 * Phase 10.5 §K.
 */

export interface RemediationPolicy {
  readonly regression_tolerance: number;       // 0-1 — fraction of regressions accepted before escalation
  readonly stability_threshold: number;        // 0-100 — RemediationHealthIndex.stability floor
  readonly confidence_floor: number;           // 0-100 — min confidence for autonomous prompt suggestion
  readonly min_cluster_size: number;           // 1-N — clusters with fewer issues hidden from queue
  readonly sequence_strictness: 'soft' | 'strict';  // soft = priority guidance, strict = hard order
  readonly source: 'override' | 'federated' | 'baseline';
  readonly recorded_at: string;                // ISO
}

const BASELINE: Omit<RemediationPolicy, 'source' | 'recorded_at'> = {
  regression_tolerance: 0.15,
  stability_threshold: 70,
  confidence_floor: 45,
  min_cluster_size: 2,
  sequence_strictness: 'soft',
};

const overrides = new Map<string, Omit<RemediationPolicy, 'source' | 'recorded_at'>>();

export async function getRemediationPolicy(projectId: string): Promise<RemediationPolicy> {
  const override = overrides.get(projectId);
  if (override) {
    return { ...override, source: 'override', recorded_at: new Date().toISOString() };
  }
  const federated = await deriveFederatedDefault();
  if (federated) {
    return { ...federated, source: 'federated', recorded_at: new Date().toISOString() };
  }
  return { ...BASELINE, source: 'baseline', recorded_at: new Date().toISOString() };
}

export function setRemediationPolicy(projectId: string, partial: Partial<Omit<RemediationPolicy, 'source' | 'recorded_at'>>): RemediationPolicy {
  const current = overrides.get(projectId) ?? { ...BASELINE };
  const next = { ...current, ...partial };
  // Bound checks
  next.regression_tolerance = clamp01(next.regression_tolerance);
  next.stability_threshold = clamp(next.stability_threshold, 0, 100);
  next.confidence_floor = clamp(next.confidence_floor, 0, 100);
  next.min_cluster_size = Math.max(1, Math.floor(next.min_cluster_size));
  if (next.sequence_strictness !== 'soft' && next.sequence_strictness !== 'strict') next.sequence_strictness = 'soft';
  overrides.set(projectId, next);
  return { ...next, source: 'override', recorded_at: new Date().toISOString() };
}

/** Test-only. */
export function _resetRemediationPolicyOverrides(): void {
  overrides.clear();
}

async function deriveFederatedDefault(): Promise<Omit<RemediationPolicy, 'source' | 'recorded_at'> | null> {
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const since = new Date(Date.now() - 60 * 86400 * 1000);
    const rows = await UXRemediationOutcome.findAll({
      where: { observed_at: { [Op.gte]: since } },
      limit: 500,
    });
    if (rows.length < 10) return null;

    let totalRegressed = 0;
    let totalResolved = 0;
    for (const r of rows as any[]) {
      totalRegressed += r.issues_regressed_count || 0;
      totalResolved += r.issues_resolved_count || 0;
    }
    const total = totalRegressed + totalResolved;
    if (total === 0) return null;
    const observedRegressionRate = totalRegressed / total;

    return {
      // Federated tolerance = min(observed × 1.5, 0.30) so fresh projects
      // inherit a slightly more lenient ceiling than the org's actual rate.
      regression_tolerance: Math.min(0.30, Math.max(0.05, observedRegressionRate * 1.5)),
      stability_threshold: BASELINE.stability_threshold,
      confidence_floor: BASELINE.confidence_floor,
      min_cluster_size: BASELINE.min_cluster_size,
      sequence_strictness: BASELINE.sequence_strictness,
    };
  } catch (err: any) {
    console.warn('[remediationPolicy] federated default derivation failed:', err?.message);
    return null;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function clamp01(v: number): number { return clamp(v, 0, 1); }
