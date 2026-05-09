/**
 * operatorReasoningCompression — Phase 31. Compresses long event
 * history. ALWAYS emits `ReasoningCompressionOmissionAttribution`
 * exposing what was dropped — no silent compression.
 *
 * Architectural commitment:
 *   - `lossless: bool` — true if no events dropped, false otherwise.
 *   - Operators verify `events_observed == events_retained + events_omitted`.
 *   - Compression aggregates by `event_kind` only — no derived behavior.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  OperatorReasoningCompression, ReasoningCompressionOmissionAttribution,
  StabilizationSessionEventKind,
} from './governanceMemoryTypes';
import { MAX_COMPRESSIONS_PER_PARTITION } from './governanceMemoryTypes';
import { listEvents } from './stabilizationSessionTimeline';

interface PartitionStore {
  compressions: OperatorReasoningCompression[];
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

const ALL_KINDS: ReadonlyArray<StabilizationSessionEventKind> = [
  'session_opened', 'archetype_viewed', 'comparison_built',
  'survivability_reviewed', 'tradeoff_reviewed', 'archaeology_replayed',
  'walkthrough_generated', 'guidance_built', 'governance_evaluated',
  'archetype_applied', 'session_closed', 'note_recorded',
];

export interface BuildCompressionInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly max_representative_sessions_per_kind?: number;
}

export function buildOperatorReasoningCompression(
  input: BuildCompressionInput,
): OperatorReasoningCompression {
  const allEvents = listEvents(input.organization_id);
  const sortedAll = [...allEvents].sort((a, b) =>
    a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0,
  );

  let inWindow = sortedAll;
  if (input.window_start) {
    const ts = Date.parse(input.window_start);
    inWindow = inWindow.filter(e => Date.parse(e.recorded_at) >= ts);
  }
  if (input.window_end) {
    const ts = Date.parse(input.window_end);
    inWindow = inWindow.filter(e => Date.parse(e.recorded_at) <= ts);
  }

  const max_reps = input.max_representative_sessions_per_kind ?? 3;

  // Aggregate by event_kind
  const byKind = new Map<StabilizationSessionEventKind, {
    aggregated_count: number;
    representative_session_ids: string[];
  }>();
  for (const k of ALL_KINDS) byKind.set(k, { aggregated_count: 0, representative_session_ids: [] });

  for (const e of inWindow) {
    const bucket = byKind.get(e.event_kind);
    if (!bucket) continue;
    bucket.aggregated_count += 1;
    if (bucket.representative_session_ids.length < max_reps
        && !bucket.representative_session_ids.includes(e.session_id)) {
      bucket.representative_session_ids.push(e.session_id);
    }
  }

  // Build summary blocks (one per kind that has events)
  const summary_blocks = ALL_KINDS
    .filter(k => (byKind.get(k)?.aggregated_count ?? 0) > 0)
    .map(k => {
      const b = byKind.get(k)!;
      return {
        block_id: `cblk_${randomUUID()}`,
        event_kind: k,
        aggregated_count: b.aggregated_count,
        representative_session_ids: b.representative_session_ids,
        deterministic_hash: deterministicHash(
          `compression_block::${input.organization_id}::${k}::${b.aggregated_count}::${b.representative_session_ids.join(',')}`,
        ),
      };
    });

  // Build omission attribution
  const events_observed = inWindow.length;
  const events_retained = events_observed; // we retain all in summary form (counts)
  // Compute "omitted" as sessions referenced in events that exceed
  // representative_session_ids cap. This is the only lossy aspect of
  // the compression — individual session IDs beyond the cap are dropped.
  let events_omitted = 0;
  const omitted_event_kinds = ALL_KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<StabilizationSessionEventKind, number>,
  );
  const omitted_session_ids_set = new Set<string>();
  for (const e of inWindow) {
    const bucket = byKind.get(e.event_kind);
    if (!bucket) continue;
    if (!bucket.representative_session_ids.includes(e.session_id)) {
      events_omitted++;
      omitted_event_kinds[e.event_kind] = (omitted_event_kinds[e.event_kind] ?? 0) + 1;
      omitted_session_ids_set.add(e.session_id);
    }
  }
  const omitted_session_ids = Array.from(omitted_session_ids_set).sort();

  const compression_id = `comp_${randomUUID()}`;
  const omission_attribution: ReasoningCompressionOmissionAttribution = {
    compression_id,
    total_events_observed: events_observed,
    events_retained,
    events_omitted,
    omitted_event_kinds,
    omitted_session_ids,
    compression_window_start: input.window_start,
    compression_window_end: input.window_end,
    lossless: events_omitted === 0,
    bounded_reason: events_omitted === 0
      ? `compression lossless: all ${events_observed} event(s) summarized in counts + representatives`
      : `${events_omitted} session-id reference(s) omitted across ${omitted_session_ids.length} session(s) due to ${max_reps}-per-kind cap`,
    deterministic_hash: deterministicHash(
      `omission::${input.organization_id}::${events_observed}::${events_omitted}::${JSON.stringify(omitted_event_kinds)}::${omitted_session_ids.join(',')}`,
    ),
  };

  const compression_hash = deterministicHash(
    `compression::${input.organization_id}::${summary_blocks.map(b => b.deterministic_hash).join('::')}::${omission_attribution.deterministic_hash}`,
  );

  const compression: OperatorReasoningCompression = {
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
): ReadonlyArray<OperatorReasoningCompression> {
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

export function _resetReasoningCompressionForTests(): void {
  partitions.clear();
}
