import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { requireCareerReviewer } from '../../middlewares/requireCareerReviewer';
import {
  handleGetReviewQueue,
  handleReviewDecision,
  handleGetRecordForReview,
} from '../../controllers/careerPublicationController';
import { grantScope, revokeScope, listScopes } from '../../services/career/careerMentorScopeService';

const router = Router();

/**
 * Portfolio review — TWO tiers of access, deliberately different.
 *
 *   requireCareerReviewer  admins AND mentors. Mentors additionally see only the
 *                          learners they are over; that scope check lives in the
 *                          controller, per learner, not here.
 *   requireAdmin           granting and revoking mentor privilege. A mentor must never
 *                          be able to widen their own scope, so these three routes stay
 *                          admin-only even though they sit in the same file.
 *
 * Clients/employers reach none of this. With no admin token they fail the first check,
 * and their only career surface is the published Capstone Record at /p/:slug, served by
 * Capstone's own public reader.
 */

router.get('/api/admin/career/review-queue', requireCareerReviewer, handleGetReviewQueue);
router.get('/api/admin/career/review/:recordId/record', requireCareerReviewer, handleGetRecordForReview);
router.post('/api/admin/career/review/:recordId', requireCareerReviewer, handleReviewDecision);

// ── Mentor privilege, admin-only ───────────────────────────────────────────

const SCOPE_TYPES = new Set(['cohort', 'enrollment']);

/** GET /api/admin/career/mentors/:mentorEnrollmentId/scopes — what can this mentor see? */
router.get('/api/admin/career/mentors/:mentorEnrollmentId/scopes', requireAdmin, async (req: Request, res: Response) => {
  try {
    res.json({ ok: true, scopes: await listScopes(String(req.params.mentorEnrollmentId)) });
  } catch (err: any) {
    console.error('[CareerReview] listScopes failed:', err?.message);
    res.status(500).json({ error: 'Failed to load mentor scopes' });
  }
});

/** POST /api/admin/career/mentors/:mentorEnrollmentId/scopes — grant a cohort or a learner. */
router.post('/api/admin/career/mentors/:mentorEnrollmentId/scopes', requireAdmin, async (req: Request, res: Response) => {
  const scopeType = String(req.body?.scope_type || '');
  const scopeId = String(req.body?.scope_id || '');
  if (!SCOPE_TYPES.has(scopeType) || !scopeId) {
    res.status(400).json({ error: 'scope_type must be cohort or enrollment, and scope_id is required' });
    return;
  }
  try {
    const admin: any = req.admin || {};
    const result = await grantScope({
      mentorEnrollmentId: String(req.params.mentorEnrollmentId),
      scopeType: scopeType as 'cohort' | 'enrollment',
      scopeId,
      grantedBy: String(admin.email || admin.sub || 'admin'),
    });
    // `granted: false` means it was already live — an idempotent no-op, not a failure.
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CareerReview] grantScope failed:', err?.message);
    res.status(500).json({ error: 'Failed to grant mentor scope' });
  }
});

/** DELETE /api/admin/career/mentors/:mentorEnrollmentId/scopes — revoke (stamps, never deletes). */
router.delete('/api/admin/career/mentors/:mentorEnrollmentId/scopes', requireAdmin, async (req: Request, res: Response) => {
  const scopeType = String(req.body?.scope_type || req.query.scope_type || '');
  const scopeId = String(req.body?.scope_id || req.query.scope_id || '');
  if (!SCOPE_TYPES.has(scopeType) || !scopeId) {
    res.status(400).json({ error: 'scope_type must be cohort or enrollment, and scope_id is required' });
    return;
  }
  try {
    const admin: any = req.admin || {};
    const result = await revokeScope(
      String(req.params.mentorEnrollmentId),
      scopeType as 'cohort' | 'enrollment',
      scopeId,
      String(admin.email || admin.sub || 'admin'),
    );
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CareerReview] revokeScope failed:', err?.message);
    res.status(500).json({ error: 'Failed to revoke mentor scope' });
  }
});

export default router;
