/**
 * collaborativeContinuityReplay — Phase 32. Deterministic replay over
 * the per-org handoff event log.
 *
 * Architectural commitment:
 *   - Pure read of append-only handoff log.
 *   - Same inputs (organization_id + window) → same replay_hash.
 *   - `deterministic: true` + `read_only: true` typed-as-literal.
 *   - Handoff count breakdowns by lifecycle, NOT derived behavior.
 */

import { createHash } from 'crypto';
import type {
  CollaborativeContinuityReplay, HandoffEventKind,
} from './operatorContinuityTypes';
import { MAX_REPLAYS_PER_PARTITION } from './operatorContinuityTypes';
import { listHandoffs } from './governanceHandoffRegistry';

interface PartitionStore {
  replays: CollaborativeContinuityReplay[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { replays: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const ALL_HANDOFF_KINDS: ReadonlyArray<HandoffEventKind> = [
  'handoff_started', 'handoff_acknowledged', 'handoff_completed',
  'handoff_declined', 'handoff_expired',
];

export interface BuildReplayInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
}

export function buildCollaborativeContinuityReplay(
  input: BuildReplayInput,
): CollaborativeContinuityReplay {
  const allHandoffs = listHandoffs(input.organization_id);
  let handoffs = [...allHandoffs].sort((a, b) =>
    a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
  );
  if (input.window_start) {
    const ts = Date.parse(input.window_start);
    handoffs = handoffs.filter(h => Date.parse(h.started_at) >= ts);
  }
  if (input.window_end) {
    const ts = Date.parse(input.window_end);
    handoffs = handoffs.filter(h => Date.parse(h.started_at) <= ts);
  }

  // Map lifecycle states to event kinds (1 lifecycle state per handoff
  // surfaces as a primary kind; for completeness we count derived events)
  const handoff_count_by_kind = ALL_HANDOFF_KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<HandoffEventKind, number>,
  );
  for (const h of handoffs) {
    // Each handoff was started; count by terminal lifecycle.
    handoff_count_by_kind.handoff_started++;
    if (h.acknowledged_at) handoff_count_by_kind.handoff_acknowledged++;
    if (h.lifecycle_state === 'completed') handoff_count_by_kind.handoff_completed++;
    if (h.lifecycle_state === 'declined') handoff_count_by_kind.handoff_declined++;
    if (h.lifecycle_state === 'expired') handoff_count_by_kind.handoff_expired++;
  }

  const oldest = handoffs[0]?.started_at;
  const newest = handoffs[handoffs.length - 1]?.started_at;
  const replay_window_ms = oldest && newest
    ? Date.parse(newest) - Date.parse(oldest)
    : undefined;

  const transfer_bundle_set = new Set(handoffs.filter(h => h.transfer_bundle_id).map(h => h.transfer_bundle_id!));

  const replay_hash = deterministicHash(
    `replay::${input.organization_id}::${handoffs.map(h => h.deterministic_hash).join('::')}`,
  );

  const replay: CollaborativeContinuityReplay = {
    organization_id: input.organization_id,
    handoffs_replayed: handoffs.length,
    transfer_bundles_replayed: transfer_bundle_set.size,
    oldest_handoff_at: oldest,
    newest_handoff_at: newest,
    replay_window_ms,
    handoff_count_by_kind,
    deterministic: true,
    read_only: true,
    replay_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.replays.push(replay);
  if (store.replays.length > MAX_REPLAYS_PER_PARTITION) store.replays.shift();

  return replay;
}

export function verifyCollaborativeReplayDeterminism(input: {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly expected_replay_hash: string;
}): { deterministic: boolean; actual_replay_hash: string } {
  const allHandoffs = listHandoffs(input.organization_id);
  let handoffs = [...allHandoffs].sort((a, b) =>
    a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
  );
  if (input.window_start) {
    const ts = Date.parse(input.window_start);
    handoffs = handoffs.filter(h => Date.parse(h.started_at) >= ts);
  }
  if (input.window_end) {
    const ts = Date.parse(input.window_end);
    handoffs = handoffs.filter(h => Date.parse(h.started_at) <= ts);
  }
  const actual_replay_hash = deterministicHash(
    `replay::${input.organization_id}::${handoffs.map(h => h.deterministic_hash).join('::')}`,
  );
  return {
    deterministic: actual_replay_hash === input.expected_replay_hash,
    actual_replay_hash,
  };
}

export function listReplays(
  organization_id: string,
): ReadonlyArray<CollaborativeContinuityReplay> {
  return [...(partitions.get(organization_id)?.replays ?? [])].reverse();
}

export function recentReplayCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.replays ?? [];
    total += arr.filter(r => Date.parse(r.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetCollaborativeReplayForTests(): void {
  partitions.clear();
}
