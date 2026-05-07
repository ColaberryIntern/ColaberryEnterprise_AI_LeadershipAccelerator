/**
 * organizationalLearning — aggregates federated patterns + dispatch logs +
 * incident history into structured OrganizationalLearningInsights.
 *
 * Phase 9 §5.
 */
import { Op } from 'sequelize';

export interface OrganizationalLearningInsights {
  readonly recurring_failures: ReadonlyArray<{ kind: string; count: number; success_rate: number; description: string }>;
  readonly successful_remediation_patterns: ReadonlyArray<{ pattern: string; signature: string; success_count: number; success_rate: number }>;
  readonly rejected_remediation_patterns: ReadonlyArray<{ pattern: string; signature: string; failure_count: number }>;
  readonly recurring_ux_friction_routes: ReadonlyArray<{ route: string; incident_count: number }>;
  readonly window_days: number;
  readonly project_count: number;
  readonly generated_at: string;
}

export async function generateOrganizationalLearningInsights(opts: { window_days?: number } = {}): Promise<OrganizationalLearningInsights> {
  const window_days = opts.window_days ?? 30;
  try {
    const since = new Date(Date.now() - window_days * 86400 * 1000);
    const { default: CognitivePattern } = await import('../../../models/CognitivePattern');
    const { default: CognitiveIncident } = await import('../../../models/CognitiveIncident');

    const patterns = await CognitivePattern.findAll({
      where: { last_seen_at: { [Op.gte]: since } },
      order: [['occurrence_count', 'DESC']],
      limit: 100,
    });

    const incidents = await CognitiveIncident.findAll({
      where: { opened_at: { [Op.gte]: since } },
      attributes: ['id', 'type', 'project_id', 'affected_routes'],
    });

    const projectSet = new Set<string>();
    for (const i of incidents as any[]) projectSet.add(i.project_id);

    // Recurring failures: patterns with the most occurrences
    const recurring_failures = patterns.slice(0, 10).map((p: any) => ({
      kind: p.pattern_kind,
      count: p.occurrence_count,
      success_rate: p.attempted_remediations > 0
        ? Math.round((p.successful_remediations / p.attempted_remediations) * 100) / 100
        : 0,
      description: p.description,
    }));

    // Successful remediation patterns: high success rate + ≥2 attempts
    const successful_remediation_patterns = patterns
      .filter((p: any) => p.attempted_remediations >= 2 && (p.successful_remediations / p.attempted_remediations) >= 0.6)
      .slice(0, 10)
      .flatMap((p: any) => (p.successful_actions || []).map((a: string) => ({
        pattern: a,
        signature: p.signature,
        success_count: p.successful_remediations,
        success_rate: Math.round((p.successful_remediations / p.attempted_remediations) * 100) / 100,
      })));

    // Rejected: high failure rate + ≥2 attempts
    const rejected_remediation_patterns = patterns
      .filter((p: any) => p.attempted_remediations >= 2 && (p.successful_remediations / p.attempted_remediations) < 0.3)
      .slice(0, 10)
      .map((p: any) => ({
        pattern: p.description,
        signature: p.signature,
        failure_count: p.attempted_remediations - p.successful_remediations,
      }));

    // Recurring UX friction routes from incidents
    const routeCounts = new Map<string, number>();
    for (const i of incidents as any[]) {
      const routes = (i.affected_routes || []) as string[];
      for (const r of routes) routeCounts.set(r, (routeCounts.get(r) || 0) + 1);
    }
    const recurring_ux_friction_routes = Array.from(routeCounts.entries())
      .map(([route, count]) => ({ route, incident_count: count }))
      .sort((a, b) => b.incident_count - a.incident_count)
      .slice(0, 10);

    return {
      recurring_failures,
      successful_remediation_patterns,
      rejected_remediation_patterns,
      recurring_ux_friction_routes,
      window_days,
      project_count: projectSet.size,
      generated_at: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn('[organizationalLearning] read failed:', err?.message);
    return {
      recurring_failures: [],
      successful_remediation_patterns: [],
      rejected_remediation_patterns: [],
      recurring_ux_friction_routes: [],
      window_days,
      project_count: 0,
      generated_at: new Date().toISOString(),
    };
  }
}
