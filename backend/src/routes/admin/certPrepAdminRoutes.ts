/**
 * certPrepAdminRoutes — the instructor/admin surface for Cert Prep.
 *
 *   GET   /api/admin/cert-prep/cohorts/:cohortId/readiness   — per-student readiness
 *   GET   /api/admin/cert-prep/cohorts/:cohortId/weakness    — cohort domain weakness
 *   GET   /api/admin/cert-prep/cohorts/:cohortId/not-started — past the fence, never started
 *   GET   /api/admin/cert-prep/bank                          — bank health
 *   GET   /api/admin/cert-prep/items                         — per-item statistics
 *   GET   /api/admin/cert-prep/questions                     — review queue
 *   POST  /api/admin/cert-prep/questions/:key/:rev/status    — approve / retire a revision
 *   GET   /api/admin/cert-prep/evidence/pending              — evidence awaiting a decision
 *   POST  /api/admin/cert-prep/evidence/:id/state            — verify / reject a mapping
 *   GET   /api/admin/cert-prep/audit                         — who approved what, when
 *
 * AUTHORIZATION. `requireAdmin` on every route, and the path prefix is
 * registered in mgmtSectionGate's PATH_SECTION table under 'program' — the same
 * section as curriculum and cohorts. That registration is not decoration: the
 * gate is deny-by-default for scoped management roles, so an unmapped prefix
 * 403s every scoped token with an error nothing in the code explains.
 *
 * THE WRITE ROUTES ARE THE POINT OF THIS SURFACE. A question cannot reach a
 * student until a named human approves it, and a student's build evidence does
 * not count toward readiness until a named human verifies it. Both write paths
 * record WHO decided and when. There is deliberately no bulk-approve endpoint:
 * approving forty questions with one click is not review, and the whole value of
 * the gate is that somebody read them.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { env } from '../../config/env';
import {
  getCohortReadiness, getCohortDomainWeakness, getNotStarted,
  getItemStatistics, getBankHealth, getAuditTrail, getReadinessHistory,
} from '../../services/certPrep/certAdminService';
import { getCurrentBlueprint } from '../../services/certPrep/certBlueprintService';
import { setReviewStatus } from '../../services/certPrep/certQuestionBankService';
import { setMappingState, listPendingForReview } from '../../services/certPrep/certEvidenceService';
import CertQuestionRevision from '../../models/CertQuestionRevision';
import { Op } from 'sequelize';

const router = Router();

/** The admin who is acting, for the audit trail. Never taken from the body. */
const actor = (req: Request): string =>
  (req as any).admin?.email || (req as any).admin?.sub || 'unknown-admin';

function gate(res: Response): boolean {
  if (!env.certPrepEnabled) {
    res.status(404).json({ error: 'Cert Prep is not enabled' });
    return false;
  }
  res.set('Cache-Control', 'no-store');
  return true;
}

function fail(res: Response, err: any, next: NextFunction) {
  if (err?.status && err?.code) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  next(err);
}

// ── cohort operations ────────────────────────────────────────────────────────

router.get('/api/admin/cert-prep/cohorts/:cohortId/readiness', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    res.json({ rows: await getCohortReadiness(String(req.params.cohortId)) });
  } catch (err) { fail(res, err, next); }
});

router.get('/api/admin/cert-prep/cohorts/:cohortId/weakness', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    res.json({ domains: await getCohortDomainWeakness(String(req.params.cohortId)) });
  } catch (err) { fail(res, err, next); }
});

router.get('/api/admin/cert-prep/cohorts/:cohortId/not-started', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    res.json({ students: await getNotStarted(String(req.params.cohortId)) });
  } catch (err) { fail(res, err, next); }
});

router.get('/api/admin/cert-prep/students/:enrollmentId/history', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    res.json({ snapshots: await getReadinessHistory(String(req.params.enrollmentId)) });
  } catch (err) { fail(res, err, next); }
});

// ── bank health and item quality ─────────────────────────────────────────────

router.get('/api/admin/cert-prep/bank', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    const blueprint = await getCurrentBlueprint();
    if (!blueprint) {
      res.status(409).json({ error: 'No certification blueprint is configured', code: 'CERT_NO_BLUEPRINT' });
      return;
    }
    const health = await getBankHealth(
      blueprint.track.blueprint_version,
      blueprint.domains.map((d) => d.domain_id),
    );
    res.json({ blueprint_version: blueprint.track.blueprint_version, ...health });
  } catch (err) { fail(res, err, next); }
});

router.get('/api/admin/cert-prep/items', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    const version = req.query.blueprint_version ? String(req.query.blueprint_version) : undefined;
    res.json({ items: await getItemStatistics(version) });
  } catch (err) { fail(res, err, next); }
});

// ── question review ──────────────────────────────────────────────────────────

router.get('/api/admin/cert-prep/questions', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    const status = req.query.status ? String(req.query.status) : 'draft';
    const rows = await CertQuestionRevision.findAll({
      where: { review_status: status },
      order: [['created_at', 'ASC']],
      limit: 200,
    });
    res.json({ questions: rows });
  } catch (err) { fail(res, err, next); }
});

const statusSchema = z.object({
  status: z.enum(['draft', 'in_review', 'approved', 'retired']),
});

/**
 * Move one revision through the lifecycle.
 *
 * The reviewer is taken from the authenticated admin, NEVER from the body — an
 * approval attributed to whoever the caller says is not an audit trail. One
 * revision per request, deliberately: see the header on bulk approval.
 */
router.post('/api/admin/cert-prep/questions/:key/:rev/status', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', code: 'CERT_BAD_REQUEST', issues: parsed.error.issues });
    return;
  }
  try {
    const row = await setReviewStatus(
      String(req.params.key),
      Number(req.params.rev),
      parsed.data.status,
      actor(req),
    );
    if (!row) { res.status(404).json({ error: 'Revision not found', code: 'CERT_REVISION_NOT_FOUND' }); return; }
    res.json({ question_key: row.question_key, revision: row.revision, review_status: row.review_status, reviewer: row.reviewer });
  } catch (err) { fail(res, err, next); }
});

// ── evidence verification ────────────────────────────────────────────────────

router.get('/api/admin/cert-prep/evidence/pending', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    const ids = String(req.query.enrollment_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    res.json({ pending: await listPendingForReview(ids) });
  } catch (err) { fail(res, err, next); }
});

const evidenceSchema = z.object({
  state: z.enum(['verified', 'rejected']),
  reason: z.string().max(500).optional(),
});

router.post('/api/admin/cert-prep/evidence/:id/state', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  const parsed = evidenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', code: 'CERT_BAD_REQUEST', issues: parsed.error.issues });
    return;
  }
  try {
    const row = await setMappingState(String(req.params.id), parsed.data.state, actor(req), parsed.data.reason);
    if (!row) { res.status(404).json({ error: 'Mapping not found', code: 'CERT_MAPPING_NOT_FOUND' }); return; }
    res.json({ id: row.id, mapping_state: row.mapping_state, verified_by: row.verified_by, verified_at: row.verified_at });
  } catch (err) { fail(res, err, next); }
});

// ── audit ────────────────────────────────────────────────────────────────────

router.get('/api/admin/cert-prep/audit', requireAdmin, async (req, res, next) => {
  if (!gate(res)) return;
  try {
    res.json({ entries: await getAuditTrail() });
  } catch (err) { fail(res, err, next); }
});

export default router;
