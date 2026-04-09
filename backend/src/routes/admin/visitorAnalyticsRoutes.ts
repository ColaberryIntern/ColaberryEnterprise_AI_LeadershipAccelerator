import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// ── Dashboard Summary ─────────────────────────────────────────────────────────

router.get('/api/admin/visitor-analytics/dashboard', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getVisitorDashboard } = await import('../../services/visitorAnalyticsService');
    const days = Math.max(1, parseInt(req.query.days as string, 10) || 30);
    const data = await getVisitorDashboard(days);
    res.json(data);
  } catch (err: any) {
    console.error('[VisitorAnalytics] Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load visitor dashboard' });
  }
});

// ── Conversion Funnel ─────────────────────────────────────────────────────────

router.get('/api/admin/visitor-analytics/funnel', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getConversionFunnel } = await import('../../services/visitorAnalyticsService');
    const days = Math.max(1, parseInt(req.query.days as string, 10) || 30);
    const data = await getConversionFunnel(days);
    res.json(data);
  } catch (err: any) {
    console.error('[VisitorAnalytics] Funnel error:', err.message);
    res.status(500).json({ error: 'Failed to load conversion funnel' });
  }
});

// ── Top Pages ─────────────────────────────────────────────────────────────────

router.get('/api/admin/visitor-analytics/pages', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getTopPages } = await import('../../services/visitorAnalyticsService');
    const days = Math.max(1, parseInt(req.query.days as string, 10) || 30);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const data = await getTopPages(days, limit);
    res.json(data);
  } catch (err: any) {
    console.error('[VisitorAnalytics] Top pages error:', err.message);
    res.status(500).json({ error: 'Failed to load top pages' });
  }
});

// ── Device Breakdown ──────────────────────────────────────────────────────────

router.get('/api/admin/visitor-analytics/devices', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getDeviceBreakdown } = await import('../../services/visitorAnalyticsService');
    const days = Math.max(1, parseInt(req.query.days as string, 10) || 30);
    const data = await getDeviceBreakdown(days);
    res.json(data);
  } catch (err: any) {
    console.error('[VisitorAnalytics] Device breakdown error:', err.message);
    res.status(500).json({ error: 'Failed to load device breakdown' });
  }
});

export default router;
