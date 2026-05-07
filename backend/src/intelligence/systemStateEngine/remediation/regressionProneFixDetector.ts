/**
 * regressionProneFixDetector — DB-backed scan over UXRemediationOutcome
 * history to surface cluster_signatures that keep coming back. A
 * signature recurring ≥3× within the lookback window is "regression-prone."
 *
 * Output is consumed by:
 *   - RegressionRiskOverlay on the step row
 *   - the adaptive prompt's "patterns to avoid" section
 *   - the queue reranker (regression-prone clusters get an upweight)
 *
 * Phase 10.5 §A.5.
 */

const RECURRENCE_THRESHOLD = 3;
const LOOKBACK_DAYS_DEFAULT = 30;

export interface RegressionPronePattern {
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly recurrence_count: number;
  readonly project_id: string;
  readonly capability_id: string;
  readonly last_seen_at: Date;
  readonly last_failed_action: string;       // most recent step_key seen
  readonly recommended_alternative: string;
}

export interface RegressionDetectionResult {
  readonly patterns: ReadonlyArray<RegressionPronePattern>;
  readonly scanned_outcomes: number;
  readonly window_days: number;
}

export async function detectRegressionPronePatterns(opts: {
  project_id?: string;
  capability_id?: string;
  lookback_days?: number;
}): Promise<RegressionDetectionResult> {
  const lookback_days = opts.lookback_days ?? LOOKBACK_DAYS_DEFAULT;
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const since = new Date(Date.now() - lookback_days * 86400 * 1000);
    const where: any = { observed_at: { [Op.gte]: since } };
    if (opts.project_id) where.project_id = opts.project_id;
    if (opts.capability_id) where.capability_id = opts.capability_id;

    const rows = await UXRemediationOutcome.findAll({ where });

    const grouped = new Map<string, {
      cluster_signature: string;
      cluster_type: string;
      project_id: string;
      capability_id: string;
      count: number;
      last_seen_at: Date;
      last_step_key: string;
    }>();

    for (const r of rows as any[]) {
      const key = r.cluster_signature;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
        if (r.observed_at > existing.last_seen_at) {
          existing.last_seen_at = r.observed_at;
          existing.last_step_key = r.step_key || existing.last_step_key;
        }
      } else {
        grouped.set(key, {
          cluster_signature: r.cluster_signature,
          cluster_type: r.cluster_type,
          project_id: r.project_id,
          capability_id: r.capability_id,
          count: 1,
          last_seen_at: r.observed_at,
          last_step_key: r.step_key || 'unknown',
        });
      }
    }

    const patterns: RegressionPronePattern[] = [];
    for (const g of grouped.values()) {
      if (g.count < RECURRENCE_THRESHOLD) continue;
      patterns.push({
        cluster_signature: g.cluster_signature,
        cluster_type: g.cluster_type,
        recurrence_count: g.count,
        project_id: g.project_id,
        capability_id: g.capability_id,
        last_seen_at: g.last_seen_at,
        last_failed_action: g.last_step_key,
        recommended_alternative: alternativeFor(g.cluster_type),
      });
    }

    patterns.sort((a, b) => b.recurrence_count - a.recurrence_count);

    return {
      patterns,
      scanned_outcomes: rows.length,
      window_days: lookback_days,
    };
  } catch (err: any) {
    console.warn('[regressionProneFixDetector] scan failed:', err?.message);
    return { patterns: [], scanned_outcomes: 0, window_days: lookback_days };
  }
}

function alternativeFor(cluster_type: string): string {
  switch (cluster_type) {
    case 'accessibility':
      return 'Add a snapshot test for keyboard + screen-reader paths so the regression can\'t reappear silently.';
    case 'hierarchy':
      return 'Lock the hierarchy with explicit heading levels in the component contract, not visual styling.';
    case 'navigation':
      return 'Run an end-to-end test that walks the primary nav after each deploy.';
    case 'cta':
      return 'Pin CTA contrast + size as design tokens; a token change becomes a visible diff.';
    case 'spacing':
      return 'Replace ad-hoc margins with the spacing scale; the regression usually comes from inline overrides.';
    case 'workflow':
      return 'Add an interaction test covering the multi-step path; spot fixes leave gaps.';
    case 'cognition_overload':
      return 'Audit information density at the route level, not per-component; the regression is structural.';
    default:
      return 'Treat this cluster as design debt, not a bug — the recurring pattern indicates a missing constraint.';
  }
}
