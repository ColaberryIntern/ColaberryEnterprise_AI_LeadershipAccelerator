/**
 * authorityEnvelopeEngine — Phase 27. Issuance + immutability +
 * revocation for delegated authority envelopes.
 *
 * Architectural commitment:
 *   - Single-use, time-bounded, immutable after issuance.
 *   - Only `consumed_at`, `lifecycle_state`, `revoked_at` may change
 *     post-issuance. Everything else structurally immutable —
 *     immutability is verified by re-hashing and comparing.
 *   - Hard TTL cap. Permanent invalidation on expiry/timeout/consumption.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  DelegatedAuthorityEnvelope, DelegatedExecutionLifecycleTier,
  DelegatableActionKind,
} from './delegatedExecutionTypes';
import {
  MAX_ENVELOPE_TTL_MS, DEFAULT_ENVELOPE_TTL_MS,
  MAX_ENVELOPES_PER_PARTITION,
} from './delegatedExecutionTypes';

interface PartitionStore {
  envelopes: DelegatedAuthorityEnvelope[];
  recent_24h: number[];
}

const partitions = new Map<string, PartitionStore>();
const envelopeIndex = new Map<string, DelegatedAuthorityEnvelope>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = { envelopes: [], recent_24h: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

function pruneRecent(store: PartitionStore, now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (store.recent_24h.length > 0 && store.recent_24h[0] < cutoff) {
    store.recent_24h.shift();
  }
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Compute the hash of the immutable fields of an envelope. Used at
 * issuance to set `deterministic_hash`, and at execution time to
 * verify immutability (re-hash and compare).
 */
export function computeEnvelopeImmutabilityHash(env: DelegatedAuthorityEnvelope): string {
  const immutable = {
    envelope_id: env.envelope_id,
    operator_id: env.operator_id,
    action_kind: env.action_kind,
    target_namespace: env.target_namespace,
    target_kind: env.target_kind,
    target_organization_id: env.target_organization_id,
    target_plan_id: env.target_plan_id,
    target_step_id: env.target_step_id,
    issued_at: env.issued_at,
    expires_at: env.expires_at,
    rollback_chain_id: env.rollback_chain_id,
    topology_containment_proof: env.topology_containment_proof,
  };
  return deterministicHash(JSON.stringify(immutable));
}

export interface IssueEnvelopeInput {
  readonly operator_id: string;
  readonly action_kind: DelegatableActionKind;
  readonly target_namespace?: string;
  readonly target_kind?: string;
  readonly target_organization_id: string;
  readonly target_plan_id?: string;
  readonly target_step_id?: string;
  readonly rollback_chain_id: string;          // pre-flight rollback coverage required
  readonly topology_containment_proof: string;  // pre-flight containment hash
  readonly ttl_ms?: number;
}

export interface IssueEnvelopeResult {
  readonly envelope: DelegatedAuthorityEnvelope;
}

export function issueAuthorityEnvelope(input: IssueEnvelopeInput): IssueEnvelopeResult {
  const ttl_ms = Math.min(input.ttl_ms ?? DEFAULT_ENVELOPE_TTL_MS, MAX_ENVELOPE_TTL_MS);
  const now = Date.now();
  const envelope_id = `env_${randomUUID()}`;
  const issued_at = new Date(now).toISOString();
  const expires_at = new Date(now + ttl_ms).toISOString();

  // Construct the envelope with immutable fields, then compute the hash.
  const draft: DelegatedAuthorityEnvelope = {
    envelope_id,
    operator_id: input.operator_id,
    action_kind: input.action_kind,
    target_namespace: input.target_namespace,
    target_kind: input.target_kind,
    target_organization_id: input.target_organization_id,
    target_plan_id: input.target_plan_id,
    target_step_id: input.target_step_id,
    issued_at,
    expires_at,
    rollback_chain_required: true,
    rollback_chain_id: input.rollback_chain_id,
    single_use: true,
    max_action_count: 1,
    topology_containment_proof: input.topology_containment_proof,
    deterministic_hash: '',     // filled below
    lifecycle_state: 'issued',
  };
  const deterministic_hash = computeEnvelopeImmutabilityHash(draft);
  const envelope: DelegatedAuthorityEnvelope = { ...draft, deterministic_hash };

  const store = ensure(input.target_organization_id);
  store.envelopes.push(envelope);
  if (store.envelopes.length > MAX_ENVELOPES_PER_PARTITION) {
    const evicted = store.envelopes.shift();
    if (evicted) envelopeIndex.delete(evicted.envelope_id);
  }
  store.recent_24h.push(now);
  pruneRecent(store, now);
  envelopeIndex.set(envelope_id, envelope);
  return { envelope };
}

/**
 * Verify envelope is still valid for execution:
 *   - exists
 *   - not consumed
 *   - not revoked
 *   - not expired
 *   - hash matches (immutability check)
 */
export type EnvelopeValidationResult =
  | { valid: true; envelope: DelegatedAuthorityEnvelope }
  | { valid: false; reason: string };

export function validateEnvelope(envelope_id: string): EnvelopeValidationResult {
  const env = envelopeIndex.get(envelope_id);
  if (!env) return { valid: false, reason: 'envelope_not_found' };
  if (env.consumed_at) return { valid: false, reason: 'envelope_already_consumed' };
  if (env.revoked_at) return { valid: false, reason: 'envelope_revoked' };
  if (env.lifecycle_state === 'expired') return { valid: false, reason: 'envelope_expired_lifecycle' };
  if (Date.parse(env.expires_at) < Date.now()) return { valid: false, reason: 'envelope_ttl_expired' };
  // Immutability check: re-hash and compare.
  const recomputed = computeEnvelopeImmutabilityHash(env);
  if (recomputed !== env.deterministic_hash) {
    return { valid: false, reason: 'envelope_immutability_violated' };
  }
  return { valid: true, envelope: env };
}

/** Mutate ONLY consumed_at + lifecycle_state. */
export function consumeEnvelope(envelope_id: string, terminal_state: 'completed' | 'failed' | 'expired'): DelegatedAuthorityEnvelope | null {
  const env = envelopeIndex.get(envelope_id);
  if (!env) return null;
  if (env.consumed_at) return env;
  const consumed_at = new Date().toISOString();
  const updated: DelegatedAuthorityEnvelope = {
    ...env,
    consumed_at,
    lifecycle_state: terminal_state,
  };
  envelopeIndex.set(envelope_id, updated);
  replaceInStore(updated);
  return updated;
}

/** Operator-revoke an envelope before consumption. */
export function revokeEnvelope(envelope_id: string): DelegatedAuthorityEnvelope | null {
  const env = envelopeIndex.get(envelope_id);
  if (!env) return null;
  if (env.consumed_at || env.revoked_at) return env;
  const revoked_at = new Date().toISOString();
  const updated: DelegatedAuthorityEnvelope = {
    ...env,
    revoked_at,
    lifecycle_state: 'expired',
  };
  envelopeIndex.set(envelope_id, updated);
  replaceInStore(updated);
  return updated;
}

/** Lifecycle helpers — only state transitions allowed. */
export function transitionEnvelopeLifecycle(envelope_id: string, next: DelegatedExecutionLifecycleTier): DelegatedAuthorityEnvelope | null {
  const env = envelopeIndex.get(envelope_id);
  if (!env) return null;
  if (!isValidLifecycleTransition(env.lifecycle_state, next)) return env;
  const updated: DelegatedAuthorityEnvelope = { ...env, lifecycle_state: next };
  envelopeIndex.set(envelope_id, updated);
  replaceInStore(updated);
  return updated;
}

function isValidLifecycleTransition(from: DelegatedExecutionLifecycleTier, to: DelegatedExecutionLifecycleTier): boolean {
  if (from === to) return false;
  const valid: Record<DelegatedExecutionLifecycleTier, DelegatedExecutionLifecycleTier[]> = {
    issued: ['verified', 'failed', 'expired'],
    verified: ['executing', 'failed', 'expired'],
    executing: ['completed', 'failed', 'expired'],
    completed: [],          // terminal
    failed: [],             // terminal
    expired: [],            // terminal
  };
  return valid[from].includes(to);
}

function replaceInStore(updated: DelegatedAuthorityEnvelope): void {
  const store = partitions.get(updated.target_organization_id);
  if (!store) return;
  const i = store.envelopes.findIndex(e => e.envelope_id === updated.envelope_id);
  if (i >= 0) store.envelopes[i] = updated;
}

export function getEnvelope(envelope_id: string): DelegatedAuthorityEnvelope | null {
  return envelopeIndex.get(envelope_id) ?? null;
}

export function listEnvelopes(organization_id: string): ReadonlyArray<DelegatedAuthorityEnvelope> {
  return [...(partitions.get(organization_id)?.envelopes ?? [])].reverse();
}

export function recentEnvelopeCount24h(organization_id?: string): number {
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

export function _resetEnvelopeEngineForTests(): void {
  envelopeIndex.clear();
  partitions.clear();
}
