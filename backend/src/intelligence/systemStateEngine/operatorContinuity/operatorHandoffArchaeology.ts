/**
 * operatorHandoffArchaeology — Phase 32. Read-only aggregation across
 * the per-org handoff history.
 *
 * Architectural commitment:
 *   - `read_only: true` + `bounded_to_organization: true` +
 *     `engine_never_ranks: true` typed-as-literal.
 *   - Counts only — NO derived collaboration patterns / NO operator
 *     ranking / NO behavioral inference.
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type {
  OperatorHandoffArchaeologyReplay, HandoffLifecycleState,
} from './operatorContinuityTypes';
import { MAX_ARCHAEOLOGY_PER_PARTITION } from './operatorContinuityTypes';
import { listHandoffs } from './governanceHandoffRegistry';

interface PartitionStore {
  archaeology: OperatorHandoffArchaeologyReplay[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { archaeology: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const ALL_LIFECYCLE: ReadonlyArray<HandoffLifecycleState> = [
  'started', 'acknowledged', 'completed', 'declined', 'expired',
];

export interface BuildArchaeologyInput {
  readonly organization_id: string;
}

export function buildOperatorHandoffArchaeology(
  input: BuildArchaeologyInput,
): OperatorHandoffArchaeologyReplay {
  const handoffs = listHandoffs(input.organization_id);

  const handoffs_by_lifecycle = ALL_LIFECYCLE.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<HandoffLifecycleState, number>,
  );
  for (const h of handoffs) {
    handoffs_by_lifecycle[h.lifecycle_state] = (handoffs_by_lifecycle[h.lifecycle_state] ?? 0) + 1;
  }

  const distinct_from = new Set(handoffs.map(h => h.from_operator_id));
  const distinct_to = new Set(handoffs.map(h => h.to_operator_id));

  // Find oldest + newest by started_at (handoffs reversed by listHandoffs)
  const sortedByStart = [...handoffs].sort((a, b) =>
    a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
  );
  const oldest = sortedByStart[0]?.started_at;
  const newest = sortedByStart[sortedByStart.length - 1]?.started_at;

  const archaeology_hash = deterministicHash([
    `total=${handoffs.length}`,
    `started=${handoffs_by_lifecycle.started}`,
    `acknowledged=${handoffs_by_lifecycle.acknowledged}`,
    `completed=${handoffs_by_lifecycle.completed}`,
    `declined=${handoffs_by_lifecycle.declined}`,
    `expired=${handoffs_by_lifecycle.expired}`,
    `from_count=${distinct_from.size}`,
    `to_count=${distinct_to.size}`,
    handoffs.slice(0, 25).map(h => h.deterministic_hash).join(':'),
  ].join('::'));

  const replay: OperatorHandoffArchaeologyReplay = {
    organization_id: input.organization_id,
    total_handoffs: handoffs.length,
    handoffs_by_lifecycle,
    distinct_from_operator_count: distinct_from.size,
    distinct_to_operator_count: distinct_to.size,
    oldest_handoff_at: oldest,
    newest_handoff_at: newest,
    read_only: true,
    bounded_to_organization: true,
    engine_never_ranks: true,
    archaeology_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.archaeology.push(replay);
  if (store.archaeology.length > MAX_ARCHAEOLOGY_PER_PARTITION) store.archaeology.shift();

  return replay;
}

export function listArchaeologyReplays(
  organization_id: string,
): ReadonlyArray<OperatorHandoffArchaeologyReplay> {
  return [...(partitions.get(organization_id)?.archaeology ?? [])].reverse();
}

export function recentArchaeologyCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.archaeology ?? [];
    total += arr.filter(a => Date.parse(a.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetHandoffArchaeologyForTests(): void {
  partitions.clear();
}
