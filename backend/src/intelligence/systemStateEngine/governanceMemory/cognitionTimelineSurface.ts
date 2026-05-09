/**
 * cognitionTimelineSurface — Phase 31. Read-only chronological
 * visualization payload for the per-org event log.
 *
 * Architectural commitment:
 *   - `read_only: true` + `engine_never_ranks: true` typed-as-literal.
 *   - Strictly chronological — no relevance reordering.
 *   - Windowable + filterable at read time.
 */

import { createHash } from 'crypto';
import type {
  CognitionTimelineSurface, CognitionTimelinePoint,
} from './governanceMemoryTypes';
import { listEvents } from './stabilizationSessionTimeline';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildTimelineSurfaceInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly operator_id_filter?: string;
  readonly session_id_filter?: string;
  readonly limit?: number;
}

export function buildCognitionTimelineSurface(
  input: BuildTimelineSurfaceInput,
): CognitionTimelineSurface {
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
  if (input.operator_id_filter) {
    events = events.filter(e => e.operator_id === input.operator_id_filter);
  }
  if (input.session_id_filter) {
    events = events.filter(e => e.session_id === input.session_id_filter);
  }
  if (input.limit && input.limit > 0) {
    events = events.slice(0, input.limit);
  }

  const points: CognitionTimelinePoint[] = events.map(e => ({
    recorded_at: e.recorded_at,
    event_kind: e.event_kind,
    subject_kind: e.subject_kind,
    subject_id: e.subject_id,
    operator_id: e.operator_id,
    session_id: e.session_id,
    deterministic_hash: e.deterministic_hash,
  }));

  const timeline_surface_hash = deterministicHash(
    `timeline_surface::${input.organization_id}::${points.map(p => p.deterministic_hash).join('::')}`,
  );

  return {
    organization_id: input.organization_id,
    points,
    window_start: input.window_start,
    window_end: input.window_end,
    read_only: true,
    engine_never_ranks: true,
    timeline_surface_hash,
    built_at: new Date().toISOString(),
  };
}
