/**
 * governanceMemorySummaryCounters — Phase 31. Summary counters for
 * `governance_memory_summary` block on `AuthoritativeSystemState`.
 */

import type {
  GovernanceMemorySummarySnapshot, GovernanceMemoryHealthScores,
  MemoryDensityTier,
} from './governanceMemoryTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import {
  recentSessionCount24h, recentEventCount24h,
} from './stabilizationSessionTimeline';
import { recentArchaeologyCount24h } from './governanceArchaeologyEngine';
import { recentReplayCount24h } from './reasoningContinuityReplay';
import { recentCompressionCount24h } from './operatorReasoningCompression';
import { recentContinuityNarrativeCount24h } from './continuityNarrativeBuilder';
import { recentMemoryGovernanceCount24h } from './governanceMemorySupervisor';

export function buildGovernanceMemorySummary(
  organization_id?: string,
): GovernanceMemorySummarySnapshot {
  const recent_sessions_24h = recentSessionCount24h(organization_id);
  const recent_events_24h = recentEventCount24h(organization_id);
  const recent_archaeology_24h = recentArchaeologyCount24h(organization_id);
  const recent_replays_24h = recentReplayCount24h(organization_id);
  const recent_compressions_24h = recentCompressionCount24h(organization_id);
  const recent_narratives_24h = recentContinuityNarrativeCount24h(organization_id);
  const recent_governance_decisions_24h = recentMemoryGovernanceCount24h(organization_id);

  let current_density_tier: MemoryDensityTier = 'sparse';
  if (recent_events_24h >= 2000) current_density_tier = 'compressed';
  else if (recent_events_24h >= 500) current_density_tier = 'dense';
  else if (recent_events_24h >= 100) current_density_tier = 'developed';
  else if (recent_events_24h >= 25) current_density_tier = 'partial';

  const health_scores: GovernanceMemoryHealthScores = {
    memory_neutrality: 100,                                    // structural
    continuity_integrity: recent_events_24h > 0 ? 100 : 80,
    timeline_visibility: recent_sessions_24h > 0 ? 100 : 80,
    archaeology_integrity: 100,                                // structural
    compression_transparency: 100,                             // structural
    replay_determinism: 100,                                   // structural
  };

  return {
    node_id: getNodeId(),
    recent_sessions_24h,
    recent_events_24h,
    recent_archaeology_24h,
    recent_replays_24h,
    recent_compressions_24h,
    recent_narratives_24h,
    recent_governance_decisions_24h,
    current_density_tier,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}
