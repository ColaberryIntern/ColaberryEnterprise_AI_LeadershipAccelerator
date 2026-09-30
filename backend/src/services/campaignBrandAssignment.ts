// ─── Brand assignment for new campaigns ─────────────────────────────────────
//
// WHY. Until now nothing set `campaigns.brand_id`. The tenancy backfill had put
// every campaign that existed in August under `colaberry-enterprise`, and every
// campaign created since then landed as NULL. The result is a brand dimension that
// cannot separate anything: one historical bucket plus a growing pile of
// Unattributed. Filtering by brand on the campaign graph is only ever as good as
// what gets written here.
//
// WHAT IT WILL NOT DO. It will not guess. Eight brands are seeded across four
// tenants — `colaberry` alone owns colaberry-enterprise, colaberry-training,
// worldoftaxonomy, advisor and trustbeforeintelligence — so "the admin's brand" is
// not a single answer, and picking the largest or the first would attribute a
// campaign to a brand nobody chose. An unresolvable brand stays NULL, which reads
// as Unattributed downstream: a visible gap rather than a confident error.

import Brand from '../models/Brand';
import SenderProfile from '../models/SenderProfile';

export interface ResolvedCampaignBrand {
  brand_id: string | null;
  tenant_id: string | null;
  /** Which rule produced this, so the decision is auditable in logs and tests. */
  resolved_from: 'explicit' | 'sender_profile' | 'none';
}

export const UNRESOLVED: ResolvedCampaignBrand = {
  brand_id: null,
  tenant_id: null,
  resolved_from: 'none',
};

export class InvalidBrandError extends Error {
  readonly error_class = 'ValidationError';

  constructor(brandId: string) {
    super(`Unknown or inactive brand: ${brandId}`);
    this.name = 'InvalidBrandError';
  }
}

/**
 * Decide which brand a campaign belongs to.
 *
 * PRECEDENCE:
 *   1. An explicit `brand_id` from the caller. VALIDATED, not trusted — an id that
 *      names no active brand is rejected rather than written, because a dangling
 *      foreign key would show up in the graph as a brand with no name and look like
 *      a rendering bug rather than a bad request.
 *   2. The brand behind the campaign's sender profile: the identity it will actually
 *      send as, which is the best available evidence when nobody said explicitly.
 *   3. Nothing. NULL, surfaced downstream as Unattributed.
 *
 * The tenant is carried along from whichever brand wins, so the two columns can
 * never disagree about who owns the campaign.
 */
export async function resolveCampaignBrand(input: {
  brandId?: string | null;
  senderProfileId?: string | null;
}): Promise<ResolvedCampaignBrand> {
  const explicit = typeof input.brandId === 'string' ? input.brandId.trim() : '';

  if (explicit) {
    const brand = (await Brand.findOne({
      attributes: ['id', 'tenant_id', 'status'],
      where: { id: explicit },
      raw: true,
    })) as any as { id: string; tenant_id: string; status: string } | null;

    if (!brand || brand.status !== 'active') throw new InvalidBrandError(explicit);
    return { brand_id: brand.id, tenant_id: brand.tenant_id, resolved_from: 'explicit' };
  }

  const senderId = typeof input.senderProfileId === 'string' ? input.senderProfileId.trim() : '';
  if (senderId) {
    // A failure here is NOT fatal: the campaign is still creatable, it just has no
    // brand. Throwing would make an unrelated lookup able to block campaign
    // creation entirely, which is a much worse outcome than an unattributed row.
    try {
      const sender = (await SenderProfile.findOne({
        attributes: ['id', 'brand_id', 'tenant_id'],
        where: { id: senderId },
        raw: true,
      })) as any as { id: string; brand_id: string | null; tenant_id: string | null } | null;

      if (sender?.brand_id) {
        return {
          brand_id: sender.brand_id,
          tenant_id: sender.tenant_id ?? null,
          resolved_from: 'sender_profile',
        };
      }
    } catch (err: any) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'backend',
          event: 'campaign_brand_sender_lookup_failed',
          outcome: 'partial',
          error_class: err?.name || 'Error',
          context: { sender_profile_id: senderId },
        }),
      );
    }
  }

  return UNRESOLVED;
}

/**
 * Brands offered to a campaign-creation form.
 *
 * Active only: an inactive brand is one nobody should be starting new outreach
 * under, and offering it would invite exactly that.
 */
export async function listAssignableBrands(): Promise<
  Array<{ id: string; slug: string; name: string; tenant_id: string }>
> {
  const rows = (await Brand.findAll({
    attributes: ['id', 'slug', 'name', 'tenant_id'],
    where: { status: 'active' },
    order: [['name', 'ASC']],
    raw: true,
  })) as any as Array<{ id: string; slug: string; name: string; tenant_id: string }>;
  return rows;
}
