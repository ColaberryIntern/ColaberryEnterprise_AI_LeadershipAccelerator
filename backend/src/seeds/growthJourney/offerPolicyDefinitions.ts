import type { OfferFamilySlug } from '../../models/OfferFamily';
import {
  OFFER_FAMILIES,
  LEARNER_OFFER_FAMILIES,
  AI_FLOTATION_DENIED_FAMILIES,
} from '../../models/OfferFamily';
import type { PolicyDecision } from '../../models/BrandOfferPolicy';

/**
 * §4's required brand-offer policy, as data (T202).
 *
 * Separated from the seed the same way `explorerCampaignDefinitions.ts` is
 * separated from `seedExplorerGrowthCampaigns.ts`: the definitions can then be
 * asserted against the spec by a test that never touches a database, which is
 * the only kind of test this repo's CI can run (no Postgres service, no
 * `DATABASE_URL`).
 *
 * ─── HOW §4's PROSE MAPS TO FAMILIES ────────────────────────────────────────
 *
 * §4's table is prose, so the mapping is a judgement and is recorded here rather
 * than left implicit in the rows:
 *
 *   "learner/free-training and approved scholarship/community pathways only"
 *      -> CPN: learner_free_training + learner_community_subscription.
 *         NOT paid training, certification or internship — "only" is doing work
 *         in that sentence.
 *
 *   "learner training, community, certification and approved internship
 *    pathways"
 *      -> Colaberry Training: all five learner_* families.
 *
 *   "business training, AI consulting, workflow automation, application builds,
 *    AI projects and paid discovery"
 *      -> Colaberry Enterprise: those six, exactly.
 *
 *   "AI consulting, workflow automation, application builds, AI projects and
 *    paid discovery; explicitly deny business training and learner programs"
 *      -> AI Flotation: those five allowed, and SIX explicit denies.
 *
 * ASSUMPTION LOGGED — SCHOLARSHIP. §4's CPN row names "scholarship pathways" but
 * §4's family list has no scholarship family. Rather than invent a twelfth
 * family (the plan's acceptance criteria pin the list at eleven, and the catalog
 * test asserts no others), scholarship is carried as `learner_free_training`
 * with the scholarship framing belonging to the policy row's approved claims and
 * CTAs — which a human populates. If scholarship needs to be its own family
 * later, that is an additive catalog row plus a policy row, not a migration.
 *
 * ─── WHY EVERY APPROVED-CONTENT LIST SHIPS EMPTY ────────────────────────────
 *
 * The eight §4:278 attributes are all present on the row, and six of them are
 * lists of approved landing pages, claims, content collections, CTAs and
 * conversion events. THIS SEED LEAVES THEM EMPTY, and that is the point rather
 * than an omission: §4's first line is "Offers are not free-text AI inventions",
 * and a seeded URL or claim that no human approved is exactly that — worse,
 * because it would arrive pre-labelled "approved".
 *
 * Eligibility and content approval are therefore separate questions, and the
 * resolver reports them separately (`allowed` vs `approved_content_ready`). A
 * brand can be eligible to offer AI consulting while having no approved page to
 * point at, which is the true state today.
 */

export interface BrandOfferPolicyDefinition {
  /** Brand slugs are unique per TENANT, not globally, so both are required. */
  tenant_slug: string;
  brand_slug: string;
  decision: PolicyDecision;
  offer_families: readonly OfferFamilySlug[];
  /** Recorded on the row so an operator reading it sees the source of the rule. */
  notes: string;
}

/**
 * Set at creation and owned by a human thereafter — never written on update.
 *
 * The `seedExplorerGrowthCampaigns` precedent (`INERT_ON_CREATE` there): an
 * operator's pause must survive every boot. `required_approvals` is seeded once
 * with the review gate and is then theirs to change.
 */
export const INERT_ON_CREATE = {
  status: 'active',
  approved_landing_pages: [] as string[],
  approved_claims: [] as string[],
  content_collections: [] as string[],
  approved_ctas: [] as string[],
  conversion_events: [] as string[],
  required_approvals: ['human_copy_review'] as string[],
} as const;

const CPN_FAMILIES: readonly OfferFamilySlug[] = [
  'learner_free_training',
  'learner_community_subscription',
];

const ENTERPRISE_FAMILIES: readonly OfferFamilySlug[] = [
  'business_training',
  'ai_consulting',
  'workflow_automation',
  'application_build',
  'ai_project',
  'paid_discovery',
];

/**
 * AI Flotation's allowed set: Colaberry Enterprise's, minus business training.
 *
 * DERIVED, not typed out again. §4 describes AI Flotation as Enterprise "minus
 * business training", and a second literal list is how a family added to
 * Enterprise later gets silently withheld from AI Flotation — or worse, how
 * `business_training` gets added to both by a copy-paste.
 */
const AI_FLOTATION_FAMILIES: readonly OfferFamilySlug[] = ENTERPRISE_FAMILIES.filter(
  (f) => f !== 'business_training',
);

export const BRAND_OFFER_POLICIES: readonly BrandOfferPolicyDefinition[] = [
  {
    tenant_slug: 'cpn',
    brand_slug: 'cpn',
    decision: 'allow',
    offer_families: CPN_FAMILIES,
    notes: '§4: free training and approved scholarship/community pathways only.',
  },
  {
    tenant_slug: 'colaberry',
    brand_slug: 'colaberry-training',
    decision: 'allow',
    offer_families: LEARNER_OFFER_FAMILIES,
    notes: '§4: learner training, community, certification and internship pathways.',
  },
  {
    tenant_slug: 'colaberry',
    brand_slug: 'colaberry-enterprise',
    decision: 'allow',
    offer_families: ENTERPRISE_FAMILIES,
    notes: '§4: business training, consulting, automation, builds, AI projects, paid discovery.',
  },
  {
    tenant_slug: 'ai-flotation',
    brand_slug: 'ai-flotation',
    decision: 'allow',
    offer_families: AI_FLOTATION_FAMILIES,
    notes: '§4: Colaberry Enterprise service paths minus business training.',
  },
  {
    // The denies §4:287 requires by name. Absence of an allow row already
    // denies — the resolver fails closed — so these rows are not there to make
    // the answer "no". They are there because a deny OUTRANKS a later allow, and
    // the realistic failure is somebody adding a grant, not forgetting one.
    tenant_slug: 'ai-flotation',
    brand_slug: 'ai-flotation',
    decision: 'deny',
    offer_families: AI_FLOTATION_DENIED_FAMILIES,
    notes: '§4:287: AI Flotation must never be offered business training or learner programmes.',
  },
];

/**
 * The families one brand is allowed, with its denials subtracted (T212).
 *
 * The same three rules `offerEligibility.ts` applies at runtime, applied here to
 * the DEFINITIONS — so the journey paths a brand gets seeded cannot disagree
 * with what the resolver will later permit. Deriving them instead of listing
 * them again is the point: a family added to a brand's policy shows up as a path
 * without anybody remembering to add it twice.
 *
 * THE POLICY TABLE IS INJECTABLE, and that is not test scaffolding for its own
 * sake. The four brands' allow and deny sets are DISJOINT today, so subtracting
 * the denials changes nothing and a mutation that deleted the subtraction
 * survived every test — the same unpinned-invariant finding an independent
 * review made about `allowedOfferFamilies`, one layer down, which I failed to
 * carry forward to this function. A contradictory pair cannot be expressed in
 * the real definitions, so the only way to pin the rule is to pass a table that
 * contains one. `lookupEntrySite` in `orgAccountType.ts` is the repo precedent:
 * export with an injectable table so the test exercises real code.
 */
export function allowedFamiliesFor(
  tenantSlug: string,
  brandSlug: string,
  table: readonly BrandOfferPolicyDefinition[] = BRAND_OFFER_POLICIES,
): OfferFamilySlug[] {
  const forBrand = table.filter(
    (d) => d.tenant_slug === tenantSlug && d.brand_slug === brandSlug,
  );
  const denied = new Set(
    forBrand.filter((d) => d.decision === 'deny').flatMap((d) => [...d.offer_families]),
  );
  const allowed = forBrand
    .filter((d) => d.decision === 'allow')
    .flatMap((d) => [...d.offer_families])
    .filter((f) => !denied.has(f));

  // Deduplicated and ordered by the catalog, so the seed's path priority is
  // stable across runs rather than following definition order.
  return OFFER_FAMILIES.filter((f) => allowed.includes(f));
}

/**
 * Every family named anywhere in the policy above.
 *
 * Used by the contract test to prove the policy names nothing outside §4's
 * catalog — and, with `OFFER_FAMILIES`, that no catalog family was left
 * unaccounted for.
 */
export function familiesNamedInPolicy(): OfferFamilySlug[] {
  const out = new Set<OfferFamilySlug>();
  for (const def of BRAND_OFFER_POLICIES) for (const f of def.offer_families) out.add(f);
  return [...out].sort();
}

/** Families in the catalog that no brand may currently offer. */
export function familiesWithNoBrand(): OfferFamilySlug[] {
  const named = new Set(
    BRAND_OFFER_POLICIES.filter((d) => d.decision === 'allow').flatMap((d) => [
      ...d.offer_families,
    ]),
  );
  return OFFER_FAMILIES.filter((f) => !named.has(f));
}
