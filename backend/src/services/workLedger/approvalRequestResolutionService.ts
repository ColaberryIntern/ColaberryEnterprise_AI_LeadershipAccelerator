import { ApprovalRequest } from '../../models';
import { replayApprovedAction } from './approvalRequestReplayService';

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

// Real-enforcement scoping, Phase 1 (2026-09-20) — the ONLY call site for
// replayApprovedAction(). bulkApproveApprovalRequests() below delegates every
// id through THIS function, so it inherits the replay (and its idempotency
// guard) for free — it must never get its own, independent replay call; see
// approvalRequestReplayService.ts's own header for why (a real bug caught by
// plan-audit before this shipped).
export async function approveApprovalRequest(
  id: string,
  decidedBy: string,
  decisionChannel = 'admin_ui',
): Promise<ApprovalResolutionResult> {
  const row = await ApprovalRequest.findByPk(id);
  if (!row) return { outcome: 'not_found' };
  if (row.status !== 'pending') return { outcome: 'not_pending', row };

  await row.update({ status: 'approved', decided_by: decidedBy, decided_at: new Date(), decision_channel: decisionChannel });

  // Fail-open: a replay failure must never leave this call reporting failure
  // when the real status transition already succeeded — the honest signal is
  // a visible log line an operator can act on, never a swallowed error and
  // never a thrown exception that would make the approval itself look failed.
  try {
    const replay = await replayApprovedAction(row);
    if (!replay.replayed) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'approvalRequestResolutionService', event: 'replay_not_performed',
        approval_request_id: row.id, reason: replay.reason,
      }));
    }
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'approvalRequestResolutionService', event: 'replay_failed',
      approval_request_id: row.id, error_class: err?.name || 'Error', message: String(err?.message || err),
    }));
  }

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
