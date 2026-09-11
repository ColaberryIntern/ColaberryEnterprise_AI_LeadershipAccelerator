import { ContentApprovalRequest, ContentItem, ContentVariant, PublishingJob } from '../../models';
import { transition } from './contentWorkflow';
import { WorkflowError, type Actor } from './contentWorkflowService';
import { validateItem, type ItemValidation } from './composerService';

/**
 * composerActionService — spec 8.1 step 9: publish now, schedule, save draft, or send for
 * approval. Each action is the lifecycle transition it implies plus the side effect that
 * makes the new status TRUE, in one place:
 *
 *   save_draft         -> 'draft'            (withdraws from review if it was there)
 *   send_for_approval  -> 'ready_for_review' + one open approval request
 *   schedule           -> 'scheduled'        + one publishing job per variant, at the time set
 *   publish_now        -> 'scheduled'        + one publishing job per variant, due immediately
 *
 * A status without its side effect is a lie the queue then has to discover: an item marked
 * `scheduled` with no job never publishes and nothing reports it. So the job rows are created
 * HERE, keyed idempotently, and the status moves only after they exist.
 *
 * VALIDATION GATES EVERY FORWARD ACTION. Sending for approval, scheduling and publishing each
 * run the full item validation first and refuse with the blockers if it fails. The item does
 * NOT move to `validation_failed` for this - the operator is on the page and can fix it; that
 * exceptional state is for validation that fails later, out of their sight.
 *
 * NOTHING HERE TALKS TO A PROVIDER. `publish_now` queues a job due now; the transport that
 * runs it, and the kill switch in front of it, are T026's. This service ends at the queue.
 */

export type ComposerAction = 'save_draft' | 'send_for_approval' | 'schedule' | 'publish_now';
export const COMPOSER_ACTIONS: readonly ComposerAction[] = ['save_draft', 'send_for_approval', 'schedule', 'publish_now'];

export interface ActionResult {
  action: ComposerAction;
  item: ContentItem;
  /** Present for the three gated actions; null for save_draft. */
  validation: ItemValidation | null;
  approvalRequestId: string | null;
  /** Jobs that exist for this item/revision/occurrence after the action - created or already there. */
  jobs: Array<{ id: string; provider: string; publishAt: string; created: boolean }>;
}

async function loadItem(itemId: string): Promise<ContentItem> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');
  return item;
}

function move(item: ContentItem, to: ContentItem['status']): void {
  const r = transition(item.status, to);
  if (!r.ok) throw new WorkflowError(r.reason, 409, 'IllegalTransition');
}

async function gate(itemId: string): Promise<ItemValidation> {
  const validation = await validateItem(itemId);
  if (!validation.ok) {
    const n = validation.providers.blockers.length;
    const g = validation.governance && !validation.governance.ok ? ' Brand governance also raised a blocking violation.' : '';
    throw new WorkflowError(
      `Validation failed: ${n} blocking problem${n === 1 ? '' : 's'} across platform variants.${g}`,
      409,
      'ValidationFailed',
    );
  }
  return validation;
}

/**
 * One job per variant, `findOrCreate` on the derived idempotency key. Calling this twice for
 * the same item, revision and occurrence returns the same rows; the second call creates none.
 */
async function enqueueJobs(item: ContentItem, publishAt: Date): Promise<ActionResult['jobs']> {
  const variants = await ContentVariant.findAll({ where: { content_item_id: item.id }, order: [['provider', 'ASC']] });
  if (variants.length === 0) throw new WorkflowError('Nothing to publish: the item has no platform variants.', 409, 'NoVariants');

  const occurrence = publishAt.toISOString();
  const revision = item.revision ?? 1;
  const out: ActionResult['jobs'] = [];
  for (const v of variants) {
    const idempotency_key = `${item.id}:${v.id}:${revision}:${occurrence}`;
    const [job, created] = await PublishingJob.findOrCreate({
      where: { idempotency_key },
      defaults: {
        tenant_id: item.tenant_id,
        brand_id: item.brand_id,
        content_item_id: item.id,
        content_variant_id: v.id,
        channel_account_id: v.channel_account_id ?? null,
        provider: v.provider,
        publish_at: publishAt,
        scheduled_occurrence: occurrence,
        content_revision: revision,
        idempotency_key,
        state: 'pending',
        policy_snapshot: { queued_by: 'composer', content_type: item.content_type },
      } as any,
    });
    out.push({ id: job.id, provider: v.provider, publishAt: occurrence, created });
  }
  return out;
}

export async function saveDraft(itemId: string): Promise<ActionResult> {
  const item = await loadItem(itemId);
  // scheduled -> draft is legal in the table ONLY for invalidation (recordEdit), which
  // cancels the queued jobs as it goes. Save-draft does not, so it must not take that door.
  if (item.status === 'scheduled') {
    throw new WorkflowError('This item is scheduled. Cancel its queued jobs first; saving as draft does not unschedule.', 409, 'IllegalTransition');
  }
  if (item.status !== 'draft') {
    move(item, 'draft');
    // Withdrawing from review closes the open request so a reviewer cannot approve a post
    // the author has taken back.
    await ContentApprovalRequest.update(
      { status: 'withdrawn', decided_at: new Date() },
      { where: { content_item_id: itemId, status: 'pending' } },
    );
    await item.update({ status: 'draft' });
  }
  return { action: 'save_draft', item, validation: null, approvalRequestId: null, jobs: [] };
}

export async function sendForApproval(itemId: string, actor: Actor): Promise<ActionResult> {
  const item = await loadItem(itemId);
  move(item, 'ready_for_review');
  const validation = await gate(itemId);

  // One open request per item is a database invariant (partial unique index); this makes the
  // second click return the same request instead of tripping it.
  const revision = item.revision ?? 1;
  let request = await ContentApprovalRequest.findOne({ where: { content_item_id: itemId, status: 'pending' } });
  if (request && request.revision_at_request !== revision) {
    await request.update({ status: 'withdrawn', decided_at: new Date(), decision_note: `Superseded by a request for revision ${revision}.` });
    request = null;
  }
  if (!request) {
    request = await ContentApprovalRequest.create({
      content_item_id: itemId,
      tenant_id: item.tenant_id,
      brand_id: item.brand_id,
      status: 'pending',
      requested_by: actor.adminId ?? actor.email ?? null,
      requested_at: new Date(),
      revision_at_request: revision,
    } as any);
  }
  await item.update({ status: 'ready_for_review' });
  return { action: 'send_for_approval', item, validation, approvalRequestId: request.id, jobs: [] };
}

export async function schedule(itemId: string, scheduledFor: Date, now: Date = new Date()): Promise<ActionResult> {
  if (Number.isNaN(scheduledFor.getTime())) throw new WorkflowError('scheduled_for is not a valid instant.', 400, 'ValidationError');
  if (scheduledFor.getTime() <= now.getTime()) {
    throw new WorkflowError('scheduled_for is in the past. Use publish_now, or pick a future time.', 400, 'ValidationError');
  }
  const item = await loadItem(itemId);
  move(item, 'scheduled');
  const validation = await gate(itemId);
  await item.update({ scheduled_for: scheduledFor });
  const jobs = await enqueueJobs(item, scheduledFor);
  await item.update({ status: 'scheduled' });
  return { action: 'schedule', item, validation, approvalRequestId: null, jobs };
}

export async function publishNow(itemId: string, now: Date = new Date()): Promise<ActionResult> {
  const item = await loadItem(itemId);
  move(item, 'scheduled');
  const validation = await gate(itemId);
  await item.update({ scheduled_for: now });
  const jobs = await enqueueJobs(item, now);
  await item.update({ status: 'scheduled' });
  return { action: 'publish_now', item, validation, approvalRequestId: null, jobs };
}

export async function runComposerAction(
  itemId: string,
  action: ComposerAction,
  actor: Actor,
  scheduledFor: Date | null,
): Promise<ActionResult> {
  switch (action) {
    case 'save_draft': return saveDraft(itemId);
    case 'send_for_approval': return sendForApproval(itemId, actor);
    case 'schedule':
      if (!scheduledFor) throw new WorkflowError('schedule requires scheduled_for.', 400, 'ValidationError');
      return schedule(itemId, scheduledFor);
    case 'publish_now': return publishNow(itemId);
    default: throw new WorkflowError(`Unknown action ${String(action)}`, 400, 'ValidationError');
  }
}
