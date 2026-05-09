/**
 * executionBudgetGovernor — Phase 27. Bounded execution budget +
 * timeout enforcement.
 *
 * Architectural commitment:
 *   - Hard caps: max_action_count=1, max_concurrency=1.
 *   - Hard timeout via Promise.race; permanent envelope invalidation
 *     on exhaustion.
 *   - No retries, no extensions, no partial-completion continuation.
 */

import { createHash } from 'crypto';
import type {
  ExecutionBudgetProfile, DelegatedExecutionTimeoutBounds,
} from './delegatedExecutionTypes';
import {
  MAX_EXECUTION_TIMEOUT_MS, DEFAULT_EXECUTION_TIMEOUT_MS,
  MAX_TOPOLOGY_PROPAGATION_DEPTH, MAX_ROLLBACK_CHAIN_DEPTH,
  REPLAY_RETENTION_PER_ENVELOPE,
} from './delegatedExecutionTypes';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildBudgetInput {
  readonly envelope_id: string;
  readonly timeout_ms?: number;
}

export function buildExecutionBudgetProfile(input: BuildBudgetInput): ExecutionBudgetProfile {
  const max_runtime_ms = Math.min(input.timeout_ms ?? DEFAULT_EXECUTION_TIMEOUT_MS, MAX_EXECUTION_TIMEOUT_MS);
  const compliance_input = `${input.envelope_id}::${max_runtime_ms}::actions=1::concurrency=1`;
  return {
    envelope_id: input.envelope_id,
    max_action_count: 1,
    max_runtime_ms,
    max_topology_propagation_depth: MAX_TOPOLOGY_PROPAGATION_DEPTH,
    max_rollback_chain_depth: MAX_ROLLBACK_CHAIN_DEPTH,
    max_concurrency: 1,
    replay_retention_count: REPLAY_RETENTION_PER_ENVELOPE,
    budget_consumed: { actions_executed: 0, runtime_ms_consumed: 0 },
    budget_exhausted: false,
    compliance_hash: deterministicHash(compliance_input),
  };
}

export function buildTimeoutBounds(envelope_id: string, timeout_ms: number, started_at: string): DelegatedExecutionTimeoutBounds {
  return {
    envelope_id,
    timeout_ms,
    started_at,
    timeout_triggered: false,
    rollback_verification_completed: false,
  };
}

/**
 * Run an async operation with hard timeout. On timeout, the envelope
 * is permanently invalidated by the caller.
 */
export async function runWithHardTimeout<T>(
  operation: Promise<T>,
  timeout_ms: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'timeout' }> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<{ ok: false; reason: 'timeout' }>(resolve => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeout_ms);
    if (timer && typeof (timer as any).unref === 'function') (timer as any).unref();
  });
  try {
    const result = await Promise.race([
      operation.then(value => ({ ok: true as const, value })),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Update a budget profile after execution to reflect consumption. */
export function recordBudgetConsumption(
  profile: ExecutionBudgetProfile,
  actions_executed: number,
  runtime_ms_consumed: number,
): ExecutionBudgetProfile {
  const exhausted = actions_executed >= profile.max_action_count
    || runtime_ms_consumed >= profile.max_runtime_ms;
  return {
    ...profile,
    budget_consumed: { actions_executed, runtime_ms_consumed },
    budget_exhausted: exhausted,
  };
}
