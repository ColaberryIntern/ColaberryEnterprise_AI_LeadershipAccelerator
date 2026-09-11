const resolveBrand = jest.fn();
const familyFindOne = jest.fn();
const familyCreate = jest.fn();
const policyFindOne = jest.fn();
const policyCreate = jest.fn();

jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: (...a: unknown[]) => resolveBrand(...a),
}));

jest.mock('../../../models', () => ({
  OfferFamily: {
    findOne: (...a: unknown[]) => familyFindOne(...a),
    create: (...a: unknown[]) => familyCreate(...a),
  },
  BrandOfferPolicy: {
    findOne: (...a: unknown[]) => policyFindOne(...a),
    create: (...a: unknown[]) => policyCreate(...a),
  },
}));

import { seedBrandOfferPolicy } from '../seedBrandOfferPolicy';
import { AI_FLOTATION_DENIED_FAMILIES } from '../../../models/OfferFamily';

/**
 * T202 — the seed's two obligations: run twice with the same end state, and
 * never overwrite an operator's hand.
 *
 * `seedExplorerGrowthCampaigns.test.ts` set the pattern (and states why a
 * database read cannot run in this repo's CI). The interesting cases here are
 * the asymmetric ones: a `deny` is re-asserted on update because it is the
 * safety property, while an `allow` never overwrites an existing `deny`,
 * because a human closing something the spec permits is a decision.
 */

const brandRow = (over: Record<string, unknown> = {}) => ({
  id: 'brand-1',
  tenant_id: 'tenant-1',
  ...over,
});

const policyRow = (over: Record<string, unknown> = {}) => ({
  id: 'policy-1',
  decision: 'allow',
  status: 'active',
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  resolveBrand.mockReset().mockResolvedValue(brandRow());
  familyFindOne.mockReset().mockResolvedValue(null);
  familyCreate.mockReset().mockResolvedValue({ id: 'family-1' });
  policyFindOne.mockReset().mockResolvedValue(null);
  policyCreate.mockReset().mockResolvedValue({ id: 'policy-new' });
});

/** Every BrandOfferPolicy.create payload the seed produced. */
const policyPayloads = () =>
  policyCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('the catalog seed is idempotent', () => {
  it('creates the eleven families on an empty database', async () => {
    const r = await seedBrandOfferPolicy();
    expect(r.families_created).toBe(11);
    expect(r.families_existing).toBe(0);
  });

  it('creates none on a second run', async () => {
    familyFindOne.mockResolvedValue({ id: 'family-1', slug: 'ai_consulting' });
    const r = await seedBrandOfferPolicy();
    expect(r.families_created).toBe(0);
    expect(r.families_existing).toBe(11);
    expect(familyCreate).not.toHaveBeenCalled();
  });

  it('reports a catalog failure without aborting the rest', async () => {
    familyCreate.mockRejectedValueOnce(new Error('unique violation'));
    const r = await seedBrandOfferPolicy();
    expect(r.failed).toHaveLength(1);
    expect(r.families_created).toBe(10);
    // The policy half still ran.
    expect(r.policies_created).toBeGreaterThan(0);
  });
});

describe('the policy seed is idempotent', () => {
  it('creates one row per brand-family pair on an empty database', async () => {
    const r = await seedBrandOfferPolicy();
    // 2 (CPN) + 5 (Training) + 6 (Enterprise) + 5 (Flotation allow) + 6 (Flotation deny)
    expect(r.policies_created).toBe(24);
    expect(r.policies_updated).toBe(0);
  });

  it('creates nothing and updates nothing on a second identical run', async () => {
    policyFindOne.mockImplementation(async (args: any) =>
      policyRow({
        decision: AI_FLOTATION_DENIED_FAMILIES.includes(args.where.offer_family)
          ? 'deny'
          : 'allow',
      }),
    );
    const r = await seedBrandOfferPolicy();
    expect(r.policies_created).toBe(0);
    expect(r.policies_updated).toBe(0);
    expect(policyCreate).not.toHaveBeenCalled();
  });
});

describe('it never overwrites an operator', () => {
  it('writes no status on the update path', async () => {
    const row = policyRow({ status: 'paused' });
    policyFindOne.mockResolvedValue(row);
    await seedBrandOfferPolicy();
    for (const call of row.update.mock.calls) {
      expect(Object.keys(call[0])).not.toContain('status');
    }
  });

  it('writes no approved-content list on the update path', async () => {
    const row = policyRow({ decision: 'allow', approved_claims: ['operator wrote this'] });
    policyFindOne.mockResolvedValue(row);
    await seedBrandOfferPolicy();
    for (const call of row.update.mock.calls) {
      const keys = Object.keys(call[0]);
      for (const field of [
        'approved_landing_pages',
        'approved_claims',
        'content_collections',
        'approved_ctas',
        'conversion_events',
        'required_approvals',
      ]) {
        expect(keys).not.toContain(field);
      }
    }
  });

  it('leaves an existing allow row completely untouched', async () => {
    // Each family reads back with the decision its definition asks for, so the
    // only rows in play here are the allow ones. An earlier version of this test
    // returned `allow` for EVERY family, which included the six §4:287 denies —
    // the seed correctly restored those six, and the test read that correct
    // behaviour as a failure.
    const allowRows: ReturnType<typeof policyRow>[] = [];
    policyFindOne.mockImplementation(async (args: any) => {
      const denied = AI_FLOTATION_DENIED_FAMILIES.includes(args.where.offer_family);
      const r = policyRow({ decision: denied ? 'deny' : 'allow' });
      if (!denied) allowRows.push(r);
      return r;
    });

    const r = await seedBrandOfferPolicy();

    expect(allowRows.length).toBeGreaterThan(0);
    for (const row of allowRows) expect(row.update).not.toHaveBeenCalled();
    expect(r.policies_updated).toBe(0);
  });

  it('does NOT reopen a family an operator denied, even where §4 allows it', async () => {
    // The seed's own definition says allow; the operator says deny. The
    // operator wins — auto-reopening on the next boot is precisely the override
    // this seed is forbidden from doing.
    const row = policyRow({ decision: 'deny' });
    policyFindOne.mockResolvedValue(row);
    const r = await seedBrandOfferPolicy();

    // Asserted as "never called", not as "no call carried allow". Every row
    // reads back as deny here, so a loop over the calls would be empty and pass
    // whatever the seed did.
    expect(row.update).not.toHaveBeenCalled();
    expect(r.policies_updated).toBe(0);
    expect(policyCreate).not.toHaveBeenCalled();
  });
});

describe('a deny is re-asserted, because it is the safety property', () => {
  it('restores decision: deny when a denied family has been flipped to allow', async () => {
    // Every row reads back as `allow`. The five allow definitions must stay
    // untouched; the six §4:287 denies must be put back.
    const rows: ReturnType<typeof policyRow>[] = [];
    policyFindOne.mockImplementation(async () => {
      const r = policyRow({ decision: 'allow' });
      rows.push(r);
      return r;
    });

    const result = await seedBrandOfferPolicy();

    const restored = rows.flatMap((r) => r.update.mock.calls).filter((c) => c[0].decision === 'deny');
    expect(restored).toHaveLength(6);
    expect(result.policies_updated).toBe(6);
  });

  it('does not re-write a deny that is already correct', async () => {
    policyFindOne.mockImplementation(async (args: any) =>
      policyRow({
        decision: AI_FLOTATION_DENIED_FAMILIES.includes(args.where.offer_family)
          ? 'deny'
          : 'allow',
      }),
    );
    const r = await seedBrandOfferPolicy();
    expect(r.policies_updated).toBe(0);
  });

  it('seeds the denies before the allows', async () => {
    await seedBrandOfferPolicy();
    const decisions = policyPayloads().map((p) => p.decision);
    const lastDeny = decisions.lastIndexOf('deny');
    const firstAllow = decisions.indexOf('allow');
    expect(lastDeny).toBeLessThan(firstAllow);
  });
});

describe('the create payload', () => {
  it('ships every approved-content list empty — no invented URL or claim', async () => {
    await seedBrandOfferPolicy();
    const payloads = policyPayloads();
    expect(payloads).toHaveLength(24);
    for (const p of payloads) {
      expect(p.approved_landing_pages).toEqual([]);
      expect(p.approved_claims).toEqual([]);
      expect(p.content_collections).toEqual([]);
      expect(p.approved_ctas).toEqual([]);
      expect(p.conversion_events).toEqual([]);
    }
  });

  it('carries the human review gate', async () => {
    await seedBrandOfferPolicy();
    for (const p of policyPayloads()) {
      expect(p.required_approvals).toEqual(['human_copy_review']);
    }
  });

  it('carries tenant_id from the brand, not from the definition', async () => {
    // The definition names a tenant SLUG; the row stores the resolved id. Taking
    // it from the brand keeps the denormalised tenant_id consistent with
    // brand_id by construction.
    resolveBrand.mockResolvedValue(brandRow({ tenant_id: 'tenant-resolved' }));
    await seedBrandOfferPolicy();
    for (const p of policyPayloads()) expect(p.tenant_id).toBe('tenant-resolved');
  });

  it('states the decision explicitly rather than relying on a column default', async () => {
    await seedBrandOfferPolicy();
    for (const p of policyPayloads()) expect(Object.keys(p)).toContain('decision');
  });
});

describe('brand resolution goes through the tenancy module', () => {
  it('calls resolveBrandBySlug with BOTH slugs, never the brand slug alone', () => {
    // Brand slugs are unique per tenant, not globally, so a one-argument lookup
    // would be resolving something this schema does not guarantee.
    return seedBrandOfferPolicy().then(() => {
      expect(resolveBrand).toHaveBeenCalled();
      for (const call of resolveBrand.mock.calls) {
        expect(typeof call[0]).toBe('string');
        expect(typeof call[1]).toBe('string');
        expect(call[0].length).toBeGreaterThan(0);
        expect(call[1].length).toBeGreaterThan(0);
      }
    });
  });

  it('resolves the four brands §4 names', async () => {
    await seedBrandOfferPolicy();
    const pairs = [...new Set(resolveBrand.mock.calls.map((c) => `${c[0]}/${c[1]}`))].sort();
    expect(pairs).toEqual([
      'ai-flotation/ai-flotation',
      'colaberry/colaberry-enterprise',
      'colaberry/colaberry-training',
      'cpn/cpn',
    ]);
  });
});

describe('a missing brand is skipped, not failed', () => {
  it('skips when the brand cannot be resolved at all', async () => {
    // `resolveBrandBySlug` returns null for a missing tenant, a missing brand
    // AND a database error - it is fail-soft by design. All three land here as
    // "absent", which for a seed means skip and retry next boot.
    resolveBrand.mockResolvedValue(null);
    const r = await seedBrandOfferPolicy();
    expect(r.policies_created).toBe(0);
    expect(r.failed).toEqual([]);
    // Four brands, deduplicated across AI Flotation's allow and deny entries.
    expect(r.skipped_brands.sort()).toEqual(
      ['ai-flotation/ai-flotation', 'colaberry/colaberry-enterprise', 'colaberry/colaberry-training', 'cpn/cpn'].sort(),
    );
  });

  it('skips only the absent brand and seeds the others', async () => {
    resolveBrand.mockImplementation(async (_tenantSlug: string, brandSlug: string) =>
      brandSlug === 'cpn' ? null : brandRow(),
    );
    const r = await seedBrandOfferPolicy();
    expect(r.skipped_brands).toEqual(['cpn/cpn']);
    // 24 minus CPN's two.
    expect(r.policies_created).toBe(22);
    expect(r.failed).toEqual([]);
  });

  it('records a genuine write failure as failed, not skipped', async () => {
    policyCreate.mockRejectedValueOnce(new Error('deadlock detected'));
    const r = await seedBrandOfferPolicy();
    expect(r.failed).toHaveLength(1);
    expect(r.skipped_brands).toEqual([]);
    expect(r.policies_created).toBe(23);
  });
});
