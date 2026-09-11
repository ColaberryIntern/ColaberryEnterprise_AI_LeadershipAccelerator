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

    // A refused brand is THROWN, not returned as null. Null means "not narrowed",
    // and returning it for a refusal would let a route that forgot to compare widen
    // a brand-scoped operator to the whole tenant.
    await expect(
      buildRequestContext({
        platformIdentityId: IDENTITY,
        requestedTenantId: COLABERRY,
        requestedBrandId: BRAND_TRAINING,
      }),
    ).rejects.toMatchObject({ status: 403, errorClass: 'AuthorizationError' });
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

/**
 * G2 — brand confinement is carried by the context, not opted into by the caller.
 *
 * Before: `brandId` was set only from a request, so a brand-restricted operator who did
 * not ask to be confined read their whole tenant. Now `authorizedBrandIds` carries the
 * restriction regardless, the builder auto-confines a single-brand operator, and both
 * guards consult the set. Every case below is one row of the plan's acceptance table.
 */
describe('G2 — brand confinement is automatic', () => {
  const BRAND_CPN = '77777777-7777-4777-8777-777777777777';

  it('auto-confines a single-brand operator who named no brand', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_TRAINING),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.tenantId).toBe(COLABERRY);
    expect(ctx.brandId).toBe(BRAND_TRAINING);
    expect(ctx.authorizedBrandIds).toEqual([BRAND_TRAINING]);
  });

  it('leaves a tenant-wide operator unrestricted: null brandId AND null set', async () => {
    membershipFindAll.mockResolvedValue([membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN, null)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.brandId).toBeNull();
    expect(ctx.authorizedBrandIds).toBeNull();
  });

  it('a two-brand operator is not narrowed to one, but the set is carried', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_TRAINING),
      membership(COLABERRY, TENANT_ROLES.BRAND_MARKETER, BRAND_ENTERPRISE),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.brandId).toBeNull();
    expect(ctx.authorizedBrandIds?.slice().sort()).toEqual(
      [BRAND_TRAINING, BRAND_ENTERPRISE].sort(),
    );
  });

  it('a two-brand operator may request either of theirs, and is refused a third', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_TRAINING),
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_ENTERPRISE),
    ]);
    const chosen = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedBrandId: BRAND_ENTERPRISE,
    });
    expect(chosen.brandId).toBe(BRAND_ENTERPRISE);
    await expect(
      buildRequestContext({ platformIdentityId: IDENTITY, requestedBrandId: BRAND_CPN }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('a brand cannot be granted without a resolved tenant: multi-tenant + brand request throws', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_TRAINING),
      membership(CPN, TENANT_ROLES.BRAND_ADMIN, BRAND_CPN),
    ]);
    // No requestedTenantId and two tenants → tenantId null → the brand cannot be scoped.
    await expect(
      buildRequestContext({ platformIdentityId: IDENTITY, requestedBrandId: BRAND_TRAINING }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('a multi-tenant restricted operator with no tenant chosen carries the union of brands', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_TRAINING),
      membership(CPN, TENANT_ROLES.BRAND_ADMIN, BRAND_CPN),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.tenantId).toBeNull();
    expect(ctx.authorizedBrandIds?.slice().sort()).toEqual([BRAND_TRAINING, BRAND_CPN].sort());
    // and the list scope is narrowed by tenant AND brand
    expect(tenantScopeWhere(ctx)).toEqual({
      tenant_id: ctx.authorizedTenantIds,
      brand_id: ctx.authorizedBrandIds,
    });
  });

  it('restriction is computed for the operating tenant only', async () => {
    // Brand-restricted in CPN, tenant-wide in Colaberry. Operating in Colaberry → unrestricted.
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN, null),
      membership(CPN, TENANT_ROLES.BRAND_ADMIN, BRAND_CPN),
    ]);
    const inColaberry = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
    });
    expect(inColaberry.authorizedBrandIds).toBeNull();
    const inCpn = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: CPN,
    });
    expect(inCpn.authorizedBrandIds).toEqual([BRAND_CPN]);
    expect(inCpn.brandId).toBe(BRAND_CPN);
  });

  it('a platform superadmin is never brand-restricted, whatever their memberships say', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.PLATFORM_SUPER_ADMIN, BRAND_TRAINING),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    expect(ctx.isPlatformSuperAdmin).toBe(true);
    expect(ctx.authorizedBrandIds).toBeNull();
    // and may still name any brand
    const named = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: CPN,
      requestedBrandId: BRAND_CPN,
    });
    expect(named.brandId).toBe(BRAND_CPN);
  });

  it('emptyContext is not brand-restricted (tenant scope already closes it)', () => {
    expect(emptyContext().authorizedBrandIds).toBeNull();
    expect(tenantScopeWhere(emptyContext())).toEqual({ tenant_id: null });
  });

  it('no source file still describes the old opt-in behaviour as a known gap', () => {
    // The gap was pinned in three places by name while it was open. Once the
    // builder closed it, prose saying "known gap" or "latent" or "null means
    // UNSCOPED" would be a comment claiming a property that is no longer true —
    // and a comment that states a property is a test somebody owes.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const files = [
      path.join(__dirname, '..', 'tenantAuthorization.ts'),
      path.join(__dirname, '..', 'adminScopeBridge.ts'),
      path.join(__dirname, '..', '..', '..', 'controllers', 'growthJourneyController.ts'),
      path.join(__dirname, '..', '..', '..', 'routes', 'admin', '__tests__', 'growthJourneyRoutes.access.test.ts'),
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/known gap/i);
      expect(src).not.toMatch(/\blatent\b/i);
      expect(src).not.toMatch(/null means UNSCOPED/);
    }
    // Control: the scan reads real files — the builder source must contain the
    // field this whole block is about.
    expect(fs.readFileSync(files[0], 'utf8')).toContain('authorizedBrandIds');
  });

  describe('tenantScopeWhere', () => {
    it('adds the brand set for a restricted operator', async () => {
      membershipFindAll.mockResolvedValue([
        membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_TRAINING),
      ]);
      const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
      expect(tenantScopeWhere(ctx)).toEqual({ tenant_id: COLABERRY, brand_id: [BRAND_TRAINING] });
    });

    it('is byte-identical to before for a tenant-wide operator (regression control)', async () => {
      membershipFindAll.mockResolvedValue([membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN, null)]);
      const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
      expect(JSON.stringify(tenantScopeWhere(ctx))).toBe(JSON.stringify({ tenant_id: COLABERRY }));
    });
  });

  describe('requireBrandAccess', () => {
    async function restrictedTo(...brands: string[]) {
      membershipFindAll.mockResolvedValue(
        brands.map((b) => membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, b)),
      );
      return buildRequestContext({ platformIdentityId: IDENTITY });
    }

    function status(fn: () => void): number | 'passed' {
      try {
        fn();
        return 'passed';
      } catch (err) {
        return (err as TenantAccessError).status;
      }
    }

    it('refuses a brand outside the set EVEN WHEN brandId is null (two-brand operator)', async () => {
      const ctx = await restrictedTo(BRAND_TRAINING, BRAND_ENTERPRISE);
      expect(ctx.brandId).toBeNull();
      expect(status(() => requireBrandAccess(ctx, COLABERRY, BRAND_CPN))).toBe(403);
    });

    it('passes a brand inside the set', async () => {
      const ctx = await restrictedTo(BRAND_TRAINING, BRAND_ENTERPRISE);
      expect(status(() => requireBrandAccess(ctx, COLABERRY, BRAND_ENTERPRISE))).toBe('passed');
    });

    it('refuses a brand-less row to a brand-restricted caller', async () => {
      const ctx = await restrictedTo(BRAND_TRAINING);
      expect(status(() => requireBrandAccess(ctx, COLABERRY, null))).toBe(403);
    });

    it('a single-brand operator who named nothing is refused the other brand (the G2 case)', async () => {
      const ctx = await restrictedTo(BRAND_TRAINING);
      expect(status(() => requireBrandAccess(ctx, COLABERRY, BRAND_ENTERPRISE))).toBe(403);
      expect(status(() => requireBrandAccess(ctx, COLABERRY, BRAND_TRAINING))).toBe('passed');
    });

    it('still 404s another tenant’s row before any brand logic (unchanged, the control)', async () => {
      const ctx = await restrictedTo(BRAND_TRAINING);
      expect(status(() => requireBrandAccess(ctx, CPN, BRAND_TRAINING))).toBe(404);
    });

    it('a tenant-wide operator passes a brand-less row (unchanged)', async () => {
      membershipFindAll.mockResolvedValue([membership(COLABERRY, TENANT_ROLES.TENANT_ADMIN, null)]);
      const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
      expect(status(() => requireBrandAccess(ctx, COLABERRY, null))).toBe('passed');
    });
  });
});
