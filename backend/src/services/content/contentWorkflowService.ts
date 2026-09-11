import { ContentApprovalEvent, ContentApprovalRequest, ContentItem } from '../../models';
import type { ContentItemStatus } from '../../models/ContentItem';
import {
  approvalInvalidatedBy,
  transition,
  DEFAULT_INVALIDATION_POLICY,
  STATUS_AFTER_INVALIDATION,
  STATUSES_HOLDING_AN_APPROVAL,
  type ApprovalSnapshot,
  type InvalidationPolicy,
  type InvalidationResult,
  type TransitionResult,
} from './contentWorkflow';

/**
 * contentWorkflowService — applies the pure workflow to rows, and writes the audit trail.
 *
 * I/O only. Whether a transition is legal, and whether an edit breaks an approval, are decided
 * in `contentWorkflow.ts` and tested there against every pair and every field. This file makes
 * those decisions durable: it moves the status, flips the approval request, and appends an
 * event - so "who approved this, when, what did they see, and what changed afterwards" survives
 * every later edit.
 *
 * INVALIDATION IS AN EVENT, NOT AN OVERWRITE. The approval request is marked invalidated with
 * the fields that broke it, and an `invalidated` event is appended carrying the same list. The
 * request row is never deleted and its `decided_by` is never cleared, because the fact that
 * someone approved an earlier revision is itself a record worth keeping.
 */

export class WorkflowError extends Error {
  constructor(message: string, public readonly status: number, public readonly errorClass: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export interface Actor {
  adminId?: string | null;
  email?: string | null;
}

/**
 * Move a content item to a new status, or refuse with the machine's reason.
 *
 * Throws a 409 for an illegal transition rather than returning it: the caller asked for
 * something the lifecycle does not permit, and that is a conflict with the item's current
 * state, not a validation error in the request body.
 */
export async function transitionContentItem(
  itemId: string,
  to: ContentItemStatus,
): Promise<{ item: ContentItem; result: TransitionResult }> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');

  const result = transition(item.status, to);
  if (!result.ok) throw new WorkflowError(result.reason, 409, 'IllegalTransition');

  await item.update({ status: to });
  return { item, result };
}

/**
 * Record that an item has been edited, and invalidate its approval if the edit broke one.
 *
 * `approved` is what the approver saw; `edited` is what exists now. Both are snapshots the
 * caller builds from the item and its variants, because this service must not have to know
 * how copy is assembled from variants to decide whether it changed - that knowledge lives in
 * one place (the composer) and is passed in.
 *
 * Returns the invalidation result whether or not anything was invalidated, so the caller can
 * tell the operator "your edit stands" as confidently as "your edit needs re-approval".
 */
export async function recordEdit(
  itemId: string,
  approved: ApprovalSnapshot,
  edited: ApprovalSnapshot,
  actor: Actor,
  policy: InvalidationPolicy = DEFAULT_INVALIDATION_POLICY,
): Promise<{ item: ContentItem; invalidation: InvalidationResult }> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');

  // Every edit bumps the revision, invalidating or not. The revision is what an approval
  // request pins to (revision_at_request / revision_at_decision), so a later reader can tell
  // exactly which version was approved without diffing snapshots.
  const revision = (item.revision ?? 0) + 1;

  const invalidation = approvalInvalidatedBy(approved, edited, policy);

  if (!invalidation.invalidated || !STATUSES_HOLDING_AN_APPROVAL.includes(item.status)) {
    await item.update({ revision });
    return { item, invalidation: { invalidated: false, fields: [] } };
  }

  const reason = `Edited after approval: ${invalidation.fields.join(', ')} changed.`;
  const now = new Date();

  const openApprovals = await ContentApprovalRequest.findAll({
    where: { content_item_id: itemId, status: 'approved' },
  });

  for (const req of openApprovals) {
    await req.update({ status: 'invalidated', invalidated_at: now, invalidated_reason: reason });
    await ContentApprovalEvent.create({
      approval_request_id: req.id,
      content_item_id: itemId,
      event_type: 'invalidated',
      actor_admin_id: actor.adminId ?? null,
      actor_email: actor.email ?? null,
      note: reason,
      // The field list travels in the payload so a reader can see WHAT broke the approval
      // without reconstructing two snapshots.
      payload: { fields: invalidation.fields, revision_before: item.revision, revision_after: revision },
      occurred_at: now,
    } as any);
  }

  // Back to draft, never straight to review: the edit may not be finished.
  const result = transition(item.status, STATUS_AFTER_INVALIDATION);
  await item.update({
    revision,
    human_approved: false,
    status: result.ok ? STATUS_AFTER_INVALIDATION : item.status,
  });

  return { item, invalidation };
}
