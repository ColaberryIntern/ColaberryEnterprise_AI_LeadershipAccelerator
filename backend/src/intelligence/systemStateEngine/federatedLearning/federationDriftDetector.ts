/**
 * federationDriftDetector — Phase 20. Heuristic organizational federation
 * drift detection over Phase 19 + Phase 20 state.
 *
 * Architectural commitment (per the Phase 20 stress-test):
 *   - Heuristic, bounded, deterministic, replayable.
 *   - NOT probabilistic, NOT predictive, NOT a federation collapse model.
 *   - 6 signal kinds: archetype propagation volatility, replay
 *     instability, anomaly clustering, routing divergence, policy
 *     inconsistency, visibility fragmentation.
 *   - 4-tier classification: stable / monitoring / fragmenting / unstable.
 */

import type {
  FederationDriftProfile, FederationDriftSignal, FederationDriftTier,
} from './federatedLearningTypes';
import { listEffectivenessProfiles } from './federatedEffectivenessTracker';
import { listReliabilityProfiles } from './archetypeReliabilityEvolution';
import { readOrgRegistry } from '../federation/federatedArchetypeRegistry';
import { readFederationLineage } from '../federation/federationLineageTracker';

const HIGH_TIER_THRESHOLD = 70;
const FRAGMENTING_TIER_THRESHOLD = 50;
const MONITORING_TIER_THRESHOLD = 30;

export interface BuildDriftProfileInput {
  readonly organization_id: string;
}

export async function buildFederationDriftProfile(input: BuildDriftProfileInput): Promise<FederationDriftProfile> {
  const effectiveness = await listEffectivenessProfiles(input.organization_id);
  const reliability = await listReliabilityProfiles(input.organization_id);
  const registry = readOrgRegistry(input.organization_id);
  const lineage = readFederationLineage({ organization_id: input.organization_id });

  const signals: FederationDriftSignal[] = [];

  // 1. Archetype propagation volatility — high-anomaly archetypes that
  //    nonetheless have many consumers signal volatile propagation.
  const volatileArchetypes = effectiveness.filter(e => e.anomaly_frequency >= 30);
  if (volatileArchetypes.length > 0) {
    const score = Math.min(100, volatileArchetypes.length * 25);
    signals.push({
      kind: 'archetype_propagation_volatility',
      score,
      explanation: `${volatileArchetypes.length} archetype(s) with anomaly frequency ≥ 30%.`,
      observed_at: new Date().toISOString(),
    });
  }

  // 2. Replay instability — archetypes with low replay_reliability.
  const lowReplayReliability = reliability.filter(r => r.replay_reliability < 50);
  if (lowReplayReliability.length > 0) {
    const score = Math.min(100, lowReplayReliability.length * 20);
    signals.push({
      kind: 'replay_instability',
      score,
      explanation: `${lowReplayReliability.length} archetype(s) with replay_reliability < 50%.`,
      observed_at: new Date().toISOString(),
    });
  }

  // 3. Anomaly clustering — multiple archetypes with simultaneously
  //    elevated anomaly_pressure indicates clustered drift.
  const clusterCount = reliability.filter(r => r.anomaly_pressure >= 40).length;
  if (clusterCount >= 2) {
    const score = Math.min(100, clusterCount * 20);
    signals.push({
      kind: 'anomaly_clustering',
      score,
      explanation: `${clusterCount} archetypes simultaneously above 40% anomaly pressure.`,
      observed_at: new Date().toISOString(),
    });
  }

  // 4. Routing divergence — when the org has many routing_archetype
  //    sources but inconsistent stabilization deltas across them.
  const routingArchetypes = registry.filter(a => a.archetype.kind === 'routing_archetype');
  if (routingArchetypes.length >= 3) {
    const successRates = routingArchetypes.map(a => a.archetype.success_rate);
    const min = Math.min(...successRates);
    const max = Math.max(...successRates);
    if (max - min >= 30) {
      const score = Math.min(100, (max - min) + 20);
      signals.push({
        kind: 'routing_divergence',
        score,
        explanation: `Routing archetypes range from ${min}% to ${max}% success — large divergence.`,
        observed_at: new Date().toISOString(),
      });
    }
  }

  // 5. Policy inconsistency — measured at the consumer side: many
  //    consumers but few `applied_locally=true` attributions.
  const totalConsumers = lineage.consumer_project_count;
  if (totalConsumers >= 2) {
    // We can't directly count applied_locally without iterating — use
    // a signal-light heuristic: if there are many consumers but few
    // `consumed` edges (vs `surfaced_to`), flag inconsistency.
    const consumedEdges = lineage.edges.filter(e => e.relation === 'consumed').length;
    const surfacedEdges = lineage.edges.filter(e => e.relation === 'surfaced_to').length;
    const totalEdges = consumedEdges + surfacedEdges;
    if (totalEdges >= 3 && consumedEdges / Math.max(1, totalEdges) < 0.3) {
      signals.push({
        kind: 'policy_inconsistency',
        score: 60,
        explanation: `${consumedEdges}/${totalEdges} consumer interactions resulted in local application — low conversion.`,
        observed_at: new Date().toISOString(),
      });
    }
  }

  // 6. Visibility fragmentation — when archetypes have very different
  //    visibility patterns across the org.
  if (registry.length >= 4) {
    const sourceCounts = registry.map(a => a.confidence.source_count);
    const meanSources = sourceCounts.reduce((s, v) => s + v, 0) / sourceCounts.length;
    const variance = sourceCounts.reduce((s, v) => s + (v - meanSources) ** 2, 0) / sourceCounts.length;
    if (variance > 4) {
      signals.push({
        kind: 'visibility_fragmentation',
        score: Math.min(100, Math.round(variance * 10)),
        explanation: `Archetype source-count variance ${variance.toFixed(1)} — uneven visibility.`,
        observed_at: new Date().toISOString(),
      });
    }
  }

  // Composite drift pressure score.
  const drift_pressure_score = signals.length === 0 ? 0 :
    Math.min(100, Math.round(signals.reduce((s, x) => s + x.score, 0) / signals.length));

  const tier = classifyTier(drift_pressure_score);

  return {
    organization_id: input.organization_id,
    tier,
    signals,
    drift_pressure_score,
    built_at: new Date().toISOString(),
  };
}

function classifyTier(score: number): FederationDriftTier {
  if (score >= HIGH_TIER_THRESHOLD) return 'unstable';
  if (score >= FRAGMENTING_TIER_THRESHOLD) return 'fragmenting';
  if (score >= MONITORING_TIER_THRESHOLD) return 'monitoring';
  return 'stable';
}

export const _DRIFT_TIER_THRESHOLDS_FOR_TESTS = {
  high: HIGH_TIER_THRESHOLD,
  fragmenting: FRAGMENTING_TIER_THRESHOLD,
  monitoring: MONITORING_TIER_THRESHOLD,
};
