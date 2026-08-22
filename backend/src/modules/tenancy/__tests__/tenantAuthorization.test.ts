const membershipFindAll = jest.fn();

jest.mock('../../../models', () => ({
  TenantMembership: { findAll: (...a: unknown[]) => membershipFindAll(...a) },
}));

import {
  buildRequestContext,
  canAccessTenant,
  emptyContext,
  hasPermission,
  requireBrandAccess,
  requirePermission,
  requirePlatformSuperAdmin,
  requireTenantAccess,
  tenantScopeWhere,
  TenantAccessError,
} from '../tenantAuthorization';
import { TENANT_ROLES } from '../tenantRoles';

const IDENTITY = '11111111-1111-4111-8111-111111111111';
const COLABERRY = '22222222-2222-4222-8222-222222222222';
const CPN = '33333333-3333-4333-8333-333333333333';
const FLOTATION = '44444444-4444-4444-8444-444444444444';
const BRAND_ENTERPRISE = '55555555-5555-4555-8555-555555555555';
const BRAND_TRAINING = '66666666-6666-4666-8666-666666666666';

function membership(tenant: string, role: string, brand: string | null = null) {
  return { tenant_id: tenant, brand_id: brand, role, status: 'active' };
}

beforeEach(() => {
  membershipFindAll.mockReset();
});

describe('buildRequestContext', () => {
  it('gives an unauthenticated request no access at all', async () => {
    const ctx = await buildRequestContext({ platformIdentityId: null });
    expect(ctx).toEqual(emptyContext());
    expect(membershipFindAll).not.toHaveBeenCalled();
  });

  it('auto-selects the tenant when the identity belongs to exactly one', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.tenantId).toBe(CPN);
  });

  it('refuses to guess when the identity belongs to several tenants', async () => {
    membershipFindAll.mockResolvedValue([
      membership(CPN, TENANT_ROLES.TENANT_ADMIN),
      membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    // Defaulting would let an operator act on the wrong tenant without noticing.
    expect(ctx.tenantId).toBeNull();
    expect(ctx.authorizedTenantIds).toEqual(expect.arrayContaining([CPN, COLABERRY]));
  });

  it('ignores a requested tenant the identity has no membership in', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: FLOTATION,
    });
    expect(ctx.tenantId).toBeNull();
  });

  it('does not carry roles from one tenant into another', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN),
      membership(CPN, TENANT_ROLES.BRAND_MARKETER),
    ]);
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: CPN,
    });
    expect(ctx.roles).toEqual([TENANT_ROLES.BRAND_MARKETER]);
    // tenant_admin in Colaberry must not grant sender.write inside CPN.
    expect(hasPermission(ctx, 'sender.write')).toBe(false);
  });

  it('lets a platform superadmin operate in a tenant they hold no membership in', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.PLATFORM_SUPER_ADMIN),
    ]);
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: FLOTATION,
    });
    expect(ctx.isPlatformSuperAdmin).toBe(true);
    expect(ctx.tenantId).toBe(FLOTATION);
  });

  it('fails closed when memberships cannot be read', async () => {
    membershipFindAll.mockRejectedValue(new Error('db down'));
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.authorizedTenantIds).toEqual([]);
    expect(ctx.isPlatformSuperAdmin).toBe(false);
    expect(ctx.tenantId).toBeNull();
  });

  it('honours a brand-scoped membership and refuses a brand outside it', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_ENTERPRISE),
    ]);
    const permitted = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
      requestedBrandId: BRAND_ENTERPRISE,
    });
    expect(permitted.brandId).toBe(BRAND_ENTERPRISE);

    const refused = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
      requestedBrandId: BRAND_TRAINING,
    });
    expect(refused.brandId).toBeNull();
  });

  it('treats a null brand_id membership as covering every brand in the tenant', async () => {
    membershipFindAll.mockResolvedValue([membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN, null)]);
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
      requestedBrandId: BRAND_TRAINING,
    });
    expect(ctx.brandId).toBe(BRAND_TRAINING);
  });
});

describe('tenantScopeWhere', () => {
  it('is unrestricted for a platform superadmin', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.PLATFORM_SUPER_ADMIN),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(tenantScopeWhere(ctx)).toEqual({});
  });

  it('pins to the selected tenant', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(tenantScopeWhere(ctx)).toEqual({ tenant_id: CPN });
  });

  it('matches NOTHING for a context with no memberships', () => {
    // The critical case: returning {} here would turn an unauthenticated request into
    // an unscoped findAll().
    expect(tenantScopeWhere(emptyContext())).toEqual({ tenant_id: null });
  });
});

describe('canAccessTenant', () => {
  it('denies a row owned by another tenant', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(canAccessTenant(ctx, FLOTATION)).toBe(false);
  });

  it('denies an unclassified (null-tenant) row to a normal operator', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    // Treating legacy unclassified data as "everyone's" would defeat isolation the
    // moment a backfill left something behind.
    expect(canAccessTenant(ctx, null)).toBe(false);
  });

  it('allows the platform superadmin to reach unclassified rows', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.PLATFORM_SUPER_ADMIN),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(canAccessTenant(ctx, null)).toBe(true);
  });
});

describe('guards', () => {
  it('raises 404, not 403, for a foreign tenant’s row', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    expect(() => requireTenantAccess(ctx, FLOTATION)).toThrow(TenantAccessError);
    try {
      requireTenantAccess(ctx, FLOTATION);
    } catch (err) {
      // A 403 would confirm the row exists, turning ID enumeration into a discovery
      // tool for a competitor's campaign inventory.
      expect((err as TenantAccessError).status).toBe(404);
      expect((err as TenantAccessError).errorClass).toBe('TenantIsolationViolation');
    }
  });

  it('raises 403 for a missing permission inside an authorized tenant', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_VIEWER)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    expect(() => requirePermission(ctx, 'campaign.read')).not.toThrow();
    try {
      requirePermission(ctx, 'campaign.write');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TenantAccessError).status).toBe(403);
    }
  });

  it('blocks a non-superadmin from ecosystem operations', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(() => requirePlatformSuperAdmin(ctx)).toThrow(TenantAccessError);
  });

  it('requireBrandAccess: foreign tenant is 404, wrong brand in own tenant is 403', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_ENTERPRISE),
    ]);
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
      requestedBrandId: BRAND_ENTERPRISE,
    });

    try {
      requireBrandAccess(ctx, CPN, 'whatever');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TenantAccessError).status).toBe(404);
    }

    try {
      requireBrandAccess(ctx, COLABERRY, BRAND_TRAINING);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TenantAccessError).status).toBe(403);
    }
  });
});

describe('role registry wiring', () => {
  it('grants a marketer campaign.send but not sender.write', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.BRAND_MARKETER)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(hasPermission(ctx, 'campaign.send')).toBe(true);
    // A marketer running a campaign must not be able to repoint the brand's From address.
    expect(hasPermission(ctx, 'sender.write')).toBe(false);
  });

  it('grants an unknown role nothing', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, 'not_a_real_role')]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(hasPermission(ctx, 'lead.read')).toBe(false);
  });
});
