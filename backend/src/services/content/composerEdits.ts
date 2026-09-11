import { ContentItem, ContentItemMedia, ContentVariant } from '../../models';
import type { ApprovalSnapshot, InvalidationResult } from './contentWorkflow';
import { assertWritable, recordEdit, WorkflowError, type Actor } from './contentWorkflowService';

/**
 * composerEdits — every write the composer makes to content goes through here, so that:
 *
 *   1. the edit is RECORDED (T021's `recordEdit`): the revision bumps, and if the item held
 *      an approval and the edit touched an invalidating field, the approval is invalidated,
 *      queued jobs are cancelled and the item returns to draft;
 *   2. the touched variants' VALIDATION IS RESET to `unvalidated`, so the confirmation says
 *      "not run for this revision" instead of showing a verdict earned by different copy.
 *
 * Both existed before this module and neither was wired: `recordEdit` had zero consumers and
 * `validation_state` was only ever written by `validateItem`. The independent verifier found
 * the consequence - an approved item's copy could be changed and published as approved. This
 * module is the consumer.
 */

function sorted(xs: readonly string[]): string[] {
  return [...xs].sort();
}

/** What the approver saw, or sees now: the fields spec 8.3 says invalidate on change. */
export async function snapshotItem(itemId: string): Promise<ApprovalSnapshot> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');
  const variants = await ContentVariant.findAll({ where: { content_item_id: itemId }, order: [['provider', 'ASC']] });
  const media = await ContentItemMedia.findAll({ where: { content_item_id: itemId } });
  return {
    copy: [item.canonical_body ?? '', ...variants.map((v) => `${v.provider}:${v.body ?? ''}`)].join('\n---\n'),
    media: sorted(media.map((m) => m.media_asset_id)),
    destination: sorted(variants.map((v) => `${v.provider}:${v.link_url ?? ''}`)),
    account: sorted(variants.map((v) => v.channel_account_id ?? '')),
    schedule: item.scheduled_for ? new Date(item.scheduled_for).toISOString() : null,
    disclosure: variants.map((v) => v.disclosure_text ?? '').join('\n'),
    campaign: item.campaign_id ?? null,
  };
}

/**
 * Forget the last verdict for these variants - `undefined` means all of them, an empty list
 * means none (a title edit touches no copy). The distinction matters: resetting on a
 * title change would send the operator back to validate copy that did not change.
 */
export async function resetValidation(itemId: string, providers?: readonly string[]): Promise<number> {
  if (providers !== undefined && providers.length === 0) return 0;
  const where: Record<string, unknown> = { content_item_id: itemId };
  if (providers) where.provider = [...providers];
  const [n] = await ContentVariant.update({ validation_state: 'unvalidated', validation_errors: [] }, { where });
  return n;
}

export interface RecordedEdit<T> {
  result: T;
  invalidation: InvalidationResult;
  /** The item AFTER recordEdit: revision bumped, status possibly back to draft. */
  item: ContentItem;
}

/**
 * Run a mutation between two snapshots and record the difference. The mutation itself must
 * not touch `revision` or `status`; recordEdit owns both.
 */
export async function withEditRecorded<T>(
  itemId: string,
  actor: Actor,
  touchedProviders: readonly string[] | 'all',
  mutate: () => Promise<T>,
): Promise<RecordedEdit<T>> {
  const before = await snapshotItem(itemId);
  const result = await mutate();
  await resetValidation(itemId, touchedProviders === 'all' ? undefined : touchedProviders);
  const after = await snapshotItem(itemId);
  const { item, invalidation } = await recordEdit(itemId, before, after, actor);
  return { result, invalidation, item };
}

export interface DraftPatch {
  title?: string;
  canonical_body?: string;
  content_type?: string;
  scheduled_for?: string | null;
}

/** PATCH /api/admin/content/:id, as a recorded edit. */
export async function updateItemDraft(itemId: string, patch: DraftPatch, actor: Actor): Promise<RecordedEdit<ContentItem>> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');
  assertWritable(item);

  // A body or type change invalidates every variant's verdict; a title or time change
  // invalidates none (the platform checks copy, not titles), so nothing is reset for those.
  const touchesCopy = patch.canonical_body !== undefined || patch.content_type !== undefined;
  return withEditRecorded(itemId, actor, touchesCopy ? 'all' : [], async () => {
    const { scheduled_for, ...rest } = patch;
    await item.update({
      ...rest,
      ...(scheduled_for !== undefined ? { scheduled_for: scheduled_for ? new Date(scheduled_for) : null } : {}),
    });
    return item;
  });
}
