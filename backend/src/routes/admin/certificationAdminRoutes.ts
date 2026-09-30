/**
 * certificationAdminRoutes — the staff side of certification claims and the
 * milestone-ladder recompute (docs/POINTS_LADDER_DECISIONS.md).
 *
 *   GET  /api/admin/cert-prep/certifications?status=pending   the review queue
 *   GET  /api/admin/cert-prep/certifications/:id/file          the uploaded file
 *   POST /api/admin/cert-prep/certifications/:id/review        { decision, note }
 *   POST /api/admin/progression/recompute                     { enrollment_id } | {} (all)
 *
 * AUTHORIZATION. `requireAdmin` on every route. The certification paths sit
 * under `/api/admin/cert-prep`, which mgmtSectionGate already maps to 'program';
 * `/api/admin/progression` has its own row there. The reviewer recorded on the
 * row is the admin's email (or sub), the same actor convention the case-study
 * routes use — an approval is a named human decision.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  listCertifications, reviewCertification, getCertificationFile, CertificationError,
} from '../../services/certification/studentCertificationService';
import { recomputeAllMilestonePromotions } from '../../services/progression/milestoneSweep';
import { evaluateForEnrollment } from '../../services/progression/promotionService';
import { env } from '../../config/env';

const router = Router();

function fail(res: Response, err: unknown, next: NextFunction): void {
  if (err instanceof CertificationError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  next(err);
}

function actorOf(req: Request): string {
  const r = req as Request & { admin?: { email?: string; sub?: string } };
  return (r.admin?.email || r.admin?.sub || '').trim();
}

const ListQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') });

router.get('/api/admin/cert-prep/certifications', requireAdmin, async (req, res, next) => {
  try {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_query', message: parsed.error.issues[0]?.message }); return; }
    res.json({ certifications: await listCertifications(parsed.data.status) });
  } catch (err) { fail(res, err, next); }
});

router.get('/api/admin/cert-prep/certifications/:id/file', requireAdmin, async (req, res, next) => {
  try {
    const file = await getCertificationFile(String(req.params.id), null);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${file.download}"`);
    res.sendFile(file.path);
  } catch (err) { fail(res, err, next); }
});

const ReviewBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).optional().nullable(),
});

router.post('/api/admin/cert-prep/certifications/:id/review', requireAdmin, async (req, res, next) => {
  try {
    const parsed = ReviewBody.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: 'invalid_body', message: parsed.error.issues[0]?.message }); return; }
    const actor = actorOf(req);
    if (!actor) { res.status(400).json({ error: 'reviewer_required', message: 'The review must be attributed to a named admin.' }); return; }
    res.json(await reviewCertification(String(req.params.id), parsed.data.decision, actor, parsed.data.note ?? null));
  } catch (err) { fail(res, err, next); }
});

const RecomputeBody = z.object({ enrollment_id: z.string().uuid().optional() });

/**
 * Re-run the ladder for one student or for everyone with a `student_level`
 * row. Idempotent by construction (milestones latch, ranks never lower), so a
 * second click changes nothing. With the milestone flag OFF this still runs
 * the legacy evaluator, so the button is never a no-op that looks like one.
 */
router.post('/api/admin/progression/recompute', requireAdmin, async (req, res, next) => {
  try {
    const parsed = RecomputeBody.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: 'invalid_body', message: parsed.error.issues[0]?.message }); return; }
    if (parsed.data.enrollment_id) {
      const out = await evaluateForEnrollment(parsed.data.enrollment_id);
      res.json({ scope: 'one', ladder: env.milestoneLadderEnabled ? 'milestone' : 'legacy', result: { level: out.level, rank: out.rank, promoted: out.promoted } });
      return;
    }
    const summary = await recomputeAllMilestonePromotions({ triggeredBy: actorOf(req) || 'admin' });
    res.json({ scope: 'all', ...summary });
  } catch (err) { next(err); }
});

export default router;
