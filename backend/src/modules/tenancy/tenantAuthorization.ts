import { TenantMembership } from '../../models';
import {
  TenantPermission,
  isPlatformSuperAdminRole,
  permissionsFor,
  rolesHavePermission,
} from './tenantRoles';

/**
 * Tenant authorization — fail-closed, unlike resolution which is fail-soft.
 *
 * The distinction is the most important invariant in this project: an unresolved brand
 * on a tracking event records null context and moves on, but an unresolved authorization
 * on an admin read DENIES. A resolver outage must never become an open door.
 *
 * Nothing here trusts an admin token by itself. Access to a tenant comes from an active
 * `tenant_memberships` row, and cross-tenant visibility comes from the explicit
 * `platform.cross_tenant` permission, never from "is an admin".
 */

export interface PlatformRequestContext {
  platformIdentityId: string | null;
  /** The tenant this request is operating in. Null when none was selected/resolved. */
  tenantId: string | null;
  brandId: string | null;
  organizationId: string | null;
  roles: string[];
  isPlatformSuperAdmin: boolean;
  /** Every tenant the identity has an active membership in. Used to scope list queries. */
  authorizedTenantIds: string[];
  /**
   * The brands the identity's memberships confine it to, or `null` when it is not
   * brand-restricted at all — a platform superadmin, or a membership whose `brand_id`
   * is null (which means "every brand in this tenant", see TenantMembership).
   *
   * This is what closes G2. Before it existed, a brand-restricted operator who did not
   * ASK to be confined to their brand read their whole tenant: `brandId` was only ever
   * set from a request, and null meant "unscoped". Now the restriction is carried
   * whether or not the caller named a brand, and `requireBrandAccess` and
   * `tenantScopeWhere` both consult it. Never an empty array: a restricted membership
   * always names a brand, and an identity with no memberships is closed by tenant scope.
   */
  authorizedBrandIds: string[] | null;
}

/** A context with no access at all. The safe default for an unauthenticated request. */
export function emptyContext(): PlatformRequestContext {
  return {
    platformIdentityId: null,
    tenantId: null,
    brandId: null,
    organizationId: null,
    roles: [],
    isPlatformSuperAdmin: false,
    authorizedTenantIds: [],
    authorizedBrandIds: null,
  };
}

/**
 * Build the request context for an identity, optionally scoped to a requested tenant.
 *
 * `requestedTenantId` is what the caller asked to operate in — a header, a query param,
 * or an admin context switcher. It is validated against real memberships here; a caller
 * naming a tenant they have no membership in gets a context with `tenantId: null`, and
 * the guards below then deny. The requested value is never trusted on its own.
 *
 * `requestedBrandId` is different: a caller naming a brand their memberships do not
 * cover gets a THROWN `TenantAccessError` (403), not a null. Null `brandId` means
 * "not narrowed to one brand", and handing that back for a refused request would let a
 * brand-scoped operator widen their read to the whole tenant by typing the wrong id.
 * Nothing passed a brand before the growth-journey routes did, so the throw reaches no
 * older caller; those routes already map the error to a 403 response.
 */
export async function buildRequestContext(input: {
  platformIdentityId: string | null;
  requestedTenantId?: string | null;
  requestedBrandId?: string | null;
  organizationId?: string | null;
}): Promise<PlatformRequestContext> {
  if (!input.platformIdentityId) return emptyContext();

  let memberships: TenantMembership[] = [];
  try {
    memberships = await TenantMembership.findAll({
      where: { platform_identity_id: input.platformIdentityId, status: 'active' },
    });
  } catch {
    // Fail closed. If memberships cannot be read, the identity has no proven access.
    return { ...emptyContext(), platformIdentityId: input.platformIdentityId };
  }

  const authorizedTenantIds = [...new Set(memberships.map((m) => m.tenant_id))];
  const allRoles = memberships.map((m) => m.role);
  const isSuper = isPlatformSuperAdminRole(allRoles);

  // A superadmin may operate in any tenant; everyone else only in one they belong to.
  let tenantId: string | null = null;
  if (input.requestedTenantId) {
    if (isSuper || authorizedTenantIds.includes(input.requestedTenantId)) {
      tenantId = input.requestedTenantId;
    }
  } else if (authorizedTenantIds.length === 1) {
    // Single-tenant operators do not need to choose. Multi-tenant operators must,
    // because silently defaulting would make it possible to act on the wrong tenant
    // without noticing.
    tenantId = authorizedTenantIds[0];
  }

  // Roles that apply to the tenant actually being operated in — not the union across
  // every tenant. A brand_marketer in CPN must not inherit tenant_admin from Colaberry.
  const scopedRoles = tenantId
    ? memberships.filter((m) => m.tenant_id === tenantId).map((m) => m.role)
    : [];
  const roles = isSuper ? [...new Set([...scopedRoles, ...allRoles])] : scopedRoles;

  // The memberships that decide brand restriction: those in the tenant being operated
  // in, or — when no single tenant was resolved — all of them. Brand ids are UUIDs and
  // globally unique, so a union across tenants is still strictly narrower than "any".
  const relevant = tenantId ? memberships.filter((m) => m.tenant_id === tenantId) : memberships;
  const authorizedBrandIds = authorizedBrandsOf(relevant, isSuper);

  let brandId: string | null = null;
  if (input.requestedBrandId) {
    // A request is honoured only inside a resolved tenant (a brand cannot be granted
    // without one) and only when the memberships there cover it. Anything else is a
    // refusal, and a refusal is thrown — see the doc comment above for why not null.
    const permitted =
      Boolean(tenantId) &&
      (authorizedBrandIds === null || authorizedBrandIds.includes(input.requestedBrandId));
    if (!permitted) {
      throw new TenantAccessError('Brand not in scope', 403, 'AuthorizationError');
    }
    brandId = input.requestedBrandId;
  } else if (authorizedBrandIds !== null && authorizedBrandIds.length === 1) {
    // Auto-confine. A single-brand operator who did not name their brand is narrowed
    // to it anyway; they have nothing else to choose. Two or more restricted brands
    // stay un-narrowed here and are still bounded by `authorizedBrandIds` in the guards.
    brandId = authorizedBrandIds[0];
  }

  return {
    platformIdentityId: input.platformIdentityId,
    tenantId,
    brandId,
    organizationId: input.organizationId ?? null,
    roles,
    isPlatformSuperAdmin: isSuper,
    authorizedTenantIds,
    authorizedBrandIds,
  };
}

/**
 * `null` when any relevant membership spans every brand (brand_id null) or the identity
 * is a superadmin; otherwise the distinct brands named by the memberships. An identity
 * with no relevant memberships is not brand-restricted either — it has no tenant to be
 * restricted within, and tenant scope already closes it.
 */
function authorizedBrandsOf(
  relevant: Array<{ brand_id: string | null }>,
  isSuper: boolean,
): string[] | null {
  if (isSuper || relevant.length === 0) return null;
  if (relevant.some((m) => m.brand_id === null)) return null;
  return [...new Set(relevant.map((m) => m.brand_id as string))];
}

/** Does the context carry this permission in its current tenant scope? */
export function hasPermission(ctx: PlatformRequestContext, permission: TenantPermission): boolean {
  if (ctx.isPlatformSuperAdmin) return true;
  if (!ctx.tenantId) return false;
  return rolesHavePermission(ctx.roles, permission);
}

/** Every permission the context currently carries. For UI capability hints. */
export function contextPermissions(ctx: PlatformRequestContext): TenantPermission[] {
  return permissionsFor(ctx.roles);
}

/**
 * May this context touch a row owned by `resourceTenantId`?
 *
 * A row with no tenant (legacy, pre-backfill) is visible only to the platform
 * superadmin. Treating unclassified data as "everyone's" would defeat the isolation the
 * moment a backfill left something behind.
 */
export function canAccessTenant(
  ctx: PlatformRequestContext,
  resourceTenantId: string | null | undefined,
): boolean {
  if (ctx.isPlatformSuperAdmin) return true;
  if (!resourceTenantId) return false;
  return ctx.authorizedTenantIds.includes(resourceTenantId);
}

/**
 * The where-clause fragment that scopes a list query.
 *
 * Returns `{}` for a superadmin (all rows), `{ tenant_id: [...] }` for a normal
 * operator, and `{ tenant_id: null }` — which matches nothing real — for a context with
 * no memberships. That last case matters: returning `{}` there would turn an
 * unauthenticated request into an unscoped `findAll()`, which is exactly the failure
 * mode master plan §18 warns about.
 */
export function tenantScopeWhere(ctx: PlatformRequestContext): Record<string, unknown> {
  if (ctx.isPlatformSuperAdmin) return {};
  // A brand-restricted operator's list is narrowed to their brands whether or not they
  // asked for one (G2). Byte-identical to before for anyone not brand-restricted.
  const brand = ctx.authorizedBrandIds !== null ? { brand_id: ctx.authorizedBrandIds } : {};
  if (ctx.tenantId) return { tenant_id: ctx.tenantId, ...brand };
  if (ctx.authorizedTenantIds.length > 0) return { tenant_id: ctx.authorizedTenantIds, ...brand };
  return { tenant_id: null };
}

/** Thrown by the guards. Carries the status the route should return. */
export class TenantAccessError extends Error {
  public readonly status: number;
  public readonly errorClass: string;

  constructor(message: string, status: number, errorClass: string) {
    super(message);
    this.name = 'TenantAccessError';
    this.status = status;
    this.errorClass = errorClass;
  }
}

/**
 * Guard for reaching a specific row.
 *
 * Throws 404, not 403, when the row belongs to another tenant. A 403 would confirm the
 * row exists, which turns ID enumeration into a discovery tool for a competitor's
 * campaign inventory. 403 is reserved for a caller explicitly requesting a tenant scope
 * they have no membership in — there, the tenant's existence is not the secret.
 */
export function requireTenantAccess(
  ctx: PlatformRequestContext,
  resourceTenantId: string | null | undefined,
): void {
  if (!canAccessTenant(ctx, resourceTenantId)) {
    throw new TenantAccessError('Not found', 404, 'TenantIsolationViolation');
  }
}

/** Guard for a permission within the current tenant scope. */
export function requirePermission(
  ctx: PlatformRequestContext,
  permission: TenantPermission,
): void {
  if (!hasPermission(ctx, permission)) {
    throw new TenantAccessError(`Missing permission: ${permission}`, 403, 'AuthorizationError');
  }
}

/** Guard for ecosystem-wide operations. */
export function requirePlatformSuperAdmin(ctx: PlatformRequestContext): void {
  if (!ctx.isPlatformSuperAdmin) {
    throw new TenantAccessError('Platform administration required', 403, 'AuthorizationError');
  }
}

/**
 * Guard for a brand-scoped operation. A brand belonging to another tenant is a 404 for
 * the same reason as `requireTenantAccess`; a brand inside the caller's tenant that
 * their membership does not cover is a 403.
 *
 * Two checks, both needed. `brandId` is the one brand the request narrowed to (asked
 * for, or auto-confined). `authorizedBrandIds` is the set the memberships allow, and it
 * applies even when nothing was narrowed — a two-brand operator with `brandId` null is
 * still refused a third brand. A row with NO brand is refused to a brand-restricted
 * caller for the reason `canAccessTenant` refuses a row with no tenant: unclassified
 * data is not everyone's.
 */
export function requireBrandAccess(
  ctx: PlatformRequestContext,
  resourceTenantId: string | null | undefined,
  resourceBrandId: string | null | undefined,
): void {
  requireTenantAccess(ctx, resourceTenantId);
  if (ctx.isPlatformSuperAdmin) return;
  if (ctx.brandId && resourceBrandId && ctx.brandId !== resourceBrandId) {
    throw new TenantAccessError('Brand not in scope', 403, 'AuthorizationError');
  }
  if (
    ctx.authorizedBrandIds !== null &&
    (!resourceBrandId || !ctx.authorizedBrandIds.includes(resourceBrandId))
  ) {
    throw new TenantAccessError('Brand not in scope', 403, 'AuthorizationError');
  }
}
