/**
 * experimentReplayEngine — Phase 25. Bounded read-only replay of past
 * experiments with deterministic hash verification.
 *
 * Architectural commitment:
 *   - Read-only over the per-partition rings of sandboxes / rollback
 *     simulations / propagation previews / rehearsals.
 *   - Verifies replayability by exposing the deterministic_hash on
 *     every replayable artifact.
 */

import type {
  ExecutionSandboxProfile, RollbackSimulationReplay,
  PropagationPreviewProfile, StabilizationRehearsalReplay,
} from './experimentationTypes';
import { listSandboxes } from './executionSandboxEngine';
import { listRollbackSimulations } from './rollbackSimulationEngine';
import { listPropagationPreviews } from './propagationPreviewEngine';
import { listRehearsals } from './stabilizationRehearsalEngine';

export interface ExperimentReplayBundle {
  readonly organization_id: string;
  readonly sandboxes: ReadonlyArray<ExecutionSandboxProfile>;
  readonly rollback_simulations: ReadonlyArray<RollbackSimulationReplay>;
  readonly propagation_previews: ReadonlyArray<PropagationPreviewProfile>;
  readonly rehearsals: ReadonlyArray<StabilizationRehearsalReplay>;
  readonly determinism_hashes: ReadonlyArray<{
    readonly artifact_id: string;
    readonly artifact_kind: 'sandbox' | 'rollback_simulation' | 'rehearsal';
    readonly hash: string;
    readonly recorded_at: string;
  }>;
  readonly built_at: string;
}

export interface BuildReplayBundleInput {
  readonly organization_id: string;
  readonly limit?: number;
}

export function buildExperimentReplayBundle(input: BuildReplayBundleInput): ExperimentReplayBundle {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const sandboxes = listSandboxes(input.organization_id).slice(0, limit);
  const rollback_simulations = listRollbackSimulations(input.organization_id).slice(0, limit);
  const propagation_previews = listPropagationPreviews(input.organization_id).slice(0, limit);
  const rehearsals = listRehearsals(input.organization_id).slice(0, limit);

  const determinism_hashes: ExperimentReplayBundle['determinism_hashes'] = [
    ...sandboxes.map(s => ({
      artifact_id: s.sandbox_id,
      artifact_kind: 'sandbox' as const,
      hash: s.determinism.projected_state_hash,
      recorded_at: s.determinism.recorded_at,
    })),
    ...rollback_simulations.map(r => ({
      artifact_id: r.simulation_id,
      artifact_kind: 'rollback_simulation' as const,
      hash: r.determinism.projected_state_hash,
      recorded_at: r.determinism.recorded_at,
    })),
    ...rehearsals.map(r => ({
      artifact_id: r.rehearsal_id,
      artifact_kind: 'rehearsal' as const,
      hash: r.determinism.projected_state_hash,
      recorded_at: r.determinism.recorded_at,
    })),
  ];

  return {
    organization_id: input.organization_id,
    sandboxes,
    rollback_simulations,
    propagation_previews,
    rehearsals,
    determinism_hashes,
    built_at: new Date().toISOString(),
  };
}
