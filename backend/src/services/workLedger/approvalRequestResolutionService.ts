import { ApprovalRequest } from '../../models';

// Real-enforcement scoping, Phase 1 slice 1 (2026-09-13) — the first code
// anywhere that ever moves an ApprovalRequest row off its create-time
// 'pending' status. Mirrors the established resolve-a-queue-item shape
// already used for the (unrelated) ProposedAgentAction inbox
// (agentApprovalService.ts's approveProposedAction/rejectProposedAction):
// findByPk -> not-found/not-pending guard -> real status transition with
// who/when/how recorded.
//
// Deliberately does NOT yet make an approval change any real agent
// behavior — nothing downstream reads `status` to gate a send (see
// agentActionAuthorizationBridge.ts's still-true SHADOW MODE INVARIANT).
// That wiring is separate, later, larger work (the scoped plan's Phase 2).
// This service exists so the real approval queue can be exercised against
// real decisions now, safely, ahead of any real gating.

export type ApprovalResolutionOutcome = 'approved' | 'rejected' | 'not_found' | 'not_pending';

export interface ApprovalResolutionResult {
  outcome: ApprovalResolutionOutcome;
  row?: InstanceType<typeof ApprovalRequest>;
}

export interface BulkApprovalResult {
  approved: string[];
  skipped: Array<{ id: string; reason: ApprovalResolutionOutcome }>;
}

const PENDING_LIST_LIMIT = 200;

export async function listPendingApprovalRequests(): Promise<InstanceType<typeof ApprovalRequest>[]> {
  return ApprovalRequest.findAll({
    where: { status: 'pending' },
    order: [['created_at', 'ASC']],
    limit: PENDING_LIST_LIMIT,
  });
}

export async function approveApprovalRequest(
  id: string,
  decidedBy: string,
  decisionChannel = 'admin_ui',
): Promise<ApprovalResolutionResult> {
  const row = await ApprovalRequest.findByPk(id);
  if (!row) return { outcome: 'not_found' };
  if (row.status !== 'pending') return { outcome: 'not_pending', row };

  await row.update({ status: 'approved', decided_by: decidedBy, decided_at: new Date(), decision_channel: decisionChannel });
  return { outcome: 'approved', row };
}

export async function rejectApprovalRequest(
  id: string,
  decidedBy: string,
  decisionChannel = 'admin_ui',
): Promise<ApprovalResolutionResult> {
  const row = await ApprovalRequest.findByPk(id);
  if (!row) return { outcome: 'not_found' };
  if (row.status !== 'pending') return { outcome: 'not_pending', row };

  await row.update({ status: 'rejected', decided_by: decidedBy, decided_at: new Date(), decision_channel: decisionChannel });
  return { outcome: 'rejected', row };
}

/** Best-effort per id — one bad id in a batch never fails the whole
 * request; the caller gets back exactly which ids landed and why any
 * didn't, rather than an all-or-nothing transaction. */
export async function bulkApproveApprovalRequests(
  ids: string[],
  decidedBy: string,
  decisionChannel = 'admin_ui',
): Promise<BulkApprovalResult> {
  const approved: string[] = [];
  const skipped: Array<{ id: string; reason: ApprovalResolutionOutcome }> = [];

  for (const id of ids) {
    const result = await approveApprovalRequest(id, decidedBy, decisionChannel);
    if (result.outcome === 'approved') approved.push(id);
    else skipped.push({ id, reason: result.outcome });
  }

  return { approved, skipped };
}
