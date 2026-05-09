/**
 * executionContinuityTracker — Phase 23. VISIBILITY ONLY.
 *
 * Architectural commitment:
 *   - Detects stalled workers (heartbeat timeout) and interrupted-on-boot
 *     workers (those flipped at process boot).
 *   - Never auto-resumes. Operators decide whether to re-run.
 *   - Builds a deterministic `ExecutionContinuityReplay` of the most
 *     recent N envelopes per organization.
 */

import { randomUUID } from 'crypto';
import type {
  ExecutionContinuityReplay, ExecutionWorkerEnvelope,
} from './executionSubstrateTypes';
import { HEARTBEAT_TIMEOUT_MS, RECENT_VISIBILITY_LIMIT } from './executionSubstrateTypes';
import {
  listEnvelopes, sweepStalledWorkers,
} from './executionRuntimeCoordinator';

export interface BuildContinuityReplayInput {
  readonly organization_id: string;
  readonly limit?: number;
}

export function buildExecutionContinuityReplay(input: BuildContinuityReplayInput): ExecutionContinuityReplay {
  // Run a stalled-worker sweep first so the visibility surface is fresh.
  const sweepedNow = sweepStalledWorkers();

  const envelopes = listEnvelopes(input.organization_id);
  const limit = Math.max(1, Math.min(100, input.limit ?? RECENT_VISIBILITY_LIMIT));
  const recent = envelopes.slice(-limit).reverse();

  const entries = recent.map(env => ({
    worker_id: env.worker_id,
    kind: env.kind,
    lifecycle_state: env.lifecycle_state,
    attribution_count: env.attribution.length,
    last_transition_at: env.attribution[env.attribution.length - 1]?.recorded_at ?? env.started_at,
    explanation: explanationFor(env),
  }));

  // Stalled = currently running but heartbeat older than timeout.
  const now = Date.now();
  const stalled_workers = envelopes
    .filter(e => e.lifecycle_state === 'running')
    .filter(e => {
      const ref = e.last_heartbeat_at ? Date.parse(e.last_heartbeat_at) : Date.parse(e.started_at);
      return now - ref > HEARTBEAT_TIMEOUT_MS;
    })
    .map(e => e.worker_id);

  const interrupted_on_boot = envelopes
    .filter(e => e.lifecycle_state === 'interrupted')
    .filter(e => e.attribution.some(a => a.transition === 'interrupted' && (a.note ?? '').includes('boot')))
    .map(e => e.worker_id);

  // include any worker we just swept (in case caller wants the freshly-flipped ids).
  const stalledSet = new Set([...stalled_workers, ...sweepedNow]);

  return {
    organization_id: input.organization_id,
    replay_id: `cont_${randomUUID()}`,
    entries,
    stalled_workers: Array.from(stalledSet),
    interrupted_on_boot,
    built_at: new Date().toISOString(),
  };
}

function explanationFor(env: ExecutionWorkerEnvelope): string {
  switch (env.lifecycle_state) {
    case 'pending':
      return `worker ${env.worker_id} (kind=${env.kind}) is registered but has not yet started`;
    case 'running':
      return `worker ${env.worker_id} (kind=${env.kind}) is running; ${env.attribution.length} lifecycle transitions recorded`;
    case 'completed':
      return `worker ${env.worker_id} (kind=${env.kind}) completed successfully`;
    case 'failed':
      return `worker ${env.worker_id} (kind=${env.kind}) failed: ${env.failure_reason ?? 'unknown'}`;
    case 'interrupted':
      return `worker ${env.worker_id} (kind=${env.kind}) was interrupted (likely heartbeat timeout or process boot)`;
    case 'rolled_back':
      return `worker ${env.worker_id} (kind=${env.kind}) was rolled back via the rollback execution coordinator`;
  }
}
