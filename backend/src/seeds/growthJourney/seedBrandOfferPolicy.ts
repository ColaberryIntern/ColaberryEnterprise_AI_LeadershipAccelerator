import type { Brand } from '../../models';
import { OfferFamily, BrandOfferPolicy } from '../../models';
import { resolveBrandBySlug } from '../../modules/tenancy/tenantResolver';
import { OFFER_FAMILIES, type OfferFamilySlug } from '../../models/OfferFamily';
import {
  BRAND_OFFER_POLICIES,
  INERT_ON_CREATE,
  type BrandOfferPolicyDefinition,
} from './offerPolicyDefinitions';

/**
 * Seed §4's offer catalog and brand-offer policy (T202).
 *
 * ─── WHAT THE UPDATE PATH WRITES, AND WHY THE ASYMMETRY ─────────────────────
 *
 * `seedExplorerGrowthCampaigns` established the rule: a seed that runs on every
 * boot must never override an operator's hand. It is followed here, with one
 * deliberate exception in the other direction.
 *
 *   NEVER WRITTEN ON UPDATE   status, and all six approved-content lists
 *                             (landing pages, claims, collections, CTAs,
 *                             conversion events, required approvals). Those are
 *                             the operator's, and a paused policy or a curated
 *                             claim list must survive every boot.
 *
 *   RE-ASSERTED ON UPDATE     a `deny`. If a row §4:287 requires to be denied
 *                             has been flipped to `allow`, the next boot puts it
 *                             back. This mirrors `is_active: false` in the
 *                             Explorer seed: where a value is the safety
 *                             property rather than a preference, inheriting the
 *                             existing state is how the safety property gets
 *                             quietly lost.
 *
 *   NEVER WRITTEN ON UPDATE   an `allow` over an existing `deny`. The reverse of
 *                             the above, and not a contradiction: a human who
 *                             closed something the spec permits has made a
 *                             decision, and auto-reopening it on the next boot
 *                             would be exactly the override this seed is
 *                             forbidden from doing. Deny is the safe direction;
 *                             only the safe direction is forced.
 *
 * ─── FAILURE ISOLATION ──────────────────────────────────────────────────────
 *
 * Per-row try/catch, same as the Explorer seed: one brand missing from a
 * database (dev1 has five brands, and a fresh preview stack may have fewer) must
 * not stop the other brands' policy from landing. Missing brands are reported as
 * `skipped`, not `failed` — absent is not broken, and conflating them would make
 * the count useless as a signal on a preview stack.
 */

export interface SeedOfferPolicyResult {
  families_created: number;
  families_existing: number;
  policies_created: number;
  policies_updated: number;
  /** Brand named in the policy but absent from this database. */
  skipped_brands: string[];
  failed: { target: string; error: string }[];
}

/** Human-readable name for a family slug. Display only; policy reads the slug. */
function familyName(slug: OfferFamilySlug): string {
  return slug
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Seed the eleven catalog rows.
 *
 * `status` is inert on create here too: a family an operator retired must stay
 * retired across boots.
 */
async function seedCatalog(result: SeedOfferPolicyResult): Promise<void> {
  for (const slug of OFFER_FAMILIES) {
    try {
      const existing = await OfferFamily.findOne({ where: { slug } });
      if (existing) {
        result.families_existing += 1;
        continue;
      }
      await OfferFamily.create({ slug, name: familyName(slug), status: 'active' });
      result.families_created += 1;
    } catch (err: unknown) {
      result.failed.push({
        target: `offer_family:${slug}`,
        error: (err as { message?: string })?.message ?? 'unknown',
      });
    }
  }
}

/**
 * Resolve a brand by (tenant slug, brand slug) — brand slugs are unique per
 * tenant, not globally, so both are needed.
 *
 * DELEGATED TO `tenantResolver`, which already owns brand resolution and
 * already exported exactly this. I wrote a `Tenant.findOne` + `Brand.findOne`
 * pair first, which is the same mistake that cost this run a whole plan cycle:
 * searching for the capability under the name I had just invented instead of
 * searching for what the code does. `resolveBrandBySlug` had no callers yet,
 * which is how it stayed invisible.
 *
 * ONE BEHAVIOUR CHANGE, ACCEPTED DELIBERATELY. That function returns `null` on a
 * database error as well as on a genuine miss, so a lookup failure now reads as
 * "brand absent" and the brand is SKIPPED rather than reported as failed. That
 * is safe for a seed — nothing wrong is written, and the next boot retries — and
 * it matches the resolver's documented fail-soft posture. The absent-versus-
 * broken distinction that matters is on the write path, which still separates
 * `skipped_brands` from `failed`.
 */
async function findBrand(def: BrandOfferPolicyDefinition): Promise<Brand | null> {
  return resolveBrandBySlug(def.tenant_slug, def.brand_slug);
}

async function seedOnePolicy(
  brand: Brand,
  def: BrandOfferPolicyDefinition,
  family: OfferFamilySlug,
  result: SeedOfferPolicyResult,
): Promise<void> {
  const existing = await BrandOfferPolicy.findOne({
    where: { brand_id: brand.id, offer_family: family },
  });

  if (existing) {
    // The only field this seed will overwrite, and only in the safe direction.
    if (def.decision === 'deny' && existing.decision !== 'deny') {
      await existing.update({ decision: 'deny', notes: def.notes });
      result.policies_updated += 1;
    }
    return;
  }

  await BrandOfferPolicy.create({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    offer_family: family,
    decision: def.decision,
    notes: def.notes,
    ...INERT_ON_CREATE,
  });
  result.policies_created += 1;
}

export async function seedBrandOfferPolicy(): Promise<SeedOfferPolicyResult> {
  const result: SeedOfferPolicyResult = {
    families_created: 0,
    families_existing: 0,
    policies_created: 0,
    policies_updated: 0,
    skipped_brands: [],
    failed: [],
  };

  await seedCatalog(result);

  // Denies first, so that on a fresh database the forbidden combinations exist
  // before any allow row does. The unique index means order cannot produce a
  // wrong end state either way, but a partial run should fail safe rather than
  // leave grants in place with their denies still pending.
  const ordered = [...BRAND_OFFER_POLICIES].sort((a, b) =>
    a.decision === b.decision ? 0 : a.decision === 'deny' ? -1 : 1,
  );

  for (const def of ordered) {
    const label = `${def.tenant_slug}/${def.brand_slug}:${def.decision}`;
    try {
      const brand = await findBrand(def);
      if (!brand) {
        if (!result.skipped_brands.includes(`${def.tenant_slug}/${def.brand_slug}`)) {
          result.skipped_brands.push(`${def.tenant_slug}/${def.brand_slug}`);
        }
        continue;
      }
      for (const family of def.offer_families) {
        try {
          await seedOnePolicy(brand, def, family, result);
        } catch (err: unknown) {
          result.failed.push({
            target: `${label}:${family}`,
            error: (err as { message?: string })?.message ?? 'unknown',
          });
        }
      }
    } catch (err: unknown) {
      result.failed.push({ target: label, error: (err as { message?: string })?.message ?? 'unknown' });
    }
  }

  return result;
}

export default seedBrandOfferPolicy;
