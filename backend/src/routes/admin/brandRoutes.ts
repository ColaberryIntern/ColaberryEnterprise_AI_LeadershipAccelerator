import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { Brand } from '../../models';
import { adminTenantScope, scopeAllows, AdminTenantScope } from '../../modules/tenancy/adminScopeBridge';
import {
  brandSendReadiness,
  listBrandSenderProfiles,
} from '../../modules/communications/senderProfileService';
import {
  BrandIdParamSchema,
  BrandListQuerySchema,
  BrandPatchSchema,
} from '../../schemas/brandAdminSchema';

/**
 * Brand administration — brands, their domains, and their sending readiness.
 *
 * WHAT THIS WIRES UP. `brandSendReadiness()` and `listBrandSenderProfiles()` already existed
 * and were called by NOTHING — the deliverability picture (domain verification, SPF, DKIM,
 * DMARC, per-profile preflight) was computed correctly and reachable from nowhere. That is the
 * same producer-without-a-consumer shape this workstream keeps finding.
 *
 * THE ISOLATION RULE, and why it is not just `tenantScopeWhere`. Both service functions take a
 * bare `brandId` and no tenant. `brandSendReadiness('<any uuid>')` will cheerfully return
 * another tenant's brand, its domains and its sender profiles. Nothing inside them checks
 * anything, so **every** authorisation decision has to happen in this file, before the call.
 * The rule applied here is: resolve the brand, decide, then serve.
 *
 * 404 AND NOT 403 for a brand in another tenant. A 403 confirms the row exists, which turns id
 * enumeration into a way to inventory a competitor's brand list. 403 is kept for the different
 * question of a caller inside their own tenant lacking a permission — there, the existence of
 * the thing is not the secret. Same position `requireTenantAccess` takes in tenantAuthorization.
 */

const router = Router();

/** 404 body used for both "no such brand" and "not yours". They must be indistinguishable. */
const NOT_FOUND = { error: 'Brand not found', error_class: 'NotFound' };

function badRequest(res: Response, details: unknown): void {
  res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details });
}

/**
 * Resolve a brand the caller is allowed to see, or null.
 *
 * Returns null for BOTH "does not exist" and "belongs to someone else", so the caller cannot
 * tell the two apart. Every handler below funnels through this rather than calling
 * `Brand.findByPk` itself — one place to get the rule right, and one place to change it when
 * `tenant_memberships` is populated and the ramp closes.
 */
async function resolveVisibleBrand(
  scope: AdminTenantScope,
  brandId: string,
): Promise<InstanceType<typeof Brand> | null> {
  const brand = await Brand.findByPk(brandId);
  if (!brand) return null;
  if (!scopeAllows(scope, brand.tenant_id)) return null;
  return brand;
}

/**
 * The tenant filter for a LIST query.
 *
 * The ordering here is the whole security property, so it is written out rather than spread
 * into an object literal. A caller-supplied `tenant_id` may only ever NARROW the set:
 *
 *   - denied            -> match nothing, whatever was asked for
 *   - migration_open    -> the caller's filter stands alone (there is no scope to narrow with)
 *   - scoped + filter   -> INTERSECTION; a tenant outside the scope yields nothing
 *   - scoped, no filter -> the whole authorised scope
 *
 * Written as an intersection rather than as `{ ...userFilter, ...scopeFilter }` because that
 * spread only works by accident: it depends on the scope key being spelled `tenant_id` too,
 * and on it coming second. Rename one, reorder the other, and a caller-supplied tenant_id
 * silently becomes the effective filter. The failure would be invisible — a 200 with somebody
 * else's brands in it.
 */
export function brandTenantFilter(
  scope: AdminTenantScope,
  requestedTenantId?: string,
): Record<string, unknown> {
  if (scope.mode === 'denied') {
    // Matches nothing. NOT `{}`, which Sequelize reads as "no filter" and would return every
    // brand in the system to a caller who has just been denied.
    return { tenant_id: null as unknown as string };
  }

  if (scope.mode === 'migration_open') {
    return requestedTenantId ? { tenant_id: requestedTenantId } : {};
  }

  if (!requestedTenantId) return { tenant_id: scope.tenantIds };

  const intersection = scope.tenantIds.filter((t) => t === requestedTenantId);
  return intersection.length > 0
    ? { tenant_id: intersection }
    : { tenant_id: null as unknown as string };
}

// ── Brands ───────────────────────────────────────────────────────────────────

router.get('/api/admin/brands', requireAdmin, async (req: Request, res: Response) => {
  const parsed = BrandListQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());

  try {
    const scope = await adminTenantScope(req.admin);
    // Keyed by string OR symbol because Sequelize's operators (Op.or) are symbols. Typed that
    // way rather than cast to `any`, so a typo in a plain column name is still caught.
    const where: Record<string | symbol, unknown> = {
      ...brandTenantFilter(scope, parsed.data.tenant_id),
    };
    if (parsed.data.status) where.status = parsed.data.status;
    if (parsed.data.q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${parsed.data.q}%` } },
        { slug: { [Op.iLike]: `%${parsed.data.q}%` } },
      ];
    }

    const brands = await Brand.findAll({ where, order: [['name', 'ASC']] });
    res.json({ brands, scope_mode: scope.mode });
  } catch {
    res.status(500).json({ error: 'Failed to list brands', error_class: 'InternalError' });
  }
});

router.get('/api/admin/brands/:brandId', requireAdmin, async (req: Request, res: Response) => {
  const parsed = BrandIdParamSchema.safeParse(req.params);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());

  try {
    const scope = await adminTenantScope(req.admin);
    const brand = await resolveVisibleBrand(scope, parsed.data.brandId);
    if (!brand) return void res.status(404).json(NOT_FOUND);
    res.json({ brand });
  } catch {
    res.status(500).json({ error: 'Failed to load brand', error_class: 'InternalError' });
  }
});

router.patch('/api/admin/brands/:brandId', requireAdmin, async (req: Request, res: Response) => {
  const params = BrandIdParamSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error.flatten());

  // Body validated BEFORE the brand is loaded. A malformed patch is a malformed patch whether
  // or not the id happens to exist, and validating first means a bad body cannot reach the
  // database at all.
  const body = BrandPatchSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error.flatten());

  try {
    const scope = await adminTenantScope(req.admin);
    const brand = await resolveVisibleBrand(scope, params.data.brandId);
    if (!brand) return void res.status(404).json(NOT_FOUND);

    await brand.update(body.data);
    res.json({ brand });
  } catch {
    res.status(500).json({ error: 'Failed to update brand', error_class: 'InternalError' });
  }
});

// ── Send readiness ───────────────────────────────────────────────────────────

router.get(
  '/api/admin/brands/:brandId/send-readiness',
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = BrandIdParamSchema.safeParse(req.params);
    if (!parsed.success) return badRequest(res, parsed.error.flatten());

    try {
      const scope = await adminTenantScope(req.admin);
      // Authorised BEFORE brandSendReadiness is called, not after. That function takes a bare
      // id and returns the brand, its domains and its sender profiles with no check of its
      // own, so calling it first and filtering the response would already have read another
      // tenant's data into this process.
      const brand = await resolveVisibleBrand(scope, parsed.data.brandId);
      if (!brand) return void res.status(404).json(NOT_FOUND);

      const readiness = await brandSendReadiness(brand.id);
      res.json({ readiness });
    } catch {
      res.status(500).json({ error: 'Failed to load send readiness', error_class: 'InternalError' });
    }
  },
);

router.get(
  '/api/admin/brands/:brandId/sender-profiles',
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = BrandIdParamSchema.safeParse(req.params);
    if (!parsed.success) return badRequest(res, parsed.error.flatten());

    try {
      const scope = await adminTenantScope(req.admin);
      const brand = await resolveVisibleBrand(scope, parsed.data.brandId);
      if (!brand) return void res.status(404).json(NOT_FOUND);

      const profiles = await listBrandSenderProfiles(brand.id);
      res.json({ profiles });
    } catch {
      res.status(500).json({ error: 'Failed to load sender profiles', error_class: 'InternalError' });
    }
  },
);

export default router;
