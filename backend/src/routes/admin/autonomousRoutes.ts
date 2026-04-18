import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { listInsights, refreshInsights, applyInsight } from '../../controllers/autonomousIngestController';

const router = Router();

router.get('/api/admin/autonomous/insights', requireAdmin, listInsights);
router.post('/api/admin/autonomous/insights/refresh', requireAdmin, refreshInsights);
router.post('/api/admin/autonomous/insights/:id/apply', requireAdmin, applyInsight);

export default router;
