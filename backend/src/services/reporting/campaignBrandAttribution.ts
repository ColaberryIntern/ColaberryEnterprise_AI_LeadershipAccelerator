// ─── Campaign → Brand attribution ───────────────────────────────────────────
//
// WHY THIS EXISTS. "Which brand is sending out what" is a question the campaign
// graph could not previously answer, because the graph traces LEADS and the brand
// lives on the CAMPAIGN. This module is the join, kept separate from
// campaignGraphService so the path-tracing engine stays about paths.
//
// ATTRIBUTION PRECEDENCE, and why it is a precedence rather than a single column:
//
//   1. `campaigns.brand_id`      — the declared owner of the campaign.
//   2. `sender_profiles.brand_id` — the identity the campaign actually SENDS AS,
//      reached through `campaigns.sender_profile_id`. A campaign with no declared
//      brand but a sender profile is still demonstrably sending as that brand, and
//      the sending identity is the thing the question is really about.
//   3. Unattributed — neither is set. Reported as its own bucket rather than
//      folded into the largest brand, because "we do not know" and "Colaberry
//      Enterprise" are different facts and merging them would invent attribution.
//
// KNOWN DATA REALITY (verified by reading backfillTenancy.ts, not assumed): the
// tenancy backfill assigned EVERY campaign that existed at the time to the single
// `colaberry-enterprise` brand, and `campaignRoutes.ts` does not set `brand_id` on
// create. So in a database where that backfill has run, expect exactly two buckets
// today — one real brand plus Unattributed — until campaigns are created under the
// other seeded brands (cpn, ai-flotation, refactored). The filter is built to be
// correct rather than to look busy: if the data says one brand, it shows one brand,
// and the caller surfaces that as a data-quality warning instead of hiding it.

import { Campaign } from '../../models';
import Brand from '../../models/Brand';
import SenderProfile from '../../models/SenderProfile';
import { Op } from 'sequelize';

/** Sentinel id for campaigns with no resolvable brand. Not a real Brand row. */
export const UNATTRIBUTED_BRAND_ID = '__unattributed__';
export const UNATTRIBUTED_BRAND_NAME = 'Unattributed';

export interface CampaignBrand {
  brand_id: string;
  brand_name: string;
  /** false when this is the Unattributed sentinel rather than a real brand row. */
  attributed: boolean;
  /** Which rule in the precedence produced this answer. Auditable, not decorative. */
  resolved_from: 'campaign' | 'sender_profile' | 'none';
}

export type CampaignBrandMap = Map<string, CampaignBrand>;

export interface BrandSummary {
  brand_id: string;
  brand_name: string;
  attributed: boolean;
  campaign_count: number;
  /** Leads touching at least one campaign of this brand, within the graph shown. */
  lead_count: number;
}

export interface CampaignBrandLoad {
  map: CampaignBrandMap;
  /** Non-fatal degradations, surfaced to the UI rather than swallowed. */
  warnings: string[];
}

export const UNATTRIBUTED: CampaignBrand = {
  brand_id: UNATTRIBUTED_BRAND_ID,
  brand_name: UNATTRIBUTED_BRAND_NAME,
  attributed: false,
  resolved_from: 'none',
};

/**
 * Resolve the owning brand for each campaign id.
 *
 * Three plain queries joined in memory rather than a Sequelize `include` chain,
 * because Campaign has no declared association to Brand or SenderProfile in this
 * codebase and adding one to serve a read would change the model surface for every
 * other consumer.
 *
 * FAILURE POSTURE: a query that fails degrades that STEP to unattributed and
 * records a warning. It never throws, because a missing brand column must not take
 * down the whole campaign graph, and it never silently swallows, because a graph
 * that reports "all unattributed" for an infrastructure reason would otherwise be
 * indistinguishable from one where the data genuinely has no brands.
 */
export async function loadCampaignBrandMap(campaignIds: string[]): Promise<CampaignBrandLoad> {
  const map: CampaignBrandMap = new Map();
  const warnings: string[] = [];

  if (campaignIds.length === 0) return { map, warnings };

  let campaignRows: Array<{ id: string; brand_id: string | null; sender_profile_id: string | null }> = [];
  try {
    campaignRows = (await Campaign.findAll({
      attributes: ['id', 'brand_id', 'sender_profile_id'],
      where: { id: { [Op.in]: campaignIds } },
      raw: true,
    })) as any;
  } catch (err: any) {
    warnings.push(
      `Brand attribution unavailable: campaign brand columns could not be read (${err?.name || 'Error'}). ` +
        'Every campaign is shown as Unattributed.',
    );
    for (const id of campaignIds) map.set(id, UNATTRIBUTED);
    return { map, warnings };
  }

  // Sender-profile fallback only for campaigns with no declared brand.
  const senderIds = Array.from(
    new Set(campaignRows.filter((c) => !c.brand_id && c.sender_profile_id).map((c) => c.sender_profile_id as string)),
  );
  const senderBrand = new Map<string, string>();
  if (senderIds.length > 0) {
    try {
      const senderRows = (await SenderProfile.findAll({
        attributes: ['id', 'brand_id'],
        where: { id: { [Op.in]: senderIds } },
        raw: true,
      })) as any as Array<{ id: string; brand_id: string | null }>;
      for (const s of senderRows) if (s.brand_id) senderBrand.set(s.id, s.brand_id);
    } catch (err: any) {
      warnings.push(
        `Sender-profile brand fallback unavailable (${err?.name || 'Error'}). ` +
          'Campaigns without a declared brand are shown as Unattributed.',
      );
    }
  }

  const brandIds = Array.from(
    new Set([
      ...campaignRows.map((c) => c.brand_id).filter(Boolean),
      ...Array.from(senderBrand.values()),
    ] as string[]),
  );
  const brandNames = new Map<string, string>();
  if (brandIds.length > 0) {
    try {
      const brandRows = (await Brand.findAll({
        attributes: ['id', 'name'],
        where: { id: { [Op.in]: brandIds } },
        raw: true,
      })) as any as Array<{ id: string; name: string }>;
      for (const b of brandRows) brandNames.set(b.id, b.name);
    } catch (err: any) {
      warnings.push(
        `Brand names could not be read (${err?.name || 'Error'}). Brands are identified by id only.`,
      );
    }
  }

  const byId = new Map(campaignRows.map((c) => [c.id, c]));
  for (const id of campaignIds) {
    const row = byId.get(id);
    if (!row) {
      // Campaign referenced by a lead path but no longer present. Real, and worth
      // saying: it means the graph is drawing a campaign that has been deleted.
      map.set(id, UNATTRIBUTED);
      continue;
    }
    const direct = row.brand_id;
    const viaSender = !direct && row.sender_profile_id ? senderBrand.get(row.sender_profile_id) : undefined;
    const resolved = direct || viaSender;
    if (!resolved) {
      map.set(id, UNATTRIBUTED);
      continue;
    }
    map.set(id, {
      brand_id: resolved,
      // An id with no name row is still a real brand; naming it by id beats
      // calling it Unattributed, which would be a different and false claim.
      brand_name: brandNames.get(resolved) || resolved,
      attributed: true,
      resolved_from: direct ? 'campaign' : 'sender_profile',
    });
  }

  return { map, warnings };
}

/**
 * Roll campaign nodes up into the brand list that drives the filter.
 *
 * PURE, and deliberately so: every number the brand dropdown shows is derived from
 * the same nodes the diagram draws, so the two can never disagree. `lead_count` is
 * summed across a brand's campaigns and is therefore an upper bound on distinct
 * leads — one lead enrolled in two campaigns of the same brand counts twice. That
 * is why it is named a count of campaign memberships in the UI rather than of
 * people; computing distinct leads per brand needs lead-level sets, which is what
 * the brand-filtered graph itself returns.
 */
export function summarizeBrands(
  campaignNodes: Array<{ id: string; count: number }>,
  brandMap: CampaignBrandMap,
): BrandSummary[] {
  const acc = new Map<string, BrandSummary>();

  for (const node of campaignNodes) {
    const campaignId = node.id.replace(/^campaign_/, '');
    const brand = brandMap.get(campaignId) || UNATTRIBUTED;
    const existing = acc.get(brand.brand_id);
    if (existing) {
      existing.campaign_count += 1;
      existing.lead_count += node.count;
    } else {
      acc.set(brand.brand_id, {
        brand_id: brand.brand_id,
        brand_name: brand.brand_name,
        attributed: brand.attributed,
        campaign_count: 1,
        lead_count: node.count,
      });
    }
  }

  // Real brands first, biggest first; Unattributed always last because it is a gap
  // in the data rather than a competitor to the brands above it.
  return Array.from(acc.values()).sort((a, b) => {
    if (a.attributed !== b.attributed) return a.attributed ? -1 : 1;
    if (b.lead_count !== a.lead_count) return b.lead_count - a.lead_count;
    return a.brand_name.localeCompare(b.brand_name);
  });
}
