import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { classifyError } from '../utils/errorClassifier';
import { GrowthJourneyEnrollment } from '../models';
import { contextFromAdminRequest } from '../modules/tenancy/adminScopeBridge';
import {
  requireBrandAccess,
  tenantScopeWhere,
  TenantAccessError,
  type PlatformRequestContext,
} from '../modules/tenancy/tenantAuthorization';
import {
  participationParamsSchema,
  participationsQuerySchema,
  type ParticipationsQuery,
} from '../schemas/growthJourneySchema';

/**
 * Brand-scoped reads over the generic participation record (T207).
 *
 * ─── THE TRUSTED MAP DECIDES, NEVER THE CLAIM ───────────────────────────────
 *
 * Scope comes from the caller's tenant MEMBERSHIPS, built by
 * `contextFromAdminRequest`. It does not come from the `Host` header, from
 * `X-Forwarded-Host`, or from anything else the client can type. A request
 * naming another brand's hostname is not "refused" by a check — there is simply
 * no code path that reads it. A source-scan test pins that absence.
 *
 * ─── THE STATUS MATRIX, USING THE CODES THE GUARD ACTUALLY RETURNS ──────────
 *
 *   401   unauthenticated                  (`requireAdmin`, on the route)
 *   400   malformed input                  (Zod, before any lookup)
 *   200   in-brand
 *   404   row does not exist
 *   404   row belongs to ANOTHER TENANT    — the same 404, deliberately. A 403
 *         would confirm the row exists, which turns id enumeration into a
 *         discovery tool for a competitor's inventory. `requireTenantAccess`
 *         documents this and this route inherits it rather than overriding it.
 *   403   row is in the caller's tenant but OUTSIDE the brand they scoped to —
 *         the Colaberry Training / Colaberry Enterprise pair, both in the
 *         `colaberry` tenant, is the only pair in §4's four brands that yields
 *         this. The plan's cycle 2 asserted 403 for every cross-brand pair,
 *         which would have failed against a correct implementation.
 *   403   caller REQUESTED a brand it does not hold — see below.
 *
 * ─── REFUSE, NEVER WIDEN ────────────────────────────────────────────────────
 *
 * `buildRequestContext` THROWS `TenantAccessError` (403) when a requested brand is
 * not permitted, and the catch below turns that into the 403 response. The
 * `scopedContext` comparison of `ctx.brandId` to the request stays as a second
 * line: if the builder ever regressed to returning null for a refusal, this route
 * would still refuse rather than widen a brand-scoped operator to their tenant.
 *
 * ─── G2: BRAND CONFINEMENT IS AUTOMATIC ────────────────────────────────────
 *
 * The context carries `authorizedBrandIds` — the brands the caller's memberships
 * confine them to, or null when they are not brand-restricted — and
 * `requireBrandAccess` / `tenantScopeWhere` consult it whether or not `?brand_id=`
 * was sent. A Training-only operator who omits the parameter is narrowed to
 * Training by the builder (`brandId` auto-confined) and refused an Enterprise row
 * with 403. This was a pinned, named gap in the first version of this route; the
 * access test that pinned it now asserts the refusal.
 *
 * ─── IN PRODUCTION TODAY, THIS ROUTE RETURNS 404 TO EVERY ADMIN ─────────────
 *
 * There are zero active `tenant_memberships`. With no membership,
 * `canAccessTenant` is false for every row, so every read is a 404. That is
 * fail-closed and correct, and it is stated here so nobody reads it as a bug:
 * the route becomes useful when an operator populates memberships, not when
 * someone loosens the guard. `enterpriseIntelligenceController` uses a
 * "be generous while the membership system is unpopulated" fallback for its
 * own reads; that is deliberately NOT adopted for a brand-scoped route.
 */

function badRequest(res: Response, err: ZodError): void {
  res.status(400).json({
    error: 'Invalid request',
    details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/**
 * Render a guard refusal.
 *
 * A 404 FROM THE GUARD IS BYTE-IDENTICAL TO A GENUINE NOT-FOUND. The first
 * version rendered `err.errorClass`, so a cross-tenant refusal carried
 * `"error_class":"TenantIsolationViolation"` while a missing row did not — and
 * the entire reason the guard returns 404 rather than 403 is to not confirm the
 * row exists. The body confirmed it. An independent review executed both
 * responses and diffed them. The class is still logged server-side, where it
 * belongs; it is not for the caller.
 *
 * A 403 keeps its class: by then the caller already knows the row exists.
 */
function accessDenied(req: Request, res: Response, err: TenantAccessError): void {
  if (err.status === 404) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        service: 'growth-journey-admin',
        event: 'participation_read_refused',
        error_class: err.errorClass,
        outcome: 'failure',
        path: req.path,
      }),
    );
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(err.status).json({ error: err.message, error_class: err.errorClass });
}

/**
 * Build the caller's context from memberships, honouring a requested scope only
 * if it was granted.
 *
 * Returns the context, or `null` after writing a 403 — the refuse-never-widen
 * rule. Also refuses when a brand was requested without a tenant to scope it
 * under, since `buildRequestContext` cannot grant a brand without one.
 */
async function scopedContext(
  req: Request,
  res: Response,
  query: Pick<ParticipationsQuery, 'tenant_id' | 'brand_id'>,
): Promise<PlatformRequestContext | null> {
  const ctx = await contextFromAdminRequest(req.admin, {
    requestedTenantId: query.tenant_id ?? null,
    requestedBrandId: query.brand_id ?? null,
  });

  if (query.tenant_id && ctx.tenantId !== query.tenant_id) {
    accessDenied(req, res, new TenantAccessError('Tenant not in scope', 403, 'AuthorizationError'));
    return null;
  }
  if (query.brand_id && ctx.brandId !== query.brand_id) {
    accessDenied(req, res, new TenantAccessError('Brand not in scope', 403, 'AuthorizationError'));
    return null;
  }
  return ctx;
}

function logReadFailure(req: Request, err: unknown): string {
  const errorClass = classifyError(err);
  // No learner identifier in this line: the params are a participation id and
  // scope ids, not an email. The message is truncated rather than dropped.
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'growth-journey-admin',
      event: 'participation_read_failed',
      error_class: errorClass,
      outcome: 'failure',
      path: req.path,
      message: (err as { message?: string })?.message?.slice(0, 200) ?? null,
    }),
  );
  return errorClass;
}

/** GET /participations/:id — one participation, brand-scoped. */
export async function getParticipationHandler(req: Request, res: Response): Promise<void> {
  const params = participationParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const query = participationsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;

    const row = await GrowthJourneyEnrollment.findByPk(params.data.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Throws 404 for another tenant's row, 403 for another brand's in this tenant.
    requireBrandAccess(ctx, row.tenant_id, row.brand_id);

    res.json(row);
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err);
    const errorClass = logReadFailure(req, err);
    res.status(500).json({ error: 'Participation read failed', error_class: errorClass });
  }
}

/** GET /participations — a page of participations within the caller's scope. */
export async function listParticipationsHandler(req: Request, res: Response): Promise<void> {
  const query = participationsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;

    // `tenantScopeWhere` yields `{ tenant_id: null }` for a context with no
    // memberships, which matches nothing real. An unauthenticated or
    // membership-less caller therefore gets an empty page, never an unscoped
    // findAll — the failure mode master plan §18 names.
    const where = {
      ...tenantScopeWhere(ctx),
      ...(ctx.brandId ? { brand_id: ctx.brandId } : {}),
    };

    const { rows, count } = await GrowthJourneyEnrollment.findAndCountAll({
      where,
      limit: query.data.limit,
      offset: query.data.offset,
      order: [['enrolled_at', 'DESC']],
    });

    res.json({ rows, total: count, limit: query.data.limit, offset: query.data.offset });
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err);
    const errorClass = logReadFailure(req, err);
    res.status(500).json({ error: 'Participation list failed', error_class: errorClass });
  }
}
