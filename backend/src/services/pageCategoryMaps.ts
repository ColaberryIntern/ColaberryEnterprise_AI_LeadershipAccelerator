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
   * The pricing gap this note used to describe is CLOSED. `/pricing` shipped on
   * 2026-09-03 as the build-membership page, so `pricing_visit` and the two multi-page
   * patterns that require a pricing view (`research_pattern`, `evaluation_pattern`) are
   * reachable for this brand for the first time. The content decision was made; this map
   * is what makes the signal follow it.
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
      // The category describes the SURFACE, not its fill state, so it stayed correct
      // through this page going from "We have nothing to show you here yet" to a
      // filterable index of published records.
      '/results': 'case_studies',
      // One record, on this brand's own domain. It is a single shell that reads the
      // slug from the path, so every /results/<slug>/ a reader ever opens is this
      // page - which is why one entry covers a set that grows without a deploy.
      '/results/record': 'case_studies',
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

  /**
   * Career Pathways Network - opportunitylift.org. Seven pages.
   *
   * THIS BRAND HAS THREE AUDIENCES AND ONLY ONE OF THEM IS A LEARNER. Scholarship
   * applicants, community partners and donors all arrive here, and the signal vocabulary
   * below was built for a single commercial funnel. The categories are therefore chosen
   * so that a donor reading about money never scores as an applicant about to enrol - a
   * confident wrong answer is worse than no answer, which is the whole reason this file
   * exists.
   */
  cpn: {
    exact: {
      // The homepage no longer carries the intake form; it moved to `/scholarships`,
      // which is where `lead_entry_points` said it lived all along. So `/` is finally a
      // plain homepage rather than a homepage with a conversion on it.
      '/': 'homepage',
      // The conversion page: the scholarship interest form and its submit CTA. Same
      // shape as ai-flotation `/start` and refactored `/platform-interest`, so it earns
      // the same category - `enroll`, strength 45, the strongest single page-visit
      // signal. This is the one page on the site where somebody commits to anything.
      '/scholarships': 'enroll',
      // The free-training push. Deliberately NOT `enroll`, even though its primary action
      // is "create your free account": that account is created on refactored.ai, under
      // refactored's own sign-in, so a visit here is not a commitment to CPN and scoring
      // it at 45 would put the funnel's strongest signal behind someone else's signup.
      // It explains an offering to an audience, which is what `program` means for the
      // other brands. The page's own form carries the real intent through
      // `form_started` (30) and `form_submitted` (50), which fire regardless of category.
      '/learn-free': 'program',
      // Deliberately NOT `pricing`, even though it is literally a page of prices.
      // `pricing` (35) combines with `enroll` to fire `evaluation_pattern` (45), and the
      // person reading this page is usually a DONOR evaluating the charity while the
      // person on `/scholarships` is an APPLICANT. Labelling it `pricing` would fuse two
      // different people into one purchase intent. It explains how the organisation
      // handles money, so it is categorised with the other pages that explain the
      // organisation.
      '/how-funds-work': 'about',
      // What partnering means for a church, employer or community group. It explains the
      // offering to an audience, which is what `program` means for the other brands. It
      // does carry a form, but forms are already covered: `form_started` (30) and
      // `form_submitted` (50) fire from the form's own events regardless of category.
      '/partners': 'program',
      // The supporter page. NOT `enroll`: it has a form and a submit CTA, but treating a
      // donor's interest as an enrolment would put the funnel's strongest signal behind
      // the wrong intent entirely. Its actual promise is "a person will follow up", which
      // is what `contact` means everywhere else in this map.
      '/support': 'contact',
      // Deliberately NOT `homepage`. That is Colaberry's rule for its own /about, and
      // inheriting it here is the exact cross-brand leak this module exists to stop.
      '/about': 'about',
      // Named rather than left to fall through, so the uncategorised bucket keeps
      // meaning "we have not looked at this page yet".
      '/privacy': 'legal',
    },
  },

  /**
   * Refactored.ai - a faithful port of the live site, pending redesign. This map
   * describes the pages as they are today and will need revisiting when the site is
   * rebuilt, which is equally true of the pages themselves.
   *
   * Several h1s in the capture are navigation text ("LEARN") rather than page headings,
   * so these categories were read from each page's content and forms, not its heading.
   */
  // TWO GENERATIONS OF SITE IN ONE MAP, DELIBERATELY.
  //
  // The paths below the divider belong to the ported portal that was retired on
  // 2026-09-07. They are kept because historical visitor events still carry them, and a
  // categoriser that stopped recognising them would silently reclassify years of recorded
  // traffic as `other` — rewriting the past to match the present. brandPageCategories.test.ts
  // also asserts several of them directly, as the canonical example of one brand's rules
  // not leaking into another's.
  //
  // The paths above the divider are the site that replaced it: a real product site for
  // Refactored.ai rather than a copy of the old learning portal. Every one of them exists
  // in apps/refactored-public/src, and the on-disk guard checks that.
  //
  // The two generations barely collide: the new site uses `/contact` where the old one
  // used `/contact-us`, and `/platform` where the old one used `/platform-interest`.
  // `/privacy` and `/terms` are the deliberate exception — the same path in both, meaning
  // the same thing, so one `legal` entry serves old events and new pages alike.
  refactored: {
    exact: {
      '/': 'homepage',

      // --- Current site ---------------------------------------------------
      // The product pages. Each explains part of the offering to an audience that is
      // still deciding, which is what `program` means for every other brand here.
      '/platform': 'program',
      '/ai-workforce': 'program',
      '/software-factory': 'program',
      '/learning': 'program',
      // The methodology page. Deliberately NOT `case_studies`: it argues a position and
      // shows no outcomes, so scoring it as evidence would inflate a signal against a
      // page that proves nothing.
      '/trust-before-intelligence': 'program',
      // Deliberately NOT `homepage`. That is Colaberry's rule for its own /about, and
      // inheriting it here is the exact cross-brand leak this module exists to stop.
      '/about': 'about',
      // The one page on the new site carrying a form and a submit CTA. `contact` rather
      // than `enroll`: its promise is "a person will reply", not a commitment to buy.
      // The form's own form_started (30) and form_submitted (50) carry the real intent
      // regardless of this category.
      '/contact': 'contact',

      // --- Retired portal, kept for historical events ---------------------
      // The three audience pages: what Refactored offered, and to whom.
      '/individuals': 'program',
      '/organizations': 'program',
      '/enterprise': 'program',
      // A searchable content index, not a case-study surface. It showcases no outcomes,
      // and labelling it `case_studies` would inflate `deep_scroll_case_study` (20)
      // against a page that proves nothing.
      '/public-library': 'library',
      // The one page on the ported site where a visitor asks for the product: an intake
      // form (`data-form="platform_interest"`) with a submit CTA. Same shape as AI
      // Flotation's `/start`, so it earns the same category rather than a weaker one.
      '/platform-interest': 'enroll',
      // Three routes, one meaning: reach a human.
      '/contact-us': 'contact',
      '/feedback': 'contact',
      '/enterprise-feedback': 'contact',
      // Post-submission confirmation. Named so it is not `other`, but it carries no
      // intent of its own - arriving here means the signal already fired upstream.
      '/thank-you': 'thank_you',
      // Legal pages. No commercial meaning, and deliberately named rather than left to
      // fall through, so the uncategorised bucket keeps meaning "we have not looked".
      '/privacy': 'legal',
      '/terms': 'legal',
    },
  },
};

/**
 * Brands whose pages exist but have no map yet.
 *
 * Empty as of Phase 2: every app in this repository now declares its own categories.
 * The constant stays, and the guard test still asserts it matches reality, so a new
 * brand app cannot be added without either a map or a deliberate entry here.
 */
export const BRANDS_AWAITING_CATEGORY_MAP: readonly string[] = [];

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
