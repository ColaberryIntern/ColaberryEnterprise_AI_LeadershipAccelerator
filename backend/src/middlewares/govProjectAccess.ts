import { Request, Response, NextFunction } from 'express';
import { normalizeEmail } from '../modules/identity/platformIdentityService';
import PlatformIdentity from '../models/PlatformIdentity';
import {
  buildDeliveryContext,
  requireDeliveryPermission,
  type DeliveryProjectContext,
} from '../modules/delivery/deliveryAuthorization';
import type { DeliveryPermission } from '../modules/delivery/deliveryRoles';
import { buildRequestContext } from '../modules/tenancy/tenantAuthorization';
import { requireTenantAccessAudited } from '../modules/tenancy/tenantAccessGuards';
import { logAuthFailure, describeCaller } from './authFailureLog';

/**
 * govProjectAccess — the project-scoped guard for a GOVERNMENT delivery project.
 *
 * This is the piece the spec's "assigned-only access" needs and that did not exist: the delivery
 * authorization engine (`modules/delivery/deliveryAuthorization`) was fully built and tested but wired to
 * ZERO routes, and `govQualificationRoutes` is gated only by `requireSection('program')` — a role check that
 * would hand an intern the entire Program surface. This guard bridges the tested engine to a route for an
 * INTERNAL actor (an operator OR an assigned student), WITHOUT broadening any section role.
 *
 * ## Composition is the security property (same order the engine documents)
 *   resolve actor -> build delivery context -> TENANT guard FIRST (audited) -> DELIVERY permission SECOND
 * Checking tenant first means a caller from another tenant is denied — and recorded to the tenant-isolation
 * audit — BEFORE this layer reveals whether the project exists. A non-member gets 404 (not 403): 403 confirms
 * the project exists, which a non-member has not earned. Fail closed: any resolution failure or unexpected
 * error is a 404, never a disclosure. A repeated `:projectId` param is refused (400) rather than coerced.
 *
 * ## Identity is resolved by EMAIL, the platform-identity join key
 * `DeliveryProjectMember` keys on `platform_identity_id`, and platform identities join on `primary_email`
 * (see platformIdentityService). Both an operator token (`req.admin`) and a student token (`req.participant`)
 * carry `email`, so the actor is resolved the same way for both — read-only, never creating an identity.
 */

export interface GovProjectRequest extends Request {
  /** Set only after this guard allows the request: the actor's resolved roles/tenant on this project. */
  deliveryContext?: DeliveryProjectContext;
}

/** The actor's platform identity, resolved read-only from their token email. Null when it cannot be resolved. */
export async function resolveGovProjectActor(req: Request): Promise<{ platformIdentityId: string; email: string } | null> {
  const email = (req as any).admin?.email ?? (req as any).participant?.email ?? null;
  if (!email || typeof email !== 'string') return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const identity: any = await PlatformIdentity.findOne({ where: { primary_email: normalized } });
  if (!identity || !identity.id) return null;
  return { platformIdentityId: identity.id, email };
}

/**
 * Fire-and-forget audit that a confirmed ACTIVE delivery member reached a gov project via their project
 * membership, with the tenant-membership requirement bypassed. A member accessing their own project is not a
 * tenant-isolation violation (so it does not belong on the tenant audit), but the access is still recorded
 * here so bypassing `requireTenantAccessAudited` for a member does not lose the trail. Never blocks the
 * request: telemetry must never break or slow the access it describes.
 */
function auditGovProjectMemberAccess(
  actor: { platformIdentityId: string; email: string },
  projectId: string,
  projectTenantId: string | null,
  permission: DeliveryPermission,
  roles: string[],
  req: GovProjectRequest,
): void {
  import('../services/aiEventService')
    .then(({ emitAiEvent }) =>
      emitAiEvent({
        event_type: 'gov_project_access_via_membership',
        outcome: 'success',
        actor_type: 'gov_project',
        metadata: {
          platform_identity_id: actor.platformIdentityId,
          project_id: projectId,
          project_tenant_id: projectTenantId,
          permission,
          delivery_roles: roles,
          ...describeCaller(req),
        },
      }),
    )
    .catch(() => { /* audit is fire-and-forget; telemetry must never break access */ });
}

/**
 * Require that the authenticated actor holds `permission` on the gov delivery project named by the route param.
 * On allow, attaches `req.deliveryContext`. On deny: 400 (bad/repeated param), 401 (no resolvable identity),
 * 404 (non-member / cross-tenant / any unexpected failure), 403 (member lacking the permission).
 *
 * A confirmed ACTIVE delivery member of the project is authorized by that project-scoped membership alone and
 * does NOT additionally require tenant membership (see the member branch below). A non-member still goes
 * through the tenant-isolation guard first, unchanged.
 */
export function requireGovProjectAccess(permission: DeliveryPermission, paramName = 'projectId') {
  return async (req: GovProjectRequest, res: Response, next: NextFunction): Promise<void> => {
    // A repeated param arrives as an array; refuse rather than coerce — picking one would silently decide
    // which project was actually checked.
    const raw = req.params?.[paramName] as unknown;
    if (typeof raw !== 'string' || !raw) {
      res.status(400).json({ error: 'Project id is required' });
      return;
    }
    const projectId: string = raw;

    let actor: { platformIdentityId: string; email: string } | null = null;
    try {
      actor = await resolveGovProjectActor(req);
    } catch (err) {
      // An identity lookup that errors proves nothing about access — fail closed as not-found.
      logAuthFailure('gov_project_identity_resolve_failed', err, 'gov_project', req.ip, req);
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const ctx = await buildDeliveryContext({ platformIdentityId: actor.platformIdentityId, deliveryProjectId: projectId });

      // A confirmed ACTIVE delivery member of THIS project (ctx.roles is built from active DeliveryProjectMember
      // rows) is authorized at the project scope: that membership IS the grant, and it does not additionally
      // require tenant membership. An assigned student holds such a row (minted by provision-on-assign) but has
      // no TenantMembership, so the tenant-first guard would otherwise 404 them out of their own assigned
      // project — and out of the evidence hand-in / reviewer routes this same guard fronts. Project-scoped
      // authorization is the right axis for an internal delivery actor; a tenant-WIDE membership is not. A
      // member bypasses ONLY the tenant-membership requirement — the delivery-permission check still runs below
      // (403 if they lack this permission), and the access is recorded so the audit trail is not lost.
      const isActiveMember = ctx.roles.length > 0;

      if (isActiveMember) {
        auditGovProjectMemberAccess(actor, projectId, ctx.projectTenantId, permission, ctx.roles, req);
      } else {
        // NON-member path, UNCHANGED. TENANT FIRST (audited): a caller from another tenant is denied + recorded
        // before the delivery layer reveals membership. The audited guard throws 404 on a foreign tenant.
        const tenantCtx = await buildRequestContext({ platformIdentityId: actor.platformIdentityId });
        await requireTenantAccessAudited(tenantCtx, ctx.projectTenantId, {
          resourceType: 'delivery_project',
          resourceId: projectId,
          action: 'read',
          actorEmail: actor.email,
          ipAddress: req.ip ?? null,
        });
      }

      // DELIVERY. 404 for a non-member (enumeration defense); 403 for a member who lacks the permission.
      requireDeliveryPermission(ctx, permission);

      req.deliveryContext = ctx;
      next();
    } catch (err: any) {
      const status = err && (err.status === 401 || err.status === 403 || err.status === 404) ? err.status : 404;
      logAuthFailure(status === 403 ? 'gov_project_permission_denied' : 'gov_project_access_denied', status === 404 ? null : err, 'gov_project', req.ip, req);
      res.status(status).json({ error: status === 403 ? 'Forbidden' : status === 401 ? 'Authentication required' : 'Not found' });
    }
  };
}
