import { ContentApprovalEvent, ContentApprovalRequest, ContentItem } from '../../models';
import type { ContentApprovalStatus } from '../../models/ContentApprovalRequest';
import type { ContentItemStatus } from '../../models/ContentItem';
import { transition } from './contentWorkflow';
import { WorkflowError, type Actor } from './contentWorkflowService';

/**
 * contentApprovalService — the reviewer's half of the approval loop.
 *
 * `sendForApproval` (composerActionService) opens the request; this closes it. A decision
 * pins the revision it was made against (`revision_at_decision`), writes an append-only
 * event, and moves the item - and the three decisions land in three different places on
 * purpose: approved -> 'approved', changes requested -> 'changes_requested' (the author
 * edits and re-sends), rejected -> 'draft' (start over; the request is closed, not parked).
 *
 * A decision on a request whose revision no longer matches the item is refused. The
 * reviewer saw revision 3 and the item is now revision 4: approving would attach a verdict
 * to copy nobody reviewed. `recordEdit` normally withdraws the request before this can
 * happen; this is the backstop for the case where it did not.
 */

export type ApprovalDecision = 'approved' | 'changes_requested' | 'rejected';
export const APPROVAL_DECISIONS: readonly ApprovalDecision[] = ['approved', 'changes_requested', 'rejected'];

const ITEM_STATUS_FOR: Record<ApprovalDecision, ContentItemStatus> = {
  approved: 'approved',
  changes_requested: 'changes_requested',
  rejected: 'draft',
};

export async function decideApproval(
  itemId: string,
  decision: ApprovalDecision,
  actor: Actor,
  note: string | null = null,
): Promise<{ item: ContentItem; request: ContentApprovalRequest }> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');

  const request = await ContentApprovalRequest.findOne({ where: { content_item_id: itemId, status: 'pending' } });
  if (!request) throw new WorkflowError('No open approval request for this item.', 409, 'NoOpenRequest');

  const revision = item.revision ?? 1;
  if (request.revision_at_request !== revision) {
    throw new WorkflowError(
      `The open request is for revision ${request.revision_at_request}; the item is now revision ${revision}. Ask the author to re-send.`,
      409,
      'StaleRequest',
    );
  }

  const target = ITEM_STATUS_FOR[decision];
  const r = transition(item.status, target);
  if (!r.ok) throw new WorkflowError(r.reason, 409, 'IllegalTransition');

  const now = new Date();
  const status: ContentApprovalStatus = decision;
  await request.update({
    status,
    decided_by: actor.adminId ?? null, // UUID column; the email goes on the event row below
    decided_at: now,
    decision_note: note,
    revision_at_decision: revision,
  });
  await ContentApprovalEvent.create({
    approval_request_id: request.id,
    content_item_id: itemId,
    event_type: decision,
    actor_admin_id: actor.adminId ?? null,
    actor_email: actor.email ?? null,
    note,
    payload: { revision },
    occurred_at: now,
  } as any);
  await item.update(decision === 'approved' ? { status: target, human_approved: true } : { status: target });
  return { item, request };
}
