import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleGetCampaignMetrics } from '../../controllers/adminMarketingController';

const router = Router();

router.get('/api/admin/marketing/campaigns', requireAdmin, handleGetCampaignMetrics);

export default router;
