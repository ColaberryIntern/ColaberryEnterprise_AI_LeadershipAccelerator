const domainFindOne = jest.fn();
const brandFindByPk = jest.fn();
const tenantFindByPk = jest.fn();
const leadSourceFindOne = jest.fn();

jest.mock('../../models', () => ({
  BrandDomain: { findOne: (...a: unknown[]) => domainFindOne(...a) },
  Brand: { findByPk: (...a: unknown[]) => brandFindByPk(...a) },
  Tenant: { findByPk: (...a: unknown[]) => tenantFindByPk(...a) },
  LeadSource: { findOne: (...a: unknown[]) => leadSourceFindOne(...a) },
}));

import {
  clearTenantResolutionCache,
  resolveContextByHostname,
} from '../../modules/tenancy/tenantResolver';

/**
 * One hostname, two brands.
 *
 * enterprise.colaberry.ai serves Colaberry Consulting when logged out and the
 * Refactored.ai working portal when logged in. `brand_domains` models that as two rows
 * on the same hostname with different `purpose` values, and a `/portal` path is what
 * selects the `app` one.
 *
 * These tests pin the two properties that make that safe: an `app` row wins for portal
 * traffic, and a host WITHOUT an app row keeps behaving exactly as it does today rather
 * than losing attribution.
 */

const HOST = 'enterprise.colaberry.ai';
const COLABERRY_TENANT = '11111111-1111-4111-8111-111111111111';
const ENTERPRISE_BRAND = '22222222-2222-4222-8222-222222222222';
const REFACTORED_TENANT = '33333333-3333-4333-8333-333333333333';
const REFACTORED_BRAND = '44444444-4444-4444-8444-444444444444';

function wireBrands() {
  brandFindByPk.mockImplementation(async (id: string) =>
    id === REFACTORED_BRAND
      ? { id: REFACTORED_BRAND, slug: 'refactored', status: 'active', tenant_id: REFACTORED_TENANT }
      : { id: ENTERPRISE_BRAND, slug: 'colaberry-enterprise', status: 'active', tenant_id: COLABERRY_TENANT },
  );
  tenantFindByPk.mockImplementation(async (id: string) =>
    id === REFACTORED_TENANT
      ? { id: REFACTORED_TENANT, slug: 'refactored', status: 'active' }
      : { id: COLABERRY_TENANT, slug: 'colaberry', status: 'active' },
  );
}

beforeEach(() => {
  [domainFindOne, brandFindByPk, tenantFindByPk, leadSourceFindOne].forEach((m) => m.mockReset());
  clearTenantResolutionCache();
  wireBrands();
});

describe('one hostname serving two brands', () => {
  it('a portal path resolves to Refactored.ai via the app row', async () => {
    domainFindOne.mockImplementation(async ({ where }: any) =>
      where.purpose === 'app'
        ? { hostname: HOST, purpose: 'app', brand_id: REFACTORED_BRAND }
        : { hostname: HOST, purpose: 'web', brand_id: ENTERPRISE_BRAND },
    );

    const ctx = await resolveContextByHostname(HOST, 'app');
    expect(ctx).toMatchObject({ brandSlug: 'refactored', tenantSlug: 'refactored' });
  });

  it('the public site on the SAME hostname still resolves to Colaberry Enterprise', async () => {
    domainFindOne.mockImplementation(async ({ where }: any) =>
      where.purpose === 'app'
        ? { hostname: HOST, purpose: 'app', brand_id: REFACTORED_BRAND }
        : { hostname: HOST, purpose: 'web', brand_id: ENTERPRISE_BRAND },
    );

    const ctx = await resolveContextByHostname(HOST, 'web');
    expect(ctx).toMatchObject({ brandSlug: 'colaberry-enterprise', tenantSlug: 'colaberry' });
  });
});

describe('hosts without an app row are unaffected', () => {
  it('falls back to the web row rather than losing attribution', async () => {
    // The safety property. Every other host in the system has only a `web` row, and an
    // app-purpose lookup on them must keep returning what it returns today.
    domainFindOne.mockImplementation(async ({ where }: any) =>
      where.purpose === 'app' ? null : { hostname: HOST, purpose: 'web', brand_id: ENTERPRISE_BRAND },
    );

    const ctx = await resolveContextByHostname(HOST, 'app');
    expect(ctx).toMatchObject({ brandSlug: 'colaberry-enterprise' });
  });

  it('an entirely unregistered host still resolves to null, not a wrong brand', async () => {
    domainFindOne.mockResolvedValue(null);
    expect(await resolveContextByHostname('not-registered.example', 'app')).toBeNull();
  });
});

describe('resolution stays fail-soft', () => {
  it('a database fault returns null rather than throwing', async () => {
    // Tracking must never take the endpoint down; the caller records a null context.
    domainFindOne.mockRejectedValue(new Error('connection refused'));
    expect(await resolveContextByHostname(HOST, 'app')).toBeNull();
  });

  it('an inactive brand does not resolve', async () => {
    domainFindOne.mockResolvedValue({ hostname: HOST, purpose: 'app', brand_id: REFACTORED_BRAND });
    brandFindByPk.mockResolvedValue({
      id: REFACTORED_BRAND,
      slug: 'refactored',
      status: 'inactive',
      tenant_id: REFACTORED_TENANT,
    });
    expect(await resolveContextByHostname(HOST, 'app')).toBeNull();
  });
});
