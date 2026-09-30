import { Request, Response } from 'express';
import { GrowthJourneyDecision } from '../models';
import { requireBrandAccess, TenantAccessError, tenantScopeWhere } from '../modules/tenancy/tenantAuthorization';
import { decisionParamsSchema, decisionsQuerySchema } from '../schemas/growthJourneySchema';
import { DECISION_LIST_ATTRIBUTES, decisionWhyFromRow, loadDecisionRow } from '../services/growthJourney/decisionWhyService';
import { accessDenied, badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * The shadow decision queue and its Why (Phase 3, T312).
 *
 * Same status matrix as the classification routes and the same reasons:
 * 401 unauthenticated · 404 master flag off (the router) · 200 in scope ·
 * 404 for another TENANT's row, byte-identical to not-found · 403 for another
 * brand inside the caller's tenant · 403 for a requested scope not granted.
 * Brand confinement is automatic since T221: a brand-restricted operator who
 * omits `?brand_id=` is narrowed by the builder, not by this file.
 *
 * ─── TWO READS, NO WRITE ────────────────────────────────────────────────────
 *
 * Nothing here creates, updates or audits a row. The decision table is
 * append-only and the only writer is `decisionService.ts`; a reviewer looking
 * at why the Governor chose WAIT changes nothing by looking. The guard runs
 * BEFORE the row is shaped, so a cross-tenant refusal and a missing row are
 * the same 404 body — there is no body brand statement on a GET, so there is
 * no post-guard row comparison here of the kind the override needs.
 *
 * The list projects `DECISION_LIST_ATTRIBUTES`: the JSONB records belong to
 * the Why, one row at a time.
 */

const NOT_FOUND = { error: 'Not found' } as const;

/** GET /decisions — the shadow queue by default, brand-scoped, newest first. */
export async function listDecisionsHandler(req: Request, res: Response): Promise<void> {
  const query = decisionsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;

    const where = {
      ...tenantScopeWhere(ctx),
      ...(ctx.brandId ? { brand_id: ctx.brandId } : {}),
      ...(query.data.mode === 'all' ? {} : { mode: query.data.mode }),
      ...(query.data.subject_ref ? { subject_ref: query.data.subject_ref } : {}),
    };
    const { rows, count } = await GrowthJourneyDecision.findAndCountAll({
      where,
      attributes: [...DECISION_LIST_ATTRIBUTES],
      order: [['created_at', 'DESC']],
      limit: query.data.limit,
      offset: query.data.offset,
    });
    res.json({ rows, total: count, limit: query.data.limit, offset: query.data.offset, mode: query.data.mode });
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'decision_read_refused');
    const errorClass = logReadFailure(req, err, 'decision_read_failed');
    res.status(500).json({ error: 'Decision list failed', error_class: errorClass });
  }
}

/** GET /decisions/:id/why — the stated Why from the stored row, or a byte-identical 404. */
export async function getDecisionWhyHandler(req: Request, res: Response): Promise<void> {
  const params = decisionParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const query = decisionsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;
    const row = await loadDecisionRow(params.data.id);
    if (!row) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    // Guard BEFORE shaping: another tenant's row is a 404 indistinguishable from none.
    requireBrandAccess(ctx, row.tenant_id, row.brand_id);
    res.json(decisionWhyFromRow(row));
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'decision_read_refused');
    const errorClass = logReadFailure(req, err, 'decision_read_failed');
    res.status(500).json({ error: 'Decision why failed', error_class: errorClass });
  }
}
