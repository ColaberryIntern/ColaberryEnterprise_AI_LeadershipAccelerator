import {
  assertLandingPage,
  buildContentRulesPlan,
  familyFor,
  FAMILIES_BY_BRAND_SLUG,
  LandingPageNotHttpsError,
  LandingPageRequiredError,
  LEARNER_BRAND_SLUGS,
  renderPlanSummary,
  type PlanAsset,
  type PlanBrand,
} from '../contentRulesPlan';

/**
 * T412 - the content-rules plan, pure: one rule per active LESSON with the
 * narrower audience winning, the per-brand family allow-list, nothing for a
 * service brand, nothing for a retired asset, and NOTHING for
 * `explorer_content_assets` in any shape.
 *
 * The registry fixture is the plan's: 12 assets - 8 `full_access` only, 3
 * week-0 carrying BOTH tags, 1 retired.
 */

const TENANT = { colaberry: 't-colaberry', cpn: 't-cpn', flotation: 't-flotation' };
const BRANDS: PlanBrand[] = [
  { tenant_id: TENANT.cpn, brand_id: 'b-cpn', brand_slug: 'cpn' },
  { tenant_id: TENANT.colaberry, brand_id: 'b-training', brand_slug: 'colaberry-training' },
  { tenant_id: TENANT.colaberry, brand_id: 'b-ent', brand_slug: 'colaberry-enterprise' },
  { tenant_id: TENANT.flotation, brand_id: 'b-flotation', brand_slug: 'ai-flotation' },
];
const PAGE = 'https://training.colaberry.com/free-class';

/** 12 assets: 8 paid-only, 3 week-0 (both tags), 1 retired. */
function registry(): PlanAsset[] {
  const paid = Array.from({ length: 8 }, (_, i) => ({ id: `a-paid-${i + 1}`, asset_type: 'LESSON', title: `Week ${i + 1} lesson`, audience_tags: ['full_access'], active: true }));
  const week0 = Array.from({ length: 3 }, (_, i) => ({ id: `a-free-${i + 1}`, asset_type: 'LESSON', title: `Week 0 card ${i + 1}`, audience_tags: ['free_preview', 'full_access'], active: true }));
  const retired = { id: 'a-retired', asset_type: 'LESSON', title: 'Retired lesson', audience_tags: ['full_access'], active: false };
  return [...paid, ...week0, retired];
}

const plan = (over: Partial<Parameters<typeof buildContentRulesPlan>[0]> = {}) =>
  buildContentRulesPlan({
    brands: BRANDS,
    assetsByBrandSlug: { 'colaberry-training': registry(), cpn: registry() },
    landingPageByBrandSlug: { 'colaberry-training': PAGE, cpn: 'https://www.careerpathnetwork.org/scholarship' },
    ...over,
  });

describe('the rule table', () => {
  it('the narrower audience wins: a week-0 card carrying BOTH tags gets ONE free rule, never two', () => {
    expect(familyFor({ id: 'x', asset_type: 'LESSON', title: 't', audience_tags: ['free_preview', 'full_access'], active: true })).toEqual({ family: 'learner_free_training' });
    expect(familyFor({ id: 'x', asset_type: 'LESSON', title: 't', audience_tags: ['full_access'], active: true })).toEqual({ family: 'learner_paid_training' });
    const rules = plan().rules.filter((r) => r.brand_slug === 'colaberry-training' && r.asset_id.startsWith('a-free-'));
    expect(rules).toHaveLength(3);
    expect(rules.every((r) => r.offer_family === 'learner_free_training')).toBe(true);
    expect(new Set(rules.map((r) => r.asset_id)).size).toBe(3);
  });

  it('a retired asset, a non-lesson and an asset with no audience tag get no rule, each skipped by name', () => {
    expect(familyFor({ id: 'x', asset_type: 'LESSON', title: 't', audience_tags: ['full_access'], active: false })).toEqual({ skip: 'retired' });
    expect(familyFor({ id: 'x', asset_type: 'ARTICLE', title: 't', audience_tags: ['full_access'], active: true })).toEqual({ skip: 'not_a_lesson' });
    expect(familyFor({ id: 'x', asset_type: 'LESSON', title: 't', audience_tags: [], active: true })).toEqual({ skip: 'no_audience_tag' });
    const p = plan();
    expect(p.rules.some((r) => r.asset_id === 'a-retired')).toBe(false);
    expect(p.skipped.filter((s) => s.asset_id === 'a-retired' && s.reason === 'retired')).toHaveLength(2); // once per learner brand
  });

  it("the fixture registry yields 11 Training rules (3 free, 8 paid) and 3 CPN rules, one per asset", () => {
    const p = plan();
    const training = p.rules.filter((r) => r.brand_slug === 'colaberry-training');
    const cpn = p.rules.filter((r) => r.brand_slug === 'cpn');
    expect(training).toHaveLength(11);
    expect(training.filter((r) => r.offer_family === 'learner_free_training')).toHaveLength(3);
    expect(training.filter((r) => r.offer_family === 'learner_paid_training')).toHaveLength(8);
    expect(cpn).toHaveLength(3);
    expect(cpn.every((r) => r.offer_family === 'learner_free_training')).toBe(true);
    expect(p.rules).toHaveLength(14);
    // One rule per (brand, asset): the unique index can never be raced by this plan.
    expect(new Set(p.rules.map((r) => `${r.brand_id}/${r.asset_id}/${r.version}`)).size).toBe(14);
    expect(p.counts).toEqual({
      'colaberry-training': { learner_free_training: 3, learner_paid_training: 8 },
      cpn: { learner_free_training: 3 },
    });
  });

  it("CPN declares only the free family: a paid asset is skipped as family_not_offered, never re-homed", () => {
    const p = plan();
    const declined = p.skipped.filter((s) => s.reason === 'family_not_offered');
    expect(declined).toHaveLength(8);
    expect(declined.every((s) => s.brand_slug === 'cpn')).toBe(true);
    expect(p.rules.some((r) => r.brand_slug === 'cpn' && r.offer_family === 'learner_paid_training')).toBe(false);
    expect(FAMILIES_BY_BRAND_SLUG.cpn).toEqual(['learner_free_training']);
    expect(FAMILIES_BY_BRAND_SLUG['colaberry-training']).toEqual(['learner_free_training', 'learner_paid_training']);
  });

  it('every rule carries the brand\'s own tenant, the learner programme and an approved status', () => {
    for (const rule of plan().rules) {
      expect(rule.eligible_programs).toEqual(['learner']);
      expect(rule.approval_status).toBe('approved');
      expect(rule.version).toBe(1);
      expect(rule.tenant_id).toBe(rule.brand_slug === 'cpn' ? TENANT.cpn : TENANT.colaberry);
    }
  });
});

describe('the brands that get nothing', () => {
  it('Business and AI Flotation get no rule and no policy entry, and the absence is reported by name', () => {
    const p = plan();
    expect(p.rules.some((r) => ['colaberry-enterprise', 'ai-flotation'].includes(r.brand_slug))).toBe(false);
    expect(p.policy_pages.some((g) => ['colaberry-enterprise', 'ai-flotation'].includes(g.brand_slug))).toBe(false);
    expect(p.brands_without_assets.sort()).toEqual(['ai-flotation', 'colaberry-enterprise']);
    // Copied before sorting: the export is readonly, and sorting it in place would reorder it for every other test.
    expect([...LEARNER_BRAND_SLUGS].sort()).toEqual(['colaberry-training', 'cpn']);
  });

  it('a service brand HANDED assets (a misconfigured caller) still gets no rule: the brand check does not rely on the registry being empty', () => {
    const p = plan({ assetsByBrandSlug: { 'colaberry-training': registry(), cpn: registry(), 'colaberry-enterprise': registry(), 'ai-flotation': registry() } });
    expect(p.rules.some((r) => r.brand_slug === 'colaberry-enterprise')).toBe(false);
    expect(p.rules.some((r) => r.brand_slug === 'ai-flotation')).toBe(false);
    expect(p.rules).toHaveLength(14);
    expect(p.brands_without_assets.sort()).toEqual(['ai-flotation', 'colaberry-enterprise']);
    expect(p.policy_pages.some((g) => ['colaberry-enterprise', 'ai-flotation'].includes(g.brand_slug))).toBe(false);
  });

  it('a learner brand whose registry is empty gets nothing either - no rules, no policy entry, named as absent', () => {
    const p = plan({ assetsByBrandSlug: { 'colaberry-training': registry(), cpn: [] } });
    expect(p.rules.every((r) => r.brand_slug === 'colaberry-training')).toBe(true);
    expect(p.brands_without_assets).toContain('cpn');
    expect(p.policy_pages.every((g) => g.brand_slug === 'colaberry-training')).toBe(true);
  });
});

describe('an asset another brand claimed (the T412 verifier)', () => {
  it('an asset whose own brand_id names ANOTHER brand is skipped by name - an approved rule would override the gate\'s asset_other_brand check' , () => {
    const claimed = registry().map((a) => (a.id === 'a-free-1' ? { ...a, brand_id: 'b-cpn' } : a));
    const p = plan({ assetsByBrandSlug: { 'colaberry-training': claimed, cpn: claimed } });
    expect(p.rules.some((r) => r.brand_slug === 'colaberry-training' && r.asset_id === 'a-free-1')).toBe(false);
    expect(p.skipped).toContainEqual({ asset_id: 'a-free-1', reason: 'another_brands_asset', brand_slug: 'colaberry-training' });
    // Its own brand still declares it; a NULL brand_id (what the sync writes) is anyone's to declare.
    expect(p.rules.some((r) => r.brand_slug === 'cpn' && r.asset_id === 'a-free-1')).toBe(true);
    expect(p.rules.filter((r) => r.brand_slug === 'colaberry-training')).toHaveLength(10);
  });
});

describe('the policy entries', () => {
  it('one per brand x family that actually got rules, carrying the operator\'s URL', () => {
    const p = plan();
    expect(p.policy_pages.map((g) => [g.brand_slug, g.offer_family])).toEqual([
      ['cpn', 'learner_free_training'],
      ['colaberry-training', 'learner_free_training'],
      ['colaberry-training', 'learner_paid_training'],
    ]);
    expect(p.policy_pages.every((g) => g.landing_page.startsWith('https://'))).toBe(true);
  });

  it('the URL is required and must be https - a policy entry without an approved URL approves nothing', () => {
    expect(() => plan({ landingPageByBrandSlug: {} })).toThrow(LandingPageRequiredError);
    expect(() => assertLandingPage('http://training.colaberry.com/x', 'colaberry-training')).toThrow(LandingPageNotHttpsError);
    expect(() => assertLandingPage('not a url', 'colaberry-training')).toThrow(LandingPageNotHttpsError);
    expect(() => assertLandingPage('https://user:pw@training.colaberry.com/x', 'colaberry-training')).toThrow(LandingPageNotHttpsError);
    expect(assertLandingPage(PAGE, 'colaberry-training')).toBe(PAGE);
  });
});

describe('never a stamp, never a body', () => {
  it('the ASSETS it is handed come back untouched: a frozen registry makes a stamp throw, and the rows are compared afterwards', () => {
    const registryBefore = registry();
    const frozen = registryBefore.map((a) => Object.freeze({ ...a, audience_tags: Object.freeze([...a.audience_tags]) as unknown as string[] }));
    const copy = JSON.parse(JSON.stringify(frozen));
    // Frozen in strict mode (ts-jest emits ES modules): assigning to an asset throws rather than passing quietly.
    const p = buildContentRulesPlan({
      brands: BRANDS,
      assetsByBrandSlug: { 'colaberry-training': frozen, cpn: frozen },
      landingPageByBrandSlug: { 'colaberry-training': PAGE, cpn: PAGE },
    });
    expect(p.rules).toHaveLength(14);
    expect(JSON.parse(JSON.stringify(frozen))).toEqual(copy);
    for (const asset of frozen) {
      expect(Object.keys(asset).sort()).toEqual(['active', 'asset_type', 'audience_tags', 'id', 'title']);
    }
  });

  it('the plan contains no asset write in any shape: no brand_id, offer_family or approval on an ASSET, only rule rows', () => {
    const p = plan();
    const json = JSON.stringify(p);
    // The plan's only writable shapes are rules and policy pages - there is no asset-shaped entry at all.
    expect(Object.keys(p).sort()).toEqual(['brands_without_assets', 'counts', 'policy_pages', 'rules', 'skipped']);
    for (const rule of p.rules) {
      expect(Object.keys(rule).sort()).toEqual(['approval_status', 'asset_id', 'brand_id', 'brand_slug', 'eligible_programs', 'offer_family', 'tenant_id', 'version']);
    }
    // No asset title or body travels with the plan - `asset_id` and nothing else identifies it.
    expect(json).not.toContain('Week 0 card');
    expect(json).not.toContain('Week 1 lesson');
    expect(json).not.toContain('@');
  });

  it('the summary\'s title says what the run IS: a dry run, or a write in one transaction', () => {
    expect(renderPlanSummary(plan())[0]).toBe('content rules plan (dry run — nothing written)');
    expect(renderPlanSummary(plan(), 'dry-run')[0]).toBe('content rules plan (dry run — nothing written)');
    expect(renderPlanSummary(plan(), 'write')[0]).toBe('content rules plan (writing — one transaction)');
  });

  it('the dry-run summary is counts only: no title, no asset URL, no address, and it states the zero explicitly', () => {
    const lines = renderPlanSummary(plan());
    const text = lines.join('\n');
    expect(text).toContain('colaberry-training: 11 rule(s)');
    expect(text).toContain('    learner_free_training: 3');
    expect(text).toContain('cpn: 3 rule(s)');
    expect(text).toContain('ai-flotation: no authored assets');
    expect(text).toContain('policy entries: 3');
    expect(text).toContain('skipped (retired): 2');
    expect(text).toContain('skipped (family_not_offered): 8');
    expect(text).toContain('explorer_content_assets touched: 0');
    expect(text).not.toContain('Week ');
    expect(text).not.toContain('@');
    expect(text).not.toContain('https://');
    // Counts only means counts: not an asset id either, which would make the summary a list of the registry.
    for (const rule of plan().rules) expect(text).not.toContain(rule.asset_id);
    for (const skipped of plan().skipped) expect(text).not.toContain(skipped.asset_id);
  });
});
