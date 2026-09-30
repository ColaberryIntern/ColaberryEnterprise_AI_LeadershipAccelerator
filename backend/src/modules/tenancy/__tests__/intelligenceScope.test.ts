import { Op } from 'sequelize';
import {
  assertSameTenant,
  CrossTenantEdgeError,
  emptyScope,
  graphScopeWhere,
  scopeAllows,
  scopeFromContext,
} from '../intelligenceScope';
import { emptyContext, PlatformRequestContext } from '../tenantAuthorization';

/**
 * The Memory Graph is one shared store. Before scoping, `globalSearch` was an unbounded
 * findAll over every node, so a CPN operator searching a keyword could receive AI
 * Flotation client memory. CPN's isolation is a formal grant commitment, so these are
 * compliance tests, not tidiness tests.
 */

const CPN = '11111111-1111-4111-8111-111111111111';
const FLOTATION = '22222222-2222-4222-8222-222222222222';

function ctx(over: Partial<PlatformRequestContext> = {}): PlatformRequestContext {
  return { ...emptyContext(), ...over };
}

describe('graphScopeWhere — the clause that decides what a reader sees', () => {
  it('a superadmin sees everything, including unclassified legacy nodes', () => {
    expect(graphScopeWhere({ tenantIds: [], crossTenant: true })).toEqual({});
  });

  it('a tenant operator is limited to their tenants', () => {
    expect(graphScopeWhere({ tenantIds: [CPN], crossTenant: false })).toEqual({
      tenant_id: { [Op.in]: [CPN] },
    });
  });

  it('an empty scope matches NOTHING, never everything', () => {
    // The dangerous default. Returning {} here would turn every unauthenticated read
    // into a full scan of the whole ecosystem's memory.
    const where = graphScopeWhere(emptyScope()) as any;
    expect(where[Op.and]).toBeDefined();
    // Deliberately unsatisfiable: tenant_id IS NULL AND tenant_id IS NOT NULL.
    expect(where[Op.and]).toHaveLength(2);
  });
});

describe('scopeAllows — single-row checks', () => {
  it('permits a row in the reader’s tenant', () => {
    expect(scopeAllows({ tenantIds: [CPN], crossTenant: false }, CPN)).toBe(true);
  });

  it('refuses a row in another tenant', () => {
    expect(scopeAllows({ tenantIds: [CPN], crossTenant: false }, FLOTATION)).toBe(false);
  });

  it('refuses unclassified rows to a tenant operator', () => {
    // Treating unclassified memory as public would void the boundary the moment a
    // backfill missed something. All 227 existing production nodes are unclassified.
    expect(scopeAllows({ tenantIds: [CPN], crossTenant: false }, null)).toBe(false);
  });

  it('permits unclassified rows to a superadmin', () => {
    expect(scopeAllows({ tenantIds: [], crossTenant: true }, null)).toBe(true);
  });

  it('an empty scope permits nothing at all', () => {
    expect(scopeAllows(emptyScope(), CPN)).toBe(false);
    expect(scopeAllows(emptyScope(), null)).toBe(false);
  });
});

describe('scopeFromContext', () => {
  it('a platform superadmin gets cross-tenant', () => {
    expect(scopeFromContext(ctx({ isPlatformSuperAdmin: true }))).toEqual({
      tenantIds: [],
      crossTenant: true,
    });
  });

  it('a selected tenant narrows to exactly that tenant', () => {
    const scope = scopeFromContext(ctx({ tenantId: CPN, authorizedTenantIds: [CPN, FLOTATION] }));
    expect(scope).toEqual({ tenantIds: [CPN], crossTenant: false });
  });

  it('with no tenant selected, falls back to every authorized tenant', () => {
    const scope = scopeFromContext(ctx({ authorizedTenantIds: [CPN, FLOTATION] }));
    expect(scope.tenantIds).toEqual([CPN, FLOTATION]);
    expect(scope.crossTenant).toBe(false);
  });

  it('an unauthenticated context sees nothing', () => {
    expect(scopeFromContext(emptyContext())).toEqual({ tenantIds: [], crossTenant: false });
  });
});

describe('assertSameTenant — cross-tenant edges are refused at WRITE time', () => {
  it('refuses to join two different tenants', () => {
    // Checked on write, not read: once the edge exists, any traversal from either side
    // crosses the boundary and no read filter can undo it.
    expect(() => assertSameTenant(CPN, FLOTATION)).toThrow(CrossTenantEdgeError);
  });

  it('classifies the refusal as a tenant isolation violation', () => {
    try {
      assertSameTenant(CPN, FLOTATION);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CrossTenantEdgeError).errorClass).toBe('TenantIsolationViolation');
    }
  });

  it('allows an edge within one tenant', () => {
    expect(() => assertSameTenant(CPN, CPN)).not.toThrow();
  });

  it('allows two unclassified nodes to relate', () => {
    // This is the entire existing graph. Refusing it would break every current write on
    // the first deploy.
    expect(() => assertSameTenant(null, null)).not.toThrow();
  });

  it('refuses to join a classified node to an unclassified one', () => {
    expect(() => assertSameTenant(CPN, null)).toThrow(CrossTenantEdgeError);
    expect(() => assertSameTenant(null, CPN)).toThrow(CrossTenantEdgeError);
  });
});
