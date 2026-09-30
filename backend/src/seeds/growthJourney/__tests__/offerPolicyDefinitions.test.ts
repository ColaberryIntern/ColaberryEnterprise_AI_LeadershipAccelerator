import * as fs from 'fs';
import * as path from 'path';
import {
  BRAND_OFFER_POLICIES,
  INERT_ON_CREATE,
  allowedFamiliesFor,
  familiesNamedInPolicy,
  familiesWithNoBrand,
} from '../offerPolicyDefinitions';
import {
  OFFER_FAMILIES,
  LEARNER_OFFER_FAMILIES,
  AI_FLOTATION_DENIED_FAMILIES,
} from '../../../models/OfferFamily';

/**
 * T202 — §4's required policy, asserted against the spec rather than against
 * itself.
 *
 * THE ALLOW SETS ARE PINNED LITERALLY, brand by brand. A test that only checked
 * the denials would pass a seed that granted AI Flotation nothing at all, and a
 * test that derived the expected sets from the definitions would assert only
 * that the code equals itself — the failure mode `explorerGrowthModels.test.ts`
 * warns about in its header.
 */

/**
 * THE SPEC FILE IS NOT READ HERE, deliberately. `request.md` lives under
 * `.loop-architect/runs/`, which is gitignored, so a test that read it would
 * pass locally and throw at import in CI — where the file does not exist. The
 * spec is pinned by the literal lists below instead, which is also the form a
 * reviewer can check against §4 by eye.
 */

const allowFor = (tenant: string, brand: string): string[] =>
  BRAND_OFFER_POLICIES.filter(
    (d) => d.tenant_slug === tenant && d.brand_slug === brand && d.decision === 'allow',
  ).flatMap((d) => [...d.offer_families]);

const denyFor = (tenant: string, brand: string): string[] =>
  BRAND_OFFER_POLICIES.filter(
    (d) => d.tenant_slug === tenant && d.brand_slug === brand && d.decision === 'deny',
  ).flatMap((d) => [...d.offer_families]);

describe('the catalog matches §4', () => {
  it('names exactly the eleven families §4 lists', () => {
    expect(OFFER_FAMILIES).toHaveLength(11);
    expect(new Set(OFFER_FAMILIES).size).toBe(11);
  });

  it('names no family outside the catalog', () => {
    for (const family of familiesNamedInPolicy()) {
      expect(OFFER_FAMILIES).toContain(family);
    }
  });

  it('accounts for every catalog family — none is left with no brand', () => {
    // If a family exists that nobody may offer, that is either a spec gap or a
    // seeding gap, and it should be a visible decision rather than a silent
    // orphan.
    expect(familiesWithNoBrand()).toEqual([]);
  });
});

describe('deny outranks allow HERE too, not only in the resolver', () => {
  // WHY AN INJECTED TABLE. The four real brands' allow and deny sets are
  // DISJOINT, so subtracting the denials changes nothing and a mutation that
  // deleted the subtraction survived every test in this file. That is the same
  // unpinned-invariant finding an independent review made about
  // `allowedOfferFamilies` one layer down - and this is the THIRD place the
  // rule is implemented, after `resolveOfferEligibility` and that one.
  //
  // A contradictory pair cannot be expressed in the real definitions, so the
  // rule can only be pinned by passing a table that contains one. The function
  // under test is the real one; only its input is substituted.
  const CONTRADICTORY = [
    {
      tenant_slug: 't',
      brand_slug: 'b',
      decision: 'allow' as const,
      offer_families: ['ai_consulting', 'business_training'] as const,
      notes: 'a stray grant somebody added later',
    },
    {
      tenant_slug: 't',
      brand_slug: 'b',
      decision: 'deny' as const,
      offer_families: ['business_training'] as const,
      notes: 'the deny that must win',
    },
  ];

  it('subtracts a denied family even when it is also explicitly allowed', () => {
    expect(allowedFamiliesFor('t', 'b', CONTRADICTORY)).toEqual(['ai_consulting']);
  });

  it('the injected table is actually reaching the function', () => {
    // THE SECOND ASSERTION IS THE ONE THAT WORKS, and the comment here used to
    // credit the first. It claimed that ignoring the parameter "would return
    // CPN's families" for ('nobody','nobody') - false: the real table returns
    // [] for that pair too, so that line passes either way and proves nothing.
    //
    // The ('t','b') assertion is what kills a mutation that swaps `table` for
    // the module constant, because that pair exists ONLY in the injected table.
    // Kept both, with the first relabelled as what it is.
    expect(allowedFamiliesFor('nobody', 'nobody', CONTRADICTORY)).toEqual([]); // shape only
    expect(allowedFamiliesFor('t', 'b', CONTRADICTORY).length).toBeGreaterThan(0);
  });

  it('defaults to the real policy when no table is passed', () => {
    expect(allowedFamiliesFor('cpn', 'cpn')).toEqual([
      'learner_free_training',
      'learner_community_subscription',
    ]);
  });
});

describe('the allow sets, pinned per brand', () => {
  it('CPN: free training and community only', () => {
    // §4 says "learner/free-training and approved scholarship/community
    // pathways only". The word "only" excludes paid training, certification and
    // internship, which Colaberry Training does carry.
    expect(allowFor('cpn', 'cpn').sort()).toEqual(
      ['learner_community_subscription', 'learner_free_training'].sort(),
    );
  });

  it('Colaberry Training: all five learner families', () => {
    expect(allowFor('colaberry', 'colaberry-training').sort()).toEqual(
      [
        'learner_certification',
        'learner_community_subscription',
        'learner_free_training',
        'learner_internship',
        'learner_paid_training',
      ].sort(),
    );
    expect(allowFor('colaberry', 'colaberry-training')).toHaveLength(
      LEARNER_OFFER_FAMILIES.length,
    );
  });

  it('Colaberry Enterprise: business training plus the five service paths', () => {
    expect(allowFor('colaberry', 'colaberry-enterprise').sort()).toEqual(
      [
        'ai_consulting',
        'ai_project',
        'application_build',
        'business_training',
        'paid_discovery',
        'workflow_automation',
      ].sort(),
    );
  });

  it('AI Flotation: the same service paths, WITHOUT business training', () => {
    expect(allowFor('ai-flotation', 'ai-flotation').sort()).toEqual(
      ['ai_consulting', 'ai_project', 'application_build', 'paid_discovery', 'workflow_automation'].sort(),
    );
    expect(allowFor('ai-flotation', 'ai-flotation')).not.toContain('business_training');
  });

  it('AI Flotation is Enterprise minus exactly one family', () => {
    const enterprise = new Set(allowFor('colaberry', 'colaberry-enterprise'));
    const flotation = allowFor('ai-flotation', 'ai-flotation');
    expect(flotation.every((f) => enterprise.has(f))).toBe(true);
    expect(enterprise.size - flotation.length).toBe(1);
  });

  it('no learner family is allowed to either business brand', () => {
    for (const brand of [
      ['colaberry', 'colaberry-enterprise'],
      ['ai-flotation', 'ai-flotation'],
    ] as const) {
      for (const family of LEARNER_OFFER_FAMILIES) {
        expect(allowFor(brand[0], brand[1])).not.toContain(family);
      }
    }
  });
});

describe('§4:287 — the AI Flotation denials', () => {
  it('enumerates all six individually', () => {
    // Individually, not as a set comparison against the same list, so removing
    // one from the definitions fails a named assertion.
    const denied = denyFor('ai-flotation', 'ai-flotation');
    expect(denied).toContain('business_training');
    expect(denied).toContain('learner_free_training');
    expect(denied).toContain('learner_paid_training');
    expect(denied).toContain('learner_community_subscription');
    expect(denied).toContain('learner_certification');
    expect(denied).toContain('learner_internship');
    expect(denied).toHaveLength(6);
  });

  it('matches the shared list the resolver test also reads', () => {
    expect(denyFor('ai-flotation', 'ai-flotation').sort()).toEqual(
      [...AI_FLOTATION_DENIED_FAMILIES].sort(),
    );
  });

  it('never denies and allows the same family', () => {
    // Would violate the unique index at seed time, and the resolver would
    // resolve it to denied — a contradiction worth catching in the definitions.
    const allowed = new Set(allowFor('ai-flotation', 'ai-flotation'));
    for (const family of denyFor('ai-flotation', 'ai-flotation')) {
      expect(allowed.has(family)).toBe(false);
    }
  });

  it('covers every family AI Flotation is not allowed — no gap between the two sets', () => {
    const allowed = new Set(allowFor('ai-flotation', 'ai-flotation'));
    const denied = new Set(denyFor('ai-flotation', 'ai-flotation'));
    const unaccounted = OFFER_FAMILIES.filter((f) => !allowed.has(f) && !denied.has(f));
    expect(unaccounted).toEqual([]);
  });

  it('is the only brand carrying explicit denials', () => {
    // The others rely on default-deny, which the resolver test proves. Stated
    // here so that if someone adds denials elsewhere it is a deliberate change
    // rather than a drift.
    const denyingBrands = BRAND_OFFER_POLICIES.filter((d) => d.decision === 'deny').map(
      (d) => `${d.tenant_slug}/${d.brand_slug}`,
    );
    expect([...new Set(denyingBrands)]).toEqual(['ai-flotation/ai-flotation']);
  });
});

describe('the seed invents no approved content', () => {
  it('ships every approved-content list empty', () => {
    // §4: "Offers are not free-text AI inventions." A seeded landing page or
    // claim would be exactly that, and would arrive pre-labelled "approved".
    expect(INERT_ON_CREATE.approved_landing_pages).toEqual([]);
    expect(INERT_ON_CREATE.approved_claims).toEqual([]);
    expect(INERT_ON_CREATE.content_collections).toEqual([]);
    expect(INERT_ON_CREATE.approved_ctas).toEqual([]);
    expect(INERT_ON_CREATE.conversion_events).toEqual([]);
  });

  it('requires a human copy review instead', () => {
    expect(INERT_ON_CREATE.required_approvals).toEqual(['human_copy_review']);
  });

  it('carries no URL anywhere in the definitions', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'offerPolicyDefinitions.ts'), 'utf8');
    const urls = src.match(/https?:\/\/[^\s'"`]+/g) ?? [];
    expect(urls).toEqual([]);
  });

  it('creates every row active, so eligibility is not silently off', () => {
    expect(INERT_ON_CREATE.status).toBe('active');
  });
});

describe('every brand named in the policy is keyed by tenant AND brand', () => {
  it('carries both slugs, because brand slugs are unique only per tenant', () => {
    for (const def of BRAND_OFFER_POLICIES) {
      expect(def.tenant_slug).toMatch(/^[a-z0-9-]+$/);
      expect(def.brand_slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('covers the four brands §4 names, and no others', () => {
    const brands = [...new Set(BRAND_OFFER_POLICIES.map((d) => d.brand_slug))].sort();
    expect(brands).toEqual(['ai-flotation', 'colaberry-enterprise', 'colaberry-training', 'cpn']);
  });
});
