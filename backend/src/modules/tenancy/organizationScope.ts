import { IntelligenceScope, graphScopeWhere } from './intelligenceScope';

/**
 * Tenant scoping for organizations (business accounts).
 *
 * WHY: `adminOrgService.listOrganizations` was an unfiltered `Organization.findAndCountAll`
 * over every row, and `getOrganizationDetail` fetched any org by id. With one tenant that
 * is correct. With CPN and AI Flotation in the same table it is the same leak class as the
 * Memory Graph before it was scoped: a CPN operator listing accounts would receive
 * Colaberry Enterprise's client companies, their owner emails and their headcounts.
 *
 * Master plan §19.2 is explicit that "admins can see everything" must not be the default.
 * This module expresses the organization half of that rule once, so no query invents its
 * own version of it.
 *
 * THE SCOPE TYPE IS SHARED ON PURPOSE. It is the same `IntelligenceScope` the graph uses,
 * and `orgScopeWhere` delegates to the same clause builder, so a reader can never see more
 * in the account list than they can see in the memory graph or the CRM. Three surfaces
 * disagreeing about who may read what is how a boundary rots.
 *
 * ONE DIFFERENCE FROM THE GRAPH, and it matters. Graph nodes carry a null `tenant_id` when
 * they predate the ecosystem, and there are 227 such rows deliberately visible only to a
 * platform superadmin. Organizations have no such legacy population: the backfill
 * classified all of them (verified in production — 6 of 6 classified, 0 unclassified). So
 * an organization with a null `tenant_id` is not legacy, it is an anomaly — a row that got
 * past the backfill or was created without context. It is treated exactly the same way
 * regardless: reachable only by a platform superadmin, never folded into a tenant's list.
 * The safe reading of "I do not know who owns this" is never "show it to everyone".
 */

/**
 * The where-clause fragment that scopes an organization query.
 *
 *   crossTenant       -> {} , every row, including any unclassified anomaly
 *   has tenants       -> tenant_id IN (...)
 *   no tenants at all -> a deliberately unsatisfiable clause, matching nothing
 *
 * The third case is the one that must never be `{}`. An empty scope means "this caller is
 * authorized for no tenant", and answering that with an unfiltered query would hand the
 * whole ecosystem's client list to an unauthenticated read.
 */
export function orgScopeWhere(scope: IntelligenceScope): Record<string, unknown> {
  return graphScopeWhere(scope);
}

/**
 * Whether a single already-loaded organization is readable under this scope.
 *
 * For a by-id fetch, prefer folding `orgScopeWhere` into the query so the database never
 * returns the row at all. Use this only where the row is already in hand — and then return
 * **404, not 403**: 403 on an org that exists in another tenant confirms that it exists,
 * which turns a list endpoint into an id-enumeration oracle. Same rule as
 * `requireTenantAccess`.
 */
export function orgReadable(
  scope: IntelligenceScope,
  org: { tenant_id?: string | null } | null,
): boolean {
  if (!org) return false;
  if (scope.crossTenant) return true;
  if (!org.tenant_id) return false; // unclassified: superadmin only, see the note above
  return scope.tenantIds.includes(org.tenant_id);
}
