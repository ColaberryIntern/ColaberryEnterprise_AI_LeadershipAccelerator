/**
 * executionRuntimeCoordinator — Phase 23. Top-level orchestrator for
 * the bounded execution visibility + governance substrate.
 *
 * Architectural commitment:
 *   - Workers OPT IN via `registerWorker`. Returns either a registered
 *     `ExecutionWorkerEnvelope` or a rejection result with attribution.
 *   - All lifecycle transitions (markRunning / markCompleted / markFailed
 *     / markInterrupted / markRolledBack / recordHeartbeat) are explicit
 *     and validated.
 *   - Bounded ring buffer per (organization_id, kind) bucket.
 *   - On process boot (i.e., the first call after `_resetForTests` or
 *     a fresh import), envelopes that were `running` are flipped to
 *     `interrupted` — visibility only, never auto-resumed.
 */

import { randomUUID } from 'crypto';
import type {
  ExecutionWorkerEnvelope, ExecutionLifecycleTier, ExecutionWorkerKind,
  ExecutionBoundedEnvelope,
} from './executionSubstrateTypes';
import {
  MAX_WORKER_ENVELOPES_PER_PARTITION, HEARTBEAT_TIMEOUT_MS,
} from './executionSubstrateTypes';
import {
  evaluateRegistration, evaluateEnvelopeBreach,
} from './executionGovernanceSupervisor';
import {
  isIsolated, recordFailure as isolationRecordFailure, recordSuccess as isolationRecordSuccess,
} from './executionIsolationEngine';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

interface PartitionStore {
  envelopes: ExecutionWorkerEnvelope[];      // ring buffer
}

const partitions = new Map<string, PartitionStore>();
const lifecycleEventCounts: { completed24h: number[]; failed24h: number[]; interrupted24h: number[]; rolled_back24h: number[] } = {
  completed24h: [], failed24h: [], interrupted24h: [], rolled_back24h: [],
};

function ensure(organization_id: string): PartitionStore {
  let p = partitions.get(organization_id);
  if (!p) {
    p = { envelopes: [] };
    partitions.set(organization_id, p);
  }
  return p;
}

function pruneCounts(now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  for (const arr of [lifecycleEventCounts.completed24h, lifecycleEventCounts.failed24h, lifecycleEventCounts.interrupted24h, lifecycleEventCounts.rolled_back24h]) {
    while (arr.length > 0 && arr[0] < cutoff) arr.shift();
  }
}

function bumpCount(state: ExecutionLifecycleTier): void {
  const now = Date.now();
  pruneCounts(now);
  if (state === 'completed') lifecycleEventCounts.completed24h.push(now);
  else if (state === 'failed') lifecycleEventCounts.failed24h.push(now);
  else if (state === 'interrupted') lifecycleEventCounts.interrupted24h.push(now);
  else if (state === 'rolled_back') lifecycleEventCounts.rolled_back24h.push(now);
}

export interface RegisterWorkerInput {
  readonly kind: ExecutionWorkerKind;
  readonly organization_id: string;
  readonly project_id?: string;
  readonly scope_summary: string;
  readonly bounded_envelope: ExecutionBoundedEnvelope;
  readonly parent_worker_id?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type RegisterWorkerResult =
  | { permitted: true; envelope: ExecutionWorkerEnvelope }
  | { permitted: false; decision: 'rejected' | 'isolated'; reason: string; supervisor_rule_violated?: string };

/** Voluntary registration. Workers opt in. */
export function registerWorker(input: RegisterWorkerInput): RegisterWorkerResult {
  const worker_id = `worker_${randomUUID()}`;
  const parent = input.parent_worker_id ? findEnvelope(input.parent_worker_id) : null;
  const parent_depth = parent ? parent.parent_depth + 1 : 0;
  const isolated = isIsolated(input.kind, input.organization_id);

  const result = evaluateRegistration({
    worker_id,
    kind: input.kind,
    organization_id: input.organization_id,
    bounded_envelope: input.bounded_envelope,
    parent_depth,
    is_isolated: isolated,
  });

  if (result.decision !== 'permitted' && result.decision !== 'flagged') {
    return {
      permitted: false,
      decision: result.decision === 'isolated' ? 'isolated' : 'rejected',
      reason: result.reason,
      supervisor_rule_violated: result.supervisor_rule_violated,
    };
  }

  const now = new Date().toISOString();
  const envelope: ExecutionWorkerEnvelope = {
    worker_id,
    kind: input.kind,
    organization_id: input.organization_id,
    project_id: input.project_id,
    started_at: now,
    scope_summary: input.scope_summary,
    bounded_envelope: input.bounded_envelope,
    parent_worker_id: input.parent_worker_id,
    parent_depth,
    lifecycle_state: 'pending',
    attribution: [{ recorded_at: now, transition: 'pending', note: 'registered_by_supervisor' }],
    metadata: input.metadata,
  };

  const store = ensure(input.organization_id);
  store.envelopes.push(envelope);
  if (store.envelopes.length > MAX_WORKER_ENVELOPES_PER_PARTITION) store.envelopes.shift();

  try {
    publishCognitiveEvent({
      kind: 'worker.started',
      project_id: input.project_id ?? 'system',
      severity: 'info',
      payload: { worker_id, kind: input.kind, organization_id: input.organization_id },
    });
  } catch { /* noop */ }

  return { permitted: true, envelope };
}

/** Transition pending → running. */
export function markRunning(worker_id: string): ExecutionWorkerEnvelope | null {
  return transition(worker_id, 'running', 'lifecycle_running');
}

/** Transition running → completed. Records isolation success. */
export function markCompleted(worker_id: string, note?: string): ExecutionWorkerEnvelope | null {
  const env = transition(worker_id, 'completed', note ?? 'lifecycle_completed');
  if (env) {
    isolationRecordSuccess(env.kind, env.organization_id);
    bumpCount('completed');
  }
  return env;
}

/** Transition → failed. Records isolation failure (may trigger circuit breaker). */
export function markFailed(worker_id: string, failure_reason: string): ExecutionWorkerEnvelope | null {
  const env = transition(worker_id, 'failed', failure_reason);
  if (env) {
    const triggered = isolationRecordFailure(env.kind, env.organization_id);
    bumpCount('failed');
    if (triggered) {
      try {
        publishCognitiveEvent({
          kind: 'execution.isolated',
          project_id: env.project_id ?? 'system',
          severity: 'warning',
          payload: { worker_id, kind: env.kind, organization_id: env.organization_id, failure_reason },
        });
      } catch { /* noop */ }
    }
  }
  return env;
}

/** Transition → interrupted. */
export function markInterrupted(worker_id: string, note?: string): ExecutionWorkerEnvelope | null {
  const env = transition(worker_id, 'interrupted', note ?? 'lifecycle_interrupted');
  if (env) bumpCount('interrupted');
  return env;
}

/** Transition → rolled_back. */
export function markRolledBack(worker_id: string, rollback_chain_id: string): ExecutionWorkerEnvelope | null {
  const env = transition(worker_id, 'rolled_back', `rolled_back_via_chain:${rollback_chain_id}`);
  if (env) bumpCount('rolled_back');
  return env;
}

/** Heartbeat. Returns the current envelope, or null if not found. */
export function recordHeartbeat(worker_id: string): ExecutionWorkerEnvelope | null {
  const env = findEnvelope(worker_id);
  if (!env) return null;
  if (env.lifecycle_state !== 'pending' && env.lifecycle_state !== 'running') return env;
  // Mutate in place via replacement.
  const updated: ExecutionWorkerEnvelope = {
    ...env,
    last_heartbeat_at: new Date().toISOString(),
  };
  replaceEnvelope(updated);

  // Envelope-breach check.
  const elapsed = Date.now() - Date.parse(env.started_at);
  const breach = evaluateEnvelopeBreach({
    worker_id,
    kind: env.kind,
    organization_id: env.organization_id,
    duration_so_far_ms: elapsed,
    max_duration_ms: env.bounded_envelope.max_duration_ms,
  });
  if (breach) {
    try {
      publishCognitiveEvent({
        kind: 'execution.degraded',
        project_id: env.project_id ?? 'system',
        severity: 'warning',
        payload: { worker_id, kind: env.kind, reason: breach.reason },
      });
    } catch { /* noop */ }
  }
  return updated;
}

/** Sweep: any envelope past heartbeat timeout in `running` state → interrupted. */
export function sweepStalledWorkers(): ReadonlyArray<string> {
  const now = Date.now();
  const flipped: string[] = [];
  for (const store of partitions.values()) {
    for (let i = 0; i < store.envelopes.length; i++) {
      const env = store.envelopes[i];
      if (env.lifecycle_state !== 'running') continue;
      const ref = env.last_heartbeat_at ? Date.parse(env.last_heartbeat_at) : Date.parse(env.started_at);
      if (now - ref > HEARTBEAT_TIMEOUT_MS) {
        const updated = applyTransition(env, 'interrupted', 'heartbeat_timeout');
        store.envelopes[i] = updated;
        flipped.push(env.worker_id);
        bumpCount('interrupted');
        try {
          publishCognitiveEvent({
            kind: 'worker.interrupted',
            project_id: env.project_id ?? 'system',
            severity: 'warning',
            payload: { worker_id: env.worker_id, kind: env.kind, reason: 'heartbeat_timeout' },
          });
        } catch { /* noop */ }
      }
    }
  }
  return flipped;
}

/** Boot-time: flip any `running` or `pending` envelope to `interrupted`. */
export function flipRunningToInterruptedOnBoot(): ReadonlyArray<string> {
  const flipped: string[] = [];
  for (const store of partitions.values()) {
    for (let i = 0; i < store.envelopes.length; i++) {
      const env = store.envelopes[i];
      if (env.lifecycle_state === 'running' || env.lifecycle_state === 'pending') {
        const updated = applyTransition(env, 'interrupted', 'process_boot_recovery');
        store.envelopes[i] = updated;
        flipped.push(env.worker_id);
        bumpCount('interrupted');
      }
    }
  }
  return flipped;
}

// ─── Internal: lookup + transition helpers ─────────────────────────

function findEnvelope(worker_id: string): ExecutionWorkerEnvelope | null {
  for (const store of partitions.values()) {
    const env = store.envelopes.find(e => e.worker_id === worker_id);
    if (env) return env;
  }
  return null;
}

function replaceEnvelope(updated: ExecutionWorkerEnvelope): void {
  const store = partitions.get(updated.organization_id);
  if (!store) return;
  const i = store.envelopes.findIndex(e => e.worker_id === updated.worker_id);
  if (i >= 0) store.envelopes[i] = updated;
}

function applyTransition(env: ExecutionWorkerEnvelope, next: ExecutionLifecycleTier, note: string): ExecutionWorkerEnvelope {
  const ts = new Date().toISOString();
  const attribution = [...env.attribution, { recorded_at: ts, transition: next, note }];
  const out: ExecutionWorkerEnvelope = {
    ...env,
    lifecycle_state: next,
    attribution,
    completed_at: next === 'completed' ? ts : env.completed_at,
    failed_at: next === 'failed' ? ts : env.failed_at,
    interrupted_at: next === 'interrupted' ? ts : env.interrupted_at,
    rolled_back_at: next === 'rolled_back' ? ts : env.rolled_back_at,
    failure_reason: next === 'failed' ? note : env.failure_reason,
  };
  return out;
}

function transition(worker_id: string, next: ExecutionLifecycleTier, note: string): ExecutionWorkerEnvelope | null {
  const env = findEnvelope(worker_id);
  if (!env) return null;
  if (!isValidTransition(env.lifecycle_state, next)) {
    // Invalid transition — silent no-op (we don't auto-correct lifecycle).
    return env;
  }
  const updated = applyTransition(env, next, note);
  replaceEnvelope(updated);
  return updated;
}

function isValidTransition(from: ExecutionLifecycleTier, to: ExecutionLifecycleTier): boolean {
  if (from === to) return false;
  // pending → completed is allowed for fast-path workers that don't separately mark running.
  const valid: Record<ExecutionLifecycleTier, ExecutionLifecycleTier[]> = {
    pending: ['running', 'completed', 'failed', 'interrupted', 'rolled_back'],
    running: ['completed', 'failed', 'interrupted', 'rolled_back'],
    completed: ['rolled_back'],
    failed: ['rolled_back'],
    interrupted: ['running', 'failed', 'rolled_back'],
    rolled_back: [],
  };
  return valid[from].includes(to);
}

// ─── Public read APIs ──────────────────────────────────────────────

export function getEnvelope(worker_id: string): ExecutionWorkerEnvelope | null {
  return findEnvelope(worker_id);
}

export function listEnvelopes(organization_id: string): ReadonlyArray<ExecutionWorkerEnvelope> {
  return [...(partitions.get(organization_id)?.envelopes ?? [])];
}

export function listAllOrganizations(): ReadonlyArray<string> {
  return Array.from(partitions.keys()).sort();
}

export function listEnvelopesByState(organization_id: string, state: ExecutionLifecycleTier): ReadonlyArray<ExecutionWorkerEnvelope> {
  return listEnvelopes(organization_id).filter(e => e.lifecycle_state === state).reverse();
}

export function activeWorkerCount(organization_id?: string): number {
  let total = 0;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  for (const o of orgs) {
    total += listEnvelopesByState(o, 'running').length + listEnvelopesByState(o, 'pending').length;
  }
  return total;
}

export function recentLifecycleCount24h(): { completed: number; failed: number; interrupted: number; rolled_back: number } {
  pruneCounts(Date.now());
  return {
    completed: lifecycleEventCounts.completed24h.length,
    failed: lifecycleEventCounts.failed24h.length,
    interrupted: lifecycleEventCounts.interrupted24h.length,
    rolled_back: lifecycleEventCounts.rolled_back24h.length,
  };
}

export function _resetCoordinatorForTests(): void {
  partitions.clear();
  lifecycleEventCounts.completed24h.length = 0;
  lifecycleEventCounts.failed24h.length = 0;
  lifecycleEventCounts.interrupted24h.length = 0;
  lifecycleEventCounts.rolled_back24h.length = 0;
}
