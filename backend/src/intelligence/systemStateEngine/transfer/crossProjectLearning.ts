/**
 * crossProjectLearning — federate successful remediation patterns across
 * projects so a fix that worked elsewhere can inform local recommendations.
 *
 * V1 reads the existing `cognitive_patterns` table (Phase 9) and surfaces
 * cross-project shared signatures with confidence-weighted recommendations.
 * No PII / project-specific data crosses boundaries — only signatures +
 * action templates + aggregate counts.
 *
 * Phase 10 §17.
 */

export interface SharedRemediationRecommendation {
  readonly signature: string;
  readonly description: string;
  readonly action: string;
  readonly success_rate: number;            // 0-1 across all projects
  readonly applied_in_projects: number;
  readonly attempts: number;
  readonly confidence: number;               // 0-100
}

export async function fetchSharedRemediations(opts: {
  pattern_kind?: string;
  min_projects?: number;
  min_attempts?: number;
  limit?: number;
} = {}): Promise<SharedRemediationRecommendation[]> {
  try {
    const { default: CognitivePattern } = await import('../../../models/CognitivePattern');
    const where: any = {};
    if (opts.pattern_kind) where.pattern_kind = opts.pattern_kind;
    const rows = await CognitivePattern.findAll({
      where,
      order: [['successful_remediations', 'DESC']],
      limit: opts.limit ?? 25,
    });
    const minProjects = opts.min_projects ?? 2;
    const minAttempts = opts.min_attempts ?? 2;

    const out: SharedRemediationRecommendation[] = [];
    for (const r of rows as any[]) {
      if ((r.project_count ?? 0) < minProjects) continue;
      if ((r.attempted_remediations ?? 0) < minAttempts) continue;
      for (const action of (r.successful_actions || [])) {
        const successRate = r.attempted_remediations > 0
          ? r.successful_remediations / r.attempted_remediations
          : 0;
        // Confidence: log-scaled with project count + attempts.
        const confidence = Math.min(95, Math.round(
          30 + Math.log10(r.project_count + 1) * 30 + Math.log10(r.attempted_remediations + 1) * 20,
        ));
        out.push({
          signature: r.signature,
          description: r.description,
          action,
          success_rate: Math.round(successRate * 100) / 100,
          applied_in_projects: r.project_count,
          attempts: r.attempted_remediations,
          confidence,
        });
      }
    }
    return out.slice(0, opts.limit ?? 25);
  } catch (err: any) {
    console.warn('[crossProjectLearning] read failed:', err?.message);
    return [];
  }
}

/**
 * Given a candidate incident, fetch the top N applicable shared remediations.
 */
export async function recommendSharedRemediationsForIncident(input: {
  incident_type: string;
  affected_route_prefix: string;
  cognition_impact: number | null;
}): Promise<SharedRemediationRecommendation[]> {
  // V1 just filters by pattern_kind == incident_type; a richer match could
  // also weight by route prefix similarity (jaccard) and impact bucket.
  const recs = await fetchSharedRemediations({
    pattern_kind: input.incident_type,
    min_projects: 2,
    min_attempts: 2,
    limit: 5,
  });
  return recs.sort((a, b) => b.confidence * b.success_rate - a.confidence * a.success_rate);
}
