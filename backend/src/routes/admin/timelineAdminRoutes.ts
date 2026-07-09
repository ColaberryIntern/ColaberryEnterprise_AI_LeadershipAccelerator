/**
 * Timeline Engine — Orchestration admin routes (the author side of the Classroom).
 * All admin-only. Kept in its own file so orchestrationRoutes.ts doesn't grow.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListTimeline, handleCreateCard, handleUpdateCard,
  handleDeleteCard, handleReorderCards, handleCloneCard,
} from '../../controllers/timelineAdminController';

const router = Router();

// Board: the whole shared curriculum (all batches) + the authorable type registry.
router.get('/api/admin/orchestration/timeline', requireAdmin, handleListTimeline);

// Card CRUD + reorder/clone.
router.post('/api/admin/orchestration/timeline/cards', requireAdmin, handleCreateCard);
router.put('/api/admin/orchestration/timeline/cards/reorder', requireAdmin, handleReorderCards);
router.post('/api/admin/orchestration/timeline/cards/:id/clone', requireAdmin, handleCloneCard);
router.put('/api/admin/orchestration/timeline/cards/:id', requireAdmin, handleUpdateCard);
router.delete('/api/admin/orchestration/timeline/cards/:id', requireAdmin, handleDeleteCard);

export default router;
