/**
 * remediationEffectivenessAnalyzer — score a UX remediation outcome with
 * UX-specific weights. Parallels Phase 10's scoreRemediationOutcome but
 * tuned against UX deltas (ux_debt_delta, friction_delta, behavioral_delta,
 * cognition_delta, regression_count) instead of pressure/cognition only.
 *
 * Why a separate scorer: Phase 10's weights were tuned against
 * orchestration outcomes (pressure-reduction credit at 0.4 multiplier,
 * cognition-improvement credit at 0.4). UX outcomes weight ux_debt_delta
 * + friction_delta + cognition_delta independently because the rule of
 * thumb here is different: a fix that drops UX debt without lifting
 * cognition is still good; a fix that drops cognition is always bad.
 *
 * Phase 10.5 §A.6.
 */

export interface UXRemediationOutcomeFacts {
  readonly issues_resolved_count: number;
  readonly issues_regressed_count: number;
  readonly cognition_delta: number | null;     // signed: positive = improved
  readonly ux_debt_delta: number | null;        // signed: positive = improved (debt dropped)
  readonly behavioral_delta: number | null;     // signed: positive = improved (pressure dropped)
  readonly friction_delta: number | null;       // signed: positive = improved (friction dropped)
  /** Same cluster_signature recurred since this outcome (set later by detector). */
  readonly subsequent_recurrence: boolean;
}

export interface UXRemediationEffectivenessScore {
  readonly score: number;                       // 0-100
  readonly tier: 'ineffective' | 'marginal' | 'helpful' | 'strong';
  readonly contributions: Readonly<Record<string, number>>;
  readonly notes: ReadonlyArray<string>;
}

export function scoreUXRemediationOutcome(o: UXRemediationOutcomeFacts): UXRemediationEffectivenessScore {
  const contributions: Record<string, number> = {};
  const notes: string[] = [];

  // Resolution credit: 0-25. Caps at 25 so a 100-issue cluster doesn't
  // dominate the score; resolution count is a signal, not the goal.
  contributions.resolution = Math.min(25, o.issues_resolved_count * 5);

  // Regression penalty: every regressed issue costs 8 points (uncapped on
  // the down-side because regressions are the failure mode we care about).
  contributions.regression_penalty = -o.issues_regressed_count * 8;
  if (o.issues_regressed_count > 0) {
    notes.push(`${o.issues_regressed_count} issue(s) regressed during this remediation cycle.`);
  }

  // Cognition delta: signed contribution, capped at ±15. Positive = improved.
  contributions.cognition = clipScaled(o.cognition_delta, 0.5, -15, 15);

  // UX debt delta: signed contribution, capped at ±20. Positive = debt
  // dropped (improvement).
  contributions.ux_debt = clipScaled(o.ux_debt_delta, 0.6, -15, 20);

  // Behavioral delta (user pressure dropped): capped at ±10.
  contributions.behavioral = clipScaled(o.behavioral_delta, 0.4, -8, 10);

  // Workflow friction: capped at ±10.
  contributions.friction = clipScaled(o.friction_delta, 0.4, -8, 10);

  // Recurrence penalty: subsequent recurrence wipes ~half the credit.
  if (o.subsequent_recurrence) {
    contributions.recurrence_penalty = -20;
    notes.push('Same cluster signature recurred after this remediation — fix did not hold.');
  } else {
    contributions.recurrence_penalty = 0;
  }

  // Baseline floor — a no-op fix gets a low-but-not-zero score.
  const baseFloor = 15;

  const raw = baseFloor + Object.values(contributions).reduce((s, v) => s + v, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const tier: UXRemediationEffectivenessScore['tier'] =
    score >= 75 ? 'strong' :
    score >= 55 ? 'helpful' :
    score >= 35 ? 'marginal' :
    'ineffective';

  return {
    score,
    tier,
    contributions: Object.freeze(contributions),
    notes,
  };
}

function clipScaled(v: number | null, scale: number, min: number, max: number): number {
  if (v == null) return 0;
  return Math.round(Math.max(min, Math.min(max, v * scale)));
}

export interface UXRemediationAggregate {
  readonly total_outcomes: number;
  readonly avg_score: number;
  readonly best_cluster_type: { cluster_type: string; avg_score: number; count: number } | null;
  readonly worst_cluster_type: { cluster_type: string; avg_score: number; count: number } | null;
  readonly avg_cognition_delta: number | null;
  readonly avg_ux_debt_delta: number | null;
  readonly historical_success_rate_by_type: Readonly<Record<string, number>>;
}

/**
 * DB-backed roll-up — read recent UX outcomes for a project, score each,
 * return per-cluster-type averages. Used by:
 *   - remediationConfidenceEngine (historical_success_rate input)
 *   - the adaptive prompt's "historical success" line
 */
export async function aggregateUXOutcomes(opts: {
  project_id?: string;
  capability_id?: string;
  cluster_type?: string;
  since_days?: number;
}): Promise<UXRemediationAggregate> {
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const since = new Date(Date.now() - (opts.since_days ?? 30) * 86400 * 1000);
    const where: any = { observed_at: { [Op.gte]: since } };
    if (opts.project_id) where.project_id = opts.project_id;
    if (opts.capability_id) where.capability_id = opts.capability_id;
    if (opts.cluster_type) where.cluster_type = opts.cluster_type;

    const rows = await UXRemediationOutcome.findAll({ where });
    if (rows.length === 0) {
      return {
        total_outcomes: 0,
        avg_score: 0,
        best_cluster_type: null,
        worst_cluster_type: null,
        avg_cognition_delta: null,
        avg_ux_debt_delta: null,
        historical_success_rate_by_type: Object.freeze({}),
      };
    }

    let scoreSum = 0;
    let cogSum = 0, cogN = 0;
    let debtSum = 0, debtN = 0;
    const perType = new Map<string, { totalScore: number; count: number }>();

    for (const r of rows as any[]) {
      const s = scoreUXRemediationOutcome({
        issues_resolved_count: r.issues_resolved_count,
        issues_regressed_count: r.issues_regressed_count,
        cognition_delta: r.cognition_delta,
        ux_debt_delta: r.ux_debt_delta,
        behavioral_delta: r.behavioral_delta,
        friction_delta: r.friction_delta,
        subsequent_recurrence: false, // recurrence is computed by detector separately
      });
      scoreSum += s.score;
      if (typeof r.cognition_delta === 'number') { cogSum += r.cognition_delta; cogN++; }
      if (typeof r.ux_debt_delta === 'number') { debtSum += r.ux_debt_delta; debtN++; }

      const t = perType.get(r.cluster_type) || { totalScore: 0, count: 0 };
      t.totalScore += s.score;
      t.count++;
      perType.set(r.cluster_type, t);
    }

    const ranked = Array.from(perType.entries())
      .map(([cluster_type, v]) => ({ cluster_type, avg_score: Math.round(v.totalScore / v.count), count: v.count }))
      .sort((a, b) => b.avg_score - a.avg_score);

    const successRateByType: Record<string, number> = {};
    for (const r of ranked) successRateByType[r.cluster_type] = r.avg_score;

    return {
      total_outcomes: rows.length,
      avg_score: Math.round(scoreSum / rows.length),
      best_cluster_type: ranked[0] ?? null,
      worst_cluster_type: ranked.length > 1 ? ranked[ranked.length - 1] : null,
      avg_cognition_delta: cogN > 0 ? Math.round((cogSum / cogN) * 10) / 10 : null,
      avg_ux_debt_delta: debtN > 0 ? Math.round((debtSum / debtN) * 10) / 10 : null,
      historical_success_rate_by_type: Object.freeze(successRateByType),
    };
  } catch (err: any) {
    console.warn('[remediationEffectivenessAnalyzer] aggregate failed:', err?.message);
    return {
      total_outcomes: 0,
      avg_score: 0,
      best_cluster_type: null,
      worst_cluster_type: null,
      avg_cognition_delta: null,
      avg_ux_debt_delta: null,
      historical_success_rate_by_type: Object.freeze({}),
    };
  }
}
