import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import InboxCase from '../models/InboxCase';
import { ResourceLease } from '../models';
import {
  inboxZeroCursorSchema,
  inboxZeroDeltaQuerySchema,
  inboxZeroLeaseSchema,
  inboxZeroNextQuerySchema,
  inboxZeroOverviewQuerySchema,
  inboxZeroQueueQuerySchema,
  inboxZeroReconcileSchema,
  inboxZeroStartSchema,
  caseIdParamSchema,
} from '../schemas/inboxCaseSchema';
import {
  advanceOperatorCursor,
  heartbeatOperatorSession,
  readOperatorCursor,
  startOperatorSession,
  stopOperatorSession,
} from '../services/inboxCase/operatorSessionService';
import { buildFocus, getDelta, getFullHealth, getNext, getOverview, summarise } from '../services/inboxCase/inboxZeroService';
import { INBOX_ZERO_OPERATOR_RESOURCE_KEY } from '../services/inboxCase/operatorSessionService';
import { getQueue } from '../services/inboxCase/inboxZeroQueueService';
import { listStaleWaiting, listWaiting } from '../services/inboxCase/waitingLedgerService';
import { listOpenCommitments, listOverdueCommitments } from '../services/inboxCase/commitmentLedgerService';
import { reconcileLiveness } from '../services/inboxCase/inboxLivenessService';

// /inbox-zero operator API (T9a). Thin: validate, call the service, return.
// Everything here is a READ except the operator session itself (lease +
// cursor), which is operator state, not case state, and the T16 liveness
// reconcile, which only ever records what the provider says about Ali's
// own inbox and dispositions evidence he already cleared. Approvals and
// executions stay on the existing case routes and their gates.

function bad(res: Response, issues: unknown) {
  return res.status(400).json({ error: 'ValidationError', details: issues });
}

function actor(req: Request): string {
  return (req as any).admin?.email || 'admin'; // `as any`: same admin-context access as every sibling inbox controller
}

export async function handleZeroStart(req: Request, res: Response) {
  const parsed = inboxZeroStartSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const session = await startOperatorSession(`${actor(req)}#${parsed.data.tab}`);
  const overview = await getOverview(session.cursor.cursor_at);
  res.status(session.acquired ? 200 : 409).json({ session, overview });
}

export async function handleZeroHeartbeat(req: Request, res: Response) {
  const parsed = inboxZeroLeaseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  res.json(await heartbeatOperatorSession(parsed.data.lease_id));
}

export async function handleZeroStop(req: Request, res: Response) {
  const parsed = inboxZeroLeaseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  res.json(await stopOperatorSession(parsed.data.lease_id));
}

/** Advance the cursor — only for the tab that still holds the active lease.
 * A released or expired lease cannot move it: that is the multi-tab guard. */
export async function handleZeroCursor(req: Request, res: Response) {
  const parsed = inboxZeroCursorSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const lease: any = await ResourceLease.findByPk(parsed.data.lease_id); // `as any`: see workCoordinatorService.releaseLease for the rationale
  // Must be THE operator lease, not any active work-graph lease that happens to exist.
  if (!lease || lease.status !== 'active' || lease.resource_key !== INBOX_ZERO_OPERATOR_RESOURCE_KEY) {
    return res.status(409).json({ error: 'LeaseNotActive', message: 'Only the tab holding the active operator lease may advance the cursor. Run `/inbox-zero resume`.' });
  }
  const r = await advanceOperatorCursor({ to: new Date(parsed.data.to), processingSucceeded: parsed.data.processing_succeeded, advancedBy: lease.lease_owner });
  res.json(r);
}

export async function handleZeroOverview(req: Request, res: Response) {
  const parsed = inboxZeroOverviewQuerySchema.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const cursor = parsed.data.cursor ?? (await readOperatorCursor()).cursor_at;
  res.json(await getOverview(cursor));
}

export async function handleZeroHealth(_req: Request, res: Response) {
  res.json(await getFullHealth());
}

export async function handleZeroDelta(req: Request, res: Response) {
  const parsed = inboxZeroDeltaQuerySchema.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.issues);
  res.json(await getDelta(parsed.data.since));
}

export async function handleZeroNext(req: Request, res: Response) {
  const parsed = inboxZeroNextQuerySchema.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const focus = await getNext(parsed.data.focus ?? null);
  if (!focus) return res.json({ focus: null, message: 'Nothing actionable in this focus.' });
  res.json({ focus });
}

export async function handleZeroReconcile(req: Request, res: Response) {
  const parsed = inboxZeroReconcileSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error.issues);
  // inbox_case_events.correlation_id is a UUID column; the actor is logged by the service.
  const correlationId = randomUUID();
  const result = await reconcileLiveness({ limit: parsed.data.limit, staleMinutes: parsed.data.stale_minutes, correlationId });
  res.json({ reconcile: result, correlation_id: correlationId, requested_by: actor(req) });
}

export async function handleZeroFocusCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return bad(res, parsed.error.issues);
  const row = await InboxCase.findByPk(parsed.data.caseId);
  if (!row) return res.status(404).json({ error: 'CaseNotFoundError' });
  res.json({ focus: await buildFocus(row) });
}

export async function handleZeroQueue(req: Request, res: Response) {
  const parsed = inboxZeroQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.issues);
  res.json(await getQueue(parsed.data.view));
}

export async function handleZeroWaiting(_req: Request, res: Response) {
  const now = new Date();
  const [waiting, stale] = await Promise.all([listWaiting(), listStaleWaiting(now)]);
  const staleIds = new Set(stale.map((c) => c.id));
  res.json({ waiting: waiting.map((c) => ({ ...summarise(c, now), stale: staleIds.has(c.id), waiting_since: c.waiting_since })), stale_count: stale.length });
}

export async function handleZeroCommitments(_req: Request, res: Response) {
  const now = new Date();
  const [open, overdue] = await Promise.all([listOpenCommitments(), listOverdueCommitments(now)]);
  const overdueIds = new Set(overdue.map((k) => k.id));
  res.json({
    open: open.map((k) => ({ id: k.id, case_id: k.case_id, statement: k.statement, owed_to: k.owed_to, due_at: k.due_at, source: k.source, overdue: overdueIds.has(k.id) })),
    overdue_count: overdue.length,
  });
}

export async function handleZeroSnoozed(_req: Request, res: Response) {
  const now = new Date();
  const rows = await InboxCase.findAll({ where: { state: { [Op.ne]: 'RESOLVED' } } as any }); // `as any`: Op-keyed where
  const snoozed = rows.filter((c) => c.snoozed_until && new Date(c.snoozed_until) > now).map((c) => ({ ...summarise(c, now), snooze_reason: c.snooze_reason }));
  res.json({ snoozed, count: snoozed.length });
}
