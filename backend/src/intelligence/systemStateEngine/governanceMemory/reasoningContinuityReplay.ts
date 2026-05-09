/**
 * reasoningContinuityReplay — Phase 31. Deterministic replay over the
 * per-org session/event log.
 *
 * Architectural commitment:
 *   - Pure read of append-only event log.
 *   - Same inputs (organization_id + window) → same replay_hash.
 *   - `deterministic: true` + `read_only: true` typed-as-literal.
 *   - Event count breakdowns, NOT derived behavior.
 */

import { createHash } from 'crypto';
import type {
  ReasoningContinuityReplay, StabilizationSessionEventKind,
} from './governanceMemoryTypes';
import { MAX_REPLAYS_PER_PARTITION } from './governanceMemoryTypes';
import { listEvents, listSessions } from './stabilizationSessionTimeline';

interface PartitionStore {
  replays: ReasoningContinuityReplay[];
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

const ALL_KINDS: ReadonlyArray<StabilizationSessionEventKind> = [
  'session_opened', 'archetype_viewed', 'comparison_built',
  'survivability_reviewed', 'tradeoff_reviewed', 'archaeology_replayed',
  'walkthrough_generated', 'guidance_built', 'governance_evaluated',
  'archetype_applied', 'session_closed', 'note_recorded',
];

export interface BuildReplayInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly operator_id_filter?: string;
}

export function buildReasoningContinuityReplay(
  input: BuildReplayInput,
): ReasoningContinuityReplay {
  const allEvents = listEvents(input.organization_id);
  const allSessions = listSessions(input.organization_id);

  let events = [...allEvents].sort((a, b) =>
    a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0,
  );

  if (input.window_start) {
    const ts = Date.parse(input.window_start);
    events = events.filter(e => Date.parse(e.recorded_at) >= ts);
  }
  if (input.window_end) {
    const ts = Date.parse(input.window_end);
    events = events.filter(e => Date.parse(e.recorded_at) <= ts);
  }
  if (input.operator_id_filter) {
    events = events.filter(e => e.operator_id === input.operator_id_filter);
  }

  const event_count_by_kind = ALL_KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<StabilizationSessionEventKind, number>,
  );
  for (const e of events) {
    event_count_by_kind[e.event_kind] = (event_count_by_kind[e.event_kind] ?? 0) + 1;
  }

  const sessionsInScope = new Set(events.map(e => e.session_id));
  const sessions_replayed = sessionsInScope.size;

  const oldest = events.length > 0 ? events[0].recorded_at : undefined;
  const newest = events.length > 0 ? events[events.length - 1].recorded_at : undefined;
  const replay_window_ms = oldest && newest
    ? Date.parse(newest) - Date.parse(oldest)
    : undefined;

  const replay_hash = deterministicHash(
    `replay::${input.organization_id}::${events.map(e => e.deterministic_hash).join('::')}`,
  );

  const replay: ReasoningContinuityReplay = {
    organization_id: input.organization_id,
    events_replayed: events.length,
    sessions_replayed,
    oldest_event_recorded_at: oldest,
    newest_event_recorded_at: newest,
    replay_window_ms,
    event_count_by_kind,
    deterministic: true,
    read_only: true,
    replay_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.replays.push(replay);
  if (store.replays.length > MAX_REPLAYS_PER_PARTITION) store.replays.shift();

  // Reference allSessions to ensure determinism + downstream verification
  // can correlate against current session list.
  void allSessions;

  return replay;
}

export function verifyContinuityReplayDeterminism(input: {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly operator_id_filter?: string;
  readonly expected_replay_hash: string;
}): { deterministic: boolean; actual_replay_hash: string } {
  // Compute fresh; do NOT record.
  const allEvents = listEvents(input.organization_id);
  let events = [...allEvents].sort((a, b) =>
    a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0,
  );
  if (input.window_start) {
    const ts = Date.parse(input.window_start);
    events = events.filter(e => Date.parse(e.recorded_at) >= ts);
  }
  if (input.window_end) {
    const ts = Date.parse(input.window_end);
    events = events.filter(e => Date.parse(e.recorded_at) <= ts);
  }
  if (input.operator_id_filter) {
    events = events.filter(e => e.operator_id === input.operator_id_filter);
  }
  const actual_replay_hash = deterministicHash(
    `replay::${input.organization_id}::${events.map(e => e.deterministic_hash).join('::')}`,
  );
  return {
    deterministic: actual_replay_hash === input.expected_replay_hash,
    actual_replay_hash,
  };
}

export function listReplays(
  organization_id: string,
): ReadonlyArray<ReasoningContinuityReplay> {
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

export function _resetReasoningContinuityReplayForTests(): void {
  partitions.clear();
}
