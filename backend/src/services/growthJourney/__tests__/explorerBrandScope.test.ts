/**
 * Who may be served Explorer Growth's population, and who may not.
 *
 * The cell that matters most is "a brand with the same slug under a DIFFERENT
 * tenant". `brands` is unique on `(tenant_id, slug)`, not on `slug`, so a
 * slug-only lookup can bind the wrong tenant's brand and then serve every
 * Colaberry Training learner under it while still reporting `explorer_brand`.
 * The `unknown_brand` branch cannot catch that, because the row exists.
 *
 * Every other test here would pass against that broken version.
 */
jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: jest.fn(),
}));
jest.mock('../../../models', () => ({
  Brand: { findByPk: jest.fn() },
}));

import { resolveExplorerScope } from '../explorerBrandScope';
import { resolveBrandBySlug } from '../../../modules/tenancy/tenantResolver';
import { Brand } from '../../../models';
import { EXPLORER_PROGRAM } from '../explorerProgramBridge';

const EXPLORER_BRAND_ID = '10ebfb01-dc51-450d-bbef-a2c10e42efa8';
const OTHER_BRAND_ID = '8e8c4054-322f-4030-8c0f-c8eeafbcdd22'; // AI Flotation
const NO_SUCH_BRAND_ID = '00000000-0000-4000-8000-000000000000';

const mockResolve = resolveBrandBySlug as jest.Mock;
const mockFindByPk = (Brand as any).findByPk as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue({ id: EXPLORER_BRAND_ID });
  mockFindByPk.mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('the brand Explorer Growth actually belongs to', () => {
  it('resolves it by TENANT slug and brand slug together, never by slug alone', async () => {
    await resolveExplorerScope(EXPLORER_BRAND_ID);

    // The assertion that kills a slug-only lookup. Both arguments, in this order.
    expect(mockResolve).toHaveBeenCalledWith(
      EXPLORER_PROGRAM.tenantSlug,
      EXPLORER_PROGRAM.brandSlug
    );
    expect(EXPLORER_PROGRAM.tenantSlug).toBe('colaberry');
    expect(EXPLORER_PROGRAM.brandSlug).toBe('colaberry-training');
  });

  it('serves the population when the request names it', async () => {
    const scope = await resolveExplorerScope(EXPLORER_BRAND_ID);
    expect(scope).toEqual({
      in_scope: true,
      brand_id: EXPLORER_BRAND_ID,
      reason: 'explorer_brand',
    });
  });
});

describe('a brand that is not Explorer\'s gets nothing', () => {
  it('refuses a real other brand, and says it is a real one', async () => {
    mockFindByPk.mockResolvedValue({ id: OTHER_BRAND_ID });

    const scope = await resolveExplorerScope(OTHER_BRAND_ID);

    expect(scope).toEqual({
      in_scope: false,
      brand_id: OTHER_BRAND_ID,
      reason: 'other_brand',
    });
  });

  it('refuses an id that matches no brand at all, and says so distinctly', async () => {
    mockFindByPk.mockResolvedValue(null);

    const scope = await resolveExplorerScope(NO_SUCH_BRAND_ID);

    // NOT in scope. An unknown id must never fall through to data, which is the
    // easiest version of this to get wrong.
    expect(scope.in_scope).toBe(false);
    expect(scope.reason).toBe('unknown_brand');
  });

  it('THE CROSS-TENANT CELL: a same-slug brand under another tenant is NOT Explorer', async () => {
    // Two tenants may both carry a brand slugged `colaberry-training`. This is the
    // one that resolves through the tenant, so it is Explorer's.
    mockResolve.mockResolvedValue({ id: EXPLORER_BRAND_ID });
    // ...and this is the impostor: a real brand row, same slug, different tenant.
    const SAME_SLUG_OTHER_TENANT = 'ffffffff-0000-4000-8000-000000000001';
    mockFindByPk.mockResolvedValue({ id: SAME_SLUG_OTHER_TENANT, slug: 'colaberry-training' });

    const scope = await resolveExplorerScope(SAME_SLUG_OTHER_TENANT);

    // A slug-only lookup would have returned this row as "Explorer's brand" and
    // reported in_scope with reason 'explorer_brand', serving 1,191 learners under
    // the wrong tenant's name.
    expect(scope.in_scope).toBe(false);
    expect(scope.reason).toBe('other_brand');
  });
});

describe('no brand requested', () => {
  it('serves everything only when the caller is not confined to a brand', async () => {
    const scope = await resolveExplorerScope(null, null);
    expect(scope).toEqual({ in_scope: true, brand_id: null, reason: 'all_brands' });
    // Nothing to resolve, so no lookup is made at all.
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('falls back to the caller\'s OWN brand when they are confined to one', async () => {
    // Otherwise a brand-restricted operator could omit the parameter and be served
    // everyone's rows, which is a widening by the module whose job is refusing to.
    const scope = await resolveExplorerScope(null, EXPLORER_BRAND_ID);
    expect(scope.reason).toBe('explorer_brand');
    expect(scope.brand_id).toBe(EXPLORER_BRAND_ID);
  });

  it('refuses when the caller is confined to a brand that is not Explorer\'s', async () => {
    mockFindByPk.mockResolvedValue({ id: OTHER_BRAND_ID });

    const scope = await resolveExplorerScope(null, OTHER_BRAND_ID);

    expect(scope.in_scope).toBe(false);
    expect(scope.reason).toBe('other_brand');
  });

  it('prefers an explicit request over the caller\'s brand', async () => {
    const scope = await resolveExplorerScope(EXPLORER_BRAND_ID, OTHER_BRAND_ID);
    expect(scope.reason).toBe('explorer_brand');
  });
});

describe('when Explorer\'s own brand cannot be resolved', () => {
  it('refuses rather than guessing', async () => {
    // An environment where the brand row is absent. Falling through here would mean
    // serving the population to whoever asked.
    mockResolve.mockResolvedValue(null);

    const scope = await resolveExplorerScope(EXPLORER_BRAND_ID);

    expect(scope.in_scope).toBe(false);
    expect(scope.reason).toBe('unknown_brand');
  });
});
