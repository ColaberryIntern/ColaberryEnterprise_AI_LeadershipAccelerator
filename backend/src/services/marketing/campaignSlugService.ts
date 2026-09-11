import { Op } from 'sequelize';
import { Brand, Campaign, TrackedLink } from '../../models';
import { assertSlugChangeAllowed, buildCampaignSlug, TaxonomyError } from './marketingTaxonomyService';
import { WorkflowError } from '../content/contentWorkflowService';

/**
 * campaignSlugService — gives a campaign its canonical `utm_campaign_slug`.
 *
 * `buildCampaignSlug` (T006) had no caller: nothing in the application ever wrote the slug,
 * so no campaign could have one, and the composer's "Generate tracked links" refused every
 * campaign with CampaignSlugRequired. The T032 live verifier found the chain's root unwired
 * (0 of 44 production campaigns carried a slug). This is the consumer.
 *
 * Two ways in: assigned when a campaign is created with enough to build one, and assigned on
 * demand by the operator from the composer (`POST /api/admin/campaigns/:id/slug`), with the
 * offer and audience segments supplied there if the campaign does not carry them.
 *
 * FROZEN ONCE CLICKS EXIST. `assertSlugChangeAllowed` refuses a change after any tracked link
 * for the campaign has been published, because the slug is the join key for every click
 * already recorded. Uniqueness is per tenant (the index on `(tenant_id, utm_campaign_slug)`);
 * a collision gets a numeric suffix rather than an error the operator cannot resolve.
 */

export interface SlugInputs {
  /** What is on offer; defaults to the campaign name. */
  offer?: string | null;
  /** Who it is for; defaults to 'all'. */
  audience?: string | null;
}

export interface SlugAssignment {
  campaign: Campaign;
  slug: string;
  /** True when the campaign already carried this exact slug (idempotent call). */
  unchanged: boolean;
}

async function uniqueWithinTenant(base: string, tenantId: string | null, exceptCampaignId: string): Promise<string> {
  let candidate = base;
  for (let n = 2; n < 100; n += 1) {
    const clash = await Campaign.findOne({
      where: { utm_campaign_slug: candidate, ...(tenantId ? { tenant_id: tenantId } : {}), id: { [Op.ne]: exceptCampaignId } },
    });
    if (!clash) return candidate;
    candidate = `${base}-${n}`;
  }
  throw new WorkflowError(`Could not find a unique slug for "${base}" after 99 attempts.`, 409, 'SlugCollision');
}

export async function assignCampaignSlug(campaignId: string, inputs: SlugInputs = {}): Promise<SlugAssignment> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new WorkflowError('Campaign not found', 404, 'NotFound');

  const brand = campaign.brand_id ? await Brand.findByPk(campaign.brand_id) : null;
  if (!brand) {
    throw new WorkflowError('Give the campaign a brand first; the slug starts with the brand.', 409, 'BrandRequired');
  }

  let base: string;
  try {
    base = buildCampaignSlug({
      brand: brand.slug,
      objective: campaign.objective || 'awareness',
      offer: (inputs.offer ?? '').trim() || campaign.name,
      audience: (inputs.audience ?? '').trim() || 'all',
      date: campaign.created_at ? new Date(campaign.created_at) : new Date(),
    });
  } catch (err) {
    if (err instanceof TaxonomyError) throw new WorkflowError(err.message, 422, err.code);
    throw err;
  }

  const current = campaign.utm_campaign_slug ?? null;
  if (current === base) return { campaign, slug: base, unchanged: true };

  // Published tracked links freeze the slug: clicks already recorded join on it.
  const published = await TrackedLink.findOne({ where: { campaign_id: campaign.id, published_at: { [Op.ne]: null } } });
  const verdict = assertSlugChangeAllowed({ currentSlug: current, proposedSlug: base, publishedAt: published?.published_at ?? null });
  if (!verdict.allowed) throw new WorkflowError(verdict.reason ?? 'Slug is frozen.', 409, 'SlugFrozen');

  const slug = await uniqueWithinTenant(base, campaign.tenant_id ?? null, campaign.id);
  await campaign.update({ utm_campaign_slug: slug });
  return { campaign, slug, unchanged: false };
}

/**
 * Best-effort assignment at creation: a campaign with a brand and an objective gets its slug
 * immediately, so the composer never meets a slugless campaign for anything created from now
 * on. Returns null (and leaves the column null) when the inputs cannot build one; the
 * operator can assign it later from the composer with the missing segments.
 */
export async function assignSlugIfPossible(campaignId: string): Promise<string | null> {
  try {
    return (await assignCampaignSlug(campaignId)).slug;
  } catch (err) {
    if (err instanceof WorkflowError && (err.errorClass === 'BrandRequired' || err.status === 422)) return null;
    throw err;
  }
}
