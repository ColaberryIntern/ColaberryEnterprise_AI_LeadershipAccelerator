/**
 * decisionAutomationEngine — top-level coordinator for the Phase 12
 * governance layer. Composes:
 *   - governanceRecommendationEngine (pure scorer)
 *   - automationConfidenceGate (pure gate)
 *   - governanceMemory (per-project learned state)
 *   - cognitivePolicyEngine (per-project policy)
 *   - cognitiveHealthIndex + remediationHealthIndex (engine state)
 *
 * Returns a single DecisionAutomationReport that the operator dashboard
 * consumes. Pure-ish — performs DB reads for engine state but does NOT
 * persist recommendations (caller does that).
 *
 * Phase 12 §A.1.
 */

import { generateGovernanceRecommendations, type GovernanceRecommendation as RecommendationDraft } from './governanceRecommendationEngine';
import { evaluateAutomationConfidence, type AutomationConfidence } from './automationConfidenceGate';
import { readMemory } from './governanceMemory';

export interface DecisionAutomationReport {
  readonly project_id: string;
  readonly recommendations: ReadonlyArray<RecommendationDraft>;
  readonly automation_confidence: AutomationConfidence;
  readonly automation_mode: 'autonomous' | 'supervised' | 'frozen';
  readonly governance_summary: {
    readonly active_clusters: number;
    readonly recent_regression_count: number;
    readonly override_velocity: number;
    readonly unsafe_pattern_count: number;
    readonly successful_pattern_count: number;
  };
  readonly generated_at: string;
}

export async function buildDecisionAutomationReport(opts: {
  project_id: string;
}): Promise<DecisionAutomationReport> {
  const generated_at = new Date().toISOString();

  const [healthIdx, remediationIdx, regressionResult, clusterReport] = await Promise.all([
    safeImport(async () => {
      const { computeCognitiveHealthIndexForProject } = await import('../health/cognitiveHealthIndex');
      return computeCognitiveHealthIndexForProject(opts.project_id);
    }),
    safeImport(async () => {
      const { computeRemediationHealthIndex } = await import('../health/remediationHealthIndex');
      return computeRemediationHealthIndex(opts.project_id);
    }),
    safeImport(async () => {
      const { detectRegressionPronePatterns } = await import('../remediation/regressionProneFixDetector');
      return detectRegressionPronePatterns({ project_id: opts.project_id });
    }),
    safeImport(async () => {
      // Active cluster count via a lightweight aggregator — count distinct
      // cluster_signature values on open UIElementFeedback rows for the
      // project. Falls back to 0 in test/empty-DB envs.
      const { Op } = await import('sequelize');
      const { default: UIElementFeedback } = await import('../../../models/UIElementFeedback');
      const { default: Capability } = await import('../../../models/Capability');
      const caps: any[] = await Capability.findAll({ where: { project_id: opts.project_id }, attributes: ['id'] });
      if (caps.length === 0) return { active_clusters: 0 };
      const rows: any[] = await UIElementFeedback.findAll({
        where: { capability_id: { [Op.in]: caps.map(c => c.id) }, status: { [Op.in]: ['open', 'in_progress'] } },
        attributes: ['cluster_signature'],
      });
      const sigs = new Set<string>();
      for (const r of rows) if (r.cluster_signature) sigs.add(r.cluster_signature);
      return { active_clusters: sigs.size };
    }),
  ]);

  const memory = readMemory(opts.project_id);
  const automation_mode = await readAutomationMode(opts.project_id);

  const policy = await safeImport(async () => {
    const { getPolicy } = await import('../policy/cognitivePolicyEngine');
    return getPolicy(opts.project_id);
  });
  const min_confidence_to_apply = (policy as any)?.guardrails?.min_confidence_to_apply ?? 65;

  const cognitive_health_score = (healthIdx as any)?.score ?? 70;
  const cognitive_health_tier = (healthIdx as any)?.tier ?? 'cautious';
  const remediation_health_score = (remediationIdx as any)?.score ?? 70;
  const orchestration_confidence = (healthIdx as any)?.prediction_confidence ?? 60;
  const recent_regression_count = (regressionResult as any)?.patterns?.length ?? 0;
  const regression_prone_signatures: string[] = (regressionResult as any)?.patterns?.map((p: any) => p.cluster_signature) ?? [];
  const active_clusters = (clusterReport as any)?.active_clusters ?? 0;

  const recent_storm = !!memory.last_storm_at && (Date.now() - new Date(memory.last_storm_at).getTime() < 30 * 60 * 1000);
  const automation_confidence = evaluateAutomationConfidence({
    mode: automation_mode,
    orchestration_confidence,
    remediation_health_score,
    override_velocity: memory.override_velocity,
    unsafe_pattern_signatures: Object.keys(memory.unsafe_pattern_signatures),
    proposed_signature: null,
    min_confidence_to_apply,
    recent_storm,
    regression_risk: Math.min(100, recent_regression_count * 15),
  });

  const recommendations = generateGovernanceRecommendations({
    cognitive_health_score,
    cognitive_health_tier,
    remediation_health_score,
    pressure_tier: ((healthIdx as any)?.pressure_tier ?? 'calm') as any,
    unresolved_error_incidents: 0, // wired later from incident store
    recent_regression_count,
    active_clusters,
    regression_prone_signatures,
    override_velocity: memory.override_velocity,
    unsafe_pattern_signatures: Object.keys(memory.unsafe_pattern_signatures),
    automation_confidence: automation_confidence.confidence,
  });

  return {
    project_id: opts.project_id,
    recommendations,
    automation_confidence,
    automation_mode,
    governance_summary: {
      active_clusters,
      recent_regression_count,
      override_velocity: memory.override_velocity,
      unsafe_pattern_count: Object.keys(memory.unsafe_pattern_signatures).length,
      successful_pattern_count: Object.keys(memory.successful_plan_signatures).length,
    },
    generated_at,
  };
}

async function safeImport<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

const automationModeByProject = new Map<string, 'autonomous' | 'supervised' | 'frozen'>();

export function setAutomationMode(project_id: string, mode: 'autonomous' | 'supervised' | 'frozen'): void {
  automationModeByProject.set(project_id, mode);
}

export async function readAutomationMode(project_id: string): Promise<'autonomous' | 'supervised' | 'frozen'> {
  return automationModeByProject.get(project_id) ?? 'supervised';
}

/** Test-only: reset in-memory automation mode map. */
export function _resetAutomationModes(): void {
  automationModeByProject.clear();
}
