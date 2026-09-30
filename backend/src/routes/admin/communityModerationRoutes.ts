import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

/**
 * GET /api/admin/community/reports
 * Moderation view — every still-visible post with at least one report,
 * most-reported first.
 */
router.get('/api/admin/community/reports', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { listReportedPosts } = await import('../../services/communityModerationService');
    const reports = await listReportedPosts();
    res.json({ reports });
  } catch (err: any) {
    console.error('[CommunityModerationRoutes] GET /community/reports error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/community/posts/:postId/remove
 * Staff removes a reported post. Idempotent — removing an already-removed
 * post is a no-op. Audited automatically via auditMiddleware (adminRoutes.ts).
 */
router.post('/api/admin/community/posts/:postId/remove', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { removePost } = await import('../../services/communityModerationService');
    const result = await removePost(req.admin!.sub, req.params.postId as string);
    res.json(result);
  } catch (err: any) {
    const status = err?.error_class === 'NotFoundError' ? 404 : 500;
    console.error('[CommunityModerationRoutes] POST /community/posts/:postId/remove error:', err.message);
    res.status(status).json({ error: err.message });
  }
});

export default router;
