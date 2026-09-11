import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { ExternalPublication, PlatformDeliveryEvent, PublishingJob } from '../../models';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { PUBLISHING_JOB_STATES } from '../../services/publishing/publishingQueueQuery';
import { cancelJob, completeHandoff, retryJob } from '../../services/publishing/publishingReceiptService';
import { runDueJobs } from '../../services/publishing/publishingWorker';
import { WorkflowError } from '../../services/content/contentWorkflowService';

/**
 * Publishing queue and receipts — /api/admin/publishing. Mapped to 'campaigns' in
 * mgmtSectionGate (an unmapped prefix is a latent 403 for every scoped role).
 *
 * Every job and publication is tenant-scoped through adminTenantScope before it is read;
 * foreign rows 404. `POST /run` is a manual tick of the same worker the cron runs, for an
 * operator who does not want to wait a minute - it is subject to the same kill switch.
 */

const router = Router();
const UUID = z.string().uuid();
const NOT_FOUND = { error: 'Not found', error_class: 'NotFound' };

const JobsQuery = z.object({
  item_id: UUID.optional(),
  state: z.enum(PUBLISHING_JOB_STATES as unknown as [string, ...string[]]).optional(),
  dead_lettered: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
const PublicationsQuery = z.object({ item_id: UUID.optional(), status: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).strict();
const HandoffCompleteSchema = z.object({ external_id: z.string().trim().min(1).max(300), permalink: z.string().trim().url().max(2048).nullable().optional() }).strict();
const CancelSchema = z.object({ reason: z.string().trim().max(500).nullable().optional() }).strict();

function bad(res: Response, details: unknown): void {
  res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details });
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof WorkflowError) return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'publishing', event, outcome: 'failure', error_class: e?.name ?? 'Error', context: { message: String(e?.message ?? e).slice(0, 200) } }));
  res.status(500).json({ error: 'Publishing operation failed', error_class: 'InternalError' });
}

function actorOf(req: Request) {
  return { adminId: req.admin?.sub ?? null, email: req.admin?.email ?? null };
}

router.get('/api/admin/publishing/jobs', requireAdmin, async (req: Request, res: Response) => {
  const parsed = JobsQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') return void res.json({ jobs: [], scope_mode: scope.mode });
    const where: Record<string, unknown> = {};
    if (scope.mode === 'scoped') where.tenant_id = scope.tenantIds;
    if (parsed.data.item_id) where.content_item_id = parsed.data.item_id;
    if (parsed.data.state) where.state = parsed.data.state;
    const jobs = await PublishingJob.findAll({ where, order: [['publish_at', 'DESC']], limit: parsed.data.limit });
    const filtered = parsed.data.dead_lettered === undefined ? jobs
      : jobs.filter((j) => (j.dead_lettered_at !== null) === (parsed.data.dead_lettered === 'true'));
    res.json({ jobs: filtered, scope_mode: scope.mode });
  } catch (err) { fail(res, err, 'publishing_jobs_list_failed'); }
});

router.get('/api/admin/publishing/jobs/:id/events', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    const job = await PublishingJob.findByPk(id.data);
    if (!job || !scopeAllows(scope, job.tenant_id)) return void res.status(404).json(NOT_FOUND);
    const events = await PlatformDeliveryEvent.findAll({ where: { publishing_job_id: job.id }, order: [['occurred_at', 'ASC']] });
    res.json({ job, events });
  } catch (err) { fail(res, err, 'publishing_job_events_failed'); }
});

router.post('/api/admin/publishing/jobs/:id/retry', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    const job = await PublishingJob.findByPk(id.data);
    if (!job || !scopeAllows(scope, job.tenant_id)) return void res.status(404).json(NOT_FOUND);
    res.json({ job: await retryJob(id.data, actorOf(req)) });
  } catch (err) { fail(res, err, 'publishing_job_retry_failed'); }
});

router.post('/api/admin/publishing/jobs/:id/cancel', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = CancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    const job = await PublishingJob.findByPk(id.data);
    if (!job || !scopeAllows(scope, job.tenant_id)) return void res.status(404).json(NOT_FOUND);
    res.json({ job: await cancelJob(id.data, actorOf(req), parsed.data.reason ?? null) });
  } catch (err) { fail(res, err, 'publishing_job_cancel_failed'); }
});

router.get('/api/admin/publishing/publications', requireAdmin, async (req: Request, res: Response) => {
  const parsed = PublicationsQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') return void res.json({ publications: [], scope_mode: scope.mode });
    const where: Record<string, unknown> = {};
    if (scope.mode === 'scoped') where.tenant_id = scope.tenantIds;
    if (parsed.data.item_id) where.content_item_id = parsed.data.item_id;
    if (parsed.data.status) where.current_status = parsed.data.status;
    const publications = await ExternalPublication.findAll({ where, order: [['created_at', 'DESC']], limit: parsed.data.limit });
    res.json({ publications, scope_mode: scope.mode });
  } catch (err) { fail(res, err, 'publishing_publications_list_failed'); }
});

router.post('/api/admin/publishing/publications/:id/handoff-complete', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error.flatten());
  const parsed = HandoffCompleteSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    const pub = await ExternalPublication.findByPk(id.data);
    if (!pub || !scopeAllows(scope, pub.tenant_id)) return void res.status(404).json(NOT_FOUND);
    const updated = await completeHandoff(id.data, { externalId: parsed.data.external_id, permalink: parsed.data.permalink ?? null }, actorOf(req));
    res.json({ publication: updated });
  } catch (err) { fail(res, err, 'publishing_handoff_complete_failed'); }
});

// A manual tick of the worker. Same kill switch, same adapters, same ledger as the cron.
router.post('/api/admin/publishing/run', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await runDueJobs({ workerId: `manual-${req.admin?.email ?? 'admin'}` });
    res.json({ result });
  } catch (err) { fail(res, err, 'publishing_manual_run_failed'); }
});

export default router;
