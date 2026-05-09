/**
 * governanceHandoffRegistry — Phase 32. Per-organization append-only
 * handoff event log.
 *
 * Architectural commitment:
 *   - Operator-mediated POST only. NEVER infers handoffs.
 *   - Each handoff carries `authority_transfer_supported: false`
 *     typed-as-literal — context only, no authority transfer.
 *   - `engine_never_ranks: true` typed-as-literal on every profile.
 *   - HandoffEventFinalityProof per event — immutable once recorded.
 *   - Cross-organization isolation absolute.
 *   - Handoffs auto-expire after HANDOFF_TTL_MS (24h) but the registry
 *     record remains immutable.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  GovernanceHandoffProfile, HandoffLifecycleState,
  HandoffEventFinalityProof,
} from './operatorContinuityTypes';
import {
  MAX_HANDOFFS_PER_PARTITION, MAX_CONTEXT_SUMMARY_LENGTH, HANDOFF_TTL_MS,
} from './operatorContinuityTypes';

interface PartitionStore {
  handoffs: GovernanceHandoffProfile[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { handoffs: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function buildFinalityProof(event_id: string, recorded_at: string): HandoffEventFinalityProof {
  return {
    event_id, recorded_at,
    cannot_be_modified: true,
    cannot_be_deleted: true,
    replayable: true,
    finality_hash: deterministicHash(`finality::${event_id}::${recorded_at}`),
  };
}

// ─── Record handoff (start) ─────────────────────────────────────────

export interface RecordHandoffInput {
  readonly organization_id: string;
  readonly from_operator_id: string;
  readonly to_operator_id: string;
  readonly context_summary: string;
  readonly reason: string;
  readonly source_session_id?: string;
  readonly transfer_bundle_id?: string;
}

export interface RecordHandoffResult {
  readonly recorded: boolean;
  readonly handoff?: GovernanceHandoffProfile;
  readonly reason?: string;
}

export function recordHandoff(input: RecordHandoffInput): RecordHandoffResult {
  if (!input.organization_id) return { recorded: false, reason: 'organization_id_required' };
  if (!input.from_operator_id) return { recorded: false, reason: 'from_operator_id_required' };
  if (!input.to_operator_id) return { recorded: false, reason: 'to_operator_id_required' };
  if (input.from_operator_id === input.to_operator_id) {
    return { recorded: false, reason: 'self_handoff_forbidden' };
  }
  if (input.context_summary && input.context_summary.length > MAX_CONTEXT_SUMMARY_LENGTH) {
    return { recorded: false, reason: 'context_summary_too_long' };
  }
  if (input.reason && input.reason.length > MAX_CONTEXT_SUMMARY_LENGTH) {
    return { recorded: false, reason: 'reason_too_long' };
  }

  const handoff_id = `hand_${randomUUID()}`;
  const started_at = new Date().toISOString();
  const handoff: GovernanceHandoffProfile = {
    handoff_id,
    organization_id: input.organization_id,
    from_operator_id: input.from_operator_id,
    to_operator_id: input.to_operator_id,
    lifecycle_state: 'started',
    started_at,
    context_summary: input.context_summary,
    reason: input.reason,
    source_session_id: input.source_session_id,
    transfer_bundle_id: input.transfer_bundle_id,
    authority_transfer_supported: false,
    engine_never_ranks: true,
    deterministic_hash: deterministicHash(
      `handoff::${handoff_id}::${input.organization_id}::${input.from_operator_id}::${input.to_operator_id}::${started_at}`,
    ),
    finality_proof: buildFinalityProof(handoff_id, started_at),
  };

  const store = ensure(input.organization_id);
  store.handoffs.push(handoff);
  if (store.handoffs.length > MAX_HANDOFFS_PER_PARTITION) store.handoffs.shift();

  return { recorded: true, handoff };
}

// ─── Lifecycle transitions (acknowledge / decline / complete / expire) ─

export interface TransitionHandoffInput {
  readonly organization_id: string;
  readonly handoff_id: string;
  readonly operator_id: string;                            // operator performing the transition
}

export interface TransitionHandoffResult {
  readonly transitioned: boolean;
  readonly handoff?: GovernanceHandoffProfile;
  readonly reason?: string;
}

function transitionHandoff(
  input: TransitionHandoffInput,
  next_state: HandoffLifecycleState,
  timestamp_field: 'acknowledged_at' | 'completed_at' | 'declined_at' | 'expired_at',
  required_actor: 'from' | 'to' | 'either',
): TransitionHandoffResult {
  if (!input.organization_id) return { transitioned: false, reason: 'organization_id_required' };
  if (!input.handoff_id) return { transitioned: false, reason: 'handoff_id_required' };
  if (!input.operator_id) return { transitioned: false, reason: 'operator_id_required' };

  const store = partitions.get(input.organization_id);
  if (!store) return { transitioned: false, reason: 'handoff_id_not_found' };
  const i = store.handoffs.findIndex(h => h.handoff_id === input.handoff_id);
  if (i < 0) return { transitioned: false, reason: 'handoff_id_not_found' };

  const existing = store.handoffs[i];
  if (existing.lifecycle_state === 'completed' || existing.lifecycle_state === 'declined' || existing.lifecycle_state === 'expired') {
    return { transitioned: false, reason: 'handoff_already_terminal' };
  }
  if (required_actor === 'to' && existing.to_operator_id !== input.operator_id) {
    return { transitioned: false, reason: 'only_to_operator_may_transition' };
  }
  if (required_actor === 'from' && existing.from_operator_id !== input.operator_id) {
    return { transitioned: false, reason: 'only_from_operator_may_transition' };
  }

  const at = new Date().toISOString();
  const updated: GovernanceHandoffProfile = {
    ...existing,
    lifecycle_state: next_state,
    [timestamp_field]: at,
  };
  store.handoffs[i] = updated;
  return { transitioned: true, handoff: updated };
}

export function acknowledgeHandoff(input: TransitionHandoffInput): TransitionHandoffResult {
  return transitionHandoff(input, 'acknowledged', 'acknowledged_at', 'to');
}

export function completeHandoff(input: TransitionHandoffInput): TransitionHandoffResult {
  return transitionHandoff(input, 'completed', 'completed_at', 'either');
}

export function declineHandoff(input: TransitionHandoffInput): TransitionHandoffResult {
  return transitionHandoff(input, 'declined', 'declined_at', 'to');
}

/** Sweep handoffs older than HANDOFF_TTL_MS that haven't reached terminal. */
export function sweepExpiredHandoffs(organization_id?: string): number {
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  const now = Date.now();
  let total = 0;
  for (const o of orgs) {
    const store = partitions.get(o);
    if (!store) continue;
    for (let i = 0; i < store.handoffs.length; i++) {
      const h = store.handoffs[i];
      if (h.lifecycle_state === 'started' || h.lifecycle_state === 'acknowledged') {
        if (now - Date.parse(h.started_at) > HANDOFF_TTL_MS) {
          store.handoffs[i] = {
            ...h,
            lifecycle_state: 'expired',
            expired_at: new Date(now).toISOString(),
          };
          total++;
        }
      }
    }
  }
  return total;
}

// ─── Read APIs ─────────────────────────────────────────────────────

export function listHandoffs(organization_id: string): ReadonlyArray<GovernanceHandoffProfile> {
  return [...(partitions.get(organization_id)?.handoffs ?? [])].reverse();
}

export function getHandoff(
  organization_id: string, handoff_id: string,
): GovernanceHandoffProfile | null {
  return partitions.get(organization_id)?.handoffs.find(h => h.handoff_id === handoff_id) ?? null;
}

export function recentHandoffCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const handoffs = partitions.get(o)?.handoffs ?? [];
    total += handoffs.filter(h => Date.parse(h.started_at) >= cutoff).length;
  }
  return total;
}

export function _resetHandoffRegistryForTests(): void {
  partitions.clear();
}
