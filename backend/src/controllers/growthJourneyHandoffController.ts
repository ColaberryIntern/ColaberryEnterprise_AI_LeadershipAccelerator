import { Request, Response } from 'express';
import type { OrderItem } from 'sequelize';
import { GrowthJourneyHandoff } from '../models';
import { requireBrandAccessAudited } from '../modules/tenancy/tenantAccessGuards';
import { requireBrandAccess, TenantAccessError, tenantScopeWhere } from '../modules/tenancy/tenantAuthorization';
import {
  HANDOFF_OPEN_STATUSES,
  handoffAcceptBodySchema,
  handoffDispositionBodySchema,
  handoffParamsSchema,
  handoffReleaseBodySchema,
  handoffsQuerySchema,
} from '../schemas/growthJourneySchema';
import { acceptHandoff, dispositionHandoff, HandoffTransitionError, releaseHandoff, type HumanActor } from '../services/growthJourney/handoffs/dispositionService';
import { accessDenied, badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * The human's handoff queue and their three moves (Phase 4, T405).
 *
 * Same status matrix as the classification and decision routes, for the same
 * reasons: 401 unauthenticated · 404 master flag off (the router) · 200 in
 * scope · 404 for another TENANT's row, byte-identical to not-found · 403 for
 * another brand inside the caller's tenant · 403 for a requested scope not
 * granted. Brand confinement is automatic since T221.
 *
 * ─── TWO READS, THREE AUDITED WRITES ────────────────────────────────────────
 *
 * The reads shape nothing before the guard. The writes follow T229's override
 * exactly: Zod → the caller's context → the row → `requireBrandAccessAudited`
 * (the access log gets the decision whether granted or refused) → the state
 * machine in `dispositionService`. An illegal transition is a 409
 * `ValidationError`; the machine, not this file, decides what is legal. A
 * cross-tenant caller has already received the byte-identical 404 before the
 * machine runs, so a 409 can never tell an outsider that a row exists.
 *
 * The actor recorded on the row and in the ledger is the admin's id (`sub`),
 * never the email: the email goes to the access audit only, where T229 put it.
 *
 * Nothing here notifies anyone. `qualified` / `converted` reach the existing
 * systems only through the machine's one door (`integrateDisposition`, T406);
 * the response carries what it wrote or why it refused, ids only.
 */

const NOT_FOUND = { error: 'Not found' } as const;
const RESOURCE_TYPE = 'growth_journey_handoff';

/** The queue's projection: everything a reviewer sorts and filters by; the packet belongs to the detail read. */
export const HANDOFF_LIST_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'program_id', 'subject_ref', 'lead_id', 'enrollment_id', 'decision_id',
  'owner_queue', 'assigned_to_type', 'assigned_to_id', 'ticket_id', 'assignment_blocked_reason',
  'priority', 'expected_value', 'urgent', 'reason', 'best_channel', 'consent_basis', 'sla_due_at',
  'status', 'disposition', 'disposition_reason', 'disposition_at', 'dispositioned_by', 'return_to_ai', 'integration_refused',
  'accepted_at', 'expired_at', 'source', 'created_at', 'updated_at',
] as const;

/** Ranked: urgent first, then expected value, then oldest first - the same order `rankHandoffs` produces in memory. */
export const HANDOFF_QUEUE_ORDER: readonly OrderItem[] = [['urgent', 'DESC'], ['expected_value', 'DESC'], ['created_at', 'ASC']];

type HandoffView = Record<(typeof HANDOFF_LIST_ATTRIBUTES)[number] | 'qualification_gaps' | 'talking_points', unknown>;

/** The row without its packet, read column by column so a plain object and a model instance shape the same. */
function handoffView(row: GrowthJourneyHandoff): HandoffView {
  const view = {} as HandoffView;
  for (const key of HANDOFF_LIST_ATTRIBUTES) view[key] = row[key];
  view.qualification_gaps = row.qualification_gaps;
  view.talking_points = row.talking_points;
  return view;
}

function detail(row: GrowthJourneyHandoff): { handoff: HandoffView; packet: Record<string, unknown> } {
  return { handoff: handoffView(row), packet: row.evidence };
}

/** GET /handoffs - the open queue by default, brand-scoped, ranked. */
export async function listHandoffsHandler(req: Request, res: Response): Promise<void> {
  const query = handoffsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;

    const status = query.data.status;
    const where = {
      ...tenantScopeWhere(ctx),
      ...(ctx.brandId ? { brand_id: ctx.brandId } : {}),
      ...(status === 'all' ? {} : status === 'open' ? { status: [...HANDOFF_OPEN_STATUSES] } : { status }),
      ...(query.data.owner_queue ? { owner_queue: query.data.owner_queue } : {}),
    };
    const { rows, count } = await GrowthJourneyHandoff.findAndCountAll({
      where,
      attributes: [...HANDOFF_LIST_ATTRIBUTES],
      order: [...HANDOFF_QUEUE_ORDER],
      limit: query.data.limit,
      offset: query.data.offset,
    });
    res.json({ rows, total: count, limit: query.data.limit, offset: query.data.offset, status, owner_queue: query.data.owner_queue ?? null });
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'handoff_read_refused');
    const errorClass = logReadFailure(req, err, 'handoff_read_failed');
    res.status(500).json({ error: 'Handoff list failed', error_class: errorClass });
  }
}

/** GET /handoffs/:id - the row and its evidence packet, or a byte-identical 404. */
export async function getHandoffHandler(req: Request, res: Response): Promise<void> {
  const params = handoffParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const query = handoffsQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;
    const row = await GrowthJourneyHandoff.findByPk(params.data.id);
    if (!row) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    // Guard BEFORE shaping: another tenant's row is a 404 indistinguishable from none.
    requireBrandAccess(ctx, row.tenant_id, row.brand_id);
    res.json(detail(row));
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'handoff_read_refused');
    const errorClass = logReadFailure(req, err, 'handoff_read_failed');
    res.status(500).json({ error: 'Handoff read failed', error_class: errorClass });
  }
}

/* ── the writes ─────────────────────────────────────────────────────────────── */

type HandoffAction = 'accept' | 'disposition' | 'release';

/**
 * The shared prelude of every write: the caller's context, the row, and the
 * AUDITED guard - in that order, so the access log carries every refused write
 * and a cross-tenant caller never learns the row exists. Returns null after
 * writing the response when the request stops here; throws `TenantAccessError`
 * when the guard refuses (the handler renders it).
 */
async function auditedHandoff(
  req: Request,
  res: Response,
  action: HandoffAction,
  metadata: Record<string, unknown>,
): Promise<{ row: GrowthJourneyHandoff; actor: HumanActor } | null> {
  const params = handoffParamsSchema.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error);
    return null;
  }
  const query = handoffsQuerySchema.safeParse(req.query);
  if (!query.success) {
    badRequest(res, query.error);
    return null;
  }
  const ctx = await scopedContext(req, res, query.data);
  if (!ctx) return null;
  const row = await GrowthJourneyHandoff.findByPk(params.data.id);
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return null;
  }
  await requireBrandAccessAudited(ctx, row.tenant_id, row.brand_id, {
    resourceType: RESOURCE_TYPE,
    action,
    resourceId: row.id,
    actorEmail: req.admin?.email ?? null,
    ipAddress: req.ip ?? null,
    metadata,
  });
  // The row and the ledger record the admin's id; the email stays in the access audit. The
  // platform identity (when the bridge resolved one) is the actor on a conversion's audit event.
  return { row, actor: { id: String(req.admin?.sub ?? 'unknown'), platformIdentityId: ctx.platformIdentityId ?? null } };
}

function renderWriteFailure(req: Request, res: Response, err: unknown, action: HandoffAction): void {
  if (err instanceof TenantAccessError) return accessDenied(req, res, err, `handoff_${action}_refused`);
  if (err instanceof HandoffTransitionError) {
    res.status(err.status).json({ error: err.message, error_class: err.error_class, from: err.from });
    return;
  }
  const errorClass = logReadFailure(req, err, `handoff_${action}_failed`);
  res.status(500).json({ error: `Handoff ${action} failed`, error_class: errorClass });
}

/** POST /handoffs/:id/accept - queued | assigned → accepted; the thread becomes the human's. */
export async function acceptHandoffHandler(req: Request, res: Response): Promise<void> {
  const body = handoffAcceptBodySchema.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  try {
    const found = await auditedHandoff(req, res, 'accept', {});
    if (!found) return;
    const row = await acceptHandoff(found.row, found.actor);
    res.json({ handoff: handoffView(row), status: row.status });
  } catch (err) {
    renderWriteFailure(req, res, err, 'accept');
  }
}

/** POST /handoffs/:id/disposition - accepted → dispositioned, or returned_to_ai with a cooldown. */
export async function dispositionHandoffHandler(req: Request, res: Response): Promise<void> {
  const body = handoffDispositionBodySchema.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  try {
    const found = await auditedHandoff(req, res, 'disposition', { disposition: body.data.disposition, cooldown_days: body.data.cooldown_days ?? null });
    if (!found) return;
    const r = await dispositionHandoff(found.row, body.data, found.actor);
    res.json({
      handoff: handoffView(r.row),
      status: r.status,
      cooldown_until: r.cooldown_until?.toISOString() ?? null,
      cooldown_source: r.cooldown_source,
      ownership_cleared: r.ownership_cleared,
      outcome_id: r.outcome_id,
      integration: r.integration,
    });
  } catch (err) {
    renderWriteFailure(req, res, err, 'disposition');
  }
}

/** POST /handoffs/:id/release - assigned | accepted → queued; the queue takes it back. */
export async function releaseHandoffHandler(req: Request, res: Response): Promise<void> {
  const body = handoffReleaseBodySchema.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  try {
    const found = await auditedHandoff(req, res, 'release', { reason: body.data.reason });
    if (!found) return;
    const r = await releaseHandoff(found.row, found.actor, body.data.reason);
    res.json({ handoff: handoffView(r.row), status: r.row.status, ownership_cleared: r.ownership_cleared });
  } catch (err) {
    renderWriteFailure(req, res, err, 'release');
  }
}
