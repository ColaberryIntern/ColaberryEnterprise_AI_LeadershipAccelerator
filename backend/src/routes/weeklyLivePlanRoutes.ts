import { Router } from 'express';
import { requireFullAdmin } from '../middlewares/authMiddleware';
import { handleApproveBrief, handleGetBrief, handleStartBrief } from '../controllers/weeklyLiveBriefController';
import { handleDeckStatus, handleStartDeck } from '../controllers/weeklyLiveDeckController';
import { handleChoose, handleGetPlan, handlePlanSetup, handleRegenerate, handleStartPlan } from '../controllers/weeklyLivePlanController';

/** Weekly Live plans (WL3.4) their decks (WL4.2) and Jackie's briefs (WL4.4). Mounted above adminRoutes, so the section gate never runs: requireFullAdmin is the guard. */
const router = Router();

router.get('/api/admin/live/plan-setup', requireFullAdmin, handlePlanSetup);
router.post('/api/admin/live/plans', requireFullAdmin, handleStartPlan);
router.get('/api/admin/live/plans/:id', requireFullAdmin, handleGetPlan);
router.post('/api/admin/live/plans/:id/regenerate', requireFullAdmin, handleRegenerate);
router.post('/api/admin/live/plans/:id/choose', requireFullAdmin, handleChoose);
router.get('/api/admin/live/plans/:id/deck', requireFullAdmin, handleDeckStatus);
router.post('/api/admin/live/plans/:id/deck', requireFullAdmin, handleStartDeck);
router.get('/api/admin/live/plans/:id/brief', requireFullAdmin, handleGetBrief);
router.post('/api/admin/live/plans/:id/brief', requireFullAdmin, handleStartBrief);
router.post('/api/admin/live/plans/:id/brief/approve', requireFullAdmin, handleApproveBrief);

export default router;
