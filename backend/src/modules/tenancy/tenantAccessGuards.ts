import { recordAccessDecision } from './tenantAccessAudit';
import {
  PlatformRequestContext,
  TenantAccessError,
  canAccessTenant,
  hasPermission,
  requireBrandAccess,
  requirePermission,
  requirePlatformSuperAdmin,
  requireTenantAccess,
} from './tenantAuthorization';
import type { TenantPermission } from './tenantRoles';

/**
 * Audited tenant guards — enforcement plus evidence, in one call.
 *
 * The plain guards in `tenantAuthorization.ts` stay pure and synchronous: they are the
 * enforcement primitive and are used wherever an audit row would be noise (inner loops,
 * list filtering, repeated checks within one request). These wrap them for the route
 * boundaries that CPN's grant and donor commitments require evidence for (DEC-05).
 *
 * ORDERING MATTERS AND IS DELIBERATE: **the audit row is written before the error is
 * thrown.** A denial that throws first and logs second loses the record the moment
 * anything upstream swallows the exception, and the denials are the entire point of
 * the trail. Write, then throw.
 *
 * The audit can never change the outcome. `recordAccessDecision` resolves even when the
 * write fails, so an unreachable audit table degrades to "enforced but unevidenced",
 * loudly logged, and never to "allowed because bookkeeping broke".
 *
 * This module depends on both the audit and the guards; nothing depends on it. That is
 * what keeps the dependency graph acyclic.
 */

export interface AuditedAccessOptions {
  resourceType: string;
  action: string;
  resourceId?: string | null;
  resourceBrandId?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Reach a specific row, with the decision recorded either way.
 *
 * Throws 404 for a foreign tenant, exactly as the unaudited guard does, so switching a
 * route onto this changes what is recorded and nothing about what callers observe.
 */
export async function requireTenantAccessAudited(
  ctx: PlatformRequestContext,
  resourceTenantId: string | null | undefined,
  options: AuditedAccessOptions,
): Promise<void> {
  const allowed = canAccessTenant(ctx, resourceTenantId);

  await recordAccessDecision({
    ctx,
    resourceType: options.resourceType,
    action: options.action,
    resourceId: options.resourceId,
    resourceTenantId: resourceTenantId ?? null,
    resourceBrandId: options.resourceBrandId,
    decision: allowed ? 'allowed' : 'denied',
    reason: allowed ? 'granted' : 'TenantIsolationViolation',
    correlationId: options.correlationId,
    ipAddress: options.ipAddress,
    actorEmail: options.actorEmail,
    metadata: options.metadata,
  });

  // Re-runs the pure guard rather than throwing from the boolean above, so there is
  // exactly one place that decides what a denial looks like.
  requireTenantAccess(ctx, resourceTenantId);
}

/** Permission check within the current tenant scope, recorded either way. */
export async function requirePermissionAudited(
  ctx: PlatformRequestContext,
  permission: TenantPermission,
  options: AuditedAccessOptions,
): Promise<void> {
  const allowed = hasPermission(ctx, permission);

  await recordAccessDecision({
    ctx,
    resourceType: options.resourceType,
    action: options.action,
    resourceId: options.resourceId,
    resourceTenantId: ctx.tenantId,
    resourceBrandId: options.resourceBrandId,
    decision: allowed ? 'allowed' : 'denied',
    reason: allowed ? 'granted' : 'AuthorizationError',
    permission,
    correlationId: options.correlationId,
    ipAddress: options.ipAddress,
    actorEmail: options.actorEmail,
    metadata: options.metadata,
  });

  requirePermission(ctx, permission);
}

/**
 * Brand-scoped access, recorded either way.
 *
 * The pure guard distinguishes a foreign tenant (404) from a brand outside the caller's
 * scope inside their own tenant (403). The recorded reason preserves that distinction,
 * because they are different findings in a review: one is an isolation event, the other
 * is an ordinary permissions gap.
 */
export async function requireBrandAccessAudited(
  ctx: PlatformRequestContext,
  resourceTenantId: string | null | undefined,
  resourceBrandId: string | null | undefined,
  options: AuditedAccessOptions,
): Promise<void> {
  let reason = 'granted';
  let allowed = true;
  try {
    requireBrandAccess(ctx, resourceTenantId, resourceBrandId);
  } catch (err) {
    allowed = false;
    reason = err instanceof TenantAccessError ? err.errorClass : 'AuthorizationError';
  }

  await recordAccessDecision({
    ctx,
    resourceType: options.resourceType,
    action: options.action,
    resourceId: options.resourceId,
    resourceTenantId: resourceTenantId ?? null,
    resourceBrandId: resourceBrandId ?? options.resourceBrandId ?? null,
    decision: allowed ? 'allowed' : 'denied',
    reason,
    correlationId: options.correlationId,
    ipAddress: options.ipAddress,
    actorEmail: options.actorEmail,
    metadata: options.metadata,
  });

  requireBrandAccess(ctx, resourceTenantId, resourceBrandId);
}

/**
 * Ecosystem-wide operations, recorded either way.
 *
 * Cross-tenant reads by a platform superadmin are legitimate and also the single most
 * sensitive thing anyone can do here, so they are recorded on the ALLOWED path too. A
 * trail that only captured refusals could not answer "who looked across tenants, and
 * when", which is the other half of what a funder wants to know.
 */
export async function requirePlatformSuperAdminAudited(
  ctx: PlatformRequestContext,
  options: AuditedAccessOptions,
): Promise<void> {
  const allowed = ctx.isPlatformSuperAdmin;

  await recordAccessDecision({
    ctx,
    resourceType: options.resourceType,
    action: options.action,
    resourceId: options.resourceId,
    resourceTenantId: null,
    decision: allowed ? 'allowed' : 'denied',
    reason: allowed ? 'granted:cross_tenant' : 'AuthorizationError',
    permission: 'platform.cross_tenant',
    correlationId: options.correlationId,
    ipAddress: options.ipAddress,
    actorEmail: options.actorEmail,
    metadata: options.metadata,
  });

  requirePlatformSuperAdmin(ctx);
}
