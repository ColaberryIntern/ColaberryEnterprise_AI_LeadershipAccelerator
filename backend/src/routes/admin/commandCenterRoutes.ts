import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getCommandCenterSummary } from '../../services/adminOs/commandCenterService';
import { getVisitorKpis } from '../../services/visitorKpiService';
import { countLiveVisitors } from '../../services/visitorAnalyticsService';
import { getDashboardStats } from '../../services/cohortService';

/**
 * Command Center — the executive home for the Admin OS.
 *
 * Gated on the `dashboard` section (see mgmtSectionGate's PATH_SECTION), which
 * is deliberate: every scoped management role holds `dashboard`, and none holds
 * `war_room`. Building this on the War Room's section would have stripped the
 * landing page from five of eight roles and bounced them on login, because
 * LANDING_PREFERENCE starts at /admin/dashboard.
 */
const router = Router();

/**
 * Window is validated, not trusted.
 *
 * It reaches a SQL interval, and an unbounded value is both an injection surface
 * and a way to ask the database for a scan of all history from a query string.
 */
const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

router.get('/api/admin/command-center/summary', requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'days must be a whole number between 1 and 365.' });
    return;
  }

  try {
    const summary = await getCommandCenterSummary(
      {
        getVisitorKpis: (days) => getVisitorKpis(days) as never,
        countLiveVisitors: () => countLiveVisitors(),
        getDashboardStats: () => getDashboardStats() as Promise<Record<string, unknown>>,
      },
      parsed.data.days,
    );
    res.json(summary);
  } catch (error) {
    // The service settles each source individually, so reaching here means the
    // composition itself broke rather than one metric. A 500 is correct: the
    // page must not render an empty summary that looks like a quiet day.
    res.status(500).json({
      error: 'Could not build the Command Center summary.',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    });
  }
});

export default router;
