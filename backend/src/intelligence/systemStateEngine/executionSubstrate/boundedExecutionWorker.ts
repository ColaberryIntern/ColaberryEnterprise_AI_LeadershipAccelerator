/**
 * boundedExecutionWorker — Phase 23. Helper that wraps an async
 * worker function with the registration → markRunning → markCompleted /
 * markFailed lifecycle.
 *
 * Architectural commitment:
 *   - This is OPT-IN. Existing scripts/services don't have to use it.
 *   - It does not spawn threads, processes, or background tasks. The
 *     wrapped function still runs in the calling context.
 *   - Heartbeats fire on a setInterval the wrapper owns. The wrapper
 *     clears the interval on terminate.
 */

import {
  registerWorker, markRunning, markCompleted, markFailed, recordHeartbeat,
  getEnvelope,
} from './executionRuntimeCoordinator';
import type { RegisterWorkerInput } from './executionRuntimeCoordinator';
import type { ExecutionWorkerEnvelope } from './executionSubstrateTypes';

export interface BoundedExecutionResult<T> {
  readonly registered: boolean;
  readonly envelope: ExecutionWorkerEnvelope | null;
  readonly outcome: 'completed' | 'failed' | 'rejected';
  readonly value?: T;
  readonly error?: unknown;
  readonly rejection_reason?: string;
}

export interface RunBoundedInput<T> extends RegisterWorkerInput {
  readonly run: (envelope: ExecutionWorkerEnvelope) => Promise<T>;
  readonly heartbeat_interval_ms?: number;
}

/**
 * Wraps an async function in the Phase 23 substrate. Returns a result
 * envelope describing whether the worker was permitted, ran, completed,
 * or failed. Never throws — wraps any thrown error into the result.
 */
export async function runBoundedWorker<T>(input: RunBoundedInput<T>): Promise<BoundedExecutionResult<T>> {
  const reg = registerWorker(input);
  if (!reg.permitted) {
    return {
      registered: false,
      envelope: null,
      outcome: 'rejected',
      rejection_reason: `${reg.decision}:${reg.reason}`,
    };
  }
  const envelope = reg.envelope;
  markRunning(envelope.worker_id);

  const interval = input.heartbeat_interval_ms ?? 60_000;
  const heartbeatTimer = setInterval(() => {
    try { recordHeartbeat(envelope.worker_id); } catch { /* swallow */ }
  }, interval);
  // Heartbeat timer should never keep the process alive on its own.
  if (typeof (heartbeatTimer as any).unref === 'function') (heartbeatTimer as any).unref();

  try {
    const value = await input.run(envelope);
    markCompleted(envelope.worker_id, 'wrapped_run_completed');
    return { registered: true, envelope: getEnvelope(envelope.worker_id) ?? envelope, outcome: 'completed', value };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    markFailed(envelope.worker_id, reason);
    return { registered: true, envelope: getEnvelope(envelope.worker_id) ?? envelope, outcome: 'failed', error: err };
  } finally {
    clearInterval(heartbeatTimer);
  }
}
