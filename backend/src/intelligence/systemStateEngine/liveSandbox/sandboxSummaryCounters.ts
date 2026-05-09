/**
 * sandboxSummaryCounters — Phase 26. Sync counters for the
 * `live_sandbox_summary` block on `AuthoritativeSystemState`.
 */

import type {
  LiveSandboxSummarySnapshot, LiveSandboxHealthScores,
} from './liveSandboxTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import {
  activeRuntimeCount, recentRuntimeCount24h, recentExpirationCount24h,
} from './ephemeralWorkerRuntime';
import { recentSandboxRollbackRehearsalCount24h } from './sandboxRollbackRehearsal';
import { recentSandboxPreviewNarrativeCount24h } from './sandboxPreviewNarrativeBuilder';
import { recentLiveSandboxDecisionCount24h } from './sandboxGovernanceSupervisor';

export function buildLiveSandboxSummary(): LiveSandboxSummarySnapshot {
  const active = activeRuntimeCount();
  const runtimes = recentRuntimeCount24h();
  const rollbacks = recentSandboxRollbackRehearsalCount24h();
  const previews = recentSandboxPreviewNarrativeCount24h();
  const decisions = recentLiveSandboxDecisionCount24h();
  const expirations = recentExpirationCount24h();

  const health_scores = computeHealth({ active, runtimes, rollbacks, previews, decisions, expirations });

  return {
    node_id: getNodeId(),
    active_runtimes: active,
    recent_runtimes_24h: runtimes,
    recent_rollback_rehearsals_24h: rollbacks,
    recent_preview_narratives_24h: previews,
    recent_governance_decisions_24h: decisions,
    recent_expirations_24h: expirations,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}

function computeHealth(input: {
  active: number; runtimes: number; rollbacks: number; previews: number;
  decisions: number; expirations: number;
}): LiveSandboxHealthScores {
  const totalActivity = input.runtimes + input.rollbacks + input.previews;
  const clarity = totalActivity === 0 ? 50 : Math.min(100, 50 + Math.min(50, totalActivity * 4));
  return {
    sandbox_execution_clarity: clarity,
    rehearsal_determinism: 100,                       // structural — every runtime has SHA-256 chain
    rollback_rehearsal_confidence: input.rollbacks === 0 ? 50 : Math.min(100, 60 + input.rollbacks * 4),
    topology_containment_stability: 100,             // structural — typed-true detachment_proofs
    live_preview_trust: input.previews === 0 ? 50 : Math.min(100, 60 + input.previews * 4),
    sandbox_replay_reliability: 100,                 // structural — deterministic hash chain
  };
}
