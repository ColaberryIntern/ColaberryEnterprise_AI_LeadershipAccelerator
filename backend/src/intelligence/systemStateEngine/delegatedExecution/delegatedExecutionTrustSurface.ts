/**
 * delegatedExecutionTrustSurface — Phase 27. 6 inherited trust bands.
 */

import type { DelegatedExecutionTrustSurface } from './delegatedExecutionTypes';
import { listEnvelopes } from './authorityEnvelopeEngine';
import {
  listExecutionTraces, recentExecutionCount24h, recentRefusalCount24h,
  recentTimeoutCount24h,
} from './delegatedExecutionCoordinator';
import { recentDelegatedDecisionCount24h } from './delegatedExecutionGovernance';

export function buildDelegatedExecutionTrustSurface(input: { organization_id: string }): DelegatedExecutionTrustSurface {
  const envelopes = listEnvelopes(input.organization_id);
  const traces = listExecutionTraces(input.organization_id);
  const exec24h = recentExecutionCount24h(input.organization_id);
  const refuse24h = recentRefusalCount24h(input.organization_id);
  const timeout24h = recentTimeoutCount24h(input.organization_id);
  const decisions24h = recentDelegatedDecisionCount24h(input.organization_id);

  // Phase 27 self-evidence bands
  const allEnvelopesImmutable = envelopes.length === 0 || envelopes.every(e =>
    e.deterministic_hash.length > 0
    && e.single_use === true
    && e.max_action_count === 1
    && e.rollback_chain_required === true,
  );
  const authority_reliability = allEnvelopesImmutable ? 100 : 0;

  const allTracesHaveAllInvariantsVerified = traces.length === 0 || traces.every(t =>
    t.safety_invariants.length === 7 && t.safety_invariants.every(i => i.invariant_verified),
  );
  const replay_integrity = allTracesHaveAllInvariantsVerified ? 100 : 60;

  const allTracesHaveRollback = traces.length === 0 || traces.every(t =>
    t.timeout_bounds.rollback_verification_completed,
  );
  const rollback_certainty = allTracesHaveRollback ? 100 : 60;

  const noCrossOrgAttempts = traces.length === 0 || traces.every(t =>
    t.boundary_proof_chain.topology_containment_hash.length > 0,
  );
  const containment_integrity = noCrossOrgAttempts ? 100 : 60;

  // Confidence scales with successful delegations vs refusals/timeouts.
  const totalActivity = exec24h + refuse24h + timeout24h;
  const successRate = totalActivity === 0 ? 1 : exec24h / totalActivity;
  const delegation_confidence = Math.round(successRate * 100);

  const budget_safety =
    timeout24h === 0 ? 100 :
    Math.max(50, 100 - timeout24h * 10);

  const bands: DelegatedExecutionTrustSurface['bands'] = [
    {
      label: 'authority_reliability',
      score: authority_reliability,
      inherited_from_phase: 'phase_27_delegated_execution',
      drivers: allEnvelopesImmutable ? ['all_envelopes_immutable_+_single_use'] : ['envelope_immutability_violation_detected'],
      source_attribution_id: `phase27_authority:${input.organization_id}`,
    },
    {
      label: 'replay_integrity',
      score: replay_integrity,
      inherited_from_phase: 'phase_27_delegated_execution',
      drivers: allTracesHaveAllInvariantsVerified
        ? ['all_traces_have_7_safety_invariants_verified']
        : ['some_trace_missing_invariants_or_violated'],
      source_attribution_id: `phase27_replay:${input.organization_id}`,
    },
    {
      label: 'rollback_certainty',
      score: rollback_certainty,
      inherited_from_phase: 'phase_23_execution_substrate',
      drivers: allTracesHaveRollback ? ['all_traces_completed_rollback_verification'] : ['rollback_verification_incomplete'],
      source_attribution_id: `phase23_rollback:${input.organization_id}`,
    },
    {
      label: 'containment_integrity',
      score: containment_integrity,
      inherited_from_phase: 'phase_22_topology',
      drivers: noCrossOrgAttempts ? ['no_cross_org_attempts'] : ['cross_org_attempt_detected'],
      source_attribution_id: `phase22_containment:${input.organization_id}`,
    },
    {
      label: 'delegation_confidence',
      score: delegation_confidence,
      inherited_from_phase: 'phase_27_delegated_execution',
      drivers: [`exec_24h=${exec24h}`, `refuse_24h=${refuse24h}`, `timeout_24h=${timeout24h}`],
      source_attribution_id: `phase27_confidence:${input.organization_id}`,
    },
    {
      label: 'budget_safety',
      score: budget_safety,
      inherited_from_phase: 'phase_27_delegated_execution',
      drivers: timeout24h === 0 ? ['no_recent_timeouts'] : [`timeouts_24h=${timeout24h}`],
      source_attribution_id: `phase27_budget:${input.organization_id}`,
    },
  ];

  void decisions24h;
  const aggregate_score = Math.round(bands.reduce((s, b) => s + b.score, 0) / bands.length);

  return {
    organization_id: input.organization_id,
    bands,
    aggregate_score,
    built_at: new Date().toISOString(),
  };
}
