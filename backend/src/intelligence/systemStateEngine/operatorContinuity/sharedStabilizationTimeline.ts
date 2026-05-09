/**
 * sharedStabilizationTimeline — Phase 32. Read-only chronological VIEW
 * over Phase 31 events filtered to handoff lineage + co-occurring
 * activity. NOT a parallel mutation surface.
 *
 * Architectural commitment:
 *   - `read_only: true` + `engine_never_ranks: true` +
 *     `derived_from_phase_31: true` typed-as-literal.
 *   - Derives from Phase 31's existing event log; writes nothing.
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type {
  SharedStabilizationTimeline, SharedStabilizationTimelinePoint,
} from './operatorContinuityTypes';
import { listEvents } from '../governanceMemory/stabilizationSessionTimeline';
import { listHandoffs } from './governanceHandoffRegistry';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildSharedTimelineInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly limit?: number;
}

export function buildSharedStabilizationTimeline(
  input: BuildSharedTimelineInput,
): SharedStabilizationTimeline {
  // Read Phase 31 events (the canonical event log) — NEVER write.
  let events = [...listEvents(input.organization_id)].sort((a, b) =>
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

  // Read Phase 32 handoffs and overlay onto the timeline (handoff_id field).
  const handoffs = listHandoffs(input.organization_id);
  const handoffLookupBySession = new Map<string, string>();
  for (const h of handoffs) {
    if (h.source_session_id) handoffLookupBySession.set(h.source_session_id, h.handoff_id);
  }

  let points: SharedStabilizationTimelinePoint[] = events.map(e => ({
    recorded_at: e.recorded_at,
    event_kind: e.event_kind,
    operator_id: e.operator_id,
    session_id: e.session_id,
    handoff_id: handoffLookupBySession.get(e.session_id),
    subject_kind: e.subject_kind,
    subject_id: e.subject_id,
    deterministic_hash: e.deterministic_hash,
  }));

  if (input.limit && input.limit > 0) {
    points = points.slice(0, input.limit);
  }

  const handoff_count = handoffs.length;
  const timeline_hash = deterministicHash(
    `shared_timeline::${input.organization_id}::${points.map(p => p.deterministic_hash).join('::')}::${handoff_count}`,
  );

  return {
    organization_id: input.organization_id,
    points,
    handoff_count,
    read_only: true,
    engine_never_ranks: true,
    derived_from_phase_31: true,
    window_start: input.window_start,
    window_end: input.window_end,
    timeline_hash,
    built_at: new Date().toISOString(),
  };
}
