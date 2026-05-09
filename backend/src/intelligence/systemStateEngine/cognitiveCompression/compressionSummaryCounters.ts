/**
 * compressionSummaryCounters — Phase 24. Sync counters for the
 * `cognitive_compression_summary` block on `AuthoritativeSystemState`.
 *
 * Architectural commitment:
 *   - Sync, in-memory; never reads DB.
 *   - Aggregates across all partitions on this single node.
 */

import type {
  CognitiveCompressionSummarySnapshot, CognitiveCompressionHealthScores,
} from './cognitiveCompressionTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import { recentNarrativeCount24h } from './operationalNarrativeBuilder';
import { recentGuidancePlanCount24h } from './operatorGuidanceOrchestrator';
import { buildCognitiveLoadProfile } from './cognitiveLoadAnalyzer';
import { listExecutionOrganizations } from './indexCompat';

/**
 * Aggregate cognitive load across cached organizations. Returns the
 * worst tier seen — operators care about the highest load partition.
 */
function worstLoad(): { tier: import('./cognitiveCompressionTypes').CognitiveLoadTier; load_score: number } {
  const orgs = listExecutionOrganizations();
  if (orgs.length === 0) return { tier: 'light', load_score: 0 };
  const profiles = orgs.map(o => buildCognitiveLoadProfile({ organization_id: o }));
  let worst = profiles[0];
  for (const p of profiles) {
    if (p.load_score > worst.load_score) worst = p;
  }
  return { tier: worst.tier, load_score: worst.load_score };
}

export function buildCognitiveCompressionSummary(): CognitiveCompressionSummarySnapshot {
  const narratives = recentNarrativeCount24h();
  const plans = recentGuidancePlanCount24h();
  const load = worstLoad();
  const health_scores = computeHealth({
    narratives,
    plans,
    load_score: load.load_score,
  });
  return {
    node_id: getNodeId(),
    recent_narratives_24h: narratives,
    recent_compressed_replays_24h: narratives,         // 1:1 today
    recent_guidance_plans_24h: plans,
    current_load_tier: load.tier,
    current_load_score: load.load_score,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}

function computeHealth(input: { narratives: number; plans: number; load_score: number }): CognitiveCompressionHealthScores {
  // Operational clarity scales inversely with load and directly with
  // recent narrative + guidance activity (more compression = clearer view).
  const clarity = Math.max(0, 100 - input.load_score);
  const trust = Math.max(0, 100 - Math.round(input.load_score * 0.6));
  return {
    operational_clarity: clarity,
    replay_comprehensibility: input.narratives === 0 ? 50 : Math.min(100, 50 + Math.min(50, input.narratives * 5)),
    rollback_explainability: 100,            // every rollback narrative cites source chain IDs
    continuity_visibility: 100,              // continuity tracker is visibility-only by design
    topology_understandability: clarity,
    operator_trust: trust,
  };
}
