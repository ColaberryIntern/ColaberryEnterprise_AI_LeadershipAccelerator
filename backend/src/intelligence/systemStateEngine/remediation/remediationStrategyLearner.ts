/**
 * remediationStrategyLearner — aggregate UXRemediationOutcome by real
 * strategy axes to surface "best strategy per cluster type" guidance.
 *
 * Axes:
 *   - cluster_type — what kind of UX problem
 *   - prompt_target_used — was it ui_fix vs ui_fix_bulk vs ui_fix_adaptive
 *   - pre_pressure_tier — was the project under pressure when fixed?
 *
 * NOT bundle_size — that's a side-effect of UX timing, not a strategy axis.
 *
 * Output drives: the queue's choice of remediation prompt target, the
 * dashboard's "best practice" hints, and the policy engine's confidence
 * floor adjustments.
 *
 * Phase 11 §J.
 */

import { scoreUXRemediationOutcome } from './remediationEffectivenessAnalyzer';

export interface StrategyKey {
  cluster_type: string;
  prompt_target: string;
  pre_pressure_tier: string;
}

export interface StrategyPerformance {
  key: StrategyKey;
  attempts: number;
  avg_score: number;
  resolved_count: number;
  regression_count: number;
  recommendation: string;
}

export interface StrategyLearningReport {
  per_cluster_type: ReadonlyArray<{
    cluster_type: string;
    best_strategy: StrategyPerformance | null;
    worst_strategy: StrategyPerformance | null;
    all_observed: ReadonlyArray<StrategyPerformance>;
  }>;
  /** Project-wide top recommendation (or null when insufficient data). */
  top_recommendation: StrategyPerformance | null;
  scanned_outcomes: number;
  window_days: number;
}

const MIN_ATTEMPTS_FOR_RECOMMENDATION = 3;
const DEFAULT_WINDOW_DAYS = 60;

export async function learnRemediationStrategies(opts: {
  project_id?: string;
  window_days?: number;
}): Promise<StrategyLearningReport> {
  const window = opts.window_days ?? DEFAULT_WINDOW_DAYS;
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const since = new Date(Date.now() - window * 86400 * 1000);
    const where: any = { observed_at: { [Op.gte]: since } };
    if (opts.project_id) where.project_id = opts.project_id;
    const rows: any[] = await UXRemediationOutcome.findAll({ where });
    if (rows.length === 0) return emptyReport(window);

    // Bucket by strategy key
    const buckets = new Map<string, { key: StrategyKey; rows: any[] }>();
    for (const r of rows) {
      const key: StrategyKey = {
        cluster_type: r.cluster_type || 'unknown',
        prompt_target: r.prompt_target_used || 'unknown',
        pre_pressure_tier: r.pre_pressure_tier || 'unknown',
      };
      const k = `${key.cluster_type}|${key.prompt_target}|${key.pre_pressure_tier}`;
      const existing = buckets.get(k);
      if (existing) existing.rows.push(r);
      else buckets.set(k, { key, rows: [r] });
    }

    // Score each bucket
    const performances: StrategyPerformance[] = [];
    for (const b of buckets.values()) {
      let totalScore = 0;
      let resolved = 0;
      let regressed = 0;
      for (const r of b.rows) {
        const s = scoreUXRemediationOutcome({
          issues_resolved_count: r.issues_resolved_count,
          issues_regressed_count: r.issues_regressed_count,
          cognition_delta: r.cognition_delta,
          ux_debt_delta: r.ux_debt_delta,
          behavioral_delta: r.behavioral_delta,
          friction_delta: r.friction_delta,
          subsequent_recurrence: false,
        });
        totalScore += s.score;
        resolved += r.issues_resolved_count || 0;
        regressed += r.issues_regressed_count || 0;
      }
      const attempts = b.rows.length;
      const avg = Math.round(totalScore / attempts);
      performances.push({
        key: b.key,
        attempts,
        avg_score: avg,
        resolved_count: resolved,
        regression_count: regressed,
        recommendation: recommendationText(b.key, avg, attempts, regressed),
      });
    }

    // Per-cluster_type best/worst
    const byClusterType = new Map<string, StrategyPerformance[]>();
    for (const p of performances) {
      const arr = byClusterType.get(p.key.cluster_type) || [];
      arr.push(p);
      byClusterType.set(p.key.cluster_type, arr);
    }
    const per_cluster_type = Array.from(byClusterType.entries()).map(([cluster_type, all]) => {
      const eligible = all.filter(p => p.attempts >= MIN_ATTEMPTS_FOR_RECOMMENDATION);
      const sorted = [...eligible].sort((a, b) => b.avg_score - a.avg_score);
      return {
        cluster_type,
        best_strategy: sorted[0] ?? null,
        worst_strategy: sorted.length > 1 ? sorted[sorted.length - 1] : null,
        all_observed: all,
      };
    });

    // Project-wide top recommendation
    const eligible = performances.filter(p => p.attempts >= MIN_ATTEMPTS_FOR_RECOMMENDATION);
    const top_recommendation = eligible.sort((a, b) => b.avg_score - a.avg_score)[0] ?? null;

    return {
      per_cluster_type,
      top_recommendation,
      scanned_outcomes: rows.length,
      window_days: window,
    };
  } catch (err: any) {
    console.warn('[remediationStrategyLearner] failed:', err?.message);
    return emptyReport(window);
  }
}

function emptyReport(window: number): StrategyLearningReport {
  return { per_cluster_type: [], top_recommendation: null, scanned_outcomes: 0, window_days: window };
}

function recommendationText(key: StrategyKey, avg: number, attempts: number, regressed: number): string {
  if (attempts < MIN_ATTEMPTS_FOR_RECOMMENDATION) {
    return `Insufficient data (${attempts} attempts; need ${MIN_ATTEMPTS_FOR_RECOMMENDATION}).`;
  }
  if (avg >= 70 && regressed === 0) {
    return `Strong: ${key.prompt_target} on ${key.cluster_type} clusters under ${key.pre_pressure_tier} pressure averages ${avg}/100 with no regressions.`;
  }
  if (regressed > attempts) {
    return `Avoid: ${key.prompt_target} on ${key.cluster_type} regresses more often than it resolves.`;
  }
  if (avg < 40) {
    return `Weak: ${key.prompt_target} averages ${avg}/100 — try a different prompt target for ${key.cluster_type}.`;
  }
  return `Acceptable: ${key.prompt_target} on ${key.cluster_type} averages ${avg}/100.`;
}
