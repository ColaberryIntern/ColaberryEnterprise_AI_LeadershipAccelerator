/** Enterprise Intelligence Layer (Phase 6) — admin routes. /api/admin/brain
 *  (namespaced away from the existing Cory /api/admin/intelligence). */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleIngest, handleStats, handleSearch, handleNode, handleExplain, handleByType,
  handleReason, handleTimeline, handleListDecisions, handleCreateDecision, handleUpdateDecision, handleTraceDecision,
} from '../../controllers/enterpriseIntelligenceController';

const router = Router();

router.post('/api/admin/brain/ingest', requireAdmin, handleIngest);
router.get('/api/admin/brain/graph/stats', requireAdmin, handleStats);
router.get('/api/admin/brain/search', requireAdmin, handleSearch);
router.get('/api/admin/brain/timeline', requireAdmin, handleTimeline);
router.get('/api/admin/brain/reason/:domain', requireAdmin, handleReason);
router.get('/api/admin/brain/type/:type', requireAdmin, handleByType);
router.get('/api/admin/brain/decisions', requireAdmin, handleListDecisions);
router.post('/api/admin/brain/decisions', requireAdmin, handleCreateDecision);
router.get('/api/admin/brain/decisions/:id/trace', requireAdmin, handleTraceDecision);
router.put('/api/admin/brain/decisions/:id', requireAdmin, handleUpdateDecision);
router.get('/api/admin/brain/explain/:id', requireAdmin, handleExplain);
router.get('/api/admin/brain/node/:id', requireAdmin, handleNode);

export default router;
