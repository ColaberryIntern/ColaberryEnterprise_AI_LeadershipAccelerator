/**
 * executionVisibilityReplay — Phase 23. Composite read-only visibility
 * surface that assembles the per-org execution view from every other
 * Phase 23 module.
 */

import type {
  ExecutionVisibilityReplay, ExecutionWorkerEnvelope,
} from './executionSubstrateTypes';
import { RECENT_VISIBILITY_LIMIT } from './executionSubstrateTypes';
import {
  listEnvelopes, listEnvelopesByState,
} from './executionRuntimeCoordinator';
import { buildExecutionTopologyProfile } from './executionTopologyGraph';
import { buildExecutionContinuityReplay } from './executionContinuityTracker';
import { buildIsolationProfile } from './executionIsolationEngine';
import { buildGovernanceProfile } from './executionGovernanceSupervisor';

export interface BuildVisibilityInput {
  readonly organization_id: string;
  readonly limit?: number;
}

export function buildExecutionVisibilityReplay(input: BuildVisibilityInput): ExecutionVisibilityReplay {
  const limit = Math.max(1, Math.min(50, input.limit ?? RECENT_VISIBILITY_LIMIT));
  const envelopes = listEnvelopes(input.organization_id);
  const active_workers: ExecutionWorkerEnvelope[] = envelopes
    .filter(e => e.lifecycle_state === 'pending' || e.lifecycle_state === 'running')
    .slice(-limit)
    .reverse();
  const recent_completed = listEnvelopesByState(input.organization_id, 'completed').slice(0, limit);
  const recent_failed = listEnvelopesByState(input.organization_id, 'failed').slice(0, limit);
  const recent_interrupted = listEnvelopesByState(input.organization_id, 'interrupted').slice(0, limit);

  const isolation = buildIsolationProfile();
  // Filter the global isolation profile down to this org for the visibility surface.
  const orgIsolation = {
    ...isolation,
    isolated_kinds: isolation.isolated_kinds.filter(i => i.organization_id === input.organization_id),
    active_isolation_count: isolation.isolated_kinds.filter(i => i.organization_id === input.organization_id).length,
  };

  return {
    organization_id: input.organization_id,
    active_workers,
    recent_completed,
    recent_failed,
    recent_interrupted,
    topology: buildExecutionTopologyProfile(input.organization_id),
    continuity: buildExecutionContinuityReplay({ organization_id: input.organization_id, limit }),
    isolation: orgIsolation,
    governance: buildGovernanceProfile(input.organization_id),
    built_at: new Date().toISOString(),
  };
}
