import { Router } from 'express';
import { requireFullAdmin } from '../middlewares/authMiddleware';
import { handleChoose, handleGetPlan, handlePlanSetup, handleRegenerate, handleStartPlan } from '../controllers/weeklyLivePlanController';

/** Weekly Live plans (WL3.4). Mounted above adminRoutes, so the section gate never runs: requireFullAdmin is the guard. */
const router = Router();

router.get('/api/admin/live/plan-setup', requireFullAdmin, handlePlanSetup);
router.post('/api/admin/live/plans', requireFullAdmin, handleStartPlan);
router.get('/api/admin/live/plans/:id', requireFullAdmin, handleGetPlan);
router.post('/api/admin/live/plans/:id/regenerate', requireFullAdmin, handleRegenerate);
router.post('/api/admin/live/plans/:id/choose', requireFullAdmin, handleChoose);

export default router;
