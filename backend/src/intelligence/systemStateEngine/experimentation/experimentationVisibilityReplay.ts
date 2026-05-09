/**
 * experimentationVisibilityReplay — Phase 25. Composite read-only
 * visibility surface assembling per-org experimentation state.
 */

import type { ExperimentationVisibilityReplay } from './experimentationTypes';
import { listSandboxes } from './executionSandboxEngine';
import { listRollbackSimulations } from './rollbackSimulationEngine';
import { listPropagationPreviews } from './propagationPreviewEngine';
import { listRehearsals } from './stabilizationRehearsalEngine';
import { buildSandboxGovernanceProfile } from './sandboxGovernanceSupervisor';
import { buildExperimentationTrustSurface } from './experimentationTrustSurface';

export interface BuildExperimentationVisibilityInput {
  readonly organization_id: string;
  readonly limit?: number;
}

export function buildExperimentationVisibilityReplay(
  input: BuildExperimentationVisibilityInput,
): ExperimentationVisibilityReplay {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  return {
    organization_id: input.organization_id,
    recent_sandboxes: listSandboxes(input.organization_id).slice(0, limit),
    recent_rollback_simulations: listRollbackSimulations(input.organization_id).slice(0, limit),
    recent_propagation_previews: listPropagationPreviews(input.organization_id).slice(0, limit),
    recent_rehearsals: listRehearsals(input.organization_id).slice(0, limit),
    recent_governance_decisions: buildSandboxGovernanceProfile(input.organization_id).recent_decisions.slice(0, limit),
    trust_surface: buildExperimentationTrustSurface({ organization_id: input.organization_id }),
    built_at: new Date().toISOString(),
  };
}
