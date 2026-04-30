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

// ── Page Funnel Drop-off (per landing page: visits → scroll → CTA → modal → book) ──

router.get('/api/admin/visitor-analytics/page-funnel', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { sequelize } = require('../../config/database');
    const days = Math.max(1, Math.min(90, parseInt(req.query.days as string, 10) || 7));
    const sinceClause = `created_at >= NOW() - INTERVAL '${days} days'`;

    const rows = await sequelize.query(
      `SELECT
         page_path,
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'pageview') AS visitors,
         COUNT(*) FILTER (WHERE event_type = 'pageview') AS pageviews,
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'scroll') AS scrolled_visitors,
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type IN ('cta_click', 'click')) AS clicked_visitors,
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'cta_click') AS cta_click_visitors,
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'booking_modal_opened') AS modal_open_visitors,
         COUNT(*) FILTER (WHERE event_type = 'heartbeat') AS heartbeats
       FROM page_events
       WHERE ${sinceClause}
         AND page_path NOT LIKE '/admin%'
         AND page_path NOT LIKE '/portal%'
       GROUP BY page_path
       HAVING COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'pageview') > 0
       ORDER BY visitors DESC
       LIMIT 30`,
      { type: 'SELECT' }
    );

    // Also pull bookings per page_origin in the same window
    const bookings = await sequelize.query(
      `SELECT page_origin, COUNT(*) AS bookings
       FROM strategy_calls
       WHERE created_at >= NOW() - INTERVAL '${days} days' AND page_origin IS NOT NULL
       GROUP BY page_origin`,
      { type: 'SELECT' }
    ) as any[];
    const bookingsByPath: Record<string, number> = {};
    for (const b of bookings) bookingsByPath[b.page_origin] = Number(b.bookings);

    const enriched = (rows as any[]).map((r) => {
      const visitors = Number(r.visitors) || 0;
      const scrolled = Number(r.scrolled_visitors) || 0;
      const clicked = Number(r.clicked_visitors) || 0;
      const ctaClicked = Number(r.cta_click_visitors) || 0;
      const modal = Number(r.modal_open_visitors) || 0;
      const booked = bookingsByPath[r.page_path] || 0;
      const pct = (n: number) => visitors > 0 ? Math.round((n / visitors) * 100) : 0;
      return {
        page_path: r.page_path,
        visitors,
        pageviews: Number(r.pageviews) || 0,
        scrolled, scrolled_pct: pct(scrolled),
        clicked, clicked_pct: pct(clicked),
        cta_clicked: ctaClicked, cta_clicked_pct: pct(ctaClicked),
        modal_opened: modal, modal_opened_pct: pct(modal),
        booked, booked_pct: pct(booked),
        heartbeats: Number(r.heartbeats) || 0,
      };
    });

    res.json({ days, pages: enriched });
  } catch (err: any) {
    console.error('[VisitorAnalytics] Page funnel error:', err.message);
    res.status(500).json({ error: 'Failed to load page funnel' });
  }
});

export default router;
