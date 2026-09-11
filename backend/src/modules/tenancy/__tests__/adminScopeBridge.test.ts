const identityFindOne = jest.fn();
const identityFindByPk = jest.fn();
const linkFindOne = jest.fn();
const membershipFindAll = jest.fn();
const membershipCount = jest.fn();

jest.mock('../../../models', () => ({
  PlatformIdentity: {
    findOne: (...a: unknown[]) => identityFindOne(...a),
    findByPk: (...a: unknown[]) => identityFindByPk(...a),
  },
  PlatformIdentityLink: { findOne: (...a: unknown[]) => linkFindOne(...a) },
  TenantMembership: {
    findAll: (...a: unknown[]) => membershipFindAll(...a),
    count: (...a: unknown[]) => membershipCount(...a),
  },
}));

import { contextFromAdminRequest, intelligenceScopeForAdmin } from '../adminScopeBridge';
import { TENANT_ROLES } from '../tenantRoles';

const CPN = '11111111-1111-4111-8111-111111111111';
const IDENTITY = '22222222-2222-4222-8222-222222222222';
const ADMIN = { id: 'admin-1', email: 'operator@colaberry.com', role: 'admin' };

beforeEach(() => {
  [identityFindOne, identityFindByPk, linkFindOne, membershipFindAll, membershipCount].forEach((m) =>
    m.mockReset(),
  );
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

/**
 * The migration ramp. `tenant_memberships` is empty in production, so strict scoping
 * would show every existing admin an empty Memory Graph — breaking a working screen to
 * enforce a boundary that currently separates nothing.
 *
 * The ramp is conditioned on the WHOLE TABLE being empty, not on this admin having no
 * rows. That makes it self-closing: the first membership anyone creates switches
 * enforcement on for everybody, with no flag to remember to flip.
 */

describe('while no memberships exist anywhere (today)', () => {
  beforeEach(() => {
    membershipCount.mockResolvedValue(0);
    linkFindOne.mockResolvedValue(null);
    identityFindOne.mockResolvedValue(null);
  });

  it('an existing admin keeps cross-tenant read access', async () => {
    const scope = await intelligenceScopeForAdmin(ADMIN);
    expect(scope.crossTenant).toBe(true);
  });

  it('and it is logged loudly, so the ramp is measurable rather than invisible', async () => {
    await intelligenceScopeForAdmin(ADMIN);
    const logged = JSON.parse((console.warn as jest.Mock).mock.calls[0][0]);
    expect(logged.event).toBe('legacy_admin_cross_tenant_scope');
    expect(logged.context.closes_when).toMatch(/first tenant_membership/);
  });
});

describe('once ANY membership exists, the ramp closes for everyone', () => {
  beforeEach(() => membershipCount.mockResolvedValue(1));

  it('an admin with no membership of their own gets NOTHING', async () => {
    linkFindOne.mockResolvedValue(null);
    identityFindOne.mockResolvedValue(null);

    const scope = await intelligenceScopeForAdmin(ADMIN);
    // An admin token is not a tenancy grant. Master plan §19.2.
    expect(scope).toEqual({ tenantIds: [], crossTenant: false });
  });

  it('an admin WITH a membership is scoped to that tenant', async () => {
    identityFindOne.mockResolvedValue({ id: IDENTITY });
    linkFindOne.mockResolvedValue(null);
    membershipFindAll.mockResolvedValue([
      { tenant_id: CPN, brand_id: null, role: TENANT_ROLES.TENANT_ADMIN, status: 'active' },
    ]);

    const scope = await intelligenceScopeForAdmin(ADMIN);
    expect(scope).toEqual({ tenantIds: [CPN], crossTenant: false });
  });

  it('a genuine platform superadmin still crosses tenants', async () => {
    identityFindOne.mockResolvedValue({ id: IDENTITY });
    linkFindOne.mockResolvedValue(null);
    membershipFindAll.mockResolvedValue([
      { tenant_id: CPN, brand_id: null, role: TENANT_ROLES.PLATFORM_SUPER_ADMIN, status: 'active' },
    ]);

    expect((await intelligenceScopeForAdmin(ADMIN)).crossTenant).toBe(true);
  });
});

describe('failure modes never widen access', () => {
  it('an unauthenticated request sees nothing', async () => {
    expect(await intelligenceScopeForAdmin(undefined)).toEqual({
      tenantIds: [],
      crossTenant: false,
    });
    expect(membershipCount).not.toHaveBeenCalled();
  });

  it('if the membership count query fails, it does NOT fall back to cross-tenant', async () => {
    // Guessing "unpopulated" on an error would hand out cross-tenant reads whenever the
    // database hiccupped. Being wrong in that direction is the expensive one.
    membershipCount.mockRejectedValue(new Error('db down'));
    linkFindOne.mockResolvedValue(null);
    identityFindOne.mockResolvedValue(null);

    expect(await intelligenceScopeForAdmin(ADMIN)).toEqual({ tenantIds: [], crossTenant: false });
  });

  it('an identity lookup failure does not widen access either', async () => {
    membershipCount.mockResolvedValue(1);
    linkFindOne.mockRejectedValue(new Error('db down'));
    identityFindOne.mockRejectedValue(new Error('db down'));

    expect((await intelligenceScopeForAdmin(ADMIN)).crossTenant).toBe(false);
  });
});

describe('identity resolution', () => {
  it('prefers an explicit admin_user link over an email match', async () => {
    membershipCount.mockResolvedValue(1);
    linkFindOne.mockResolvedValue({ platform_identity_id: IDENTITY });
    identityFindByPk.mockResolvedValue({ id: IDENTITY });
    membershipFindAll.mockResolvedValue([
      { tenant_id: CPN, brand_id: null, role: TENANT_ROLES.TENANT_ADMIN, status: 'active' },
    ]);

    const scope = await intelligenceScopeForAdmin(ADMIN);
    expect(scope.tenantIds).toEqual([CPN]);
    // The link is authoritative; email is only the fallback.
    expect(identityFindOne).not.toHaveBeenCalled();
  });
});

describe('contextFromAdminRequest propagates a brand refusal (G2)', () => {
  const BRAND_A = '33333333-3333-4333-8333-333333333333';
  const BRAND_B = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    membershipCount.mockResolvedValue(1);
    linkFindOne.mockResolvedValue(null);
    identityFindOne.mockResolvedValue({ id: IDENTITY });
    membershipFindAll.mockResolvedValue([
      { tenant_id: CPN, brand_id: BRAND_A, role: TENANT_ROLES.BRAND_ADMIN, status: 'active' },
    ]);
  });

  it('throws — does not return an unscoped context — when the requested brand is not held', async () => {
    await expect(
      contextFromAdminRequest(ADMIN, { requestedTenantId: CPN, requestedBrandId: BRAND_B }),
    ).rejects.toMatchObject({ status: 403, errorClass: 'AuthorizationError' });
  });

  it('auto-confines when no brand was requested', async () => {
    const ctx = await contextFromAdminRequest(ADMIN);
    expect(ctx.brandId).toBe(BRAND_A);
    expect(ctx.authorizedBrandIds).toEqual([BRAND_A]);
  });

  it('the older brand-less callers are unaffected: intelligenceScopeForAdmin still scopes by tenant', async () => {
    const scope = await intelligenceScopeForAdmin(ADMIN);
    expect(scope).toEqual({ tenantIds: [CPN], crossTenant: false });
  });
});
