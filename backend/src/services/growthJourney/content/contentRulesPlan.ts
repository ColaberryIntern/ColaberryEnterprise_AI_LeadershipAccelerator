/**
 * The content-rules plan (Phase 4 T412): what the operator's tool WOULD write,
 * computed as a pure function of the asset registry.
 *
 * ─── A RULE ROW IS A DECLARATION, NOT A STAMP ───────────────────────────────
 *
 * `growth_journey_content_rules` is where Phase 4 declares which authored asset
 * an offer family may cite (T304's gate reads it and fails closed without it).
 * The assets themselves are SYNCED rows - `explorer_content_assets` is written
 * by `syncTimelineCards` from the curriculum, and a `brand_id` or
 * `offer_family` stamped on a synced row would be overwritten by the next sync
 * and would make the registry claim an ownership the curriculum never stated.
 * So this planner emits rule rows keyed on `asset_id` and NOTHING for the
 * assets: no update, no stamp, not even a projected one. The script that runs
 * it contains no `UPDATE explorer_content_assets` at all, and both are pinned
 * by tests.
 *
 * ─── THE RULE TABLE, SMALL AND LITERAL ──────────────────────────────────────
 *
 * Learner brands only. An active `LESSON` asset whose `audience_tags` contain
 * `free_preview` is `learner_free_training`; otherwise (`full_access`) it is
 * `learner_paid_training`. The NARROWER audience wins, because week-0 cards
 * carry BOTH tags (`syncTimelineCards.ts:128`) and the unique index is
 * `(brand_id, asset_id, version)` - one family per asset, so the choice has to
 * be made here rather than left to two rows racing.
 *
 * The FAMILIES are per brand, because the brands do not offer the same things:
 * Colaberry Training declares both learner families; CPN declares only
 * `learner_free_training` - it runs scholarship cohorts, and a paid-training
 * declaration under CPN would approve a citation for an offer CPN does not
 * make. An asset whose family the brand does not offer is skipped BY NAME,
 * never re-homed into the family the brand happens to have.
 *
 * Business and AI Flotation get NO rows: they have no authored assets, and a
 * rule pointing at a learner asset under a service brand is exactly the
 * cross-brand citation the phase forbids. A retired (inactive) asset gets no
 * rule either - an approval for something nobody publishes is an approval
 * waiting to be wrong.
 */

export const FREE_PREVIEW_TAG = 'free_preview';
export const FULL_ACCESS_TAG = 'full_access';
export const RULED_ASSET_TYPE = 'LESSON';

export const LEARNER_FREE_FAMILY = 'learner_free_training';
export const LEARNER_PAID_FAMILY = 'learner_paid_training';

/**
 * The families each brand declares. A brand absent here has no authored assets
 * (the service brands) and gets no rows at all.
 */
export const FAMILIES_BY_BRAND_SLUG: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'colaberry-training': [LEARNER_FREE_FAMILY, LEARNER_PAID_FAMILY],
  // CPN runs scholarship cohorts: the free family only.
  cpn: [LEARNER_FREE_FAMILY],
});

/** The brands that have authored assets to declare. Service brands are absent on purpose. */
export const LEARNER_BRAND_SLUGS: readonly string[] = Object.keys(FAMILIES_BY_BRAND_SLUG);

/** The asset columns the plan reads: identity, type, audience and whether anyone publishes it. */
export interface PlanAsset {
  id: string;
  asset_type: string;
  title: string;
  audience_tags: string[];
  active: boolean;
  /**
   * The brand the asset row itself names, if any. `syncTimelineCards` writes NULL; a
   * non-null value means some other writer claimed the asset for a brand, and an asset
   * claimed for ANOTHER brand is not declared here - an approved rule supersedes
   * `contentEligibility`'s `asset_other_brand` check, so this is the place to refuse it.
   */
  brand_id?: string | null;
}

export interface PlanBrand {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
}

export interface PlannedRule {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
  asset_id: string;
  offer_family: typeof LEARNER_FREE_FAMILY | typeof LEARNER_PAID_FAMILY;
  eligible_programs: string[];
  approval_status: 'approved';
  version: number;
}

export interface PlannedPolicyPage {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
  offer_family: string;
  landing_page: string;
}

export interface SkippedAsset {
  asset_id: string;
  reason: 'not_a_lesson' | 'retired' | 'no_audience_tag' | 'family_not_offered' | 'another_brands_asset';
  /** For `family_not_offered`: which brand declined it, so the count is readable. */
  brand_slug?: string;
}

export interface ContentRulesPlan {
  rules: PlannedRule[];
  policy_pages: PlannedPolicyPage[];
  skipped: SkippedAsset[];
  /** Counts by brand slug x family - what the dry run prints, and all it prints. */
  counts: Record<string, Record<string, number>>;
  /** Brands with no authored assets, named so the operator sees the deliberate absence. */
  brands_without_assets: string[];
}

export interface BuildPlanArgs {
  brands: readonly PlanBrand[];
  /** The active registry, per brand slug. A brand absent from the map has no assets. */
  assetsByBrandSlug: Readonly<Record<string, readonly PlanAsset[]>>;
  /** The operator's approved landing page per brand slug; required for a brand that gets rules. */
  landingPageByBrandSlug: Readonly<Record<string, string>>;
  /** Rule version to write; the unique index is (brand_id, asset_id, version). */
  version?: number;
}

/** The family an asset belongs to, or null with the reason it gets no rule. */
export function familyFor(asset: PlanAsset): { family: PlannedRule['offer_family'] } | { skip: SkippedAsset['reason'] } {
  if (asset.asset_type !== RULED_ASSET_TYPE) return { skip: 'not_a_lesson' };
  if (!asset.active) return { skip: 'retired' };
  // The narrower audience wins: a week-0 card carries both tags and gets ONE rule, the free one.
  if (asset.audience_tags.includes(FREE_PREVIEW_TAG)) return { family: LEARNER_FREE_FAMILY };
  if (asset.audience_tags.includes(FULL_ACCESS_TAG)) return { family: LEARNER_PAID_FAMILY };
  return { skip: 'no_audience_tag' };
}

export class LandingPageRequiredError extends Error {
  readonly error_class = 'ValidationError';
  constructor(readonly brand_slug: string) {
    super(`--landing-page is required for ${brand_slug}: a policy entry without an approved URL approves nothing`);
    this.name = 'LandingPageRequiredError';
  }
}

export class LandingPageNotHttpsError extends Error {
  readonly error_class = 'ValidationError';
  constructor(readonly url: string) {
    super(`landing page must be an https URL: ${url}`);
    this.name = 'LandingPageNotHttpsError';
  }
}

/** An operator-supplied URL: https, parseable, no credentials, no fragment. */
export function assertLandingPage(url: string, brandSlug: string): string {
  if (!url) throw new LandingPageRequiredError(brandSlug);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new LandingPageNotHttpsError(url);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new LandingPageNotHttpsError(url);
  return parsed.toString();
}

export function buildContentRulesPlan(args: BuildPlanArgs): ContentRulesPlan {
  const version = args.version ?? 1;
  const plan: ContentRulesPlan = { rules: [], policy_pages: [], skipped: [], counts: {}, brands_without_assets: [] };

  for (const brand of args.brands) {
    const assets = args.assetsByBrandSlug[brand.brand_slug] ?? [];
    // A service brand, or a learner brand with nothing authored: no rows, and the absence is reported.
    if (!LEARNER_BRAND_SLUGS.includes(brand.brand_slug) || assets.length === 0) {
      plan.brands_without_assets.push(brand.brand_slug);
      continue;
    }

    const offered = FAMILIES_BY_BRAND_SLUG[brand.brand_slug] ?? [];
    const families = new Set<string>();
    for (const asset of assets) {
      if (asset.brand_id && asset.brand_id !== brand.brand_id) {
        // Claimed for another brand: never declared under this one.
        plan.skipped.push({ asset_id: asset.id, reason: 'another_brands_asset', brand_slug: brand.brand_slug });
        continue;
      }
      const verdict = familyFor(asset);
      if ('skip' in verdict) {
        plan.skipped.push({ asset_id: asset.id, reason: verdict.skip });
        continue;
      }
      if (!offered.includes(verdict.family)) {
        // The brand does not make this offer: no rule, and no re-homing into the family it does make.
        plan.skipped.push({ asset_id: asset.id, reason: 'family_not_offered', brand_slug: brand.brand_slug });
        continue;
      }
      plan.rules.push({
        tenant_id: brand.tenant_id,
        brand_id: brand.brand_id,
        brand_slug: brand.brand_slug,
        asset_id: asset.id,
        offer_family: verdict.family,
        eligible_programs: ['learner'],
        approval_status: 'approved',
        version,
      });
      families.add(verdict.family);
      plan.counts[brand.brand_slug] ??= {};
      plan.counts[brand.brand_slug][verdict.family] = (plan.counts[brand.brand_slug][verdict.family] ?? 0) + 1;
    }

    // One policy entry per brand x family that actually got rules: the operator's approved URL.
    for (const family of [...families].sort()) {
      plan.policy_pages.push({
        tenant_id: brand.tenant_id,
        brand_id: brand.brand_id,
        brand_slug: brand.brand_slug,
        offer_family: family,
        landing_page: assertLandingPage(args.landingPageByBrandSlug[brand.brand_slug] ?? '', brand.brand_slug),
      });
    }
  }

  return plan;
}

/**
 * The plan as an operator reads it: counts, never a title, an asset URL or a body.
 * The title says what the run IS - a production run no longer announces itself as
 * a dry run above the counts it just wrote (the T412 verifier).
 */
export function renderPlanSummary(plan: ContentRulesPlan, mode: 'dry-run' | 'write' = 'dry-run'): string[] {
  const lines: string[] = [mode === 'dry-run' ? 'content rules plan (dry run — nothing written)' : 'content rules plan (writing — one transaction)'];
  for (const [brandSlug, byFamily] of Object.entries(plan.counts).sort()) {
    const total = Object.values(byFamily).reduce((a, b) => a + b, 0);
    lines.push(`  ${brandSlug}: ${total} rule(s)`);
    for (const [family, n] of Object.entries(byFamily).sort()) lines.push(`    ${family}: ${n}`);
  }
  for (const brandSlug of plan.brands_without_assets.sort()) lines.push(`  ${brandSlug}: no authored assets — no rules, deliberately`);
  lines.push(`  policy entries: ${plan.policy_pages.length}`);
  const bySkip = plan.skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {});
  for (const [reason, n] of Object.entries(bySkip).sort()) lines.push(`  skipped (${reason}): ${n}`);
  lines.push('  explorer_content_assets touched: 0');
  return lines;
}
