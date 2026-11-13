/**
 * hireHeadlineController - admins review the headline a candidate proposed in their Hire studio.
 *
 *   GET  /api/admin/career/hire-headline-drafts                 the pending drafts
 *   POST /api/admin/career/hire-headline-drafts/:enrollmentId   { decision, draft }
 *
 * Both sit behind requireAdmin, like the Hire spotlight: the headline is what employers read
 * first, so the endorsement stays with admins rather than the broader mentor reviewer gate.
 * `draft` is the text the admin was shown; the service refuses (409) if it changed since.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { decideHeadline, listHeadlineDrafts } from '../services/hire/hireHeadlineReview';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const headlineDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  draft: z.string().trim().min(1).max(90),
}).strict();

// `e` is any thrown value; the service throws errors carrying `status` and `error_class`.
function fail(res: Response, e: any, next: NextFunction): void {
  if (e?.status) {
    res.status(e.status).json({ error: e.message || 'error', error_class: e.error_class });
    return;
  }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'hire_headline_controller_error', outcome: 'failure',
    error_class: e?.error_class || e?.name || 'Error', context: { message: e?.message },
  }));
  next(e);
}

export async function handleListHeadlineDrafts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ ok: true, drafts: await listHeadlineDrafts() });
  } catch (e) { fail(res, e, next); }
}

export async function handleDecideHeadline(req: Request, res: Response, next: NextFunction): Promise<void> {
  const enrollmentId = String(req.params.enrollmentId || '');
  if (!UUID.test(enrollmentId)) {
    res.status(400).json({ error: 'enrollmentId must be a uuid' });
    return;
  }
  const parsed = headlineDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'body must be exactly { decision: "approve" | "reject", draft: the text you reviewed }' });
    return;
  }
  const who: any = req.admin || {};
  try {
    await decideHeadline(enrollmentId, parsed.data.decision, parsed.data.draft, String(who.email || who.sub || 'admin'));
    res.json({ ok: true });
  } catch (e) { fail(res, e, next); }
}
