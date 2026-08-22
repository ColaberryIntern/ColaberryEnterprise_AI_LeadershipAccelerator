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
  };
}

/**
 * Build the request context for an identity, optionally scoped to a requested tenant.
 *
 * `requestedTenantId` is what the caller asked to operate in — a header, a query param,
 * or an admin context switcher. It is validated against real memberships here; a caller
 * naming a tenant they have no membership in gets a context with `tenantId: null`, and
 * the guards below then deny. The requested value is never trusted on its own.
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

  let brandId: string | null = null;
  if (input.requestedBrandId && tenantId) {
    // A membership with brand_id null spans every brand in its tenant.
    const brandScoped = memberships.filter((m) => m.tenant_id === tenantId);
    const permitted =
      isSuper ||
      brandScoped.some((m) => m.brand_id === null || m.brand_id === input.requestedBrandId);
    if (permitted) brandId = input.requestedBrandId;
  }

  return {
    platformIdentityId: input.platformIdentityId,
    tenantId,
    brandId,
    organizationId: input.organizationId ?? null,
    roles,
    isPlatformSuperAdmin: isSuper,
    authorizedTenantIds,
  };
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
  if (ctx.tenantId) return { tenant_id: ctx.tenantId };
  if (ctx.authorizedTenantIds.length > 0) return { tenant_id: ctx.authorizedTenantIds };
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
}
