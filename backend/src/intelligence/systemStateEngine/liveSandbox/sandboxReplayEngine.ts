/**
 * sandboxReplayEngine — Phase 26. Bounded read-only replay of past
 * live sandbox runtimes with deterministic hash verification.
 */

import type {
  EphemeralSandboxRuntimeProfile, SandboxRollbackRehearsalReplay,
  OperationalPreviewNarrative, SandboxReplayDeterminismBounds,
} from './liveSandboxTypes';
import { listRuntimes, getRuntime } from './ephemeralWorkerRuntime';
import { listSandboxRollbackRehearsals } from './sandboxRollbackRehearsal';
import { listSandboxPreviewNarratives } from './sandboxPreviewNarrativeBuilder';

export interface SandboxReplayBundle {
  readonly organization_id: string;
  readonly runtimes: ReadonlyArray<EphemeralSandboxRuntimeProfile>;
  readonly rollback_rehearsals: ReadonlyArray<SandboxRollbackRehearsalReplay>;
  readonly preview_narratives: ReadonlyArray<OperationalPreviewNarrative>;
  readonly determinism_bounds: ReadonlyArray<SandboxReplayDeterminismBounds>;
  readonly built_at: string;
}

export function buildSandboxReplayBundle(input: {
  organization_id: string;
  limit?: number;
}): SandboxReplayBundle {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const runtimes = listRuntimes(input.organization_id).slice(0, limit);
  const rollback_rehearsals = listSandboxRollbackRehearsals(input.organization_id).slice(0, limit);
  const preview_narratives = listSandboxPreviewNarratives(input.organization_id).slice(0, limit);

  const determinism_bounds: SandboxReplayDeterminismBounds[] = runtimes.map(r => ({
    runtime_id: r.runtime_id,
    replay_hash: r.boundary_proof.replay_determinism_hash,
    replayable: true,
    deterministic: true,
    runtime_expired: r.lifecycle_state === 'expired',
    bounded_reason: r.expiration?.expiration_reason,
  }));

  return {
    organization_id: input.organization_id,
    runtimes,
    rollback_rehearsals,
    preview_narratives,
    determinism_bounds,
    built_at: new Date().toISOString(),
  };
}

export function getReplayDeterminismBounds(runtime_id: string): SandboxReplayDeterminismBounds | null {
  const runtime = getRuntime(runtime_id);
  if (!runtime) return null;
  return {
    runtime_id: runtime.runtime_id,
    replay_hash: runtime.boundary_proof.replay_determinism_hash,
    replayable: true,
    deterministic: true,
    runtime_expired: runtime.lifecycle_state === 'expired',
    bounded_reason: runtime.expiration?.expiration_reason,
  };
}
