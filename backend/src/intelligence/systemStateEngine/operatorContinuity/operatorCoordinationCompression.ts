/**
 * operatorCoordinationCompression — Phase 32. Compresses long handoff
 * history. ALWAYS emits CoordinationCompressionOmissionAttribution
 * exposing what was dropped — no silent compression.
 *
 * Architectural commitment:
 *   - `lossless: bool` — true if no handoffs dropped, false otherwise.
 *   - Operators verify handoffs_observed == handoffs_retained + handoffs_omitted.
 *   - Compression aggregates by lifecycle/handoff_kind ONLY — no derived
 *     collaboration patterns / operator tendencies / quality scoring.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  OperatorCoordinationCompression, CoordinationCompressionOmissionAttribution,
  HandoffEventKind,
} from './operatorContinuityTypes';
import { MAX_COMPRESSIONS_PER_PARTITION } from './operatorContinuityTypes';
import { listHandoffs } from './governanceHandoffRegistry';

interface PartitionStore {
  compressions: OperatorCoordinationCompression[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { compressions: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const ALL_KINDS: ReadonlyArray<HandoffEventKind> = [
  'handoff_started', 'handoff_acknowledged', 'handoff_completed',
  'handoff_declined', 'handoff_expired',
];

function lifecycleToKind(lifecycle: string): HandoffEventKind {
  // Map lifecycle states to canonical handoff kinds
  switch (lifecycle) {
    case 'started': return 'handoff_started';
    case 'acknowledged': return 'handoff_acknowledged';
    case 'completed': return 'handoff_completed';
    case 'declined': return 'handoff_declined';
    case 'expired': return 'handoff_expired';
    default: return 'handoff_started';
  }
}

export interface BuildCompressionInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly max_representative_handoffs_per_kind?: number;
}

export function buildOperatorCoordinationCompression(
  input: BuildCompressionInput,
): OperatorCoordinationCompression {
  const all = listHandoffs(input.organization_id);
  let inWindow = [...all].sort((a, b) =>
    a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
  );
  if (input.window_start) {
    const ts = Date.parse(input.window_start);
    inWindow = inWindow.filter(h => Date.parse(h.started_at) >= ts);
  }
  if (input.window_end) {
    const ts = Date.parse(input.window_end);
    inWindow = inWindow.filter(h => Date.parse(h.started_at) <= ts);
  }

  const max_reps = input.max_representative_handoffs_per_kind ?? 3;

  const byKind = new Map<HandoffEventKind, {
    aggregated_count: number;
    representative_handoff_ids: string[];
  }>();
  for (const k of ALL_KINDS) byKind.set(k, { aggregated_count: 0, representative_handoff_ids: [] });

  for (const h of inWindow) {
    const k = lifecycleToKind(h.lifecycle_state);
    const bucket = byKind.get(k);
    if (!bucket) continue;
    bucket.aggregated_count += 1;
    if (bucket.representative_handoff_ids.length < max_reps
        && !bucket.representative_handoff_ids.includes(h.handoff_id)) {
      bucket.representative_handoff_ids.push(h.handoff_id);
    }
  }

  const summary_blocks = ALL_KINDS
    .filter(k => (byKind.get(k)?.aggregated_count ?? 0) > 0)
    .map(k => {
      const b = byKind.get(k)!;
      return {
        block_id: `cblk_${randomUUID()}`,
        handoff_kind: k,
        aggregated_count: b.aggregated_count,
        representative_handoff_ids: b.representative_handoff_ids,
        deterministic_hash: deterministicHash(
          `coord_compression_block::${input.organization_id}::${k}::${b.aggregated_count}::${b.representative_handoff_ids.join(',')}`,
        ),
      };
    });

  const handoffs_observed = inWindow.length;
  const handoffs_retained = handoffs_observed;
  let handoffs_omitted = 0;
  const omitted_handoff_kinds = ALL_KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<HandoffEventKind, number>,
  );
  const omitted_handoff_ids_set = new Set<string>();
  for (const h of inWindow) {
    const k = lifecycleToKind(h.lifecycle_state);
    const bucket = byKind.get(k);
    if (!bucket) continue;
    if (!bucket.representative_handoff_ids.includes(h.handoff_id)) {
      handoffs_omitted++;
      omitted_handoff_kinds[k] = (omitted_handoff_kinds[k] ?? 0) + 1;
      omitted_handoff_ids_set.add(h.handoff_id);
    }
  }
  const omitted_handoff_ids = Array.from(omitted_handoff_ids_set).sort();

  const compression_id = `comp_${randomUUID()}`;
  const omission_attribution: CoordinationCompressionOmissionAttribution = {
    compression_id,
    total_handoffs_observed: handoffs_observed,
    handoffs_retained,
    handoffs_omitted,
    omitted_handoff_kinds,
    omitted_handoff_ids,
    compression_window_start: input.window_start,
    compression_window_end: input.window_end,
    lossless: handoffs_omitted === 0,
    bounded_reason: handoffs_omitted === 0
      ? `compression lossless: all ${handoffs_observed} handoff(s) summarized in counts + representatives`
      : `${handoffs_omitted} handoff-id reference(s) omitted across ${omitted_handoff_ids.length} handoff(s) due to ${max_reps}-per-kind cap`,
    deterministic_hash: deterministicHash(
      `omission::${input.organization_id}::${handoffs_observed}::${handoffs_omitted}::${JSON.stringify(omitted_handoff_kinds)}::${omitted_handoff_ids.join(',')}`,
    ),
  };

  const compression_hash = deterministicHash(
    `compression::${input.organization_id}::${summary_blocks.map(b => b.deterministic_hash).join('::')}::${omission_attribution.deterministic_hash}`,
  );

  const compression: OperatorCoordinationCompression = {
    compression_id,
    organization_id: input.organization_id,
    summary_blocks,
    omission_attribution,
    compression_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.compressions.push(compression);
  if (store.compressions.length > MAX_COMPRESSIONS_PER_PARTITION) store.compressions.shift();

  return compression;
}

export function listCompressions(
  organization_id: string,
): ReadonlyArray<OperatorCoordinationCompression> {
  return [...(partitions.get(organization_id)?.compressions ?? [])].reverse();
}

export function recentCompressionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.compressions ?? [];
    total += arr.filter(c => Date.parse(c.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetCoordinationCompressionForTests(): void {
  partitions.clear();
}
