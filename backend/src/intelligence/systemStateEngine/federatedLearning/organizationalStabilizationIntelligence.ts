/**
 * organizationalStabilizationIntelligence — Phase 20. Aggregates
 * federated effectiveness profiles into ranked organizational
 * stabilization insights.
 *
 * Architectural commitment (per the Phase 20 stress-test):
 *   - Aggregated observation only. NO cross-project trust blending,
 *     NO shared governance memory, NO topology convergence.
 *   - Reads effectiveness profiles + reliability profiles via the
 *     broker adapter; does NOT reach into the consuming project's
 *     governance state.
 */

import type { ArchetypeKind, FederatedArchetype } from '../federation/federationTypes';
import type {
  OrganizationalStabilizationInsight, OrganizationalStabilizationReport,
} from './federatedLearningTypes';
import { listEffectivenessProfiles } from './federatedEffectivenessTracker';
import { listReliabilityProfiles } from './archetypeReliabilityEvolution';
import { readOrgRegistry } from '../federation/federatedArchetypeRegistry';

const MAX_INSIGHTS_RETURNED = 25;

export interface BuildOrgStabilizationInput {
  readonly organization_id: string;
}

export async function buildOrganizationalStabilizationReport(input: BuildOrgStabilizationInput): Promise<OrganizationalStabilizationReport> {
  const effectiveness = await listEffectivenessProfiles(input.organization_id);
  const reliability = await listReliabilityProfiles(input.organization_id);
  const registry = readOrgRegistry(input.organization_id);

  const reliabilityBySig = new Map(reliability.map(r => [r.archetype_signature, r] as const));
  const archetypeBySig = new Map(registry.map(a => [a.archetype.archetype_signature, a] as const));

  const insights: OrganizationalStabilizationInsight[] = [];
  for (const eff of effectiveness) {
    const rel = reliabilityBySig.get(eff.archetype_signature);
    const reg = archetypeBySig.get(eff.archetype_signature);
    if (!reg) continue;
    insights.push({
      archetype_signature: eff.archetype_signature,
      archetype_kind: reg.archetype.kind,
      stabilization_score: composeStabilizationScore(eff, rel),
      fastest_stabilization_minutes: reg.archetype.avg_minutes_to_stabilize,
      avg_propagation_reduction: Math.max(0, eff.propagation_reduction),
      total_observations: eff.confidence_evolution.length,
      unique_consumer_count: reg.confidence.source_count,
      notes: composeNotes(eff, rel, reg),
    });
  }
  insights.sort((a, b) => b.stabilization_score - a.stabilization_score);

  // Worst recurring drift signature: archetype with the highest
  // anomaly_frequency among observed archetypes (heuristic only).
  let worst_recurring_drift_signature: string | null = null;
  let worstAnomaly = 0;
  for (const eff of effectiveness) {
    if (eff.anomaly_frequency > worstAnomaly && eff.anomaly_frequency >= 30) {
      worstAnomaly = eff.anomaly_frequency;
      worst_recurring_drift_signature = eff.archetype_signature;
    }
  }

  return {
    organization_id: input.organization_id,
    insights: insights.slice(0, MAX_INSIGHTS_RETURNED),
    worst_recurring_drift_signature,
    built_at: new Date().toISOString(),
  };
}

function composeStabilizationScore(
  eff: { observed_stabilization_delta: number; propagation_reduction: number; recovery_success_rate: number; anomaly_frequency: number; organizational_consistency: number },
  rel?: { current_score: number },
): number {
  // Weighted composite. Stabilization + propagation are signed (delta could
  // be negative); shift them to 0..100 by adding 100 and halving.
  const stab = Math.max(0, Math.min(100, 50 + eff.observed_stabilization_delta / 2));
  const prop = Math.max(0, Math.min(100, 50 + eff.propagation_reduction / 2));
  const reliability = rel?.current_score ?? 50;
  return Math.round(
    stab * 0.30 + prop * 0.20 + eff.recovery_success_rate * 0.20 +
    (100 - eff.anomaly_frequency) * 0.10 + eff.organizational_consistency * 0.10 +
    reliability * 0.10,
  );
}

function composeNotes(
  eff: { recovery_success_rate: number; anomaly_frequency: number; organizational_consistency: number },
  rel: { current_tier: string; current_score: number } | undefined,
  reg: FederatedArchetype,
): string {
  const parts: string[] = [];
  parts.push(`recovery ${eff.recovery_success_rate}% success`);
  if (eff.anomaly_frequency >= 30) parts.push(`anomaly ${eff.anomaly_frequency}%`);
  if (rel) parts.push(`reliability ${rel.current_tier} (${rel.current_score}/100)`);
  parts.push(`${reg.confidence.source_count} sources`);
  return parts.join('; ');
}

export const _MAX_INSIGHTS_RETURNED_FOR_TESTS = MAX_INSIGHTS_RETURNED;
