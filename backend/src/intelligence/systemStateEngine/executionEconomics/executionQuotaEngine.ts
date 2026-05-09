/**
 * executionQuotaEngine — Phase 28. Static operator-set quota governance.
 *
 * Architectural commitment:
 *   - Quotas are STATIC OPERATOR-SET CAPS with conservative defaults.
 *   - Operator mutates via `setQuotaLimit`; every mutation records a
 *     `QuotaGovernanceAttribution` with previous/updated/by/reason.
 *   - Quota check (`checkQuotaAvailability`) is INTEGRATED INTO Phase 27's
 *     `evaluateIssuance` (single source of truth).
 *   - Consumption (`recordConsumption`) is called by Phase 27 coordinator
 *     post-execution.
 *   - Hard-fail on exhaustion: returns `{ allowed: false, exhausted_keys }`.
 *   - Cross-organization isolation: every storage map keyed by org.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ExecutionQuotaProfile, QuotaResourceKey, QuotaGovernanceAttribution,
  QuotaExhaustionAttribution, QuotaExhaustionFinalityProof,
} from './executionEconomicsTypes';
import {
  DEFAULT_QUOTA_LIMITS, MAX_QUOTA_LIMIT, MIN_QUOTA_LIMIT,
  MAX_QUOTA_GOVERNANCE_PER_PARTITION, MAX_QUOTA_EXHAUSTIONS_PER_PARTITION,
} from './executionEconomicsTypes';

interface PartitionStore {
  limits: Record<QuotaResourceKey, number>;
  // 24h sliding-window timestamps per resource key.
  consumed_24h: Record<QuotaResourceKey, number[]>;
  // currently-running concurrent counter (decremented post-execution).
  concurrent: number;
  governance_log: QuotaGovernanceAttribution[];
  exhaustion_log: QuotaExhaustionAttribution[];
}

const partitions = new Map<string, PartitionStore>();

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function emptyConsumedWindows(): Record<QuotaResourceKey, number[]> {
  return {
    envelopes_per_24h: [],
    executions_per_24h: [],
    rollback_chains_per_24h: [],
    topology_recovery_steps_per_24h: [],
    continuity_replays_per_24h: [],
    concurrent_executions: [],
  };
}

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = {
      limits: { ...DEFAULT_QUOTA_LIMITS },
      consumed_24h: emptyConsumedWindows(),
      concurrent: 0,
      governance_log: [],
      exhaustion_log: [],
    };
    partitions.set(organization_id, s);
  }
  return s;
}

function pruneWindow(arr: number[], now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
}

function pruneAll(store: PartitionStore, now: number): void {
  for (const k of Object.keys(store.consumed_24h) as QuotaResourceKey[]) {
    if (k === 'concurrent_executions') continue;
    pruneWindow(store.consumed_24h[k], now);
  }
}

// ─── Quota profile ─────────────────────────────────────────────────

export function buildExecutionQuotaProfile(organization_id: string): ExecutionQuotaProfile {
  const store = ensure(organization_id);
  const now = Date.now();
  pruneAll(store, now);

  const consumed: Record<QuotaResourceKey, number> = {
    envelopes_per_24h: store.consumed_24h.envelopes_per_24h.length,
    executions_per_24h: store.consumed_24h.executions_per_24h.length,
    rollback_chains_per_24h: store.consumed_24h.rollback_chains_per_24h.length,
    topology_recovery_steps_per_24h: store.consumed_24h.topology_recovery_steps_per_24h.length,
    continuity_replays_per_24h: store.consumed_24h.continuity_replays_per_24h.length,
    concurrent_executions: store.concurrent,
  };

  const remaining: Record<QuotaResourceKey, number> = {
    envelopes_per_24h: Math.max(0, store.limits.envelopes_per_24h - consumed.envelopes_per_24h),
    executions_per_24h: Math.max(0, store.limits.executions_per_24h - consumed.executions_per_24h),
    rollback_chains_per_24h: Math.max(0, store.limits.rollback_chains_per_24h - consumed.rollback_chains_per_24h),
    topology_recovery_steps_per_24h: Math.max(0, store.limits.topology_recovery_steps_per_24h - consumed.topology_recovery_steps_per_24h),
    continuity_replays_per_24h: Math.max(0, store.limits.continuity_replays_per_24h - consumed.continuity_replays_per_24h),
    concurrent_executions: Math.max(0, store.limits.concurrent_executions - consumed.concurrent_executions),
  };

  const exhausted_keys: QuotaResourceKey[] = (Object.keys(remaining) as QuotaResourceKey[])
    .filter(k => remaining[k] === 0 && store.limits[k] >= 0);

  const built_at = new Date(now).toISOString();
  const deterministic_hash = deterministicHash(
    `${organization_id}::${JSON.stringify(store.limits)}::${JSON.stringify(consumed)}`,
  );

  return {
    organization_id,
    limits: { ...store.limits },
    consumed,
    remaining,
    any_exhausted: exhausted_keys.length > 0,
    exhausted_keys,
    built_at,
    deterministic_hash,
  };
}

// ─── Availability check (called from Phase 27 evaluateIssuance) ────

export interface QuotaAvailabilityResult {
  readonly allowed: boolean;
  readonly exhausted_keys: ReadonlyArray<QuotaResourceKey>;
  readonly profile: ExecutionQuotaProfile;
}

/**
 * Check whether a Phase 27 envelope issuance can proceed under quota.
 * Reads ONLY — does not consume. Phase 27 calls `recordConsumption`
 * post-execution (or post-issuance for envelope counter).
 */
export function checkQuotaAvailability(
  organization_id: string,
  required_keys: ReadonlyArray<QuotaResourceKey>,
): QuotaAvailabilityResult {
  const profile = buildExecutionQuotaProfile(organization_id);
  const exhausted_keys = required_keys.filter(k => profile.remaining[k] <= 0);
  return {
    allowed: exhausted_keys.length === 0,
    exhausted_keys,
    profile,
  };
}

// ─── Consumption (called from Phase 27 coordinator post-action) ────

export function recordConsumption(
  organization_id: string,
  key: QuotaResourceKey,
  delta = 1,
): void {
  const store = ensure(organization_id);
  const now = Date.now();
  if (key === 'concurrent_executions') {
    store.concurrent = Math.max(0, store.concurrent + delta);
    return;
  }
  for (let i = 0; i < delta; i++) store.consumed_24h[key].push(now);
  pruneWindow(store.consumed_24h[key], now);
}

export function releaseConcurrent(organization_id: string): void {
  const store = ensure(organization_id);
  store.concurrent = Math.max(0, store.concurrent - 1);
}

// ─── Operator-driven quota mutation ────────────────────────────────

export interface SetQuotaLimitInput {
  readonly organization_id: string;
  readonly quota_key: QuotaResourceKey;
  readonly updated_limit: number;
  readonly updated_by: string;            // operator_id
  readonly reason: string;
}

export interface SetQuotaLimitResult {
  readonly applied: boolean;
  readonly attribution?: QuotaGovernanceAttribution;
  readonly reason?: string;
}

export function setQuotaLimit(input: SetQuotaLimitInput): SetQuotaLimitResult {
  if (!input.updated_by || input.updated_by.trim().length === 0) {
    return { applied: false, reason: 'updated_by_missing' };
  }
  if (input.updated_limit < MIN_QUOTA_LIMIT || input.updated_limit > MAX_QUOTA_LIMIT) {
    return {
      applied: false,
      reason: `updated_limit_out_of_range (must be ${MIN_QUOTA_LIMIT}..${MAX_QUOTA_LIMIT})`,
    };
  }
  const store = ensure(input.organization_id);
  const previous_limit = store.limits[input.quota_key];
  store.limits[input.quota_key] = input.updated_limit;

  const attribution: QuotaGovernanceAttribution = {
    attribution_id: `qga_${randomUUID()}`,
    organization_id: input.organization_id,
    quota_key: input.quota_key,
    previous_limit,
    updated_limit: input.updated_limit,
    updated_by: input.updated_by,
    reason: input.reason,
    recorded_at: new Date().toISOString(),
    deterministic_hash: deterministicHash(
      `${input.organization_id}::${input.quota_key}::${previous_limit}->${input.updated_limit}::${input.updated_by}::${input.reason}`,
    ),
  };
  store.governance_log.push(attribution);
  if (store.governance_log.length > MAX_QUOTA_GOVERNANCE_PER_PARTITION) {
    store.governance_log.shift();
  }
  return { applied: true, attribution };
}

export function listQuotaGovernanceAttributions(
  organization_id: string,
): ReadonlyArray<QuotaGovernanceAttribution> {
  const store = partitions.get(organization_id);
  if (!store) return [];
  return [...store.governance_log].reverse();
}

// ─── Exhaustion recording + finality proof ─────────────────────────

export function recordQuotaExhaustion(input: {
  organization_id: string;
  quota_key: QuotaResourceKey;
  attempted_envelope_id?: string;
}): { attribution: QuotaExhaustionAttribution; finality: QuotaExhaustionFinalityProof } {
  const store = ensure(input.organization_id);
  const profile = buildExecutionQuotaProfile(input.organization_id);
  const recorded_at = new Date().toISOString();
  const attribution: QuotaExhaustionAttribution = {
    organization_id: input.organization_id,
    quota_key: input.quota_key,
    attempted_envelope_id: input.attempted_envelope_id,
    limit: profile.limits[input.quota_key],
    consumed_at_check: profile.consumed[input.quota_key],
    recorded_at,
    deterministic_hash: deterministicHash(
      `${input.organization_id}::${input.quota_key}::${profile.limits[input.quota_key]}::${profile.consumed[input.quota_key]}::${recorded_at}`,
    ),
  };
  store.exhaustion_log.push(attribution);
  if (store.exhaustion_log.length > MAX_QUOTA_EXHAUSTIONS_PER_PARTITION) {
    store.exhaustion_log.shift();
  }

  const finality: QuotaExhaustionFinalityProof = {
    quota_key: input.quota_key,
    exhaustion_timestamp: recorded_at,
    blocking_envelope_id: input.attempted_envelope_id,
    exhaustion_scope: 'organization',
    replayable: true,
    bounded_reason: `quota '${input.quota_key}' exhausted at ${profile.consumed[input.quota_key]}/${profile.limits[input.quota_key]}`,
    finality_hash: deterministicHash(
      `final::${input.organization_id}::${input.quota_key}::${recorded_at}`,
    ),
  };
  return { attribution, finality };
}

export function listQuotaExhaustions(
  organization_id: string,
): ReadonlyArray<QuotaExhaustionAttribution> {
  const store = partitions.get(organization_id);
  if (!store) return [];
  return [...store.exhaustion_log].reverse();
}

export function recentQuotaExhaustionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const log = partitions.get(o)?.exhaustion_log ?? [];
    total += log.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function recentQuotaGovernanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const log = partitions.get(o)?.governance_log ?? [];
    total += log.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetQuotaEngineForTests(): void {
  partitions.clear();
}
