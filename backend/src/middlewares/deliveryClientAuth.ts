import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logAuthFailure } from './authFailureLog';
import {
  CLIENT_TOKEN_AUDIENCE,
  CLIENT_TOKEN_TYPE,
  type ClientSessionClaims,
} from '../modules/delivery/clientAuth';
import { recordAccessDecision } from '../modules/tenancy/tenantAccessAudit';

/**
 * deliveryClientAuth — the guard for the client review surface.
 *
 * Separate from `authMiddleware` on purpose. Master plan §Gate 10's safety property is that
 * **a client session is not a builder session**, and the cheapest way to lose that property
 * is to teach one middleware to accept both.
 *
 * ## The separation holds in both directions
 *
 * - **A client token cannot pass `requireAdmin`.** It carries no `role` claim, and
 *   `requireAdmin` gates on `ADMIN_ROLES.has(payload.role)` — `undefined` is not in that set.
 * - **An admin token cannot pass this guard.** Verification here demands
 *   `audience: 'delivery-client'`, and an admin token is signed without an audience, so
 *   `jwt.verify` rejects it before any claim is read.
 *
 * Both directions are properties of the token shape, not of a middleware remembering to
 * check something.
 *
 * ## Project scope travels in the token
 *
 * `delivery_project_ids` is stamped at sign-in from memberships that already existed. A
 * request for a project not in that list is refused here, before any handler runs — and
 * refused as **404, not 403**, because 403 confirms the project exists. The difference
 * between "you may not see this" and "this is not here" is the difference between a denial
 * and a disclosure.
 */

export interface DeliveryClientRequest extends Request {
  deliveryClient?: ClientSessionClaims;
}

export function requireDeliveryClient(
  req: DeliveryClientRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    // The audience is the load-bearing argument. Without it an admin token verifies here.
    const payload = jwt.verify(token, env.jwtSecret, {
      audience: CLIENT_TOKEN_AUDIENCE,
    }) as unknown as ClientSessionClaims & { role?: unknown };

    if (payload.token_type !== CLIENT_TOKEN_TYPE) {
      logAuthFailure('delivery_client_wrong_token_type', null, 'delivery_client', req.ip, req);
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // A client token must never carry a role. If one appears, something minted a hybrid
    // session and it must not be honoured — failing loudly here is far better than letting
    // it through and discovering it in an access review.
    if ('role' in payload && payload.role !== undefined) {
      logAuthFailure('delivery_client_token_carries_role', null, 'delivery_client', req.ip, req);
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (!Array.isArray(payload.delivery_project_ids) || payload.delivery_project_ids.length === 0) {
      // Sign-in refuses to mint a session with no projects, so this means a token was
      // altered or hand-made.
      logAuthFailure('delivery_client_no_projects', null, 'delivery_client', req.ip, req);
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.deliveryClient = payload;
    next();
  } catch (err) {
    logAuthFailure('delivery_client_auth_failed', err, 'delivery_client', req.ip, req);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Scope a request to a project the session actually covers.
 *
 * **404, never 403.** A 403 on a foreign project confirms that project exists, which turns
 * this endpoint into a way to enumerate other clients' engagements. E2E scenario F asserts
 * exactly this status code for the cross-tenant case.
 */
export function requireDeliveryProjectAccess(paramName = 'projectId') {
  return (req: DeliveryClientRequest, res: Response, next: NextFunction): void => {
    const claims = req.deliveryClient;
    if (!claims) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Express types this as `string | string[]`. An array means the param appeared more
    // than once, and picking one would decide which project was checked — so refuse it
    // rather than coerce. Casting the type away here would let a repeated param slip past
    // the scope check entirely.
    const raw = req.params?.[paramName] as unknown;
    if (typeof raw !== 'string' || !raw) {
      res.status(400).json({ error: 'Project id is required' });
      return;
    }
    const requested: string = raw;

    if (!claims.delivery_project_ids.includes(requested)) {
      logAuthFailure('delivery_client_foreign_project', null, 'delivery_client', req.ip, req);

      // Also record it in the tenant-isolation audit trail. This guard previously logged
      // ONLY to ai_events, which meant a cross-tenant attempt against the client surface
      // never reached the table that exists specifically to answer "who tried to read
      // whose data". E2E scenario F asserts on that row, and it would have failed.
      //
      // Fire-and-forget by design: recordAccessDecision never affects an authorization
      // outcome and resolves even when the write fails, so awaiting it would add latency
      // to a refusal without changing it. The refusal below is already decided.
      void recordAccessDecision({
        ctx: {
          platformIdentityId: claims.sub ?? null,
          // A client session is deliberately not tenant-scoped: it carries project ids,
          // not a tenant. Null is the honest value rather than a guess.
          tenantId: null,
          brandId: null,
          organizationId: null,
          roles: [],
          isPlatformSuperAdmin: false,
          authorizedTenantIds: [],
        },
        resourceType: 'delivery_project',
        resourceId: requested,
        action: 'read',
        decision: 'denied',
        reason: 'project_not_in_client_session',
        actorEmail: claims.email ?? null,
        ipAddress: req.ip ?? null,
      }).catch(() => {
        // recordAccessDecision already shouts about a failed write; swallowing here
        // keeps a bookkeeping failure from surfacing as an unhandled rejection.
      });

      res.status(404).json({ error: 'Not found' });
      return;
    }

    next();
  };
}
