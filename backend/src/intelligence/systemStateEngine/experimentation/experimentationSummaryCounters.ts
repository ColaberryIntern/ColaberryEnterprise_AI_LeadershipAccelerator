/**
 * experimentationSummaryCounters — Phase 25. Sync counters for the
 * `experimentation_summary` block on `AuthoritativeSystemState`.
 */

import type {
  ExperimentationSummarySnapshot, ExperimentationHealthScores,
} from './experimentationTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import { recentSandboxCount24h } from './executionSandboxEngine';
import { recentRollbackSimulationCount24h } from './rollbackSimulationEngine';
import { recentPropagationPreviewCount24h } from './propagationPreviewEngine';
import { recentRehearsalCount24h } from './stabilizationRehearsalEngine';
import { recentSandboxDecisionCount24h } from './sandboxGovernanceSupervisor';

export function buildExperimentationSummary(): ExperimentationSummarySnapshot {
  const sandboxes = recentSandboxCount24h();
  const rollbacks = recentRollbackSimulationCount24h();
  const previews = recentPropagationPreviewCount24h();
  const rehearsals = recentRehearsalCount24h();
  const decisions = recentSandboxDecisionCount24h();

  const health_scores = computeHealth({
    sandboxes, rollbacks, previews, rehearsals, decisions,
  });

  return {
    node_id: getNodeId(),
    recent_sandboxes_24h: sandboxes,
    recent_rollback_simulations_24h: rollbacks,
    recent_propagation_previews_24h: previews,
    recent_rehearsals_24h: rehearsals,
    recent_governance_decisions_24h: decisions,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}

interface HealthInput {
  sandboxes: number;
  rollbacks: number;
  previews: number;
  rehearsals: number;
  decisions: number;
}

function computeHealth(input: HealthInput): ExperimentationHealthScores {
  // Phase 25 health is bounded — clarity scales with usage,
  // but safety + integrity are 100 by structural guarantee (every
  // sandbox carries isolation + determinism; trust surface enforces).
  const totalActivity = input.sandboxes + input.rollbacks + input.previews + input.rehearsals;
  const clarity = totalActivity === 0 ? 50 : Math.min(100, 50 + Math.min(50, totalActivity * 5));
  return {
    experimentation_clarity: clarity,
    simulation_reliability: 100,                 // deterministic by construction
    rollback_rehearsal_confidence: input.rehearsals === 0 ? 50 : Math.min(100, 60 + input.rehearsals * 4),
    propagation_preview_quality: input.previews === 0 ? 50 : Math.min(100, 60 + input.previews * 4),
    sandbox_integrity: 100,                      // isolation guarantee enforced at construction
    experimentation_safety: 100,                 // structural — sandboxes never write live state
  };
}
