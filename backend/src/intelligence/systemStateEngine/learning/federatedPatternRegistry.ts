/**
 * federatedPatternRegistry — upserts cognitive patterns derived from
 * historical incidents. Patterns are project-agnostic: when the same
 * signature appears across projects, the registry merges the counts so
 * insights aggregate across the federation.
 *
 * Phase 9 §6.
 */
import { createHash } from 'crypto';

export interface IncidentForLearning {
  readonly type: string;
  readonly affected_routes: ReadonlyArray<string>;
  readonly cognition_impact: number | null;
  readonly project_id: string;
  readonly remediation_action?: string | null;
  readonly remediation_succeeded?: boolean;
}

/** Pure: build a stable signature from an incident's structural shape. */
export function patternSignature(input: {
  type: string;
  cognition_impact: number | null;
  primary_route_prefix: string;
}): string {
  const impactBucket = input.cognition_impact === null
    ? 'unknown'
    : input.cognition_impact <= -25 ? 'severe'
    : input.cognition_impact <= -10 ? 'moderate'
    : input.cognition_impact < 0 ? 'mild'
    : 'positive';
  const raw = `${input.type}|${impactBucket}|${input.primary_route_prefix}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function primaryRoutePrefix(routes: ReadonlyArray<string>): string {
  if (routes.length === 0) return 'global';
  const first = routes[0];
  // Use first 2 path segments as the prefix bucket.
  const parts = first.split('/').filter(Boolean).slice(0, 2);
  return parts.length === 0 ? '/' : '/' + parts.join('/');
}

/**
 * DB-backed: upsert a pattern from an incident. Best-effort.
 */
export async function upsertPatternFromIncident(input: IncidentForLearning): Promise<void> {
  try {
    const { default: CognitivePattern } = await import('../../../models/CognitivePattern');
    const sig = patternSignature({
      type: input.type,
      cognition_impact: input.cognition_impact,
      primary_route_prefix: primaryRoutePrefix(input.affected_routes),
    });

    const existing = await CognitivePattern.findOne({ where: { signature: sig } });
    if (existing) {
      const e = existing as any;
      const knownProjects = new Set<string>((e.metadata?.known_project_ids as string[]) || []);
      const newProject = !knownProjects.has(input.project_id);
      knownProjects.add(input.project_id);

      const successfulActions = new Set<string>(e.successful_actions || []);
      if (input.remediation_action && input.remediation_succeeded) {
        successfulActions.add(input.remediation_action);
      }
      const exampleRoutes = new Set<string>(e.example_routes || []);
      for (const r of input.affected_routes) exampleRoutes.add(r);

      await CognitivePattern.update({
        occurrence_count: (e.occurrence_count || 1) + 1,
        project_count: knownProjects.size,
        successful_remediations: (e.successful_remediations || 0) + (input.remediation_succeeded ? 1 : 0),
        attempted_remediations: (e.attempted_remediations || 0) + (input.remediation_action ? 1 : 0),
        last_seen_at: new Date(),
        example_routes: Array.from(exampleRoutes).slice(0, 20),
        successful_actions: Array.from(successfulActions).slice(0, 20),
        metadata: { ...(e.metadata || {}), known_project_ids: Array.from(knownProjects) },
        updated_at: new Date(),
      } as any, { where: { id: e.id } });
    } else {
      await CognitivePattern.create({
        signature: sig,
        pattern_kind: input.type,
        description: `Pattern: ${input.type} on ${primaryRoutePrefix(input.affected_routes)} (impact bucket inferred)`,
        occurrence_count: 1,
        project_count: 1,
        successful_remediations: input.remediation_succeeded ? 1 : 0,
        attempted_remediations: input.remediation_action ? 1 : 0,
        last_seen_at: new Date(),
        example_routes: [...input.affected_routes].slice(0, 20),
        successful_actions: input.remediation_action && input.remediation_succeeded ? [input.remediation_action] : [],
        metadata: { known_project_ids: [input.project_id] },
      } as any);
    }
  } catch (err: any) {
    console.warn('[federatedPatternRegistry] upsert failed:', err?.message);
  }
}

/** Read top patterns across the federation. */
export async function listTopPatterns(opts: { limit?: number; pattern_kind?: string } = {}): Promise<any[]> {
  try {
    const { default: CognitivePattern } = await import('../../../models/CognitivePattern');
    const where: any = {};
    if (opts.pattern_kind) where.pattern_kind = opts.pattern_kind;
    const rows = await CognitivePattern.findAll({
      where,
      order: [['occurrence_count', 'DESC']],
      limit: opts.limit ?? 25,
    });
    return rows.map((r: any) => ({
      signature: r.signature,
      pattern_kind: r.pattern_kind,
      description: r.description,
      occurrence_count: r.occurrence_count,
      project_count: r.project_count,
      successful_remediations: r.successful_remediations,
      attempted_remediations: r.attempted_remediations,
      success_rate: r.attempted_remediations > 0
        ? Math.round((r.successful_remediations / r.attempted_remediations) * 100) / 100
        : 0,
      last_seen_at: new Date(r.last_seen_at).toISOString(),
      successful_actions: r.successful_actions || [],
    }));
  } catch (err: any) {
    console.warn('[federatedPatternRegistry] read failed:', err?.message);
    return [];
  }
}
