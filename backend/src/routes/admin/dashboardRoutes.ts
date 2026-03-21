import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getCampaignActivitySummary } from '../../services/dashboardService';

const router = Router();

router.get('/api/admin/dashboard/campaign-activity', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const summary = await getCampaignActivitySummary();
    res.json(summary);
  } catch (err: any) {
    console.error('[Dashboard] Campaign activity query failed:', err.message);
    res.status(500).json({ error: 'Failed to load campaign activity' });
  }
});

export default router;
