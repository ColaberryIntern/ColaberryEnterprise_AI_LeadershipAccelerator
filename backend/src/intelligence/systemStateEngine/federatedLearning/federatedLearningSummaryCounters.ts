/**
 * federatedLearningSummaryCounters — Phase 20 in-memory rolling
 * counters used by the engine state's `federated_learning_summary`
 * block.
 *
 * Strictly sync, no DB reads. Counters reset on process restart;
 * GovernanceAuditEntry rows of the Phase 20 audit kinds remain
 * authoritative for history.
 */

import type {
  FederationDriftTier, FederatedLearningSummarySnapshot,
  FederatedLearningHealthScores, ArchetypeReliabilityTier,
} from './federatedLearningTypes';

interface ProjectFederatedLearningCounters {
  archetypes_tracked: number;
  archetypes_trusted: number;
  archetypes_degraded: number;
  active_drift_signals: number;
  drift_tier: FederationDriftTier;
  pending_policy_proposals: number;
  approved_policies_24h: number;
  rejected_policies_24h: number;
  // Health-score input counters
  recent_effectiveness_updates: number;
  recent_reliability_evolutions: number;
  recent_visibility_replays: number;
  recent_replay_inconsistencies: number;
  last_event_at: number;
}

const states = new Map<string, ProjectFederatedLearningCounters>();

function getOrInit(project_id: string): ProjectFederatedLearningCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      archetypes_tracked: 0,
      archetypes_trusted: 0,
      archetypes_degraded: 0,
      active_drift_signals: 0,
      drift_tier: 'stable',
      pending_policy_proposals: 0,
      approved_policies_24h: 0,
      rejected_policies_24h: 0,
      recent_effectiveness_updates: 0,
      recent_reliability_evolutions: 0,
      recent_visibility_replays: 0,
      recent_replay_inconsistencies: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteEffectivenessUpdated(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_effectiveness_updates++;
  s.last_event_at = Date.now();
}

export function noteReliabilityEvolved(project_id: string, newTier: ArchetypeReliabilityTier, isNewArchetype: boolean): void {
  const s = getOrInit(project_id);
  if (isNewArchetype) s.archetypes_tracked++;
  if (newTier === 'trusted') s.archetypes_trusted++;
  if (newTier === 'degraded') s.archetypes_degraded++;
  s.recent_reliability_evolutions++;
  s.last_event_at = Date.now();
}

export function noteDriftDetected(project_id: string, tier: FederationDriftTier, signalCount: number): void {
  const s = getOrInit(project_id);
  s.drift_tier = tier;
  s.active_drift_signals = signalCount;
  s.last_event_at = Date.now();
}

export function notePolicyProposed(project_id: string): void {
  const s = getOrInit(project_id);
  s.pending_policy_proposals++;
  s.last_event_at = Date.now();
}

export function notePolicyApproved(project_id: string): void {
  const s = getOrInit(project_id);
  s.pending_policy_proposals = Math.max(0, s.pending_policy_proposals - 1);
  s.approved_policies_24h++;
  s.last_event_at = Date.now();
}

export function notePolicyRejected(project_id: string): void {
  const s = getOrInit(project_id);
  s.pending_policy_proposals = Math.max(0, s.pending_policy_proposals - 1);
  s.rejected_policies_24h++;
  s.last_event_at = Date.now();
}

export function noteVisibilityReplay(project_id: string, hasInconsistencies: boolean): void {
  const s = getOrInit(project_id);
  s.recent_visibility_replays++;
  if (hasInconsistencies) s.recent_replay_inconsistencies++;
  s.last_event_at = Date.now();
}

export function readFederatedLearningSummary(project_id: string): FederatedLearningSummarySnapshot {
  const s = getOrInit(project_id);
  return {
    archetypes_tracked: s.archetypes_tracked,
    archetypes_trusted: s.archetypes_trusted,
    archetypes_degraded: s.archetypes_degraded,
    active_drift_signals: s.active_drift_signals,
    drift_tier: s.drift_tier,
    pending_policy_proposals: s.pending_policy_proposals,
    approved_policies_24h: s.approved_policies_24h,
    rejected_policies_24h: s.rejected_policies_24h,
    health_scores: computeHealthScores(s),
  };
}

function computeHealthScores(s: ProjectFederatedLearningCounters): FederatedLearningHealthScores {
  // Federated effectiveness: more recent effectiveness updates without
  // proportional drift = higher score.
  const federated_effectiveness = s.recent_effectiveness_updates === 0 ? 100
    : Math.max(0, Math.min(100, Math.round(100 - (s.archetypes_degraded / Math.max(1, s.archetypes_tracked)) * 100)));

  // Organizational stabilization: ratio of trusted to tracked.
  const organizational_stabilization = s.archetypes_tracked === 0 ? 100
    : Math.round((s.archetypes_trusted / s.archetypes_tracked) * 100);

  // Federation drift pressure: based on tier (lower = better).
  const federation_drift_pressure =
    s.drift_tier === 'stable' ? 10 :
    s.drift_tier === 'monitoring' ? 30 :
    s.drift_tier === 'fragmenting' ? 60 :
    s.drift_tier === 'unstable' ? 90 : 0;

  // Archetype reliability: ratio of trusted+stable among tracked.
  const archetype_reliability = s.archetypes_tracked === 0 ? 100
    : Math.round(((s.archetypes_trusted) / s.archetypes_tracked) * 100);

  // Visibility integrity: inverse ratio of inconsistencies.
  const federation_visibility_integrity = s.recent_visibility_replays === 0 ? 100
    : Math.max(0, 100 - Math.round((s.recent_replay_inconsistencies / s.recent_visibility_replays) * 100));

  // Policy evolution stability: fewer rejections and pending = more stable.
  const totalPolicyDecisions = s.approved_policies_24h + s.rejected_policies_24h;
  const policy_evolution_stability = totalPolicyDecisions === 0 ? 100
    : Math.round((s.approved_policies_24h / Math.max(1, totalPolicyDecisions)) * 100);

  return {
    federated_effectiveness,
    organizational_stabilization,
    federation_drift_pressure,
    archetype_reliability,
    federation_visibility_integrity,
    policy_evolution_stability,
  };
}

export function _resetFederatedLearningSummary(): void {
  states.clear();
}
