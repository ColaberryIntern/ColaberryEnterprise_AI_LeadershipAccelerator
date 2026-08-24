/**
 * Delivery authorization — the gate for project-scoped actions.
 *
 * THE ORDER IS THE SECURITY PROPERTY. Tenant first, delivery second:
 *
 *   allow(identity, action, project) =
 *         tenantGuard(identity, project.tenant_id, project.brand_id)   // fail closed, audited
 *     AND deliveryGuard(identity, action, project.id)                  // fail closed
 *
 * Checking tenant first means a caller from another tenant is denied — and audited to
 * `tenant_access_audits` — **before** this layer reveals whether the project exists.
 * Reversing it would let a foreign caller distinguish "no such project" from "not a
 * member", which is enumeration, and master plan §8 scenario F requires denial *without*
 * it.
 *
 * `platform.cross_tenant` grants nothing here. A platform superadmin can see that a
 * project exists; approving a client's design decision on their behalf is a different act
 * and is not implied by being an operator. That is enforced by this module simply never
 * consulting the tenant context's superadmin flag when deciding delivery permissions.
 *
 * Fail closed everywhere: unknown role, unknown permission, unknown action, unresolved
 * membership, or an unreadable membership table all deny.
 */

import DeliveryProject from '../../models/DeliveryProject';
import DeliveryProjectMember from '../../models/DeliveryProjectMember';
import {
  deliveryPermissionsFor,
  isClientOnly,
  isKnownDeliveryRole,
  rolesHaveDeliveryPermission,
  type DeliveryPermission,
} from './deliveryRoles';
import {
  declarationFor,
  deliveryRiskIndex,
  riskWithinCeiling,
  type DeliveryRiskLevel,
} from './deliveryRiskLevels';

export interface DeliveryProjectContext {
  platformIdentityId: string | null;
  deliveryProjectId: string | null;
  /** The tenant that owns the project, resolved from the project row itself. */
  projectTenantId: string | null;
  /** Active delivery roles this identity holds on this project. */
  roles: string[];
  /** True when every role held is client-side, so the client projection is the safe answer. */
  isClientOnly: boolean;
}

/** A context with no access at all. The safe default for an unresolved caller. */
export function emptyDeliveryContext(): DeliveryProjectContext {
  return {
    platformIdentityId: null,
    deliveryProjectId: null,
    projectTenantId: null,
    roles: [],
    isClientOnly: false,
  };
}

/** Structured, non-fatal log. A membership read that fails must be visible, never silent. */
function logResolutionFailure(event: string, context: Record<string, unknown>, err: unknown): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event,
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { ...context, message: err instanceof Error ? err.message : String(err) },
    }),
  );
}

/**
 * Build the delivery context for an identity on one project.
 *
 * Reads the project to learn its tenant — the caller must still run the tenant guard with
 * that value. This function deliberately does NOT call the tenant guard itself: doing so
 * would hide the ordering inside a helper, and the ordering is the security property.
 */
export async function buildDeliveryContext(input: {
  platformIdentityId: string | null;
  deliveryProjectId: string | null;
}): Promise<DeliveryProjectContext> {
  if (!input.platformIdentityId || !input.deliveryProjectId) return emptyDeliveryContext();

  let project: DeliveryProject | null = null;
  try {
    project = await DeliveryProject.findByPk(input.deliveryProjectId);
  } catch (err) {
    // Fail closed. If the project cannot be read, nothing is proven about access.
    logResolutionFailure(
      'delivery_project_lookup_failed',
      { delivery_project_id: input.deliveryProjectId },
      err,
    );
    return emptyDeliveryContext();
  }

  if (!project || project.archived_at) return emptyDeliveryContext();

  let memberships: DeliveryProjectMember[] = [];
  try {
    memberships = await DeliveryProjectMember.findAll({
      where: {
        delivery_project_id: input.deliveryProjectId,
        platform_identity_id: input.platformIdentityId,
        status: 'active',
      },
    });
  } catch (err) {
    logResolutionFailure(
      'delivery_membership_lookup_failed',
      { delivery_project_id: input.deliveryProjectId },
      err,
    );
    return { ...emptyDeliveryContext(), platformIdentityId: input.platformIdentityId };
  }

  // Unknown roles are dropped here rather than carried and ignored later. A role the
  // registry does not recognise grants nothing, and keeping it in the context would make
  // `roles` misleading in logs and in the client-only determination below.
  const roles = memberships.map((m) => m.delivery_role).filter(isKnownDeliveryRole);

  return {
    platformIdentityId: input.platformIdentityId,
    deliveryProjectId: input.deliveryProjectId,
    projectTenantId: project.tenant_id,
    roles,
    isClientOnly: isClientOnly(roles),
  };
}

export function hasDeliveryPermission(
  ctx: DeliveryProjectContext,
  permission: DeliveryPermission,
): boolean {
  if (!ctx.platformIdentityId || !ctx.deliveryProjectId) return false;
  return rolesHaveDeliveryPermission(ctx.roles, permission);
}

export function deliveryContextPermissions(ctx: DeliveryProjectContext): DeliveryPermission[] {
  return deliveryPermissionsFor(ctx.roles);
}

/** Thrown by the guards. Carries the status the route should return. */
export class DeliveryAccessError extends Error {
  readonly status: number;
  readonly reason: string;

  constructor(reason: string, status = 403) {
    super(`delivery access denied: ${reason}`);
    this.name = 'DeliveryAccessError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * Require a permission. Throws `DeliveryAccessError` when absent.
 *
 * Status is 404, not 403, when the caller has no membership at all. A 403 confirms the
 * project exists; a non-member has not earned that fact. A member who merely lacks one
 * permission already knows the project exists, so 403 is correct for them and is more
 * useful.
 */
export function requireDeliveryPermission(
  ctx: DeliveryProjectContext,
  permission: DeliveryPermission,
): void {
  if (!ctx.platformIdentityId) throw new DeliveryAccessError('unauthenticated', 401);
  if (ctx.roles.length === 0) throw new DeliveryAccessError('not_a_project_member', 404);
  if (!hasDeliveryPermission(ctx, permission)) {
    throw new DeliveryAccessError(`missing_permission:${permission}`, 403);
  }
}

export interface ActionAuthorization {
  allowed: boolean;
  risk: DeliveryRiskLevel;
  requiredPermission: DeliveryPermission;
  /** True when a second party must approve before this action may proceed. */
  requiresApproval: boolean;
  reason: string;
}

/**
 * Authorize one consequential action, returning a decision rather than throwing.
 *
 * Used by the execution plane, where a denial is a run state (`waiting_for_human`) rather
 * than an HTTP error. Applies identically to humans and AI workers — master plan §Gate 2:
 * "This policy applies to both humans and AI workers."
 *
 * `riskCeiling` is the actor's Builder Authority Profile cap. An action above it is not
 * refused outright — it becomes a review requirement, which is what lets an intern drive
 * work they cannot unilaterally land.
 */
export function authorizeAction(
  ctx: DeliveryProjectContext,
  action: string,
  options: { riskCeiling?: string | null } = {},
): ActionAuthorization {
  const decl = declarationFor(action);
  const base = {
    risk: decl.risk,
    requiredPermission: decl.requiredPermission,
  };

  if (!ctx.platformIdentityId) {
    return { ...base, allowed: false, requiresApproval: false, reason: 'unauthenticated' };
  }
  if (ctx.roles.length === 0) {
    return { ...base, allowed: false, requiresApproval: false, reason: 'not_a_project_member' };
  }
  if (!hasDeliveryPermission(ctx, decl.requiredPermission)) {
    return {
      ...base,
      allowed: false,
      requiresApproval: false,
      reason: `missing_permission:${decl.requiredPermission}`,
    };
  }

  // Above the actor's authority ceiling: permitted, but only with a second party.
  if (options.riskCeiling !== undefined && !riskWithinCeiling(decl.risk, options.riskCeiling)) {
    return { ...base, allowed: true, requiresApproval: true, reason: 'above_authority_ceiling' };
  }

  // R4 and R5 always need a human second party regardless of who is asking. Master plan
  // §Gate 2 lists production release and destructive actions as requiring an approver,
  // and no single identity should be able to ship to production alone.
  if (deliveryRiskIndex(decl.risk) >= deliveryRiskIndex('R4')) {
    return { ...base, allowed: true, requiresApproval: true, reason: 'high_risk_action' };
  }

  return { ...base, allowed: true, requiresApproval: false, reason: 'granted' };
}

/**
 * The combined check. Callers pass the result of their tenant guard so the ordering stays
 * explicit at the call site rather than hidden here.
 *
 * `tenantAllowed` must be the outcome of `modules/tenancy`'s audited guard against
 * `ctx.projectTenantId`. When it is false this returns 404, never 403 — a caller from
 * another tenant must not learn the project exists.
 */
export function requireTenantThenDelivery(
  ctx: DeliveryProjectContext,
  tenantAllowed: boolean,
  permission: DeliveryPermission,
): void {
  if (!tenantAllowed) throw new DeliveryAccessError('cross_tenant_denied', 404);
  requireDeliveryPermission(ctx, permission);
}
