import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import AnthropicContentRegistry from '../../models/AnthropicContentRegistry';
import AnthropicChangeEvent from '../../models/AnthropicChangeEvent';
import { runContentWatcher } from '../../services/anthropicContentWatcher';
import { runChangeDetector } from '../../services/anthropicChangeDetector';
import { runCurriculumImpactAgent } from '../../services/anthropicCurriculumImpactAgent';

const router = Router();

// Manual trigger — runs the content watcher immediately and returns a summary.
router.post('/api/admin/sync/anthropic-content', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await runContentWatcher();
    res.json({
      ok: true,
      checked: result.checked,
      changed: result.changed,
      errors: result.errors,
      results: result.results,
    });
  } catch (err: any) {
    console.error('[anthropicRoutes] manual sync failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// View all registry rows ordered by content_type then title.
router.get('/api/admin/anthropic/registry', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await AnthropicContentRegistry.findAll({
      order: [['content_type', 'ASC'], ['title', 'ASC']],
    });
    res.json({ ok: true, count: rows.length, rows });
  } catch (err: any) {
    console.error('[anthropicRoutes] registry fetch failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// L2: manually trigger the change detector
router.post('/api/admin/sync/anthropic-detect', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await runChangeDetector();
    res.json({
      ok: true,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
      events: result.events,
    });
  } catch (err: any) {
    console.error('[anthropicRoutes] manual detect failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// L2: list change events, newest first. Optional ?content_type= and ?limit= filters.
router.get('/api/admin/anthropic/change-events', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const where: Record<string, unknown> = {};
    if (req.query.content_type) where.content_type = req.query.content_type;

    const rows = await AnthropicChangeEvent.findAll({
      where,
      order: [['processed_at', 'DESC']],
      limit,
    });
    res.json({ ok: true, count: rows.length, rows });
  } catch (err: any) {
    console.error('[anthropicRoutes] change-events fetch failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// L3: manually trigger the curriculum impact agent
router.post('/api/admin/sync/anthropic-impact', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await runCurriculumImpactAgent();
    res.json({
      ok: true,
      scored: result.scored,
      alerted: result.alerted,
      errors: result.errors,
      events: result.events,
    });
  } catch (err: any) {
    console.error('[anthropicRoutes] manual impact failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
