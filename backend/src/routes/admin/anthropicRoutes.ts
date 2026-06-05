import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import AnthropicContentRegistry from '../../models/AnthropicContentRegistry';
import { runContentWatcher } from '../../services/anthropicContentWatcher';

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

export default router;
