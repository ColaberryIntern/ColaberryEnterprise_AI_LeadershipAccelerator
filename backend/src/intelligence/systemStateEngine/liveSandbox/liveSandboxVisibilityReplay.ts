/**
 * liveSandboxVisibilityReplay — Phase 26. Composite read-only
 * visibility surface assembling per-org live sandbox state.
 */

import type { LiveSandboxVisibilityReplay } from './liveSandboxTypes';
import { listRuntimes } from './ephemeralWorkerRuntime';
import { listSandboxRollbackRehearsals } from './sandboxRollbackRehearsal';
import { listSandboxPreviewNarratives } from './sandboxPreviewNarrativeBuilder';
import { listLiveSandboxGovernanceAttributions } from './sandboxGovernanceSupervisor';
import { buildLiveSandboxTrustSurface } from './sandboxTrustSurface';

export function buildLiveSandboxVisibilityReplay(input: {
  organization_id: string;
  limit?: number;
}): LiveSandboxVisibilityReplay {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  return {
    organization_id: input.organization_id,
    recent_runtimes: listRuntimes(input.organization_id).slice(0, limit),
    recent_rollback_rehearsals: listSandboxRollbackRehearsals(input.organization_id).slice(0, limit),
    recent_preview_narratives: listSandboxPreviewNarratives(input.organization_id).slice(0, limit),
    recent_governance_decisions: listLiveSandboxGovernanceAttributions(input.organization_id).slice(0, limit),
    trust_surface: buildLiveSandboxTrustSurface({ organization_id: input.organization_id }),
    built_at: new Date().toISOString(),
  };
}
