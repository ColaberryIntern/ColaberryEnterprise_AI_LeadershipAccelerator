/**
 * executionSummaryCounters — Phase 23. Sync counters for the
 * `execution_substrate_summary` block on `AuthoritativeSystemState`.
 *
 * Architectural commitment:
 *   - Sync, in-memory; never reads DB.
 *   - Aggregates across all partitions on this single node.
 */

import type {
  ExecutionSubstrateSummarySnapshot, ExecutionHealthScores,
} from './executionSubstrateTypes';
import {
  activeWorkerCount, recentLifecycleCount24h, listAllOrganizations,
} from './executionRuntimeCoordinator';
import { buildIsolationProfile } from './executionIsolationEngine';
import { recentDecisionCount24h } from './executionGovernanceSupervisor';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';

export function buildExecutionSubstrateSummary(): ExecutionSubstrateSummarySnapshot {
  const activeCount = activeWorkerCount();
  const counts = recentLifecycleCount24h();
  const isolation = buildIsolationProfile();
  const decisions24h = recentDecisionCount24h();
  const health_scores = computeHealth({
    active: activeCount,
    completed: counts.completed,
    failed: counts.failed,
    interrupted: counts.interrupted,
    rolled_back: counts.rolled_back,
    isolated: isolation.active_isolation_count,
    organizations: listAllOrganizations().length,
  });
  return {
    node_id: getNodeId(),
    active_worker_count: activeCount,
    completed_24h: counts.completed,
    failed_24h: counts.failed,
    interrupted_24h: counts.interrupted,
    rolled_back_24h: counts.rolled_back,
    active_isolation_count: isolation.active_isolation_count,
    recent_governance_decisions_24h: decisions24h,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}

interface HealthInput {
  active: number;
  completed: number;
  failed: number;
  interrupted: number;
  rolled_back: number;
  isolated: number;
  organizations: number;
}

function computeHealth(input: HealthInput): ExecutionHealthScores {
  const totalLifecycle = input.completed + input.failed + input.interrupted + input.rolled_back;
  const continuity = totalLifecycle === 0
    ? 100
    : Math.max(0, Math.round(100 - ((input.failed + input.interrupted) / totalLifecycle) * 100));
  const rollback_resilience = input.rolled_back === 0 ? 100 : Math.max(0, 100 - input.rolled_back * 5);
  const worker_stability = totalLifecycle === 0
    ? 100
    : Math.max(0, Math.round((input.completed / totalLifecycle) * 100));
  const isolation_score = input.organizations === 0
    ? 100
    : Math.max(0, Math.round(100 - (input.isolated / Math.max(1, input.organizations * 4)) * 100));
  const replay_integrity = 100;          // sync, in-memory; replay is deterministic
  const governance_stability = totalLifecycle === 0
    ? 100
    : Math.max(0, Math.round(100 - ((input.failed + input.interrupted + input.rolled_back) / totalLifecycle) * 60));
  return {
    execution_continuity: continuity,
    rollback_resilience,
    worker_stability,
    execution_isolation: isolation_score,
    replay_execution_integrity: replay_integrity,
    execution_governance_stability: governance_stability,
  };
}
