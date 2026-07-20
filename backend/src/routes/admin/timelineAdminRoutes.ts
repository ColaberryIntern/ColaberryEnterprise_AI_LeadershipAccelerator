/**
 * Timeline Engine — Orchestration admin routes (the author side of the Classroom).
 * All admin-only. Kept in its own file so orchestrationRoutes.ts doesn't grow.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListTimeline, handleCreateCard, handleUpdateCard,
  handleDeleteCard, handleReorderCards, handleCloneCard, handleGenerateCardContent,
  handleGenerateVideoDraft, handleGenerateCourseDraft, handleGetBlueprintContext,
  handleGetSectionRules, handleSetSectionRule,
} from '../../controllers/timelineAdminController';

const router = Router();

// Board: the whole shared curriculum (all batches) + the authorable type registry.
router.get('/api/admin/orchestration/timeline', requireAdmin, handleListTimeline);
// Read-only week Blueprint context (auto-injected into every generator).
router.get('/api/admin/orchestration/timeline/blueprint-context', requireAdmin, handleGetBlueprintContext);
// Section gating rules (per program × bucket): list + upsert one section.
router.get('/api/admin/orchestration/timeline/section-rules', requireAdmin, handleGetSectionRules);
router.put('/api/admin/orchestration/timeline/section-rules', requireAdmin, handleSetSectionRule);

// Card CRUD + reorder/clone.
router.post('/api/admin/orchestration/timeline/cards', requireAdmin, handleCreateCard);
router.put('/api/admin/orchestration/timeline/cards/reorder', requireAdmin, handleReorderCards);
router.post('/api/admin/orchestration/timeline/cards/:id/clone', requireAdmin, handleCloneCard);
// One-click "make a video from a title" — returns a draft (no card needed yet).
router.post('/api/admin/orchestration/timeline/generate-video-draft', requireAdmin, handleGenerateVideoDraft);
router.post('/api/admin/orchestration/timeline/generate-course-draft', requireAdmin, handleGenerateCourseDraft);
router.post('/api/admin/orchestration/timeline/cards/:id/generate', requireAdmin, handleGenerateCardContent);
router.put('/api/admin/orchestration/timeline/cards/:id', requireAdmin, handleUpdateCard);
router.delete('/api/admin/orchestration/timeline/cards/:id', requireAdmin, handleDeleteCard);

export default router;
