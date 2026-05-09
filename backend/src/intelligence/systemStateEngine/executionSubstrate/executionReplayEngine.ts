/**
 * executionReplayEngine — Phase 23. Bounded read-only replay over the
 * recent envelope ring buffer.
 *
 * Architectural commitment:
 *   - Read-only. Never mutates envelopes, never re-runs workers.
 *   - Filterable by organization / kind / state / time-window.
 *   - Bounded by the per-partition envelope cap already enforced upstream.
 */

import type {
  ExecutionWorkerEnvelope, ExecutionLifecycleTier, ExecutionWorkerKind,
} from './executionSubstrateTypes';
import { listEnvelopes } from './executionRuntimeCoordinator';

export interface ReplayQueryInput {
  readonly organization_id: string;
  readonly kind?: ExecutionWorkerKind;
  readonly state?: ExecutionLifecycleTier;
  readonly since_iso?: string;
  readonly until_iso?: string;
  readonly limit?: number;
}

export interface ReplayQueryResult {
  readonly organization_id: string;
  readonly envelopes: ReadonlyArray<ExecutionWorkerEnvelope>;
  readonly bounded_reason: string;
  readonly built_at: string;
}

export function replayExecutionEnvelopes(input: ReplayQueryInput): ReplayQueryResult {
  const all = listEnvelopes(input.organization_id);
  const since = input.since_iso ? Date.parse(input.since_iso) : Number.NEGATIVE_INFINITY;
  const until = input.until_iso ? Date.parse(input.until_iso) : Number.POSITIVE_INFINITY;
  const filtered = all.filter(e => {
    if (input.kind && e.kind !== input.kind) return false;
    if (input.state && e.lifecycle_state !== input.state) return false;
    const t = Date.parse(e.started_at);
    if (t < since || t > until) return false;
    return true;
  }).reverse();
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const envelopes = filtered.slice(0, limit);
  const truncated = filtered.length > envelopes.length;
  return {
    organization_id: input.organization_id,
    envelopes,
    bounded_reason: truncated ? `truncated_to_${limit}_of_${filtered.length}` : `returned_${envelopes.length}_envelopes`,
    built_at: new Date().toISOString(),
  };
}
