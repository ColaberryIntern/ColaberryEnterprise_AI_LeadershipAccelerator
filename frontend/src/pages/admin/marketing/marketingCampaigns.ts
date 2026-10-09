/**
 * marketingCampaigns - which rows in `campaigns` are MARKETING campaigns, and whose they are.
 *
 * WHY THIS IS SHARED. Ali, 2026-10-07, looking at the composer's campaign dropdown: "This list
 * are not campaigns that exists so I'm confused." They did exist - the list was every row in
 * `campaigns` filtered by brand and nothing else, so it offered forty-odd EMAIL sequences
 * (warm_nurture, cold_outbound, executive_outreach, behavioural triggers, alumni win-back)
 * alongside anything made for marketing. Most were paused months ago. Choosing one of those for
 * a LinkedIn post is not a thing anybody wants to do, and the UI was inviting it.
 *
 * The rule lived inside the composer page. Brand setup now shows the same campaigns with their
 * tracked-link slugs, and two screens answering "which campaigns can this brand post under?"
 * with two copies of the rule is how a tab that says 2 ends up above a dropdown offering 3 -
 * the same disagreement `MarketingStatTiles` was built to avoid. So the rule lives here once and
 * both screens read it.
 *
 * Pure, and takes loose rows on purpose: `/api/admin/campaigns` is shared with the rest of the
 * admin and returns far more than marketing needs. Narrowing happens here rather than by
 * mirroring the whole campaign type.
 */

/**
 * What IS a marketing campaign, rather than what is not.
 *
 * Deliberately an allowlist: a new email-lifecycle `type` added later must not silently reappear
 * in a social-post picker just because nobody remembered to add it to a denylist.
 */
export const POST_CAMPAIGN_TYPES = new Set(['marketing', 'paid_social', 'organic_social', 'content', 'launch']);

/** A finished or shelved campaign is not a destination for new posts. */
export const DEAD_CAMPAIGN_STATUSES = new Set(['completed', 'archived', 'cancelled']);

/**
 * Campaigns that can actually carry a social post.
 *
 * Campaigns with no UTM slug are KEPT, because a slug can be minted in place and both screens
 * say so against them. Hiding those would turn a fixable gap into an invisible one.
 */
export function usableForAPost(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((c) => {
    const status = String(c.status ?? '').toLowerCase();
    if (DEAD_CAMPAIGN_STATUSES.has(status)) return false;
    const type = String(c.type ?? '').toLowerCase();
    // No type at all is treated as a marketing campaign: that is what the Campaigns screen
    // creates when nobody picks one, and hiding a row somebody just made would be the worse bug.
    return type === '' || POST_CAMPAIGN_TYPES.has(type);
  });
}

/** The few fields marketing actually reads off a campaign. */
export interface MarketingCampaign {
  id: string;
  name: string;
  brand_id: string | null;
  utm_campaign_slug: string | null;
}

/**
 * The narrow shape, read the same way by every screen.
 *
 * Both callers were doing this mapping inline, which is how one of them ends up reading
 * `utm_slug` while the other reads `utm_campaign_slug` and only one screen shows the gap.
 */
export function toMarketingCampaigns(rows: Record<string, unknown>[]): MarketingCampaign[] {
  return usableForAPost(rows).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ''),
    brand_id: (c.brand_id as string | null) ?? null,
    utm_campaign_slug: (c.utm_campaign_slug as string | null) ?? null,
  }));
}

/**
 * The campaigns a given brand can post under.
 *
 * A campaign with NO `brand_id` belongs to every brand rather than to none: campaigns are shared
 * across the admin and most rows predate brands existing, so treating a null as "not this brand"
 * would empty the picker for everyone. That rule came from the composer's own setup step and is
 * kept identical here on purpose - brand setup counting one thing while the composer offers
 * another is worse than either number alone.
 *
 * `brandId` of null means no brand is selected, which narrows nothing.
 */
export function forBrand(list: MarketingCampaign[], brandId: string | null): MarketingCampaign[] {
  if (!brandId) return list;
  return list.filter((c) => !c.brand_id || c.brand_id === brandId);
}

/** Campaigns that cannot attribute a click yet, because nothing tracks an unslugged campaign. */
export function missingSlug(list: MarketingCampaign[]): MarketingCampaign[] {
  return list.filter((c) => !c.utm_campaign_slug);
}
