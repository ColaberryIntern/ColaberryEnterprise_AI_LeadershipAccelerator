import { Request, Response } from 'express';
import { Brand } from '../models';
import { requireBrandAccessAudited, requirePlatformSuperAdminAudited } from '../modules/tenancy/tenantAccessGuards';
import { TenantAccessError, tenantScopeWhere } from '../modules/tenancy/tenantAuthorization';
import {
  clearControlBodySchema,
  controlParamsSchema,
  controlsQuerySchema,
  pauseBodySchema,
  rolloutBodySchema,
} from '../schemas/growthJourneySchema';
import {
  clearControl,
  ControlConflictError,
  ControlValidationError,
  findControl,
  listControls,
  ScopeKeyError,
  setPause,
  setRollout,
  type ControlActor,
  type ControlView,
} from '../services/growthJourney/execution/controlsService';
import { accessDenied, badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * The operator surface for governed execution (Phase 5 T518): one read, four
 * audited writes over `growth_journey_execution_controls`.
 *
 * ─── WHO MAY WRITE WHAT ─────────────────────────────────────────────────────
 *
 *   a pause ON A BRAND            `requireBrandAccessAudited` for that brand - the
 *                                 brand's own admins may stop their own brand
 *   a pause WITH NO BRAND         `requirePlatformSuperAdminAudited` - it spans
 *   (programme-, channel-,        brands, so only the platform may set it
 *    subject-wide)
 *   ANY rollout                   `requirePlatformSuperAdminAudited` - a rollout
 *                                 RAISES a mode; only the platform releases work
 *   a clear                       the same guard the row's scope needed to set it
 *
 * Same status matrix as the sibling routes: 401 unauthenticated · 404 master
 * flag off (the router) · 400 a body the schema or the scope rules refuse
 * (`sms`, an all-wildcard pause, a programme outside its brand, a cohort id
 * that does not exist) · 403 a scope the caller was not granted (recorded)
 * · 404 a foreign tenant's brand, byte-identical to not-found · 409 a second
 * active control for a scope, the database's answer · 201 a row written
 * · 200 a row cleared (a second clear: 200 `already_cleared`, no second write).
 *
 * The actor on the row and in the ledger is the admin's id; the email goes to
 * the access audit only. Nothing here sends, enrols or plans: a control is a
 * row the executor reads on its next run.
 */

const NOT_FOUND = { error: 'Not found' } as const;
const RESOURCE_TYPE = 'growth_journey_execution_control';

const actorOf = (req: Request): ControlActor => ({ id: String(req.admin?.sub ?? 'unknown') });
const auditFields = (req: Request, action: string, resourceId: string | null, metadata: Record<string, unknown>) => ({
  resourceType: RESOURCE_TYPE, action, resourceId, actorEmail: req.admin?.email ?? null, ipAddress: req.ip ?? null, metadata,
});

function renderWriteFailure(req: Request, res: Response, err: unknown, action: string): void {
  if (err instanceof TenantAccessError) return accessDenied(req, res, err, `execution_control_${action}_refused`);
  if (err instanceof ScopeKeyError || err instanceof ControlValidationError) {
    res.status(400).json({ error: err.message, error_class: err.error_class, ...(err instanceof ControlValidationError ? { code: err.code, ...err.detail } : {}) });
    return;
  }
  if (err instanceof ControlConflictError) {
    res.status(409).json({ error: err.message, error_class: err.error_class, scope_key: err.scope_key });
    return;
  }
  const errorClass = logReadFailure(req, err, `execution_control_${action}_failed`);
  res.status(500).json({ error: `Execution control ${action} failed`, error_class: errorClass });
}

/** The brand's tenant, or null: a brand that does not exist is the byte-identical 404. */
async function tenantOfBrand(brandId: string): Promise<string | null> {
  const brand = await Brand.findByPk(brandId, { attributes: ['id', 'tenant_id'] });
  return brand ? String(brand.tenant_id) : null;
}

/** GET /execution/controls - the controls in the caller's scope, active unless `include_cleared`. */
export async function listControlsHandler(req: Request, res: Response): Promise<void> {
  const query = controlsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);
  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;
    const where: Record<string, unknown> = { ...tenantScopeWhere(ctx) };
    if (query.data.tenant_id) where.tenant_id = query.data.tenant_id;
    if (query.data.brand_id) where.brand_id = query.data.brand_id;
    const controls = await listControls({ where, includeCleared: query.data.include_cleared, limit: query.data.limit });
    res.json({ controls, count: controls.length });
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'execution_control_list_refused');
    const errorClass = logReadFailure(req, err, 'execution_control_list_failed');
    res.status(500).json({ error: 'Execution control list failed', error_class: errorClass });
  }
}

/** POST /execution/pauses - a brand's admins may pause their brand; a pause with no brand is the platform's. */
export async function createPauseHandler(req: Request, res: Response): Promise<void> {
  const body = pauseBodySchema.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  try {
    const ctx = await scopedContext(req, res, {});
    if (!ctx) return;
    const b = body.data;
    const metadata = { kind: 'pause', program_id: b.program_id ?? null, channel: b.channel ?? null, subject_ref: b.subject_ref ?? null };
    let tenantId: string;
    if (b.brand_id) {
      const tenant = await tenantOfBrand(b.brand_id);
      if (!tenant) { res.status(404).json(NOT_FOUND); return; }
      await requireBrandAccessAudited(ctx, tenant, b.brand_id, auditFields(req, 'set_pause', null, metadata));
      tenantId = tenant;
    } else {
      await requirePlatformSuperAdminAudited(ctx, auditFields(req, 'set_pause', null, { ...metadata, tenant_id: b.tenant_id }));
      tenantId = b.tenant_id as string;
    }
    const control = await setPause(
      { tenantId, brandId: b.brand_id ?? null, programId: b.program_id ?? null, channel: b.channel ?? null, subjectRef: b.subject_ref ?? null, reason: b.reason },
      actorOf(req),
    );
    res.status(201).json({ control, id: control.id });
  } catch (err) {
    renderWriteFailure(req, res, err, 'set_pause');
  }
}

/** POST /execution/rollouts - the platform's write: one brand x programme x channel raised to review or limited. */
export async function createRolloutHandler(req: Request, res: Response): Promise<void> {
  const body = rolloutBodySchema.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  try {
    const ctx = await scopedContext(req, res, {});
    if (!ctx) return;
    const b = body.data;
    await requirePlatformSuperAdminAudited(ctx, auditFields(req, 'set_rollout', null, {
      kind: 'rollout', brand_id: b.brand_id, program_id: b.program_id, channel: b.channel, mode: b.mode, cohort_size: b.cohort_lead_ids?.length ?? null, daily_limit: b.daily_limit ?? null,
    }));
    const tenant = await tenantOfBrand(b.brand_id);
    if (!tenant) { res.status(404).json(NOT_FOUND); return; }
    const control = await setRollout(
      { tenantId: tenant, brandId: b.brand_id, programId: b.program_id, channel: b.channel, mode: b.mode, cohortLeadIds: b.cohort_lead_ids ?? null, dailyLimit: b.daily_limit ?? null, reason: b.reason },
      actorOf(req),
    );
    res.status(201).json({ control, id: control.id });
  } catch (err) {
    renderWriteFailure(req, res, err, 'set_rollout');
  }
}

/** The row, authorised by the guard its scope needed to set it; null after the response is written. */
async function authorisedControl(req: Request, res: Response, kind: 'pause' | 'rollout', action: string): Promise<ControlView | null> {
  const params = controlParamsSchema.safeParse(req.params);
  if (!params.success) { badRequest(res, params.error); return null; }
  const ctx = await scopedContext(req, res, {});
  if (!ctx) return null;
  const control = await findControl(params.data.id);
  if (!control || control.kind !== kind) { res.status(404).json(NOT_FOUND); return null; }
  const metadata = { kind: control.kind, scope_key: control.scope_key };
  if (control.kind === 'pause' && control.brand_id) {
    await requireBrandAccessAudited(ctx, control.tenant_id, control.brand_id, auditFields(req, action, control.id, metadata));
  } else {
    await requirePlatformSuperAdminAudited(ctx, auditFields(req, action, control.id, { ...metadata, tenant_id: control.tenant_id }));
  }
  return control;
}

function clearHandler(kind: 'pause' | 'rollout') {
  const action = `clear_${kind}`;
  return async (req: Request, res: Response): Promise<void> => {
    const body = clearControlBodySchema.safeParse(req.body ?? {});
    if (!body.success) return badRequest(res, body.error);
    try {
      const control = await authorisedControl(req, res, kind, action);
      if (!control) return;
      const r = await clearControl(control.id, actorOf(req));
      if (r.status === 'not_found') { res.status(404).json(NOT_FOUND); return; }
      res.status(200).json({ control: r.control, status: r.status });
    } catch (err) {
      renderWriteFailure(req, res, err, action);
    }
  };
}

/** POST /execution/pauses/:id/clear - the pause is history; a second clear is 200 `already_cleared`. */
export const clearPauseHandler = clearHandler('pause');
/** POST /execution/rollouts/:id/clear - the scope drops back to SHADOW on the executor's next run. */
export const clearRolloutHandler = clearHandler('rollout');
