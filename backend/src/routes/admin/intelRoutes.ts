/**
 * Intelligence pipeline admin routes — manual triggers for the continuously-
 * generating intelligence curriculum types. All admin-only.
 *
 * POST /api/admin/intel/ai-news/refresh  — run the AI News Flash pipeline now.
 *   body/query: { dryRun?, maxCards?, force? }. `force` materializes cards even
 *   when AI_NEWS_INGEST_ENABLED is off (for a supervised, on-demand run).
 */
import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

router.post('/api/admin/intel/ai-news/refresh', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { refreshAiNews } = await import('../../services/intel/aiNewsIngestionService');
    const body = { ...(req.query as any), ...(req.body as any) };
    const dryRun = body.dryRun === true || body.dryRun === 'true' || body.dry === '1';
    const force = body.force === true || body.force === 'true';
    const maxCards = body.maxCards != null ? Math.max(0, Math.min(50, Number(body.maxCards) || 0)) : undefined;
    const result = await refreshAiNews({ dryRun, force, maxCards });
    return res.json({ ok: true, result });
  } catch (err: any) {
    console.error('[intelRoutes] ai-news refresh failed:', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'refresh failed' });
  }
});

export default router;
