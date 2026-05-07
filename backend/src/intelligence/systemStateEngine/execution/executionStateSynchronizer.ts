/**
 * executionStateSynchronizer — guarantees the engine's snapshot is fresh
 * after a build cycle.
 *
 * Phase 4: turns Phase 2's fire-and-forget refresh trigger into a synchronous
 * "after a manifest is ingested, the next read MUST reflect it" guarantee
 * for callers that need it.
 *
 * Used by the build-completion endpoint to await the rebuild before returning.
 */
import type { AuthoritativeSystemState } from '../types/systemState.types';

export interface SyncOutcome {
  readonly state: AuthoritativeSystemState;
  readonly elapsed_ms: number;
}

/**
 * Force a fresh snapshot for a project. Awaits the build (unlike
 * `refreshSystemState` which is fire-and-forget). Returns the new state.
 */
export async function syncProjectState(projectId: string): Promise<SyncOutcome> {
  const t0 = Date.now();
  const { buildAuthoritativeState } = await import('../systemStateEngine');
  const state = await buildAuthoritativeState(projectId, { persist: true });
  return {
    state,
    elapsed_ms: Date.now() - t0,
  };
}
