const findOne = jest.fn();
const findAll = jest.fn();

const brandFindAll = jest.fn();

jest.mock('../../../models/BrandOfferPolicy', () => ({
  BrandOfferPolicy: {
    findOne: (...a: unknown[]) => findOne(...a),
    findAll: (...a: unknown[]) => findAll(...a),
  },
}));
jest.mock('../../../models/Brand', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => brandFindAll(...a) },
}));

import {
  resolveOfferEligibility,
  allowedOfferFamilies,
  assertOfferAllowed,
  brandsAllowingFamily,
  OfferNotEligibleError,
} from '../offerEligibility';
import { AI_FLOTATION_DENIED_FAMILIES, OFFER_FAMILIES } from '../../../models/OfferFamily';

/**
 * T202 — the §4 eligibility gate.
 *
 * §4 requires "contract tests proving AI Flotation cannot receive
 * business-training assets even when the classifier, content tags or caller
 * request are wrong". The three describe blocks below are those three ways of
 * being wrong: a caller naming something outside the catalog, a policy row that
 * has been paused or expired, and a stray `allow` row added later.
 *
 * A DATABASE READ CANNOT RUN IN THIS REPO'S CI — `.github/workflows/ci.yml`
 * starts no Postgres service and sets no `DATABASE_URL` — so the policy rows are
 * mocked here and the persisted rows are verified live on dev1 (and, under T208,
 * in production). Both halves are needed: this file proves the rules, the live
 * check proves the rows.
 */

const BRAND = 'brand-ai-flotation';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'policy-1',
  brand_id: BRAND,
  offer_family: 'ai_consulting',
  decision: 'allow',
  status: 'active',
  effective_from: new Date('2026-01-01T00:00:00Z'),
  effective_to: null,
  approved_landing_pages: [],
  approved_claims: [],
  content_collections: [],
  approved_ctas: [],
  conversion_events: [],
  required_approvals: ['human_copy_review'],
  ...over,
});

beforeEach(() => {
  findOne.mockReset().mockResolvedValue(null);
  findAll.mockReset().mockResolvedValue([]);
  brandFindAll.mockReset().mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('it fails closed', () => {
  it('denies when no policy row exists', async () => {
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('no_policy');
  });

  it('denies an unrecognised family WITHOUT querying the database', async () => {
    // A typo must not reach the database as a silent miss that reads identically
    // to "no policy" — and must not be answerable by a row that happens to exist.
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'business-training' });
    expect(d.reason).toBe('unknown_offer_family');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('denies a family that differs only in case', async () => {
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'BUSINESS_TRAINING' });
    expect(d.reason).toBe('unknown_offer_family');
  });

  it('denies when the lookup itself throws', async () => {
    findOne.mockRejectedValue(new Error('connection terminated'));
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('lookup_failed');
  });

  it('returns [] rather than throwing when the list query fails', async () => {
    findAll.mockRejectedValue(new Error('connection terminated'));
    await expect(allowedOfferFamilies(BRAND)).resolves.toEqual([]);
  });

  it('grants only on an active, in-window allow row', async () => {
    findOne.mockResolvedValue(row());
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('allowed');
    expect(d.policy_id).toBe('policy-1');
  });
});

describe('a deny is unconditional, and outranks an allow', () => {
  it('denies with explicit_deny, not no_policy — the distinction the mutation test needs', async () => {
    // If the assertion were only `allowed === false`, deleting the deny row would
    // still produce false via default-deny and the mutation would pass. The
    // REASON is what makes the deny row load-bearing rather than decorative.
    findOne.mockResolvedValue(row({ decision: 'deny', offer_family: 'business_training' }));
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'business_training' });
    expect(d.reason).toBe('explicit_deny');
    expect(d.policy_id).toBe('policy-1');
  });

  it('still denies when the deny row is paused', async () => {
    // A deny must not be liftable by pausing it.
    findOne.mockResolvedValue(row({ decision: 'deny', status: 'paused' }));
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('explicit_deny');
  });

  it('still denies when the deny row has expired', async () => {
    // Nor by letting it lapse.
    findOne.mockResolvedValue(
      row({ decision: 'deny', effective_to: new Date('2026-02-01T00:00:00Z') }),
    );
    const d = await resolveOfferEligibility({
      brandId: BRAND,
      offerFamily: 'ai_consulting',
      at: new Date('2026-09-10T00:00:00Z'),
    });
    expect(d.reason).toBe('explicit_deny');
  });

  it('excludes a family whose deny row is PAUSED, on the list path too', async () => {
    // The gap an independent mutation found: `allowedOfferFamilies` is a second
    // implementation of the same three rules, and reversing its deny/status
    // ordering left all 24 tests in this file green. The code was already
    // correct; nothing pinned it. These two tests pin it.
    findAll.mockResolvedValue([
      row({ offer_family: 'business_training', decision: 'deny', status: 'paused' }),
      row({ id: 'policy-2', offer_family: 'ai_consulting', decision: 'allow' }),
    ]);
    await expect(allowedOfferFamilies(BRAND)).resolves.toEqual(['ai_consulting']);
  });

  it('excludes a family whose deny row has EXPIRED, on the list path too', async () => {
    findAll.mockResolvedValue([
      row({
        offer_family: 'business_training',
        decision: 'deny',
        effective_to: new Date('2026-02-01T00:00:00Z'),
      }),
      row({ id: 'policy-2', offer_family: 'ai_consulting', decision: 'allow' }),
    ]);
    await expect(allowedOfferFamilies(BRAND, new Date('2026-09-10T00:00:00Z'))).resolves.toEqual([
      'ai_consulting',
    ]);
  });

  it('excludes a paused deny even when a live allow row sits beside it', async () => {
    // The two failure modes composed: the deny is softened AND a grant exists.
    // Ordering the status check first would return business_training here.
    findAll.mockResolvedValue([
      row({ offer_family: 'business_training', decision: 'deny', status: 'retired' }),
      row({ id: 'policy-2', offer_family: 'business_training', decision: 'allow' }),
    ]);
    await expect(allowedOfferFamilies(BRAND)).resolves.toEqual([]);
  });

  it('subtracts denies from the allowed list even when both rows exist', async () => {
    // The stray-grant case: someone adds an allow beside the deny.
    findAll.mockResolvedValue([
      row({ offer_family: 'business_training', decision: 'allow' }),
      row({ id: 'policy-2', offer_family: 'business_training', decision: 'deny' }),
      row({ id: 'policy-3', offer_family: 'ai_consulting', decision: 'allow' }),
    ]);
    await expect(allowedOfferFamilies(BRAND)).resolves.toEqual(['ai_consulting']);
  });
});

describe('an allow is conditional', () => {
  it('denies a paused allow row', async () => {
    findOne.mockResolvedValue(row({ status: 'paused' }));
    expect((await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' })).reason).toBe(
      'policy_inactive',
    );
  });

  it('denies a retired allow row', async () => {
    findOne.mockResolvedValue(row({ status: 'retired' }));
    expect((await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' })).reason).toBe(
      'policy_inactive',
    );
  });

  it('denies before the window opens and after it closes', async () => {
    findOne.mockResolvedValue(
      row({
        effective_from: new Date('2026-06-01T00:00:00Z'),
        effective_to: new Date('2026-07-01T00:00:00Z'),
      }),
    );
    const before = await resolveOfferEligibility({
      brandId: BRAND,
      offerFamily: 'ai_consulting',
      at: new Date('2026-05-31T23:59:59Z'),
    });
    const after = await resolveOfferEligibility({
      brandId: BRAND,
      offerFamily: 'ai_consulting',
      at: new Date('2026-07-01T00:00:01Z'),
    });
    const during = await resolveOfferEligibility({
      brandId: BRAND,
      offerFamily: 'ai_consulting',
      at: new Date('2026-06-15T00:00:00Z'),
    });
    expect(before.reason).toBe('outside_effective_window');
    expect(after.reason).toBe('outside_effective_window');
    expect(during.allowed).toBe(true);
  });

  it('treats a null effective_to as open-ended', async () => {
    findOne.mockResolvedValue(row({ effective_to: null }));
    const d = await resolveOfferEligibility({
      brandId: BRAND,
      offerFamily: 'ai_consulting',
      at: new Date('2099-01-01T00:00:00Z'),
    });
    expect(d.allowed).toBe(true);
  });
});

describe('eligibility is not content approval', () => {
  it('allows with approved_content_ready false when the lists are empty', async () => {
    findOne.mockResolvedValue(row());
    const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' });
    expect(d.allowed).toBe(true);
    expect(d.approved_content_ready).toBe(false);
  });

  it('reports ready once a page or a collection is approved', async () => {
    findOne.mockResolvedValue(row({ approved_landing_pages: ['https://example.test/a'] }));
    expect(
      (await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' }))
        .approved_content_ready,
    ).toBe(true);

    findOne.mockResolvedValue(row({ content_collections: ['consulting-cases'] }));
    expect(
      (await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' }))
        .approved_content_ready,
    ).toBe(true);
  });

  it('does not count approved claims alone as content readiness', async () => {
    // A claim is copy, not something to point a person at. Treating it as
    // readiness would let a campaign fire with no approved destination.
    findOne.mockResolvedValue(row({ approved_claims: ['we do consulting'] }));
    expect(
      (await resolveOfferEligibility({ brandId: BRAND, offerFamily: 'ai_consulting' }))
        .approved_content_ready,
    ).toBe(false);
  });
});

describe('§4:287 — AI Flotation cannot receive a denied family, six ways', () => {
  it('denies every one of the six, enumerated', async () => {
    // Enumerated from the shared list, so a family dropped from the seed's
    // definition is also dropped from this loop and cannot hide.
    expect(AI_FLOTATION_DENIED_FAMILIES).toHaveLength(6);

    for (const family of AI_FLOTATION_DENIED_FAMILIES) {
      findOne.mockResolvedValue(row({ decision: 'deny', offer_family: family }));
      const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: family });
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe('explicit_deny');
    }
  });

  it('names business_training and all five learner families, not four', async () => {
    expect([...AI_FLOTATION_DENIED_FAMILIES].sort()).toEqual(
      [
        'business_training',
        'learner_certification',
        'learner_community_subscription',
        'learner_free_training',
        'learner_internship',
        'learner_paid_training',
      ].sort(),
    );
  });

  it('denies them even with no rows at all — absence is the backstop', async () => {
    findOne.mockResolvedValue(null);
    for (const family of AI_FLOTATION_DENIED_FAMILIES) {
      const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: family });
      expect(d.allowed).toBe(false);
    }
  });

  it('never allows anything outside the catalog, across all eleven plus a fake', async () => {
    findOne.mockResolvedValue(row({ decision: 'allow' }));
    for (const family of [...OFFER_FAMILIES, 'business_training_lite']) {
      const d = await resolveOfferEligibility({ brandId: BRAND, offerFamily: family });
      expect(d.allowed).toBe(family !== 'business_training_lite');
    }
  });
});

describe('assertOfferAllowed', () => {
  it('throws a classified error on denial', async () => {
    findOne.mockResolvedValue(row({ decision: 'deny' }));
    await expect(
      assertOfferAllowed({ brandId: BRAND, offerFamily: 'business_training' }),
    ).rejects.toBeInstanceOf(OfferNotEligibleError);
  });

  it('carries the decision on the error, so the caller can log the reason', async () => {
    findOne.mockResolvedValue(row({ decision: 'deny' }));
    try {
      await assertOfferAllowed({ brandId: BRAND, offerFamily: 'business_training' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OfferNotEligibleError);
      expect((err as OfferNotEligibleError).decision.reason).toBe('explicit_deny');
      expect((err as OfferNotEligibleError).error_class).toBe('OfferNotEligibleError');
    }
  });

  it('returns the decision when allowed', async () => {
    findOne.mockResolvedValue(row());
    await expect(
      assertOfferAllowed({ brandId: BRAND, offerFamily: 'ai_consulting' }),
    ).resolves.toMatchObject({ allowed: true });
  });
});

/**
 * Phase 2 (T225): the inverse lookup — which brands may offer a family this
 * brand may not? Same three rules as `allowedOfferFamilies`, so the two cannot
 * disagree: an active, in-window allow row grants; a deny row for the same
 * brand subtracts it whatever its status; anything else is not a grant.
 */
describe('brandsAllowingFamily — the referral target lookup', () => {
  const BRANDS = [
    { id: 'brand-ai-flotation', slug: 'ai-flotation', tenant_id: 't-af' },
    { id: 'brand-enterprise', slug: 'colaberry-enterprise', tenant_id: 't-col' },
    { id: 'brand-training', slug: 'colaberry-training', tenant_id: 't-col' },
  ];
  const brandsById = (q: { where: { id: string[] } }) => BRANDS.filter((b) => q.where.id.includes(b.id));

  it('returns the brands with a live allow row, sorted by slug, with tenant ids', async () => {
    findAll.mockResolvedValue([
      row({ brand_id: 'brand-training', offer_family: 'business_training' }),
      row({ brand_id: 'brand-enterprise', offer_family: 'business_training' }),
    ]);
    brandFindAll.mockImplementation(async (q) => brandsById(q));
    expect(await brandsAllowingFamily('business_training')).toEqual([
      { brand_id: 'brand-enterprise', brand_slug: 'colaberry-enterprise', tenant_id: 't-col' },
      { brand_id: 'brand-training', brand_slug: 'colaberry-training', tenant_id: 't-col' },
    ]);
    expect(findAll).toHaveBeenCalledWith({ where: { offer_family: 'business_training' } });
  });

  it('a deny row for a brand removes it even when an allow row sits beside it, whatever the deny’s status', async () => {
    findAll.mockResolvedValue([
      row({ brand_id: 'brand-enterprise', offer_family: 'business_training' }),
      row({ brand_id: 'brand-ai-flotation', offer_family: 'business_training' }),
      row({ brand_id: 'brand-ai-flotation', offer_family: 'business_training', decision: 'deny', status: 'paused' }),
    ]);
    brandFindAll.mockImplementation(async (q) => brandsById(q));
    expect((await brandsAllowingFamily('business_training')).map((b) => b.brand_slug)).toEqual(['colaberry-enterprise']);
  });

  it('a paused, retired or out-of-window allow is not a grant', async () => {
    findAll.mockResolvedValue([
      row({ brand_id: 'brand-enterprise', status: 'paused' }),
      row({ brand_id: 'brand-training', status: 'retired' }),
      row({ brand_id: 'brand-ai-flotation', effective_to: new Date('2020-01-01T00:00:00Z') }),
    ]);
    brandFindAll.mockImplementation(async (q) => brandsById(q));
    expect(await brandsAllowingFamily('ai_consulting')).toEqual([]);
    expect(brandFindAll).not.toHaveBeenCalled();
  });

  it('an unrecognised family is [] without a query; a failing query is [] and logged', async () => {
    expect(await brandsAllowingFamily('quantum_consulting')).toEqual([]);
    expect(findAll).not.toHaveBeenCalled();
    findAll.mockRejectedValue(new Error('db down'));
    expect(await brandsAllowingFamily('ai_consulting')).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('brands_failed'));
  });

  it('agrees with allowedOfferFamilies: a brand is in the list for a family iff the family is in its list', async () => {
    const rows = [
      row({ brand_id: 'brand-enterprise', offer_family: 'business_training' }),
      row({ brand_id: 'brand-ai-flotation', offer_family: 'business_training', decision: 'deny' }),
      row({ brand_id: 'brand-ai-flotation', offer_family: 'workflow_automation' }),
    ];
    findAll.mockImplementation(async (q: { where: Record<string, string> }) =>
      rows.filter((r) => Object.entries(q.where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)),
    );
    brandFindAll.mockImplementation(async (q) => brandsById(q));
    const enterpriseHas = await allowedOfferFamilies('brand-enterprise');
    const flotationHas = await allowedOfferFamilies('brand-ai-flotation');
    const bt = (await brandsAllowingFamily('business_training')).map((b) => b.brand_id);
    const wa = (await brandsAllowingFamily('workflow_automation')).map((b) => b.brand_id);
    expect(bt.includes('brand-enterprise')).toBe(enterpriseHas.includes('business_training'));
    expect(bt.includes('brand-ai-flotation')).toBe(flotationHas.includes('business_training'));
    expect(wa.includes('brand-ai-flotation')).toBe(flotationHas.includes('workflow_automation'));
    expect(bt).toEqual(['brand-enterprise']);
  });
});
