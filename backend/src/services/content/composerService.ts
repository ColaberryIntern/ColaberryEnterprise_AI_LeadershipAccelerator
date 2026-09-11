import { ContentItem, ContentVariant, ContentItemMedia } from '../../models';
import type { ProviderKey, ContentType } from '../publishing/providerCapabilities';
import { PROVIDER_KEYS } from '../publishing/providerCapabilities';
import { applyEdit, fingerprint, generateVariants, revertToGenerated, type Variant } from './composerVariants';
import { validateSubmission, type SubmissionValidation } from './composerValidation';
import { checkContentForBrand } from './brandGovernanceService';
import type { GovernanceResult } from './brandGovernance';
import { assertWritable, WorkflowError, type Actor } from './contentWorkflowService';
import { withEditRecorded, type RecordedEdit } from './composerEdits';

/**
 * composerService — persists what the pure composer modules decide.
 *
 * The rules live elsewhere and are tested there: which variants regeneration may touch
 * (composerVariants), whether a variant fits its platform (composerValidation), whether the
 * content obeys its brand (brandGovernance). This file maps rows to those modules' inputs and
 * writes their outputs back. It decides nothing about content.
 *
 * PROVENANCE IS STORED, NOT INFERRED. `is_manually_edited` on the row is the durable form of
 * `source: 'edited'`, and `metadata.canonicalFingerprint` is what lets a later regeneration
 * tell whether an edit is stale. Both are written the moment a human edits and never cleared
 * by generation.
 *
 * EVERY MUTATOR IS A RECORDED EDIT (composerEdits.withEditRecorded): the revision bumps, an
 * approval held by the item is invalidated when the edit touches copy, queued jobs are
 * cancelled, and the touched variants go back to `unvalidated`. Callers get the item back
 * as it is AFTER that, because its status may have changed under them.
 */

const URL_RE = /https?:\/\/[^\s)]+/g;

function isProviderKey(s: string): s is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(s);
}

function rowToVariant(row: ContentVariant, canonical: string): Variant | null {
  if (!isProviderKey(row.provider)) return null;
  return {
    provider: row.provider,
    text: row.body ?? '',
    source: row.is_manually_edited ? 'edited' : 'generated',
    canonicalFingerprint: row.metadata?.canonicalFingerprint ?? fingerprint(canonical),
    stale: Boolean(row.metadata?.stale),
  };
}

async function loadItem(itemId: string, forWrite: boolean): Promise<ContentItem> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');
  if (forWrite) assertWritable(item);
  return item;
}

async function loadVariants(itemId: string, canonical: string): Promise<{ rows: ContentVariant[]; variants: Variant[] }> {
  const rows = await ContentVariant.findAll({ where: { content_item_id: itemId }, order: [['provider', 'ASC']] });
  const variants = rows.map((r) => rowToVariant(r, canonical)).filter((v): v is Variant => v !== null);
  return { rows, variants };
}

/**
 * Generate (or regenerate) variants for the given providers. Edited variants survive.
 */
export async function generateItemVariants(
  itemId: string,
  providers: readonly ProviderKey[],
  actor: Actor = {},
): Promise<RecordedEdit<Variant[]>> {
  const item = await loadItem(itemId, true);
  return withEditRecorded(itemId, actor, providers, async () => {
    const canonical = item.canonical_body ?? '';
    const { rows, variants: existing } = await loadVariants(itemId, canonical);
    const next = generateVariants(canonical, providers, existing);

    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    for (const v of next) {
      const row = byProvider.get(v.provider);
      const patch = {
        body: v.text,
        is_manually_edited: v.source === 'edited',
        metadata: { ...(row?.metadata ?? {}), canonicalFingerprint: v.canonicalFingerprint, stale: v.stale },
      };
      if (row) {
        // An edited row keeps its body; only its stale flag moves. A generated row is replaced.
        await row.update(v.source === 'edited' ? { metadata: patch.metadata } : patch);
      } else {
        // Sequelize's creation-attributes type predates the model's `declare` fields; the
        // cast is the repo's idiom for create() on these models.
        await ContentVariant.create({ content_item_id: itemId, provider: v.provider, ...patch } as any);
      }
    }
    return next;
  });
}

export async function editItemVariant(
  itemId: string,
  provider: ProviderKey,
  text: string,
  actor: Actor,
): Promise<RecordedEdit<Variant>> {
  const item = await loadItem(itemId, true);
  const canonical = item.canonical_body ?? '';
  const row = await ContentVariant.findOne({ where: { content_item_id: itemId, provider } });
  if (!row) throw new WorkflowError(`No ${provider} variant exists yet; generate first.`, 404, 'NotFound');
  return withEditRecorded(itemId, actor, [provider], async () => {
    const current = rowToVariant(row, canonical)!;
    const edited = applyEdit(current, text, canonical);
    await row.update({
      body: edited.text,
      is_manually_edited: true,
      edited_by: actor.email ?? null,
      edited_at: new Date(),
      metadata: { ...(row.metadata ?? {}), canonicalFingerprint: edited.canonicalFingerprint, stale: false },
    });
    return edited;
  });
}

export async function revertItemVariant(itemId: string, provider: ProviderKey, actor: Actor = {}): Promise<RecordedEdit<Variant>> {
  const item = await loadItem(itemId, true);
  const canonical = item.canonical_body ?? '';
  const row = await ContentVariant.findOne({ where: { content_item_id: itemId, provider } });
  if (!row) throw new WorkflowError(`No ${provider} variant exists.`, 404, 'NotFound');
  return withEditRecorded(itemId, actor, [provider], async () => {
    const reverted = revertToGenerated(rowToVariant(row, canonical)!, canonical);
    await row.update({
      body: reverted.text,
      is_manually_edited: false,
      metadata: { ...(row.metadata ?? {}), canonicalFingerprint: reverted.canonicalFingerprint, stale: false },
    });
    return reverted;
  });
}

export interface ItemValidation {
  providers: SubmissionValidation;
  governance: GovernanceResult | null;
  /** True only when every provider check passes AND governance raises no blocking violation. */
  ok: boolean;
}

/**
 * Validate every variant against its platform AND the content against its brand's rules.
 * Both are reported in full; `ok` is the conjunction. Results are persisted on each variant row
 * so the state survives a reload and the queue can read it.
 */
export async function validateItem(itemId: string): Promise<ItemValidation> {
  const item = await loadItem(itemId, false);
  const canonical = item.canonical_body ?? '';
  const { rows, variants } = await loadVariants(itemId, canonical);
  const mediaCount = await ContentItemMedia.count({ where: { content_item_id: itemId } });

  const providers = validateSubmission(variants, (provider) => {
    const row = rows.find((r) => r.provider === provider);
    const text = row?.body ?? '';
    return {
      contentType: item.content_type as ContentType,
      mediaCount,
      links: text.match(URL_RE) ?? [],
    };
  });

  for (const r of providers.variants) {
    const row = rows.find((x) => x.provider === r.provider);
    if (row) await row.update({ validation_state: r.ok ? 'valid' : 'invalid', validation_errors: r.problems });
  }

  const governance = item.brand_id
    ? await checkContentForBrand(item.brand_id, {
        body: canonical,
        disclosure: rows.map((r) => r.disclosure_text ?? '').join('\n'),
        links: canonical.match(URL_RE) ?? [],
        isPaid: Boolean(item.metadata?.isPaid),
        aiGenerated: Boolean(item.ai_model),
        hasOffer: Boolean(item.metadata?.hasOffer),
        kinds: Array.isArray(item.metadata?.kinds) ? item.metadata.kinds : [],
        ai: item.ai_model
          ? { model: item.ai_model, promptVersion: item.ai_prompt_version, templateVersion: item.ai_template_version, humanApproved: item.human_approved }
          : undefined,
      })
    : null;

  return { providers, governance, ok: providers.ok && (governance?.ok ?? true) };
}
