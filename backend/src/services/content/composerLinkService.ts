import { Campaign, ContentItem, ContentVariant, TrackedLink } from '../../models';
import { getLinkableHostnames } from '../journeyLinkRewriter';
import { allocateShortCode, buildTrackedLinkPreview } from '../marketing/trackedLinkService';
import type { UtmMedium, UtmParams, UtmSource } from '../marketing/marketingTaxonomyService';
import { PROVIDER_KEYS, type ProviderKey } from '../publishing/providerCapabilities';
import { env } from '../../config/env';
import { WorkflowError } from './contentWorkflowService';

/**
 * composerLinkService — spec 8.1 step 6: one tracked link per platform variant.
 *
 * Each variant gets its OWN link, not the item, because `utm_source` is the platform and a
 * single link shared across Facebook and LinkedIn would attribute every click to whichever
 * source happened to be written first. The short code is what the operator pastes; the
 * destination and UTMs behind it are frozen the moment the first click lands (T007's rule),
 * which is why this is the step that happens BEFORE preview and confirmation, not after.
 *
 * IDEMPOTENT ON DESTINATION. Generating links twice for the same destination returns the same
 * rows. Generating for a CHANGED destination mints new links and archives the old ones with
 * `superseded_by` pointing forward - the old code keeps resolving (clicks already recorded
 * against it stay meaningful) but the composer stops offering it.
 *
 * THE CAMPAIGN SLUG IS REQUIRED. `utm_campaign` is the campaign's stable slug and never its
 * display name (spec section 7; `buildUtmParams` enforces the shape). An item with no campaign,
 * or a campaign with no slug, cannot have attributable links, and this refuses rather than
 * inventing a value - a link that reports under a made-up campaign is worse than no link.
 */

/** The utm_source each provider reports under. One spelling each, from the taxonomy vocabulary. */
export const PROVIDER_UTM_SOURCE: Record<ProviderKey, UtmSource> = {
  meta_facebook_page: 'facebook',
  meta_instagram: 'instagram',
  linkedin_organization: 'linkedin',
  linkedin_member: 'linkedin',
  youtube: 'youtube',
  tiktok: 'tiktok',
  x: 'x',
};

export interface ItemLink {
  provider: ProviderKey;
  trackedLinkId: string;
  shortUrl: string;
  finalUrl: string;
  utm: UtmParams;
  /** True when an existing link for this destination was returned instead of a new one minted. */
  reused: boolean;
}

function isProviderKey(s: string): s is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(s);
}

function shortUrlFor(code: string): string {
  return `${env.publicAppUrl.replace(/\/+$/, '')}/r/${code}`;
}

/**
 * Generate (or reuse) a tracked link for every variant of the item, pointing at `destinationUrl`.
 */
export async function generateItemLinks(
  itemId: string,
  destinationUrl: string,
  /** The admin's id (`req.admin.sub`) - `tracked_links.created_by` is a UUID column, not an email. */
  createdBy: string | null,
): Promise<ItemLink[]> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');

  const campaign = item.campaign_id ? await Campaign.findByPk(item.campaign_id) : null;
  const slug = campaign?.utm_campaign_slug ?? null;
  if (!campaign || !slug) {
    throw new WorkflowError(
      'Attach this item to a campaign that has a UTM slug before generating tracked links. Links are attributed by slug, never by name.',
      409,
      'CampaignSlugRequired',
    );
  }

  const variants = await ContentVariant.findAll({ where: { content_item_id: itemId }, order: [['provider', 'ASC']] });
  if (variants.length === 0) {
    throw new WorkflowError('Generate platform variants before tracked links; each variant gets its own.', 409, 'NoVariants');
  }

  const allowedHosts = await getLinkableHostnames();
  const origin = env.publicAppUrl;
  const out: ItemLink[] = [];

  for (const variant of variants) {
    if (!isProviderKey(variant.provider)) continue;
    const provider = variant.provider;

    // Reuse: same destination, same link. This is what makes "Generate links" safe to click twice.
    const existing = variant.tracked_link_id ? await TrackedLink.findByPk(variant.tracked_link_id) : null;
    if (existing && existing.destination_url === destinationUrl && existing.status !== 'archived') {
      const preview = buildTrackedLinkPreview({
        destinationUrl, allowedHosts, shortCode: existing.short_code, shortLinkOrigin: origin,
        utm: { source: PROVIDER_UTM_SOURCE[provider], medium: 'organic_social', campaignSlug: slug, variantCode: provider },
      });
      if (preview.ok) {
        out.push({ provider, trackedLinkId: existing.id, shortUrl: preview.shortUrl!, finalUrl: preview.finalUrl!, utm: preview.utm!, reused: true });
        continue;
      }
      // The destination was acceptable when this link was made and is not now (a domain was
      // removed). Fall through and let the fresh validation below produce the reason.
    }

    const shortCode = await allocateShortCode(async (code) => (await TrackedLink.count({ where: { short_code: code } })) > 0);
    const preview = buildTrackedLinkPreview({
      destinationUrl, allowedHosts, shortCode, shortLinkOrigin: origin,
      utm: { source: PROVIDER_UTM_SOURCE[provider], medium: 'organic_social', campaignSlug: slug, variantCode: provider },
    });
    if (!preview.ok) {
      const r = preview.rejection;
      throw new WorkflowError(
        r && !r.ok ? `${r.reason} (${r.code})` : 'Destination rejected.',
        422,
        'DestinationRejected',
      );
    }

    const link = await TrackedLink.create({
      tenant_id: item.tenant_id,
      brand_id: item.brand_id,
      campaign_id: campaign.id,
      short_code: shortCode,
      destination_url: destinationUrl,
      utm_source: preview.utm!.utm_source,
      utm_medium: preview.utm!.utm_medium,
      utm_campaign: preview.utm!.utm_campaign,
      utm_content: preview.utm!.utm_content ?? null,
      utm_term: preview.utm!.utm_term ?? null,
      status: 'draft',
      created_by: createdBy,
      metadata: { content_item_id: itemId, content_variant_id: variant.id, provider },
    } as any);

    if (existing && existing.id !== link.id) {
      await existing.update({ status: 'archived', superseded_by: link.id });
    }
    await variant.update({ tracked_link_id: link.id, link_url: shortUrlFor(shortCode) });

    out.push({ provider, trackedLinkId: link.id, shortUrl: preview.shortUrl!, finalUrl: preview.finalUrl!, utm: preview.utm!, reused: false });
  }

  return out;
}

/** The current (non-archived) links for an item's variants, for the confirmation surface. */
export async function listItemLinks(itemId: string): Promise<ItemLink[]> {
  const variants = await ContentVariant.findAll({ where: { content_item_id: itemId }, order: [['provider', 'ASC']] });
  const allowedHosts = await getLinkableHostnames();
  const out: ItemLink[] = [];
  for (const variant of variants) {
    if (!isProviderKey(variant.provider) || !variant.tracked_link_id) continue;
    const link = await TrackedLink.findByPk(variant.tracked_link_id);
    if (!link || link.status === 'archived' || !link.utm_source || !link.utm_medium || !link.utm_campaign) continue;
    const preview = buildTrackedLinkPreview({
      destinationUrl: link.destination_url, allowedHosts, shortCode: link.short_code, shortLinkOrigin: env.publicAppUrl,
      utm: { source: link.utm_source as UtmSource, medium: link.utm_medium as UtmMedium, campaignSlug: link.utm_campaign, variantCode: link.utm_content },
    });
    if (!preview.ok) continue;
    out.push({ provider: variant.provider, trackedLinkId: link.id, shortUrl: preview.shortUrl!, finalUrl: preview.finalUrl!, utm: preview.utm!, reused: true });
  }
  return out;
}
