/**
 * remediationOutcomeLearner — pure scoring of remediation effectiveness +
 * DB-backed roll-up across history.
 *
 * Outcome score combines: did the user accept it, did it ship, did it
 * resolve the underlying problem, did pressure / cognition improve, and
 * did the same pattern recur within 7d (regression failure).
 *
 * Phase 10 §2.
 */

export interface RawRemediationOutcome {
  readonly accepted: boolean;
  readonly implemented: boolean;
  readonly resolved: boolean;
  readonly pressure_delta: number | null;     // negative = pressure reduced
  readonly cognition_delta: number | null;    // positive = cognition improved
  readonly recurred_within_7d: boolean;
}

export interface RemediationEffectivenessScore {
  /** 0-100 — overall effectiveness blend. */
  readonly score: number;
  /** Composite contributions (transparent breakdown). */
  readonly contributions: Readonly<Record<string, number>>;
  readonly tier: 'ineffective' | 'marginal' | 'helpful' | 'strong';
  readonly notes: ReadonlyArray<string>;
}

export function scoreRemediationOutcome(o: RawRemediationOutcome): RemediationEffectivenessScore {
  const contributions: Record<string, number> = {};
  const notes: string[] = [];

  contributions.accepted = o.accepted ? 5 : 0;
  contributions.implemented = o.implemented ? 10 : 0;
  contributions.resolved = o.resolved ? 35 : 0;

  if (typeof o.pressure_delta === 'number') {
    // Negative delta = pressure reduced = good. Cap absolute contribution at 25.
    contributions.pressure_reduction = Math.min(25, Math.max(-10, Math.round(-o.pressure_delta * 0.4)));
  } else {
    contributions.pressure_reduction = 0;
  }

  if (typeof o.cognition_delta === 'number') {
    contributions.cognition_improvement = Math.min(15, Math.max(-10, Math.round(o.cognition_delta * 0.4)));
  } else {
    contributions.cognition_improvement = 0;
  }

  // Recurrence credit ONLY when the remediation was actually implemented;
  // a non-attempted remediation can't claim credit for "not recurring."
  if (o.recurred_within_7d) {
    contributions.recurrence_penalty = -25;
  } else if (o.implemented) {
    contributions.recurrence_penalty = 10;
  } else {
    contributions.recurrence_penalty = 0;
  }
  if (o.recurred_within_7d) notes.push('Same pattern recurred within 7 days — heavy penalty.');
  if (!o.accepted) notes.push('User rejected the remediation.');
  if (o.accepted && !o.implemented) notes.push('Accepted but not implemented — uncertain attribution.');
  if (o.resolved && o.recurred_within_7d) notes.push('Resolved short-term but bounced back; suggests the root cause was not addressed.');

  // Baseline floor: accepted attempts get a higher floor. A fully-rejected
  // remediation gets no implicit credit.
  const baseFloor = o.accepted ? 30 : 10;
  const score = Math.max(0, Math.min(100,
    Math.round(Object.values(contributions).reduce((s, v) => s + v, 0) + baseFloor),
  ));

  let tier: RemediationEffectivenessScore['tier'] = 'ineffective';
  if (score >= 75) tier = 'strong';
  else if (score >= 55) tier = 'helpful';
  else if (score >= 35) tier = 'marginal';

  return {
    score,
    contributions: Object.freeze(contributions),
    tier,
    notes,
  };
}

export interface AggregateOutcomes {
  readonly total_attempts: number;
  readonly resolved_count: number;
  readonly recurred_count: number;
  readonly avg_pressure_delta: number | null;
  readonly avg_cognition_delta: number | null;
  readonly avg_score: number;
  readonly best_action: { action: string; success_rate: number; attempts: number } | null;
  readonly worst_action: { action: string; success_rate: number; attempts: number } | null;
}

/**
 * DB-backed: read recent outcomes for a project + pattern, return aggregates.
 */
export async function aggregateOutcomes(opts: {
  project_id?: string;
  pattern_signature?: string;
  since_days?: number;
}): Promise<AggregateOutcomes> {
  try {
    const { Op } = await import('sequelize');
    const { default: RemediationOutcome } = await import('../../../models/RemediationOutcome');
    const since = new Date(Date.now() - (opts.since_days ?? 30) * 86400 * 1000);
    const where: any = { observed_at: { [Op.gte]: since } };
    if (opts.project_id) where.project_id = opts.project_id;
    if (opts.pattern_signature) where.pattern_signature = opts.pattern_signature;

    const rows = await RemediationOutcome.findAll({ where });
    if (rows.length === 0) {
      return {
        total_attempts: 0,
        resolved_count: 0,
        recurred_count: 0,
        avg_pressure_delta: null,
        avg_cognition_delta: null,
        avg_score: 0,
        best_action: null,
        worst_action: null,
      };
    }

    let totalScore = 0;
    let resolvedCount = 0;
    let recurredCount = 0;
    let pressureSum = 0;
    let pressureCount = 0;
    let cognitionSum = 0;
    let cognitionCount = 0;

    const perAction = new Map<string, { attempts: number; resolved: number }>();

    for (const r of rows as any[]) {
      const score = scoreRemediationOutcome({
        accepted: r.accepted,
        implemented: r.implemented,
        resolved: r.resolved,
        pressure_delta: r.pressure_delta,
        cognition_delta: r.cognition_delta,
        recurred_within_7d: r.recurred_within_7d,
      });
      totalScore += score.score;
      if (r.resolved) resolvedCount++;
      if (r.recurred_within_7d) recurredCount++;
      if (typeof r.pressure_delta === 'number') { pressureSum += r.pressure_delta; pressureCount++; }
      if (typeof r.cognition_delta === 'number') { cognitionSum += r.cognition_delta; cognitionCount++; }

      const a = perAction.get(r.remediation_action) || { attempts: 0, resolved: 0 };
      a.attempts++;
      if (r.resolved && !r.recurred_within_7d) a.resolved++;
      perAction.set(r.remediation_action, a);
    }

    const ranked = Array.from(perAction.entries())
      .filter(([, v]) => v.attempts >= 2)        // ignore one-shots
      .map(([action, v]) => ({ action, success_rate: v.resolved / v.attempts, attempts: v.attempts }))
      .sort((a, b) => b.success_rate - a.success_rate);

    return {
      total_attempts: rows.length,
      resolved_count: resolvedCount,
      recurred_count: recurredCount,
      avg_pressure_delta: pressureCount > 0 ? Math.round((pressureSum / pressureCount) * 10) / 10 : null,
      avg_cognition_delta: cognitionCount > 0 ? Math.round((cognitionSum / cognitionCount) * 10) / 10 : null,
      avg_score: Math.round(totalScore / rows.length),
      best_action: ranked[0] ?? null,
      worst_action: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    };
  } catch (err: any) {
    console.warn('[remediationOutcomeLearner] aggregate failed:', err?.message);
    return {
      total_attempts: 0, resolved_count: 0, recurred_count: 0,
      avg_pressure_delta: null, avg_cognition_delta: null,
      avg_score: 0, best_action: null, worst_action: null,
    };
  }
}
