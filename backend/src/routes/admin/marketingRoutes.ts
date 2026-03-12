import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleGetCampaignMetrics } from '../../controllers/adminMarketingController';
import { getChannelROIAggregation, flagUnregisteredTraffic } from '../../services/campaignLinkService';

const router = Router();

router.get('/api/admin/marketing/campaigns', requireAdmin, handleGetCampaignMetrics);

router.get('/api/admin/marketing/channel-roi', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const channels = await getChannelROIAggregation();
    res.json({ channels });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/marketing/unregistered-traffic', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const flagged = await flagUnregisteredTraffic();
    res.json({ flagged_count: flagged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
