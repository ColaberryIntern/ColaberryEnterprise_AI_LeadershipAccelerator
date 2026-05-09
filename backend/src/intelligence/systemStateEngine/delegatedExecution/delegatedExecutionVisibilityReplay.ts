/**
 * delegatedExecutionVisibilityReplay — Phase 27. Composite read-only
 * visibility surface.
 */

import type { DelegatedExecutionVisibilityReplay } from './delegatedExecutionTypes';
import { listEnvelopes } from './authorityEnvelopeEngine';
import { listExecutionTraces } from './delegatedExecutionCoordinator';
import { listDelegatedGovernanceAttributions } from './delegatedExecutionGovernance';
import { listAuthorityNarratives } from './executionAuthorityCompressionNarrative';
import { buildDelegatedExecutionTrustSurface } from './delegatedExecutionTrustSurface';

export function buildDelegatedExecutionVisibilityReplay(input: {
  organization_id: string;
  limit?: number;
}): DelegatedExecutionVisibilityReplay {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  return {
    organization_id: input.organization_id,
    recent_envelopes: listEnvelopes(input.organization_id).slice(0, limit),
    recent_traces: listExecutionTraces(input.organization_id).slice(0, limit),
    recent_governance_decisions: listDelegatedGovernanceAttributions(input.organization_id).slice(0, limit),
    recent_authority_narratives: listAuthorityNarratives(input.organization_id).slice(0, limit),
    trust_surface: buildDelegatedExecutionTrustSurface({ organization_id: input.organization_id }),
    built_at: new Date().toISOString(),
  };
}
