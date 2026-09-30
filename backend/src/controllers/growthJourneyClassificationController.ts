import { Request, Response } from 'express';
import { GrowthJourneyClassification } from '../models';
import { requireBrandAccess, TenantAccessError, tenantScopeWhere } from '../modules/tenancy/tenantAuthorization';
import { requireBrandAccessAudited } from '../modules/tenancy/tenantAccessGuards';
import {
  classificationOverrideBodySchema,
  classificationParamsSchema,
  classificationsQuerySchema,
} from '../schemas/growthJourneySchema';
import { overrideClassification } from '../services/growthJourney/classificationService';
import { OfferNotEligibleError } from '../services/growthJourney/offerEligibility';
import { loadWhyRows, whyFromRow } from '../services/growthJourney/classificationWhyService';
import { accessDenied, badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * The classification queue, its Why, and the human override (Phase 2, T229).
 *
 * Same status matrix as the participation routes and the same reasons:
 * 401 unauthenticated · 404 master flag off (the router) · 200 in scope ·
 * 404 for another TENANT's row, byte-identical to not-found · 403 for another
 * brand inside the caller's tenant · 403 for a requested scope not granted.
 * Brand confinement is automatic since T221: a brand-restricted operator who
 * omits `?brand_id=` is narrowed by the builder, not by this file.
 *
 * The override is the only write, and it is audited through
 * `requireBrandAccessAudited` so the access log records the decision either
 * way. It writes an append-only row; policy beats the human (422 with the
 * eligibility decision when the family is not the brand's to offer).
 */

const NOT_FOUND = { error: 'Not found' } as const;

/** GET /classifications — the review queue by default, brand-scoped. */
export async function listClassificationsHandler(req: Request, res: Response): Promise<void> {
  const query = classificationsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;

    const where = {
      ...tenantScopeWhere(ctx),
      ...(ctx.brandId ? { brand_id: ctx.brandId } : {}),
      ...(query.data.status === 'all' ? {} : { status: query.data.status }),
    };
    const { rows, count } = await GrowthJourneyClassification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: query.data.limit,
      offset: query.data.offset,
    });
    res.json({ rows, total: count, limit: query.data.limit, offset: query.data.offset, status: query.data.status });
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'classification_read_refused');
    const errorClass = logReadFailure(req, err, 'classification_read_failed');
    res.status(500).json({ error: 'Classification list failed', error_class: errorClass });
  }
}

/** GET /classifications/:id/why — the stated Why, or a byte-identical 404. */
export async function getClassificationWhyHandler(req: Request, res: Response): Promise<void> {
  const params = classificationParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const query = classificationsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;
    const loaded = await loadWhyRows(params.data.id);
    if (!loaded) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    // Guard BEFORE shaping: another tenant's row is a 404 indistinguishable from none.
    requireBrandAccess(ctx, loaded.row.tenant_id, loaded.row.brand_id);
    res.json(whyFromRow(loaded.row, loaded.chain));
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'classification_read_refused');
    const errorClass = logReadFailure(req, err, 'classification_read_failed');
    res.status(500).json({ error: 'Classification why failed', error_class: errorClass });
  }
}

/** POST /classifications/:id/override — a human decision, as a new row. */
export async function overrideClassificationHandler(req: Request, res: Response): Promise<void> {
  const params = classificationParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = classificationOverrideBodySchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const query = classificationsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;
    const prior = await GrowthJourneyClassification.findByPk(params.data.id);
    if (!prior) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    // Audited: the write lands in the access log whether granted or refused.
    await requireBrandAccessAudited(ctx, prior.tenant_id, prior.brand_id, {
      resourceType: 'growth_journey_classification',
      action: 'override',
      resourceId: prior.id,
      actorEmail: req.admin?.email ?? null,
      ipAddress: req.ip ?? null,
      metadata: { lock: body.data.lock },
    });
    // Only NOW may the body's brand statement be compared with the row: a caller
    // outside the row's tenant has already received the byte-identical 404 above,
    // so a mismatch here can never tell an outsider that the row exists.
    if (body.data.brand_id && body.data.brand_id !== prior.brand_id) {
      res.status(409).json({ error: 'brand_id does not match the classification', error_class: 'ValidationError' });
      return;
    }

    // AuthPayload carries `sub` (the admin id) and `email`; `decided_by` records the id.
    const adminId = String(req.admin?.sub ?? req.admin?.email ?? 'unknown');
    const result = await overrideClassification({
      classificationId: prior.id,
      admin: { id: adminId },
      patch: { primary_path: body.data.primary_path, journey_program: body.data.journey_program },
      lock: body.data.lock,
      reason: body.data.reason,
    });
    if (result.status === 'not_found') {
      res.status(404).json(NOT_FOUND);
      return;
    }
    res.status(result.replayed ? 200 : 201).json({ classification: result.row, override_of: prior.id, replayed: result.replayed });
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'classification_override_refused');
    if (err instanceof OfferNotEligibleError) {
      res.status(422).json({ error: 'Offer not eligible for this brand', error_class: err.error_class, decision: err.decision });
      return;
    }
    const errorClass = logReadFailure(req, err, 'classification_override_failed');
    res.status(500).json({ error: 'Classification override failed', error_class: errorClass });
  }
}
