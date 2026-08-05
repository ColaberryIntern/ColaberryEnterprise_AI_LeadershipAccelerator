import { randomUUID } from 'crypto';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import { ActionType, ItemDisposition } from '../../types/inboxCase';
import { computeIdempotencyKey } from './textNormalization';
import { getCaseOrThrow } from './caseRepository';
import { logCaseEvent } from './caseEventLog';
import { createActionIfNew, ProposedAction } from './caseActionPlanner';

// Per-item quick resolve ("Handled" / "Ignore" — root directive extension,
// this session). Deliberately narrow: sets a disposition and, only when
// the item's source has a natural close action, proposes ONE action —
// same idempotency-dedup and sanitization guarantees as full-case
// planning (via the shared createActionIfNew), same PROPOSED-only
// guarantee (nothing external fires without Ali's own Approve click).

export type QuickResolveResolution = 'HANDLED' | 'IGNORE';

const DISPOSITION_BY_RESOLUTION: Record<QuickResolveResolution, ItemDisposition> = {
  HANDLED: 'RESOLVED',
  IGNORE: 'NO_ACTION',
};

export interface QuickResolveResult {
  dispositionSet: ItemDisposition;
  actionProposed: ActionType | null;
}

function buildCloseAction(caseRow: InboxCase, item: InboxCaseItem): ProposedAction | null {
  if (item.source_type === 'email' || item.source_type === 'sent_email') {
    const action_type: ActionType = item.provider === 'hotmail' ? 'EMAIL_ARCHIVE' : 'EMAIL_LABEL';
    return {
      action_type,
      item_id: item.id,
      target_source: item.provider,
      target_id: item.source_id,
      preview: `Archive "${item.title}" (${item.provider})`,
      payload: { source_id: item.source_id, provider: item.provider, label: 'Inbox Intel/Resolved' },
      risk_level: 'LOW',
      idempotencyParts: [caseRow.id, action_type, item.id],
    };
  }
  if (item.source_type === 'basecamp_todo') {
    const projectId = (item.snapshot as any)?.project_id ?? null;
    return {
      action_type: 'BASECAMP_COMPLETE_TODO',
      item_id: item.id,
      target_source: 'basecamp',
      target_id: item.source_id,
      preview: `Mark Basecamp to-do "${item.title}" complete`,
      payload: { project_id: projectId },
      risk_level: 'LOW',
      idempotencyParts: [caseRow.id, 'BASECAMP_COMPLETE_TODO', item.id],
    };
  }
  // basecamp_comment / basecamp_message / attachment: no natural close
  // action exists for these source types — disposition-only, by design.
  return null;
}

export async function quickResolveItem(
  caseId: string,
  itemId: string,
  resolution: QuickResolveResolution,
  requestedBy: string
): Promise<QuickResolveResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const item = await InboxCaseItem.findOne({ where: { case_id: caseId, id: itemId } });
  if (!item) {
    const err: any = new Error(`Item ${itemId} not found on case ${caseId}`);
    err.statusCode = 404;
    err.error_class = 'NotFoundError';
    throw err;
  }

  const disposition = DISPOSITION_BY_RESOLUTION[resolution];
  await item.update({ disposition, disposition_reason: `Quick resolve: ${resolution}`, updated_at: new Date() });

  const proposal = buildCloseAction(caseRow, item);
  let actionProposed: ActionType | null = null;
  if (proposal) {
    const idempotency_key = computeIdempotencyKey(proposal.idempotencyParts);
    const createdId = await createActionIfNew(caseRow, randomUUID(), requestedBy, proposal, idempotency_key, []);
    if (createdId) actionProposed = proposal.action_type;
  }

  await logCaseEvent({
    case_id: caseId,
    item_id: itemId,
    event_type: 'item_quick_resolved',
    actor_type: 'admin',
    actor_id: requestedBy,
    details: { resolution, disposition, action_proposed: actionProposed },
    correlation_id: caseRow.correlation_id,
  });

  return { dispositionSet: disposition, actionProposed };
}
