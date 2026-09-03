/**
 * Per-brand page category maps.
 *
 * WHY THIS EXISTS. `categorizePagePath` decides what a page *means* — pricing, enroll,
 * case studies — and almost every intent signal reads that decision. Until now it was a
 * single global map whose every key was a Colaberry route (`/pricing`, `/enroll`,
 * `/stories`). It took no brand argument, so every page of every other brand fell
 * through to `other`.
 *
 * The consequence was not a missing feature, it was a silent zero. AI Flotation's
 * conversion page scored the same as its footer. Eleven of the twenty signal types the
 * scorer knows about — including the four strongest — could never fire on a brand site,
 * so nobody browsing one could ever look like a buyer.
 *
 * The subtler half of the same bug: `/about` matched Colaberry's map and was labelled
 * `homepage`. Not "unknown brand, no category" but *another company's rule applied to
 * this one*, which is worse, because it produces a confident wrong answer.
 *
 * WHY CODE AND NOT SEED DATA. `categorizePagePath` runs synchronously inside the
 * tracking hot path. Reading a per-brand map from Postgres there would mean a cache, an
 * invalidation story, and a new way for tracking to fail. These maps are behaviour
 * rather than tenancy, they change when a site's routes change, and keeping them here
 * lets `brandPageCategories.test.ts` check them against the actual pages on disk — which
 * a database table could not do.
 *
 * A brand that appears here owns its categorisation completely: the global Colaberry map
 * is NOT consulted as a fallback, precisely so another brand's rules can never leak in.
 * A brand absent from here keeps the old global behaviour, unchanged.
 */

export interface BrandPageCategoryMap {
  /** Exact path match, after trailing slashes are stripped. */
  exact: Record<string, string>;
  /** Prefix match, longest first. Applied only when no exact match wins. */
  prefix?: Array<{ startsWith: string; category: string }>;
}

export const BRAND_PAGE_CATEGORIES: Record<string, BrandPageCategoryMap> = {
  /**
   * AI Flotation — aiflotation.com. Seven pages, mapped from what each page actually is
   * rather than from its URL shape.
   *
   * `/start` is the conversion page: "Start a project", carrying the intake form and the
   * submit CTA. It earns `enroll` (strength 45, the highest single page-visit signal in
   * the system) because that is genuinely what a visit to it means.
   *
   * NOTE, and it is a real gap rather than an oversight: this brand has NO pricing page.
   * So `pricing_visit`, and the two multi-page patterns that require a pricing view
   * (`research_pattern`, `evaluation_pattern`), stay unreachable here no matter what this
   * map says. That is a content decision to make, not a bug to fix in code.
   */
  'ai-flotation': {
    exact: {
      '/': 'homepage',
      // Intake form plus the submit CTA. The only page on the site where someone
      // commits to anything.
      '/start': 'enroll',
      // The offering: what it is, how it runs, and what it is held to. A visitor reading
      // any of these is evaluating the service itself.
      '/what-we-build': 'program',
      '/approach': 'program',
      '/delivery-standard': 'program',
      // Currently reads "We have nothing to show you here yet." The category describes
      // the surface, not its fill state, so it stays correct as the page gains content.
      '/results': 'case_studies',
      // Added 2026-09-03, and it is the page this brand was missing. "Build membership
      // ... why it is priced this way" is a genuine pricing page, so it earns `pricing`
      // (35) directly - but the larger effect is combinatorial: with `/start` already
      // `enroll` it completes `evaluation_pattern` (45), and alongside the `program`
      // pages and `/results` it completes `research_pattern` (30). One page revives
      // three signals worth 110 points, which is exactly the gap flagged when this map
      // was written and the brand had nowhere to express price.
      '/pricing': 'pricing',
      // The methodology page: "Architecture of Trust", seven layers, how a build is
      // held together. Same family as /what-we-build and /approach - it explains the
      // offering rather than showcasing results or asking for anything - so `program`
      // is the honest category. It is not case_studies: there are no outcomes on it.
      '/trust-before-intelligence': 'program',
      // Deliberately NOT `homepage`. That was Colaberry's rule for its own /about, and
      // inheriting it here is the exact cross-brand leak this module exists to stop.
      '/about': 'about',
    },
  },
};

/** Brands whose pages exist but have no map yet. Phase 2 of the tracking work. */
export const BRANDS_AWAITING_CATEGORY_MAP = ['cpn', 'refactored'] as const;

/**
 * Resolve a path within one brand's map. Returns null when the brand has no map, so the
 * caller can fall back; returns 'other' when the brand HAS a map and nothing matched,
 * which is a genuine miss worth surfacing rather than silently backfilling.
 */
export function categorizeForBrand(cleanedPath: string, brandSlug: string): string | null {
  const map = BRAND_PAGE_CATEGORIES[brandSlug];
  if (!map) return null;

  const exact = map.exact[cleanedPath];
  if (exact) return exact;

  if (map.prefix) {
    // Longest prefix wins, so a specific rule is never shadowed by a broader one that
    // happens to be declared first.
    const sorted = [...map.prefix].sort((a, b) => b.startsWith.length - a.startsWith.length);
    for (const rule of sorted) {
      if (cleanedPath.startsWith(rule.startsWith)) return rule.category;
    }
  }

  return 'other';
}
