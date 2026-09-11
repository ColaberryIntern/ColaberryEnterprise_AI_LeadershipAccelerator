import { Brand, Campaign, ContentApprovalRequest, ContentItem, ContentItemMedia, ContentVariant, MediaAsset } from '../../models';
import { PROVIDER_KEYS, type ProviderKey } from '../publishing/providerCapabilities';
import { buildConfirmation, type ConfirmationInput, type ConfirmationSummary } from './composerConfirmation';
import { listItemLinks } from './composerLinkService';
import { WorkflowError } from './contentWorkflowService';

/**
 * Loads everything the confirmation surface shows and hands it to the pure builder.
 *
 * Validation state is read from what the last `validateItem` run persisted on the variant
 * rows, not re-run here: the confirmation describes the item AS VALIDATED, and if the
 * operator edited since, `validation.ran` is false and the readiness reasons say so. Re-running
 * silently on read would let a confirmation claim a green state the operator never saw.
 */

function isProviderKey(s: string): s is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(s);
}

export async function buildItemConfirmation(itemId: string): Promise<ConfirmationSummary> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');

  const [brand, campaign, variantRows, links, mediaRows, approval] = await Promise.all([
    item.brand_id ? Brand.findByPk(item.brand_id) : Promise.resolve(null),
    item.campaign_id ? Campaign.findByPk(item.campaign_id) : Promise.resolve(null),
    ContentVariant.findAll({ where: { content_item_id: itemId }, order: [['provider', 'ASC']] }),
    listItemLinks(itemId),
    ContentItemMedia.findAll({ where: { content_item_id: itemId }, order: [['position', 'ASC']] }),
    ContentApprovalRequest.findOne({ where: { content_item_id: itemId }, order: [['requested_at', 'DESC']] }),
  ]);

  const assets = await Promise.all(mediaRows.map(async (m) => {
    const a = await MediaAsset.findByPk(m.media_asset_id);
    return {
      id: m.media_asset_id,
      filename: a?.original_filename ?? null,
      mime_type: a?.mime_type ?? 'unknown',
      alt_text: a?.alt_text ?? null,
      position: m.position,
    };
  }));

  const variants = variantRows.filter((r) => isProviderKey(r.provider)).map((r) => ({
    provider: r.provider as ProviderKey,
    body: r.body ?? '',
    is_manually_edited: Boolean(r.is_manually_edited),
    stale: Boolean(r.metadata?.stale),
    link_url: r.link_url ?? null,
  }));

  // Validation "ran" only if every variant carries a persisted verdict. A single 'pending'
  // means the last run predates a variant that exists now.
  const ran = variantRows.length > 0 && variantRows.every((r) => r.validation_state === 'valid' || r.validation_state === 'invalid');
  const blockers = ran
    ? variantRows.flatMap((r) => (Array.isArray(r.validation_errors) ? r.validation_errors : []).filter((p) => p?.severity === 'block'))
    : [];
  const validation: ConfirmationInput['validation'] = ran ? { ok: blockers.length === 0, blockers } : null;

  return buildConfirmation({
    item: {
      id: item.id,
      title: item.title,
      status: item.status,
      content_type: item.content_type,
      scheduled_for: item.scheduled_for ? new Date(item.scheduled_for).toISOString() : null,
      human_approved: Boolean(item.human_approved),
      revision: item.revision ?? 1,
    },
    brand: brand ? { id: brand.id, name: brand.name, timezone: brand.timezone ?? null } : null,
    campaign: campaign ? { id: campaign.id, name: campaign.name, utm_campaign_slug: campaign.utm_campaign_slug ?? null } : null,
    variants,
    links: links.map((l) => ({ provider: l.provider, short_url: l.shortUrl, final_url: l.finalUrl, utm: l.utm as unknown as Record<string, string> })),
    assets,
    approval: approval ? {
      status: approval.status,
      requested_by: approval.requested_by,
      requested_at: new Date(approval.requested_at).toISOString(),
      decided_by: approval.decided_by,
      decided_at: approval.decided_at ? new Date(approval.decided_at).toISOString() : null,
      decision_note: approval.decision_note,
    } : null,
    validation,
  });
}
