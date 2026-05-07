/**
 * federatedTrustProfiles — Phase 13 §F. Cross-project trust federation.
 *
 * Federation contributes to a project's trust math ONLY when:
 *   - local sample size < 20 (cold project) AND
 *   - federation sample size > 50 AND
 *   - federation success_rate variance < 0.15
 *
 * Otherwise federation is informational only. Mirrors Phase 9's
 * crossProjectLearning pattern — reads `LearningPolicySnapshot` rows
 * with `trigger='autonomy_trust_recompute'` (and especially
 * `project_id='global'` if present).
 */

export interface SharedTrustProfile {
  readonly action_class: string;
  readonly project_count: number;
  readonly total_executions: number;
  readonly avg_trust_score: number;
  readonly success_rate_variance: number;
  readonly federation_blessing: boolean;
}

const MIN_LOCAL_SAMPLE = 20;
const MIN_FEDERATION_SAMPLES = 50;
const VARIANCE_CEILING = 0.15;

export async function fetchSharedTrustProfiles(opts?: {
  action_class?: string;
  min_projects?: number;
  min_executions?: number;
}): Promise<SharedTrustProfile[]> {
  try {
    const { Op } = await import('sequelize');
    const { default: LearningPolicySnapshot } = await import('../../../models/LearningPolicySnapshot');
    const since = new Date(Date.now() - 60 * 86400 * 1000);
    const rows: any[] = await LearningPolicySnapshot.findAll({
      where: { trigger: 'autonomy_trust_recompute', recorded_at: { [Op.gte]: since } },
    });
    if (rows.length === 0) return [];

    // Group by action_class across rows
    const byClass = new Map<string, { trust_scores: number[]; executions: number; project_ids: Set<string> }>();
    for (const r of rows) {
      const tp = (r.policy as any)?.trust_profiles_by_action_class || {};
      for (const klass of Object.keys(tp)) {
        const e = tp[klass];
        if (!e) continue;
        const slot = byClass.get(klass) || { trust_scores: [], executions: 0, project_ids: new Set<string>() };
        slot.trust_scores.push(e.trust_score);
        slot.executions += (e.success_count || 0) + (e.rollback_count || 0);
        slot.project_ids.add(r.project_id);
        byClass.set(klass, slot);
      }
    }

    const min_projects = opts?.min_projects ?? 2;
    const min_executions = opts?.min_executions ?? MIN_FEDERATION_SAMPLES;

    const out: SharedTrustProfile[] = [];
    for (const [klass, slot] of byClass.entries()) {
      if (opts?.action_class && klass !== opts.action_class) continue;
      const project_count = slot.project_ids.size;
      if (project_count < min_projects) continue;
      if (slot.executions < min_executions) continue;
      const avg = slot.trust_scores.reduce((s, v) => s + v, 0) / slot.trust_scores.length;
      const variance = slot.trust_scores.reduce((s, v) => s + (v - avg) * (v - avg), 0) / slot.trust_scores.length / 10000;   // normalize 0-100 → 0-1
      const blessed = slot.executions >= MIN_FEDERATION_SAMPLES && variance < VARIANCE_CEILING;
      out.push({
        action_class: klass,
        project_count,
        total_executions: slot.executions,
        avg_trust_score: Math.round(avg),
        success_rate_variance: Math.round(variance * 1000) / 1000,
        federation_blessing: blessed,
      });
    }
    return out.sort((a, b) => b.avg_trust_score - a.avg_trust_score);
  } catch (err: any) {
    console.warn('[federatedTrustProfiles] failed:', err?.message);
    return [];
  }
}

/**
 * Decide whether federation should influence local trust math for a
 * given (project, action_class). Returns true only when the strict
 * stress-test conditions hold; otherwise federation is informational
 * (the dashboard may still display it, but trust math doesn't blend).
 */
export function shouldFederationInfluence(opts: {
  local_sample_size: number;
  federation_total_executions: number;
  federation_variance: number;
}): boolean {
  return opts.local_sample_size < MIN_LOCAL_SAMPLE
    && opts.federation_total_executions > MIN_FEDERATION_SAMPLES
    && opts.federation_variance < VARIANCE_CEILING;
}
