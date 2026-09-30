import ProposedAgentAction from '../models/ProposedAgentAction';
import { ScheduledEmail } from '../models';
import { logAiEvent } from './aiEventService';
import { applyExecutionApproval, applyExecutionRejection, type ReviewerIdentity } from './growthJourney/execution/approvalApply';
import { PROPOSAL_TARGET_TABLE as GROWTH_JOURNEY_EXECUTIONS } from './growthJourney/execution/proposalFiler';

// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — the approve/reject/
// preview logic that used to live inline in agentGovernanceController.ts,
// extracted verbatim (same behavior, same status/response shape) so the new
// agent-scoped routes (managerInboxController.ts) and the existing global
// routes (agentGovernanceController.ts) share one implementation instead of
// two copies drifting apart. No behavior change to the existing global
// routes — same field names, same expiry check, same "only scheduled_emails
// has a real executor" special case documented in the real discovery this
// mission ran before touching any of this.

// Phase 5 T509: `not_authorized` is the growth-journey branch's own outcome - the caller
// carried no admin identity, or the identity has no access to the receipt's brand. The
// proposal stays `pending` in that case; nothing else here produces it.
export type ProposalOutcome = 'not_found' | 'not_pending' | 'expired' | 'not_authorized';

interface ApproveResult {
  outcome: 'approved';
  applied: boolean;
  proposal: ProposedAgentAction;
}

interface RejectResult {
  outcome: 'rejected';
  proposal: ProposedAgentAction;
}

/** Same expiry/status/executor rules as the pre-existing global route —
 * approving a `scheduled_emails` proposal is the one real, tested executor
 * path; every other target_table only flips status, exactly as it always has. */
export async function approveProposedAction(
  id: string,
  adminEmail: string,
  notes: string | null,
  // Phase 5 T509: the caller's `req.admin`. Only the growth-journey branch reads it, to check
  // the approver's access to the receipt's brand; every other target_table ignores it.
  admin?: ReviewerIdentity,
): Promise<ApproveResult | { outcome: ProposalOutcome; proposal?: ProposedAgentAction }> {
  const proposal = await ProposedAgentAction.findByPk(id);
  if (!proposal) return { outcome: 'not_found' };
  if (proposal.status !== 'pending') return { outcome: 'not_pending', proposal };

  if (proposal.expires_at && new Date() > proposal.expires_at) {
    await proposal.update({ status: 'expired' });
    return { outcome: 'expired', proposal };
  }

  let applied = false;
  if (proposal.target_table === 'scheduled_emails') {
    const email = await ScheduledEmail.findByPk(proposal.target_id);
    if (email) {
      await email.update(proposal.proposed_changes);
      applied = true;
    }
  } else if (proposal.target_table === GROWTH_JOURNEY_EXECUTIONS) {
    // Phase 5 T509: the receipt flips pending_review -> approved after the approver's brand
    // access is checked and recorded. It never enrols; the adapter re-runs every gate. A
    // receipt that is no longer pending (expired, cancelled) records the approval unapplied.
    const r = await applyExecutionApproval(proposal.target_id, admin);
    if (r.outcome === 'not_authorized') return { outcome: 'not_authorized', proposal };
    applied = r.outcome === 'approved';
  }

  await proposal.update({
    status: 'approved',
    reviewed_by: adminEmail,
    reviewed_at: new Date(),
    review_notes: notes || null,
    applied_at: applied ? new Date() : null,
  });

  await logAiEvent('agent_governance', 'proposal_approved', undefined, undefined, {
    proposal_id: id,
    agent_name: proposal.agent_name,
    action_type: proposal.action_type,
    reviewed_by: adminEmail,
    applied,
  });

  return { outcome: 'approved', applied, proposal };
}

export async function rejectProposedAction(
  id: string,
  adminEmail: string,
  notes: string | null,
  admin?: ReviewerIdentity,
): Promise<RejectResult | { outcome: ProposalOutcome; proposal?: ProposedAgentAction }> {
  const proposal = await ProposedAgentAction.findByPk(id);
  if (!proposal) return { outcome: 'not_found' };
  if (proposal.status !== 'pending') return { outcome: 'not_pending', proposal };
  if (proposal.target_table === GROWTH_JOURNEY_EXECUTIONS) {
    // Phase 5 T509: the same gate as approve - a reject is also an act on the brand's row.
    const r = await applyExecutionRejection(proposal.target_id, admin);
    if (r.outcome === 'not_authorized') return { outcome: 'not_authorized', proposal };
  }

  await proposal.update({
    status: 'rejected',
    reviewed_by: adminEmail,
    reviewed_at: new Date(),
    review_notes: notes || null,
  });

  await logAiEvent('agent_governance', 'proposal_rejected', undefined, undefined, {
    proposal_id: id,
    agent_name: proposal.agent_name,
    action_type: proposal.action_type,
    reviewed_by: adminEmail,
  });

  return { outcome: 'rejected', proposal };
}
