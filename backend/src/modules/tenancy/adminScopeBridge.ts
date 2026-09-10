import { PlatformIdentity, PlatformIdentityLink, TenantMembership } from '../../models';
import { buildRequestContext, emptyContext, PlatformRequestContext } from './tenantAuthorization';
import { IntelligenceScope, scopeFromContext } from './intelligenceScope';

/**
 * Bridge from the legacy admin token to a tenancy scope.
 *
 * THE PROBLEM THIS SOLVES. Admin routes authenticate with `requireAdmin`, which predates
 * the ecosystem and knows nothing about tenants. The tenancy layer wants a
 * `PlatformRequestContext` built from `tenant_memberships`. Right now that table has
 * **zero rows in production**, so deriving scope strictly from it would show every
 * existing admin an empty Memory Graph — breaking a working screen to enforce a boundary
 * that currently separates nothing, since there is exactly one tenant with data.
 *
 * THE RAMP, and why it is safe. Same shape as the sender-profile fallback:
 *
 *   1. admin email -> platform identity -> memberships  ->  scope to those tenants
 *   2. no memberships anywhere in the system yet        ->  cross-tenant, LOGGED
 *   3. memberships exist but this admin has none        ->  DENY
 *
 * Step 2 is deliberately conditioned on the whole table being empty, not on this
 * admin's rows being empty. That makes the ramp **self-closing**: the moment anyone
 * creates the first membership, step 2 stops applying and enforcement begins for
 * everybody. There is no flag to remember to flip and no way to sit in the permissive
 * state by accident.
 *
 * Step 3 is the one that matters. An admin token is not a tenancy grant. Master plan
 * §19.2 is explicit that "admins can see everything" must not be the default, and once
 * the membership system is populated this bridge stops being generous.
 */

/** True while `tenant_memberships` is completely empty — the pre-migration state. */
async function membershipSystemIsUnpopulated(): Promise<boolean> {
  try {
    return (await TenantMembership.count()) === 0;
  } catch {
    // If we cannot tell, assume it IS populated and fall through to strict scoping.
    // Guessing "unpopulated" on an error would hand out cross-tenant reads whenever the
    // database hiccupped, which is the wrong way to be wrong.
    return false;
  }
}

/** Resolve the platform identity behind an admin token, if one has been linked. */
async function identityForAdmin(admin: {
  id?: string;
  email?: string;
}): Promise<PlatformIdentity | null> {
  try {
    if (admin.id) {
      const link = await PlatformIdentityLink.findOne({
        where: { link_type: 'admin_user', linked_entity_id: String(admin.id) },
      });
      if (link) return await PlatformIdentity.findByPk(link.platform_identity_id);
    }
    if (admin.email) {
      return await PlatformIdentity.findOne({
        where: { primary_email: admin.email.trim().toLowerCase() },
      });
    }
  } catch {
    return null;
  }
  return null;
}

function logLegacyAdminScope(admin: { email?: string }): void {
  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'tenancy',
      event: 'legacy_admin_cross_tenant_scope',
      outcome: 'partial',
      context: {
        actor: admin.email ?? null,
        reason: 'tenant_memberships is empty; granting cross-tenant read during migration',
        closes_when: 'the first tenant_membership row is created',
      },
    }),
  );
}

/**
 * Build the tenancy request context for a legacy admin request.
 *
 * Returns an empty context for an unauthenticated caller, which scopes to nothing.
 */
export async function contextFromAdminRequest(
  admin: { id?: string; email?: string; role?: string } | undefined,
): Promise<PlatformRequestContext> {
  if (!admin) return emptyContext();

  const identity = await identityForAdmin(admin);
  if (!identity) return { ...emptyContext(), platformIdentityId: null };

  return buildRequestContext({ platformIdentityId: identity.id });
}

/**
 * The tenant scope for a brand-administration request.
 *
 * WHY THIS EXISTS RATHER THAN CALLING `tenantScopeWhere` DIRECTLY. Brand admin cannot build
 * its scope straight from `contextFromAdminRequest`, because that resolves memberships and
 * `tenant_memberships` currently has zero rows — so `tenantScopeWhere` would return
 * `{ tenant_id: null }`, which matches nothing, and every admin would open the brand page to an
 * empty list. That is the correct STRICT answer and the wrong answer for today.
 *
 * So this rides the exact ramp `intelligenceScopeForAdmin` already established, rather than
 * inventing a second one. Same three steps, same self-closing property, same warning log:
 *
 *   1. this admin has memberships                  -> scope to those tenants
 *   2. NOBODY has memberships (table is empty)     -> open, and LOGGED
 *   3. memberships exist, this admin has none      -> DENIED, matches nothing
 *
 * Step 2 keys on the WHOLE TABLE being empty, not on this admin's rows. That is what makes it
 * close by itself: the first membership row anyone creates ends the open state for everybody
 * at once, with no flag to remember and no way to linger in the permissive mode by accident.
 *
 * The result is a discriminated union rather than a where-clause on purpose. A bare `{}` means
 * "no filter" to Sequelize, and returning that for the DENIED case — a single wrong branch —
 * would turn a lockout into an unscoped `findAll()` across every tenant. Making the three cases
 * distinct values forces each caller to say what it does with each one, and lets the tests
 * assert on the decision instead of on a fragment that has to be interpreted.
 */
export type AdminTenantScope =
  /** Restricted to these tenants. Never empty — an empty list would be DENIED. */
  | { mode: 'scoped'; tenantIds: string[] }
  /** Cross-tenant, only because the membership system is not populated yet. Logged. */
  | { mode: 'migration_open' }
  /** Memberships exist and this admin has none. An admin token is not a tenancy grant. */
  | { mode: 'denied' };

export async function adminTenantScope(
  admin: { id?: string; email?: string; role?: string } | undefined,
): Promise<AdminTenantScope> {
  if (!admin) return { mode: 'denied' };

  const ctx = await contextFromAdminRequest(admin);

  // A genuine platform superadmin is cross-tenant by right, not by ramp.
  if (ctx.isPlatformSuperAdmin) return { mode: 'migration_open' };

  const tenantIds = ctx.tenantId ? [ctx.tenantId] : ctx.authorizedTenantIds;
  if (tenantIds.length > 0) return { mode: 'scoped', tenantIds };

  if (await membershipSystemIsUnpopulated()) {
    logLegacyAdminScope(admin);
    return { mode: 'migration_open' };
  }

  return { mode: 'denied' };
}

/**
 * May this scope reach a row owned by `resourceTenantId`?
 *
 * Callers turn `false` into a **404, never a 403**. A 403 confirms the row exists, which turns
 * ID enumeration into a way to inventory another tenant's brands. `requireBrandAccess` in
 * tenantAuthorization takes the same position for the same reason.
 */
export function scopeAllows(scope: AdminTenantScope, resourceTenantId: string | null | undefined): boolean {
  if (scope.mode === 'denied') return false;
  if (scope.mode === 'migration_open') return true;
  // A row with no tenant is NOT visible to a scoped operator. Treating unclassified rows as
  // everyone's would defeat the isolation the moment a backfill left one behind.
  if (!resourceTenantId) return false;
  return scope.tenantIds.includes(resourceTenantId);
}

/**
 * The Memory Graph scope for a legacy admin request.
 *
 * This is what intelligence routes call. It applies the ramp described above.
 */
export async function intelligenceScopeForAdmin(
  admin: { id?: string; email?: string; role?: string } | undefined,
): Promise<IntelligenceScope> {
  if (!admin) return { tenantIds: [], crossTenant: false };

  const ctx = await contextFromAdminRequest(admin);
  const scope = scopeFromContext(ctx);

  // A real membership, or genuine superadmin: use it.
  if (scope.crossTenant || scope.tenantIds.length > 0) return scope;

  // No membership. Only be generous while the system has none at all.
  if (await membershipSystemIsUnpopulated()) {
    logLegacyAdminScope(admin);
    return { tenantIds: [], crossTenant: true };
  }

  // Memberships exist and this admin has none. An admin token is not a tenancy grant.
  return { tenantIds: [], crossTenant: false };
}
