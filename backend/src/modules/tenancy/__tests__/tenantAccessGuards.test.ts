const auditCreate = jest.fn();
const membershipFindAll = jest.fn();

jest.mock('../../../models', () => ({
  TenantAccessAudit: {
    create: (...a: unknown[]) => auditCreate(...a),
    findAll: jest.fn(),
  },
  TenantMembership: { findAll: (...a: unknown[]) => membershipFindAll(...a) },
}));

import { buildRequestContext, TenantAccessError, emptyContext } from '../tenantAuthorization';
import {
  requireBrandAccessAudited,
  requirePermissionAudited,
  requirePlatformSuperAdminAudited,
  requireTenantAccessAudited,
} from '../tenantAccessGuards';
import { TENANT_ROLES } from '../tenantRoles';

const IDENTITY = '11111111-1111-4111-8111-111111111111';
const CPN = '22222222-2222-4222-8222-222222222222';
const FLOTATION = '33333333-3333-4333-8333-333333333333';
const COLABERRY = '44444444-4444-4444-8444-444444444444';
const BRAND_ENTERPRISE = '55555555-5555-4555-8555-555555555555';
const BRAND_TRAINING = '66666666-6666-4666-8666-666666666666';

const OPTS = { resourceType: 'campaign', action: 'read', resourceId: 'camp-1' };

function membership(tenant: string, role: string, brand: string | null = null) {
  return { tenant_id: tenant, brand_id: brand, role, status: 'active' };
}

/** The single row the recorder wrote. */
function written() {
  return auditCreate.mock.calls[0][0];
}

beforeEach(() => {
  auditCreate.mockReset().mockResolvedValue({});
  membershipFindAll.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('the denials are the evidence', () => {
  it('records a cross-tenant denial and still throws 404', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    await expect(requireTenantAccessAudited(ctx, FLOTATION, OPTS)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({
      decision: 'denied',
      reason: 'TenantIsolationViolation',
      resource_tenant_id: FLOTATION,
      context_tenant_id: CPN,
      platform_identity_id: IDENTITY,
      resource_type: 'campaign',
      resource_id: 'camp-1',
      action: 'read',
    });
  });

  it('writes the audit row BEFORE throwing, so a swallowed error still leaves evidence', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    try {
      await requireTenantAccessAudited(ctx, FLOTATION, OPTS);
    } catch {
      /* a caller that swallows the error must not also lose the record */
    }
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(written().decision).toBe('denied');
  });

  it('records an unauthenticated attempt rather than ignoring it', async () => {
    await expect(requireTenantAccessAudited(emptyContext(), CPN, OPTS)).rejects.toThrow();
    expect(written()).toMatchObject({ decision: 'denied', platform_identity_id: null });
  });

  it('records a permission denial with the permission under test', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_VIEWER)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    await expect(
      requirePermissionAudited(ctx, 'campaign.write', { ...OPTS, action: 'write' }),
    ).rejects.toBeInstanceOf(TenantAccessError);

    expect(written()).toMatchObject({
      decision: 'denied',
      reason: 'AuthorizationError',
      permission: 'campaign.write',
    });
  });
});

describe('allowed access is recorded too', () => {
  it('records a permitted read', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    await expect(requireTenantAccessAudited(ctx, CPN, OPTS)).resolves.toBeUndefined();
    expect(written()).toMatchObject({ decision: 'allowed', reason: 'granted' });
  });

  it('records a superadmin crossing tenants, which is the most sensitive allowed action', async () => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.PLATFORM_SUPER_ADMIN),
    ]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    await requirePlatformSuperAdminAudited(ctx, { resourceType: 'ecosystem', action: 'list' });

    // "Who looked across tenants, and when" is the other half of what a funder asks.
    expect(written()).toMatchObject({
      decision: 'allowed',
      reason: 'granted:cross_tenant',
      permission: 'platform.cross_tenant',
    });
  });
});

describe('brand scope keeps isolation and permissions distinguishable', () => {
  beforeEach(() => {
    membershipFindAll.mockResolvedValue([
      membership(COLABERRY, TENANT_ROLES.BRAND_ADMIN, BRAND_ENTERPRISE),
    ]);
  });

  it('a foreign tenant is recorded as an isolation event', async () => {
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
      requestedBrandId: BRAND_ENTERPRISE,
    });

    await expect(
      requireBrandAccessAudited(ctx, CPN, 'whatever', OPTS),
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(written().reason).toBe('TenantIsolationViolation');
  });

  it('a wrong brand inside your own tenant is recorded as a permissions gap, not isolation', async () => {
    const ctx = await buildRequestContext({
      platformIdentityId: IDENTITY,
      requestedTenantId: COLABERRY,
      requestedBrandId: BRAND_ENTERPRISE,
    });

    await expect(
      requireBrandAccessAudited(ctx, COLABERRY, BRAND_TRAINING, OPTS),
    ).rejects.toBeInstanceOf(TenantAccessError);

    // Different finding in a review. Conflating the two would misreport the boundary.
    expect(written().reason).toBe('AuthorizationError');
  });
});

describe('the audit can never change the outcome', () => {
  it('still DENIES when the audit table is unreachable', async () => {
    auditCreate.mockRejectedValue(new Error('relation "tenant_access_audits" does not exist'));
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    // The failure mode that would matter most: bookkeeping breaks, boundary holds.
    await expect(requireTenantAccessAudited(ctx, FLOTATION, OPTS)).rejects.toBeInstanceOf(
      TenantAccessError,
    );
  });

  it('still ALLOWS legitimate work when the audit table is unreachable', async () => {
    auditCreate.mockRejectedValue(new Error('connection refused'));
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    await expect(requireTenantAccessAudited(ctx, CPN, OPTS)).resolves.toBeUndefined();
  });

  it('shouts when a row is dropped, carrying the record it could not persist', async () => {
    auditCreate.mockRejectedValue(new Error('disk full'));
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    try {
      await requireTenantAccessAudited(ctx, FLOTATION, OPTS);
    } catch {
      /* expected */
    }

    const logged = JSON.parse((console.error as jest.Mock).mock.calls[0][0]);
    expect(logged.event).toBe('tenant_access_audit_write_failed');
    expect(logged.level).toBe('error');
    // The log line is now the only copy of the record, so it must carry it.
    expect(logged.context).toMatchObject({
      decision: 'denied',
      resource_tenant_id: FLOTATION,
      resource_type: 'campaign',
    });
  });
});

describe('correlation and provenance', () => {
  it('carries the correlation id, actor email and ip through to the row', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });

    await requireTenantAccessAudited(ctx, CPN, {
      ...OPTS,
      correlationId: 'req-abc-123',
      actorEmail: 'operator@cpn.org',
      ipAddress: '203.0.113.7',
    });

    expect(written()).toMatchObject({
      correlation_id: 'req-abc-123',
      actor_email: 'operator@cpn.org',
      ip_address: '203.0.113.7',
    });
  });

  it('stamps occurred_at on every row', async () => {
    membershipFindAll.mockResolvedValue([membership(CPN, TENANT_ROLES.TENANT_ADMIN)]);
    const ctx = await buildRequestContext({ platformIdentityId: IDENTITY });
    await requireTenantAccessAudited(ctx, CPN, OPTS);
    expect(written().occurred_at).toBeInstanceOf(Date);
  });
});
