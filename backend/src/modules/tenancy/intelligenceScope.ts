import { Op } from 'sequelize';
import type { PlatformRequestContext } from './tenantAuthorization';

/**
 * Tenant scoping for the Memory Graph.
 *
 * WHY: the graph is one shared store. `globalSearch` was an unbounded
 * `GraphNode.findAll` over every node in the database, and `neighbors` traversed any
 * node's edges by id. With one tenant that is a feature. With CPN in the same store it
 * is a leak: a CPN operator could search a keyword and receive AI Flotation client
 * memory, and CPN's isolation is a formal grant and donor commitment (DEC-05), not a
 * preference.
 *
 * The rule from the master plan §46 is that cross-tenant reasoning requires
 * platform-level privilege. This module is how that rule is expressed once, so every
 * query cannot each invent its own version of it.
 *
 * FAIL CLOSED. A scope that resolves to no tenants matches NOTHING, never everything.
 * The same reasoning as `tenantScopeWhere` in tenantAuthorization: the dangerous default
 * is the one that silently returns all rows.
 */

export interface IntelligenceScope {
  /** Tenants this reader may see. Empty means none. */
  tenantIds: string[];
  /** True only for a platform superadmin. Reads across every tenant, including legacy. */
  crossTenant: boolean;
}

/** A scope that can see nothing. The safe default for an unauthenticated caller. */
export function emptyScope(): IntelligenceScope {
  return { tenantIds: [], crossTenant: false };
}

/**
 * Derive the scope from a request context.
 *
 * A platform superadmin gets `crossTenant`, which is the ONLY way to reach another
 * tenant's memory or the unclassified legacy rows. Everyone else is limited to the
 * tenants they hold an active membership in.
 */
export function scopeFromContext(ctx: PlatformRequestContext): IntelligenceScope {
  if (ctx.isPlatformSuperAdmin) return { tenantIds: [], crossTenant: true };
  // The tenant currently being operated in, when one is selected; otherwise every
  // tenant the identity belongs to. Matches how tenantScopeWhere behaves, so a reader
  // never sees more in the graph than they would see in the CRM.
  const tenantIds = ctx.tenantId ? [ctx.tenantId] : [...ctx.authorizedTenantIds];
  return { tenantIds, crossTenant: false };
}

/**
 * The where-clause fragment that scopes a graph query.
 *
 * Three cases, and the third is the one that matters:
 *
 *   crossTenant        -> {} , every row including unclassified legacy nodes
 *   has tenants        -> tenant_id IN (...) , and NOT the unclassified rows
 *   no tenants at all  -> tenant_id IS NULL AND tenant_id IS NOT NULL , matches nothing
 *
 * That last clause is deliberately unsatisfiable rather than clever. Returning `{}` for
 * an empty scope would turn every unauthenticated read into a full table scan of the
 * whole ecosystem's memory, which is precisely the failure this module exists to make
 * impossible.
 *
 * Legacy nodes carry a null `tenant_id` because they predate the ecosystem. They are
 * reachable ONLY by a platform superadmin: treating unclassified memory as public would
 * make the boundary meaningless the moment a backfill missed something.
 */
export function graphScopeWhere(scope: IntelligenceScope): Record<string, unknown> {
  if (scope.crossTenant) return {};
  if (scope.tenantIds.length === 0) {
    return { [Op.and]: [{ tenant_id: null }, { tenant_id: { [Op.ne]: null } }] };
  }
  return { tenant_id: { [Op.in]: scope.tenantIds } };
}

/** May this scope read a specific row's tenant? Used for single-node fetches. */
export function scopeAllows(scope: IntelligenceScope, rowTenantId: string | null | undefined): boolean {
  if (scope.crossTenant) return true;
  if (!rowTenantId) return false; // unclassified is superadmin-only
  return scope.tenantIds.includes(rowTenantId);
}

/**
 * Raised when a write would connect two tenants.
 *
 * An edge between a CPN node and an AI Flotation node is not a read leak, it is a
 * structural one: once it exists, any traversal from either side crosses the boundary
 * and no read-time filter can undo it. Cheaper and far safer to refuse the write.
 */
export class CrossTenantEdgeError extends Error {
  public readonly errorClass = 'TenantIsolationViolation';

  constructor(
    public readonly fromTenantId: string | null,
    public readonly toTenantId: string | null,
  ) {
    super(
      `Refusing to relate nodes across tenants (${fromTenantId ?? 'unclassified'} -> ${toTenantId ?? 'unclassified'})`,
    );
    this.name = 'CrossTenantEdgeError';
  }
}

/**
 * Guard for edge creation.
 *
 * Two unclassified nodes may still be related: that is the entire existing graph, and
 * refusing it would break every current write on the first deploy. What is refused is
 * connecting a *classified* node to a node belonging to a *different* tenant.
 */
export function assertSameTenant(
  fromTenantId: string | null | undefined,
  toTenantId: string | null | undefined,
): void {
  const a = fromTenantId ?? null;
  const b = toTenantId ?? null;
  if (a === b) return;
  throw new CrossTenantEdgeError(a, b);
}
