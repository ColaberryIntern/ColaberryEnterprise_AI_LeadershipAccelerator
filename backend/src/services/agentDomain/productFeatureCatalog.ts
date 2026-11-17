/**
 * productFeatureCatalog — what the PRODUCT can already do, as opposed to what a tool is
 * registered to do. PURE, no I/O.
 *
 * AF11.9. Ali, 16 Nov 2026: *"1st Sarbjit would need to create a landing page in the app to see
 * how it works and make sure she can build it how she wants. If that functionality does not
 * exist, she has to put the request in."*
 *
 * ## THE GAP THIS CLOSES, AND WHY AF11.2 CANNOT CLOSE IT
 *
 * AF11.2's duplicate check compares a request against **registered tools** — the names compiled
 * into the backend and listed at `/admin/tools`. That is a different question from "can the
 * product already do this?", and the difference is worth money.
 *
 * Measured on main, 17 Nov 2026: `backend/src/routes/admin/landingPageRoutes.ts` registers TEN
 * routes across nine paths, including create, revise, preview, publish and unpublish, and the
 * preview renders the real page through the same code the public route uses. **No agent has been
 * granted any of it**, so it is not a registered tool, and AF11.2 would wave a "build me a
 * landing page tool" request straight through to a build. We would have paid to build something
 * we already own.
 *
 * ## WHY THIS LIST IS CURATED AND NOT DERIVED, said plainly
 *
 * There is no index of product features. Deriving one from route files would produce a list of
 * HTTP endpoints, and an endpoint is not a capability: `PATCH /api/admin/landing-pages/:id` and
 * "draft a landing page from a brief" are not the same claim, and a builder reading the first
 * cannot tell whether the second is possible.
 *
 * So this is a hand-written list, each entry carrying the route file that backs it and the date
 * somebody checked. A short correct list beats a generated wrong one: a front door that says
 * "already in the app" about something that is not there sends a builder to a screen that does
 * not exist, and they will not trust the next answer either.
 *
 * **It is deliberately incomplete, and the API says so.** `coverage` reports how many domains
 * have been curated, so a builder in a domain nobody has got to yet is told "we have not mapped
 * your domain yet" rather than "nothing exists", which are very different facts.
 *
 * ## THE THREE STATES ARE THE WHOLE POINT
 *
 * They are not a label on a feature; they decide the path before a request is written:
 *
 *   - `in_app`  the feature is there and works. The answer is never "write a request": go use
 *               it, confirm it does what you need, then ask for the agent to be GRANTED the
 *               thing you just used. Routes to AF11.4.
 *   - `partly`  the endpoint exists and whether an agent may ever call it is a separate
 *               decision. Publishing a landing page puts something on the public internet.
 *               Routes to Ali as a ruling, not a build.
 *   - `not_built` a genuine build request. Routes to the AF11.7 scope sheet.
 *
 * `partly` is the state that earns its keep. Without it every risky feature is either waved
 * through as "already there" or rebuilt as "not there", and the question that actually matters —
 * may an agent do this unsupervised — never gets asked.
 */

import type { ToolProductState } from '../../db/ensureAgentDomainToolRequestSchema';

/** One thing the product can do, in a builder's words rather than in endpoints. */
export interface ProductFeature {
  /** Stable id, so a request can record which feature it was checked against. */
  readonly feature_key: string;
  /** `domain_key` on `agent_domain_projects`. */
  readonly domain_key: string;
  /** What a builder would call it. */
  readonly label: string;
  /** What it actually does, in one line, so "already there" can be checked rather than believed. */
  readonly what_it_does: string;
  /**
   * The three-way split, and the AF11.7 field it writes.
   *
   * `in_app` and `partly` both mean the product has it; they differ in whether an AGENT may be
   * let near it without a separate ruling.
   */
  readonly state: 'in_app' | 'partly';
  /** Where to go and use it. A front door that cannot point at the door is a sign, not a door. */
  readonly product_route: string;
  /** The route file that backs the claim, so the next reader can check it rather than trust it. */
  readonly backed_by: string;
  /** When a human last checked that this is true. A claim with no date goes stale invisibly. */
  readonly verified_on: string;
  /** Why it is `partly`, and null when it is not. */
  readonly ruling_needed: string | null;
  /**
   * The phrases that identify this feature, written out rather than inferred from the label.
   *
   * INFERRING FROM THE LABEL WAS THE FIRST ATTEMPT AND IT WAS WRONG. Requiring every word of
   * "Draft a landing page" to appear meant "create a landing page from a brief" did not match,
   * because the builder said "create" and the label said "draft" — so the front door told
   * somebody to write a scope sheet for a feature sitting right there. A label is written for a
   * reader; the words a builder will actually type are a separate thing and are listed here.
   *
   * A phrase matches when EVERY word in it appears in the candidate, and the LONGEST matching
   * phrase wins, so "publish a landing page" resolves to publishing rather than to drafting.
   */
  readonly matches: ReadonlyArray<string>;
}

/**
 * The curated list. LANDING PAGES FIRST, because that is the worked case in the ticket and the
 * one that proved the gap.
 *
 * Adding an entry is a claim that somebody opened the product and used the thing. Put the date in
 * `verified_on` and the route file in `backed_by`, or leave it out.
 */
export const PRODUCT_FEATURES: ReadonlyArray<ProductFeature> = Object.freeze([
  {
    feature_key: 'marketing.landing_page.draft',
    matches: ['landing page', 'landing pages'],
    domain_key: 'marketing',
    label: 'Draft a landing page',
    what_it_does:
      'Create a landing page, have a name suggested, revise it, and preview the real rendered '
      + 'page before anybody sees it.',
    state: 'in_app',
    product_route: '/admin/landing-pages',
    backed_by: 'backend/src/routes/admin/landingPageRoutes.ts (create, suggest-name, revise, patch, preview, list)',
    verified_on: '2026-11-17',
    ruling_needed: null,
  },
  {
    feature_key: 'marketing.landing_page.publish',
    matches: ['publish landing page', 'unpublish landing page', 'publish page'],
    domain_key: 'marketing',
    label: 'Publish a landing page',
    what_it_does: 'Put a drafted landing page on the public internet, and take it down again.',
    // PARTLY, and this is the entry that shows why the middle state exists. The endpoint works
    // perfectly. Whether an AGENT may call it is a different question with a different answer.
    state: 'partly',
    product_route: '/admin/landing-pages',
    backed_by: 'backend/src/routes/admin/landingPageRoutes.ts (publish, unpublish)',
    verified_on: '2026-11-17',
    ruling_needed:
      'Publishing puts a page on the public internet under the Colaberry name. Whether an agent '
      + 'may do that without a person pressing the button is your ruling, not a build.',
  },
  {
    feature_key: 'marketing.campaign.send',
    matches: ['send campaign', 'campaign send', 'email campaign'],
    domain_key: 'marketing',
    label: 'Build and send a campaign',
    what_it_does: 'Create a campaign, preview the copy, and send it to a list.',
    state: 'partly',
    product_route: '/admin/campaigns',
    backed_by: 'backend/src/routes/admin/campaignRoutes.ts (73 routes)',
    verified_on: '2026-11-17',
    ruling_needed:
      'Sending reaches real people and cannot be taken back. Drafting and previewing are already '
      + 'usable; whether an agent may press send is a separate decision.',
  },
  {
    feature_key: 'product_experience.case_study.studio',
    matches: ['case study', 'case studies'],
    domain_key: 'product_experience',
    label: 'Build a case study',
    what_it_does:
      'Draft a case study from artifacts, pull quotes and charts out of it, and preview the '
      + 'rendered page.',
    state: 'in_app',
    product_route: '/admin/case-studies',
    backed_by: 'backend/src/routes/admin/caseStudyStudioRoutes.ts (18 routes)',
    verified_on: '2026-11-17',
    ruling_needed: null,
  },
  {
    feature_key: 'platform.tool_catalog.read',
    matches: ['tool catalog', 'which tools', 'tools granted'],
    domain_key: 'platform',
    label: 'See which tools an agent holds and whether it can use them',
    what_it_does:
      'Read the 47-tool catalog with, for each agent, whether the tool is registered, granted, '
      + 'and usable right now.',
    state: 'in_app',
    product_route: '/admin/tools',
    backed_by: 'backend/src/routes/admin/agentEffectiveAccessRoutes.ts',
    verified_on: '2026-11-17',
    ruling_needed: null,
  },
]);

/** The domains anybody has actually curated. Everything else is unmapped, not empty. */
export const CURATED_DOMAINS: ReadonlyArray<string> = Object.freeze(
  [...new Set(PRODUCT_FEATURES.map((f) => f.domain_key))].sort(),
);

/** What the front door shows for one candidate. */
export interface FrontDoorAnswer {
  /** `in_app`, `partly`, or `not_built` when nothing in the catalog matches. */
  readonly state: 'in_app' | 'partly' | 'not_built';
  /** The feature that answered, or null when nothing did. */
  readonly feature: ProductFeature | null;
  /** What happens next, as an instruction rather than a status. */
  readonly route_to: 'use_it_then_ask_for_a_grant' | 'ask_for_a_ruling' | 'write_a_scope_sheet';
  /**
   * The AF11.7 `tried_in_product` value this answer implies, or null when the builder still has
   * to tell us whether they have used it.
   *
   * `in_app` deliberately does NOT imply `used_by_hand`. The product having the feature is not
   * the same fact as the builder having used it, and AF11.7 keeps those apart on purpose: the
   * whole point of "go and use it first" is that trying it is what produces the answer.
   */
  readonly implies_tried_in_product: ToolProductState | null;
  /** Whether this domain has been curated at all. False means unmapped, never "nothing exists". */
  readonly domain_is_mapped: boolean;
}

const norm = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/**
 * Does this candidate match a feature we already have?
 *
 * ## The matcher is deliberately literal
 *
 * It matches on the feature key, the label, and the words in the label. It does NOT attempt to
 * understand the candidate: a fuzzy matcher that half-recognises "make a page for the webinar"
 * would be wrong in the expensive direction, telling a builder the product already does
 * something it does not. When it is unsure it answers `not_built`, which costs a scope sheet that
 * Ali then reads, and he is the backstop the whole ladder is built around.
 *
 * `word` matching requires every word of the FEATURE's label to appear in the candidate, not the
 * other way round. "landing page" matches "draft a landing page from a brief"; "page" alone does
 * not match the landing page feature, because one shared word is not a claim.
 */
export function answerFrontDoor(args: {
  readonly candidate: string;
  readonly domainKey: string;
  readonly features?: ReadonlyArray<ProductFeature>;
}): FrontDoorAnswer {
  const features = args.features ?? PRODUCT_FEATURES;
  const domain = norm(args.domainKey);
  const candidate = norm(args.candidate);
  const mapped = features.some((f) => norm(f.domain_key) === domain);
  const inDomain = features.filter((f) => norm(f.domain_key) === domain);

  // Exact key first, so a stored answer resolves straight back. Then the phrase list, taking
  // the LONGEST match: "publish a landing page" names publishing, not drafting, and the only
  // thing separating them is how specific the phrase is.
  const byKey = inDomain.find((f) => norm(f.feature_key) === candidate) ?? null;
  let match = byKey;
  if (!match) {
    let best = 0;
    for (const f of inDomain) {
      for (const phrase of f.matches) {
        const words = norm(phrase).split(/\s+/).filter(Boolean);
        if (words.length === 0 || !words.every((w) => candidate.includes(w))) continue;
        if (words.length > best) { best = words.length; match = f; }
      }
    }
  }

  if (!match) {
    return {
      state: 'not_built',
      feature: null,
      route_to: 'write_a_scope_sheet',
      implies_tried_in_product: 'not_built',
      domain_is_mapped: mapped,
    };
  }
  if (match.state === 'partly') {
    return {
      state: 'partly',
      feature: match,
      route_to: 'ask_for_a_ruling',
      // Not an answer to AF11.7's question. Whether this becomes a grant or a build depends on
      // the ruling, and guessing either way here would pre-empt it.
      implies_tried_in_product: null,
      domain_is_mapped: true,
    };
  }
  return {
    state: 'in_app',
    feature: match,
    route_to: 'use_it_then_ask_for_a_grant',
    // Still null. The product having it is not the builder having used it, and "go and use it
    // first" only means something if trying it is what produces the answer.
    implies_tried_in_product: null,
    domain_is_mapped: true,
  };
}

/** Everything the product already does in one domain, for the front door's browse list. */
export function featuresForDomain(
  domainKey: string,
  features: ReadonlyArray<ProductFeature> = PRODUCT_FEATURES,
): ProductFeature[] {
  const d = norm(domainKey);
  return features.filter((f) => norm(f.domain_key) === d);
}

/** How much of the product has been mapped, so the gap is reported rather than hidden. */
export function catalogCoverage(
  features: ReadonlyArray<ProductFeature> = PRODUCT_FEATURES,
): { readonly features: number; readonly domains: ReadonlyArray<string> } {
  return {
    features: features.length,
    domains: [...new Set(features.map((f) => f.domain_key))].sort(),
  };
}
