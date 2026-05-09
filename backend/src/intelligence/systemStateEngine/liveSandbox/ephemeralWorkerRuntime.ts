/**
 * ephemeralWorkerRuntime — Phase 26. Lifecycle state machine for
 * bounded ephemeral sandbox runtimes.
 *
 * Architectural commitment:
 *   - The "runtime" is a typed lifecycle object, NOT a thread, process,
 *     queue worker, or compute environment.
 *   - Auto-expiration via unref'd setTimeout. The timer never holds the
 *     Node process; the runtime auto-flips to `expired` at TTL.
 *   - Heartbeats are observational only — they MUST NOT trigger
 *     orchestration / execution / recovery / topology mutation / retries.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  EphemeralSandboxRuntimeProfile, EphemeralRuntimeLifecycleTier,
  SandboxRuntimeBoundaryTier, LiveSandboxHeartbeatAttribution,
  SandboxBoundaryProofChain, SandboxExpirationAttribution,
  SandboxExpirationTrigger, RuntimeLifecycleCompressionAttribution,
} from './liveSandboxTypes';
import {
  MAX_RUNTIMES_PER_PARTITION, MAX_HEARTBEATS_PER_RUNTIME,
  RUNTIME_EXPIRING_WINDOW_MS,
} from './liveSandboxTypes';

interface PartitionStore {
  runtimes: EphemeralSandboxRuntimeProfile[];
  recent_24h: number[];
  recent_expirations_24h: number[];
}

const partitions = new Map<string, PartitionStore>();
const runtimeIndex = new Map<string, EphemeralSandboxRuntimeProfile>();
const expirationTimers = new Map<string, NodeJS.Timeout>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = { runtimes: [], recent_24h: [], recent_expirations_24h: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

function pruneRecent(store: PartitionStore, now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (store.recent_24h.length > 0 && store.recent_24h[0] < cutoff) store.recent_24h.shift();
  while (store.recent_expirations_24h.length > 0 && store.recent_expirations_24h[0] < cutoff) store.recent_expirations_24h.shift();
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface CreateRuntimeInput {
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly underlying_phase_25_sandbox_id?: string;
  readonly ttl_ms: number;
  readonly boundary_proof: SandboxBoundaryProofChain;
}

export function createEphemeralRuntime(input: CreateRuntimeInput): EphemeralSandboxRuntimeProfile {
  const runtime_id = `runtime_${randomUUID()}`;
  const now = Date.now();
  const started_at = new Date(now).toISOString();
  const expires_at = new Date(now + input.ttl_ms).toISOString();

  const compression: RuntimeLifecycleCompressionAttribution = {
    runtime_id,
    heartbeat_count: 0,
    replay_window_ms: input.ttl_ms,
    compressed_events: 0,
    retained_events: 0,
    deterministic_hash: deterministicHash(`${runtime_id}::compression::initial`),
  };

  const profile: EphemeralSandboxRuntimeProfile = {
    runtime_id,
    experiment_id: input.experiment_id,
    organization_id: input.organization_id,
    lifecycle_state: 'pending',
    boundary_tier: 'detached',
    started_at,
    expires_at,
    underlying_phase_25_sandbox_id: input.underlying_phase_25_sandbox_id,
    heartbeats: [],
    boundary_proof: input.boundary_proof,
    compression,
    attribution_log: [{ recorded_at: started_at, transition: 'pending', note: 'runtime_registered' }],
  };

  const store = ensure(input.organization_id);
  store.runtimes.push(profile);
  if (store.runtimes.length > MAX_RUNTIMES_PER_PARTITION) {
    const evicted = store.runtimes.shift();
    if (evicted) runtimeIndex.delete(evicted.runtime_id);
  }
  store.recent_24h.push(now);
  pruneRecent(store, now);
  runtimeIndex.set(runtime_id, profile);

  // Auto-expiration: unref'd timer flips to expired at TTL.
  const timer = setTimeout(() => {
    autoExpire(runtime_id, 'ttl_reached');
  }, input.ttl_ms);
  if (typeof (timer as any).unref === 'function') (timer as any).unref();
  expirationTimers.set(runtime_id, timer);

  return profile;
}

/** Transition pending → running. */
export function markRuntimeRunning(runtime_id: string): EphemeralSandboxRuntimeProfile | null {
  return transition(runtime_id, 'running', 'isolated', 'lifecycle_running');
}

/** Transition running → completed. */
export function markRuntimeCompleted(runtime_id: string, note?: string): EphemeralSandboxRuntimeProfile | null {
  return transition(runtime_id, 'completed', 'bounded', note ?? 'lifecycle_completed');
}

/** Transition any → failed. */
export function markRuntimeFailed(runtime_id: string, reason: string): EphemeralSandboxRuntimeProfile | null {
  return transition(runtime_id, 'failed', 'bounded', reason);
}

/** Operator-initiated expiration (cancels TTL timer + records expiration attribution). */
export function expireRuntime(runtime_id: string, trigger: SandboxExpirationTrigger = 'operator_cancelled'): EphemeralSandboxRuntimeProfile | null {
  return autoExpire(runtime_id, trigger);
}

function autoExpire(runtime_id: string, trigger: SandboxExpirationTrigger): EphemeralSandboxRuntimeProfile | null {
  const profile = runtimeIndex.get(runtime_id);
  if (!profile) return null;
  if (profile.lifecycle_state === 'expired') return profile;
  const timer = expirationTimers.get(runtime_id);
  if (timer) {
    clearTimeout(timer);
    expirationTimers.delete(runtime_id);
  }
  const now = Date.now();
  const expired_at = new Date(now).toISOString();
  const lifecycle_terminal_state = profile.lifecycle_state;
  const runtime_duration_ms = now - Date.parse(profile.started_at);
  const expiration: SandboxExpirationAttribution = {
    runtime_id,
    expiration_reason: trigger === 'ttl_reached' ? 'TTL reached' : `expired via ${trigger}`,
    runtime_duration_ms,
    lifecycle_terminal_state,
    expiration_trigger: trigger,
    recorded_at: expired_at,
  };
  const updated: EphemeralSandboxRuntimeProfile = {
    ...profile,
    lifecycle_state: 'expired',
    boundary_tier: 'expired',
    expired_at,
    expiration,
    attribution_log: [...profile.attribution_log, { recorded_at: expired_at, transition: 'expired', note: trigger }],
  };
  replaceProfile(updated);
  const store = ensure(profile.organization_id);
  store.recent_expirations_24h.push(now);
  pruneRecent(store, now);
  return updated;
}

/** Record a heartbeat — observational only. */
export function recordRuntimeHeartbeat(runtime_id: string): EphemeralSandboxRuntimeProfile | null {
  const profile = runtimeIndex.get(runtime_id);
  if (!profile) return null;
  if (profile.lifecycle_state !== 'running' && profile.lifecycle_state !== 'pending') return profile;
  if (profile.heartbeats.length >= MAX_HEARTBEATS_PER_RUNTIME) return profile;
  const now = Date.now();
  const elapsed_ms = now - Date.parse(profile.started_at);
  const tick_index = profile.heartbeats.length;
  const tick: LiveSandboxHeartbeatAttribution = {
    tick_index,
    recorded_at: new Date(now).toISOString(),
    runtime_state: profile.lifecycle_state,
    elapsed_ms,
    deterministic_hash: deterministicHash(`${runtime_id}::tick:${tick_index}::elapsed:${elapsed_ms}`),
  };
  const compression: RuntimeLifecycleCompressionAttribution = {
    runtime_id,
    heartbeat_count: tick_index + 1,
    replay_window_ms: Date.parse(profile.expires_at) - Date.parse(profile.started_at),
    compressed_events: 0,
    retained_events: tick_index + 1,
    deterministic_hash: deterministicHash(`${runtime_id}::compression::ticks:${tick_index + 1}`),
  };
  const expiringSoon = Date.parse(profile.expires_at) - now < RUNTIME_EXPIRING_WINDOW_MS;
  const boundary_tier: SandboxRuntimeBoundaryTier = expiringSoon ? 'expiring' : profile.boundary_tier;
  const updated: EphemeralSandboxRuntimeProfile = {
    ...profile,
    heartbeats: [...profile.heartbeats, tick],
    compression,
    boundary_tier,
  };
  replaceProfile(updated);
  return updated;
}

function transition(
  runtime_id: string, next: EphemeralRuntimeLifecycleTier,
  next_boundary: SandboxRuntimeBoundaryTier, note: string,
): EphemeralSandboxRuntimeProfile | null {
  const profile = runtimeIndex.get(runtime_id);
  if (!profile) return null;
  if (!isValidTransition(profile.lifecycle_state, next)) return profile;
  const recorded_at = new Date().toISOString();
  const updated: EphemeralSandboxRuntimeProfile = {
    ...profile,
    lifecycle_state: next,
    boundary_tier: next_boundary,
    completed_at: next === 'completed' ? recorded_at : profile.completed_at,
    failed_at: next === 'failed' ? recorded_at : profile.failed_at,
    attribution_log: [...profile.attribution_log, { recorded_at, transition: next, note }],
  };
  replaceProfile(updated);
  return updated;
}

function isValidTransition(from: EphemeralRuntimeLifecycleTier, to: EphemeralRuntimeLifecycleTier): boolean {
  if (from === to) return false;
  const valid: Record<EphemeralRuntimeLifecycleTier, EphemeralRuntimeLifecycleTier[]> = {
    // pending → completed allowed for fast-path runtimes (Phase 26 sample
    // pattern: register, run, complete in one synchronous tick).
    pending: ['running', 'completed', 'failed', 'expired'],
    running: ['completed', 'failed', 'expired'],
    completed: ['expired'],
    failed: ['expired'],
    expired: [],
  };
  return valid[from].includes(to);
}

function replaceProfile(updated: EphemeralSandboxRuntimeProfile): void {
  runtimeIndex.set(updated.runtime_id, updated);
  const store = partitions.get(updated.organization_id);
  if (!store) return;
  const i = store.runtimes.findIndex(r => r.runtime_id === updated.runtime_id);
  if (i >= 0) store.runtimes[i] = updated;
}

// ─── Read APIs ──────────────────────────────────────────────────────

export function getRuntime(runtime_id: string): EphemeralSandboxRuntimeProfile | null {
  return runtimeIndex.get(runtime_id) ?? null;
}

export function listRuntimes(organization_id: string): ReadonlyArray<EphemeralSandboxRuntimeProfile> {
  return [...(partitions.get(organization_id)?.runtimes ?? [])].reverse();
}

export function activeRuntimeCount(organization_id?: string): number {
  let total = 0;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  for (const o of orgs) {
    total += listRuntimes(o).filter(r => r.lifecycle_state === 'pending' || r.lifecycle_state === 'running').length;
  }
  return total;
}

export function recentRuntimeCount24h(organization_id?: string): number {
  if (organization_id) {
    const store = partitions.get(organization_id);
    if (!store) return 0;
    pruneRecent(store, Date.now());
    return store.recent_24h.length;
  }
  let total = 0;
  for (const store of partitions.values()) {
    pruneRecent(store, Date.now());
    total += store.recent_24h.length;
  }
  return total;
}

export function recentExpirationCount24h(organization_id?: string): number {
  if (organization_id) {
    const store = partitions.get(organization_id);
    if (!store) return 0;
    pruneRecent(store, Date.now());
    return store.recent_expirations_24h.length;
  }
  let total = 0;
  for (const store of partitions.values()) {
    pruneRecent(store, Date.now());
    total += store.recent_expirations_24h.length;
  }
  return total;
}

export function _resetEphemeralRuntimeForTests(): void {
  for (const timer of expirationTimers.values()) clearTimeout(timer);
  expirationTimers.clear();
  runtimeIndex.clear();
  partitions.clear();
}
