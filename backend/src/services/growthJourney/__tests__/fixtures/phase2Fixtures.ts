import { OFFER_FAMILIES } from '../../../../models/OfferFamily';
import { PROGRAM_SLUGS } from '../../../../seeds/growthJourney/journeyProgramDefinitions';
import { allowedFamiliesFor } from '../../../../seeds/growthJourney/offerPolicyDefinitions';
import { buildHostnameMap, buildSourceSlugMap, ECOSYSTEM_SEED } from '../../../../seeds/ecosystemSeedData';
import type { EligibilityDecision } from '../../offerEligibility';
import type { BrandContext, ClassificationInput, ClassifyOptions } from '../../classification/types';

/**
 * Phase 2 fixtures (T230) — every website and channel, derived from the seeds
 * that define them rather than restated:
 *
 *   - source slug → brand: `buildSourceSlugMap()` (ecosystemSeedData)
 *   - web hostname → brand: `buildHostnameMap()`, purpose 'web'
 *   - entry points: `seedLeadSources.ts` (the fifteen slugs, asserted by name)
 *   - what each brand may offer: `allowedFamiliesFor` (offerPolicyDefinitions)
 *   - programme slugs: `PROGRAM_SLUGS`
 *
 * Brands outside the four Growth Journey brands (advisor, refactored,
 * trustbeforeintelligence, worldoftaxonomy) have no policy rows and no
 * programme: for them the correct answer is "brand resolved, nothing offered,
 * nurture or review" — and the fixtures say so rather than pretending.
 */

const GJ_PROGRAM: Record<string, string> = {
  cpn: PROGRAM_SLUGS.cpn,
  'colaberry-training': PROGRAM_SLUGS.colaberryTraining,
  'colaberry-enterprise': PROGRAM_SLUGS.colaberryEnterprise,
  'ai-flotation': PROGRAM_SLUGS.aiFlotation,
};

export interface FixtureBrand extends BrandContext {
  tenant_slug: string;
}

/** Every brand in the ecosystem seed as a BrandContext (programmes treated as ACTIVE for the four GJ brands). */
export function fixtureBrands(): FixtureBrand[] {
  const out: FixtureBrand[] = [];
  for (const tenant of ECOSYSTEM_SEED) {
    for (const brand of tenant.brands) {
      out.push({
        tenant_slug: tenant.slug,
        tenant_id: `t-${tenant.slug}`,
        brand_id: `b-${brand.slug}`,
        brand_slug: brand.slug,
        default_program_slug: GJ_PROGRAM[brand.slug] ?? null,
      });
    }
  }
  return out;
}

export function brandBySlug(slug: string): FixtureBrand {
  const b = fixtureBrands().find((x) => x.brand_slug === slug);
  if (!b) throw new Error(`fixture brand missing: ${slug}`);
  return b;
}

export function brandForSource(sourceSlug: string): FixtureBrand | null {
  const hit = buildSourceSlugMap().get(sourceSlug);
  return hit ? brandBySlug(hit.brandSlug) : null;
}

export function brandForHostname(hostname: string): FixtureBrand | null {
  const hit = buildHostnameMap().get(hostname);
  return hit ? brandBySlug(hit.brandSlug) : null;
}

export function webHostnames(): string[] {
  const out: string[] = [];
  for (const tenant of ECOSYSTEM_SEED) for (const brand of tenant.brands) for (const d of brand.domains) if (d.purpose === 'web') out.push(d.hostname);
  return [...new Set(out)];
}

/** The shipped policy, as the ladder's injected dependencies. */
export function fixtureOptions(extra: Partial<ClassifyOptions> = {}): ClassifyOptions {
  const brands = fixtureBrands();
  const allowedOf = (b: FixtureBrand): string[] => allowedFamiliesFor(b.tenant_slug, b.brand_slug);
  const decision = (brandId: string, family: string): EligibilityDecision => {
    const b = brands.find((x) => x.brand_id === brandId);
    const known = (OFFER_FAMILIES as readonly string[]).includes(family);
    const allowed = Boolean(b && known && allowedOf(b).includes(family));
    const reason = !known ? 'unknown_offer_family' : allowed ? 'allowed' : b?.brand_slug === 'ai-flotation' ? 'explicit_deny' : 'no_policy';
    return { allowed, reason, brand_id: brandId, offer_family: family, policy_id: allowed ? `p-${brandId}-${family}` : null, approved_content_ready: false };
  };
  return {
    eligibility: async (brandId, family) => decision(brandId, family),
    allowedFamilies: async (brandId) => {
      const b = brands.find((x) => x.brand_id === brandId);
      return b ? allowedOf(b) : [];
    },
    allowingBrands: async (family) => brands.filter((b) => allowedOf(b).includes(family)).map((b) => ({ brand_id: b.brand_id, brand_slug: b.brand_slug })),
    ...extra,
  };
}

export function inputFor(brand: FixtureBrand | null, over: Partial<ClassificationInput> = {}): ClassificationInput {
  return { subject_ref: 'lead:1', lock: null, form: null, campaign: null, source_brand: brand, account: null, behaviour: null, reply: null, ...over };
}

export function formFor(entry_slug: string | null, message: string | null = null, interest_area: string | null = null) {
  return { entry_slug, entry_type: null, form_type: entry_slug, interest_area, explicit_offer_family: null, message };
}

export interface EntryFixture {
  source: string;
  entry: string;
  /** How many accepted payloads production had by 2026-09-11 (0 = seeded, never used). */
  prod_accepted: number;
  expect: { brand: string; program: string | null; path: string | null; step: number; review: boolean; intent?: string };
}

/** One fixture per seeded (source, entry) pair. */
export const ENTRY_FIXTURES: readonly EntryFixture[] = [
  { source: 'ai-flotation', entry: 'workflow_intake', prod_accepted: 18, expect: { brand: 'ai-flotation', program: PROGRAM_SLUGS.aiFlotation, path: 'workflow_automation', step: 3, review: false } },
  { source: 'ai-flotation', entry: 'call_me_now', prod_accepted: 2, expect: { brand: 'ai-flotation', program: PROGRAM_SLUGS.aiFlotation, path: null, step: 4, review: false, intent: 'callback_requested' } },
  { source: 'colaberry', entry: 'request_demo_form', prod_accepted: 7, expect: { brand: 'colaberry-enterprise', program: PROGRAM_SLUGS.colaberryEnterprise, path: 'business_training', step: 3, review: false } },
  { source: 'colaberry', entry: 'executive_overview_download', prod_accepted: 0, expect: { brand: 'colaberry-enterprise', program: PROGRAM_SLUGS.colaberryEnterprise, path: null, step: 4, review: false, intent: 'content_download' } },
  { source: 'cpn', entry: 'scholarship_interest', prod_accepted: 1, expect: { brand: 'cpn', program: PROGRAM_SLUGS.cpn, path: 'learner_free_training', step: 3, review: false } },
  { source: 'cpn', entry: 'scholarship_interview_call', prod_accepted: 0, expect: { brand: 'cpn', program: PROGRAM_SLUGS.cpn, path: 'learner_free_training', step: 3, review: false } },
  { source: 'cpn', entry: 'free_training_interest', prod_accepted: 0, expect: { brand: 'cpn', program: PROGRAM_SLUGS.cpn, path: 'learner_free_training', step: 3, review: false } },
  { source: 'cpn', entry: 'community_partner_interest', prod_accepted: 0, expect: { brand: 'cpn', program: PROGRAM_SLUGS.cpn, path: null, step: 4, review: true, intent: 'partner_interest' } },
  { source: 'cpn', entry: 'champion_interest', prod_accepted: 0, expect: { brand: 'cpn', program: PROGRAM_SLUGS.cpn, path: null, step: 4, review: true, intent: 'supporter_interest' } },
  { source: 'trustbeforeintelligence', entry: 'get_book_modal', prod_accepted: 10, expect: { brand: 'trustbeforeintelligence', program: null, path: null, step: 4, review: false, intent: 'content_download' } },
  { source: 'trustbeforeintelligence', entry: 'newsletter_footer', prod_accepted: 0, expect: { brand: 'trustbeforeintelligence', program: null, path: null, step: 4, review: false, intent: 'newsletter' } },
  { source: 'worldoftaxonomy', entry: 'classify_lead', prod_accepted: 11, expect: { brand: 'worldoftaxonomy', program: null, path: null, step: 4, review: false, intent: 'product_demo' } },
  { source: 'worldoftaxonomy', entry: 'developer_contact', prod_accepted: 1, expect: { brand: 'worldoftaxonomy', program: null, path: null, step: 4, review: false, intent: 'developer_contact' } },
  // advisor's form names consulting, but no policy row grants it to that brand: dropped, review, and
  // two brands could take it (Enterprise, AI Flotation) so no single referral target.
  { source: 'advisor', entry: 'advisory_inline_form', prod_accepted: 0, expect: { brand: 'advisor', program: null, path: null, step: 3, review: true, intent: 'consulting_request' } },
  { source: 'refactored', entry: 'platform_interest', prod_accepted: 0, expect: { brand: 'refactored', program: null, path: null, step: 4, review: false, intent: 'platform_interest' } },
];
