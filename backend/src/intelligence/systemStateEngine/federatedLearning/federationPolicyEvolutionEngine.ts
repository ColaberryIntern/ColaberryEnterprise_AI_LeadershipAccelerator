/**
 * federationPolicyEvolutionEngine — Phase 20. Operator-approved
 * federation policy evolution proposal lifecycle.
 *
 * Architectural commitment (per the Phase 20 stress-test):
 *   - Mirrors Phase 18 calibration governance — engine PROPOSES,
 *     operator APPROVES.
 *   - NO timeout-based auto-approval, NO threshold-triggered mutation,
 *     NO silent federation policy drift.
 *   - Every proposal carries `PolicyEvolutionImpactBounds` so operators
 *     avoid false certainty in federation governance evolution.
 *   - Storage: persisted via the broker adapter.
 */

import { randomUUID } from 'crypto';
import type {
  FederationPolicyEvolutionProposal, PolicyEvolutionKind, PolicyProposalStatus,
  PolicyEvolutionImpactBounds,
} from './federatedLearningTypes';
import { MAX_POLICY_PROPOSALS_PER_ORG } from './federatedLearningTypes';
import { getBrokerAdapter, BROKER_NAMESPACES } from './persistentFederationBroker';

const STORE_NAMESPACE = BROKER_NAMESPACES.policy_proposals;

export interface ProposePolicyInput {
  readonly organization_id: string;
  readonly project_id: string;
  readonly evolution_kind: PolicyEvolutionKind;
  readonly proposed_change: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly impact_bounds: PolicyEvolutionImpactBounds;
  readonly forecasted_impact: ReadonlyArray<string>;
  readonly rollback_path: ReadonlyArray<string>;
}

export async function proposePolicyEvolution(input: ProposePolicyInput): Promise<FederationPolicyEvolutionProposal | { error: string }> {
  const broker = getBrokerAdapter();
  // Bounded — never queue more than MAX_POLICY_PROPOSALS_PER_ORG pending.
  const existing = await broker.listValues<FederationPolicyEvolutionProposal>(input.organization_id, STORE_NAMESPACE);
  const pendingCount = existing.filter(p => p.status === 'pending_operator').length;
  if (pendingCount >= MAX_POLICY_PROPOSALS_PER_ORG) {
    return { error: `Cannot queue more than ${MAX_POLICY_PROPOSALS_PER_ORG} pending policy proposals.` };
  }

  const proposal: FederationPolicyEvolutionProposal = {
    proposal_id: `pol-${randomUUID()}`,
    organization_id: input.organization_id,
    project_id: input.project_id,
    evolution_kind: input.evolution_kind,
    proposed_change: input.proposed_change,
    rationale: input.rationale,
    impact_bounds: input.impact_bounds,
    forecasted_impact: input.forecasted_impact,
    rollback_path: input.rollback_path,
    operator_required: true,
    created_at: new Date().toISOString(),
    status: 'pending_operator',
    decided_at: null,
    decided_by: null,
  };

  await broker.put(input.organization_id, STORE_NAMESPACE, proposal.proposal_id, proposal);
  await writeProposalAudit(proposal, 'federation_policy_proposed', null);
  return proposal;
}

export interface ApproveRejectPolicyInput {
  readonly organization_id: string;
  readonly proposal_id: string;
  readonly operator_id: string;
  readonly reason?: string;
}

export async function approvePolicy(input: ApproveRejectPolicyInput): Promise<{ proposal: FederationPolicyEvolutionProposal; applied: boolean; apply_error: string | null }> {
  const broker = getBrokerAdapter();
  const proposal = await broker.get<FederationPolicyEvolutionProposal>(input.organization_id, STORE_NAMESPACE, input.proposal_id);
  if (!proposal) throw new Error(`Policy proposal ${input.proposal_id} not found`);
  if (proposal.status !== 'pending_operator') {
    return { proposal, applied: false, apply_error: `Proposal not pending (status=${proposal.status})` };
  }
  let applyError: string | null = null;
  try {
    await applyPolicyEvolution(proposal);
  } catch (err: any) {
    applyError = err?.message || String(err);
  }
  const updated: FederationPolicyEvolutionProposal = {
    ...proposal,
    status: applyError ? 'rejected' : 'approved' satisfies PolicyProposalStatus,
    decided_at: new Date().toISOString(),
    decided_by: input.operator_id,
  };
  await broker.put(input.organization_id, STORE_NAMESPACE, input.proposal_id, updated);
  await writeProposalAudit(updated, applyError ? 'federation_policy_rejected' : 'federation_policy_approved', input.operator_id, applyError);
  return { proposal: updated, applied: !applyError, apply_error: applyError };
}

export async function rejectPolicy(input: ApproveRejectPolicyInput): Promise<FederationPolicyEvolutionProposal> {
  const broker = getBrokerAdapter();
  const proposal = await broker.get<FederationPolicyEvolutionProposal>(input.organization_id, STORE_NAMESPACE, input.proposal_id);
  if (!proposal) throw new Error(`Policy proposal ${input.proposal_id} not found`);
  if (proposal.status !== 'pending_operator') return proposal;
  const updated: FederationPolicyEvolutionProposal = {
    ...proposal,
    status: 'rejected',
    decided_at: new Date().toISOString(),
    decided_by: input.operator_id,
  };
  await broker.put(input.organization_id, STORE_NAMESPACE, input.proposal_id, updated);
  await writeProposalAudit(updated, 'federation_policy_rejected', input.operator_id, input.reason ?? 'operator_rejected');
  return updated;
}

export async function listPolicyProposals(organization_id: string): Promise<ReadonlyArray<FederationPolicyEvolutionProposal>> {
  return getBrokerAdapter().listValues<FederationPolicyEvolutionProposal>(organization_id, STORE_NAMESPACE);
}

export async function getPolicyProposal(organization_id: string, proposal_id: string): Promise<FederationPolicyEvolutionProposal | null> {
  return getBrokerAdapter().get<FederationPolicyEvolutionProposal>(organization_id, STORE_NAMESPACE, proposal_id);
}

async function applyPolicyEvolution(proposal: FederationPolicyEvolutionProposal): Promise<void> {
  // v1: policy applications are advisory only — the actual change goes
  // through the proposing project's Phase 19 consent profile, which
  // requires the project's own operator to update via the existing
  // consent endpoint. Future phases can extend this to cross-project
  // coordination, but only with explicit cross-project consent.
  switch (proposal.evolution_kind) {
    case 'tighten_share_permissions':
    case 'broaden_share_permissions':
    case 'adjust_visibility_inheritance':
    case 'adjust_archetype_kind_scope':
    case 'adjust_organizational_partitioning':
    case 'adjust_replay_permissions':
      // Advisory — log the approval. The actual consent change happens
      // when the proposing project's operator updates their Phase 19
      // FederationConsentProfile to match.
      return;
  }
}

async function writeProposalAudit(
  proposal: FederationPolicyEvolutionProposal,
  kind: 'federation_policy_proposed' | 'federation_policy_approved' | 'federation_policy_rejected',
  operator_id: string | null,
  note?: string | null,
): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: proposal.project_id,
      kind,
      subject_id: proposal.proposal_id,
      payload: { ...proposal, note: note ?? null },
      operator_id,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[federationPolicyEvolutionEngine] audit write failed:', err?.message);
  }
}

export const _MAX_POLICY_PROPOSALS_PER_ORG_FOR_TESTS = MAX_POLICY_PROPOSALS_PER_ORG;
