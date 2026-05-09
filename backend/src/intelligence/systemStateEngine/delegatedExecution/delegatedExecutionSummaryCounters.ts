/**
 * delegatedExecutionSummaryCounters — Phase 27. Sync counters for the
 * `delegated_execution_summary` block on `AuthoritativeSystemState`.
 */

import type {
  DelegatedExecutionSummarySnapshot, DelegatedExecutionHealthScores,
} from './delegatedExecutionTypes';
import { getNodeId } from '../distributedRuntime/distributedBrokerRuntime';
import { recentEnvelopeCount24h } from './authorityEnvelopeEngine';
import {
  recentExecutionCount24h, recentRefusalCount24h,
  recentTimeoutCount24h, recentExpirationCount24h,
} from './delegatedExecutionCoordinator';
import { recentDelegatedDecisionCount24h } from './delegatedExecutionGovernance';

export function buildDelegatedExecutionSummary(): DelegatedExecutionSummarySnapshot {
  const envelopes = recentEnvelopeCount24h();
  const executions = recentExecutionCount24h();
  const refusals = recentRefusalCount24h();
  const timeouts = recentTimeoutCount24h();
  const expirations = recentExpirationCount24h();
  const decisions = recentDelegatedDecisionCount24h();

  const health_scores = computeHealth({
    envelopes, executions, refusals, timeouts, expirations,
  });

  return {
    node_id: getNodeId(),
    recent_envelopes_24h: envelopes,
    recent_executions_24h: executions,
    recent_refusals_24h: refusals,
    recent_timeouts_24h: timeouts,
    recent_expirations_24h: expirations,
    recent_governance_decisions_24h: decisions,
    health_scores,
    last_updated: new Date().toISOString(),
  };
}

interface HealthInput {
  envelopes: number;
  executions: number;
  refusals: number;
  timeouts: number;
  expirations: number;
}

function computeHealth(input: HealthInput): DelegatedExecutionHealthScores {
  const totalActivity = input.executions + input.refusals + input.timeouts;
  const successRate = totalActivity === 0 ? 1 : input.executions / totalActivity;
  const delegation_confidence = Math.round(successRate * 100);

  return {
    delegation_confidence,
    rollback_certainty: 100,                    // structural — every envelope requires rollback chain
    containment_integrity: 100,                 // structural — typed-as-true containment
    authority_reliability: 100,                 // structural — typed-as-true single_use + max_action_count=1
    budget_safety: input.timeouts === 0 ? 100 : Math.max(50, 100 - input.timeouts * 10),
    replay_integrity: 100,                      // structural — SHA-256 chain on every trace
  };
}
