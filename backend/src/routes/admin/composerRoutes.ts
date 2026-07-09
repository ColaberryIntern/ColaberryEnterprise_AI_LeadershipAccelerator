/**
 * Curriculum Composer (Phase 2) — admin routes. All admin-only.
 * Order matters: specific paths before the /:id parameter routes.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handlePalette, handleArchitectJourney, handleQuickGenerate, handleFillCard,
  handleListBlueprints, handleCreateBlueprint, handleGetBlueprint, handleUpdateBlueprint, handleDeleteBlueprint,
  handleGenerate, handleValidate, handlePublish,
} from '../../controllers/composerController';

const router = Router();

router.get('/api/admin/composer/palette', requireAdmin, handlePalette);
router.get('/api/admin/composer/architect-journey', requireAdmin, handleArchitectJourney);
router.post('/api/admin/composer/generate', requireAdmin, handleQuickGenerate);
router.post('/api/admin/composer/fill-card', requireAdmin, handleFillCard);

router.get('/api/admin/composer/blueprints', requireAdmin, handleListBlueprints);
router.post('/api/admin/composer/blueprints', requireAdmin, handleCreateBlueprint);
router.post('/api/admin/composer/blueprints/:id/generate', requireAdmin, handleGenerate);
router.get('/api/admin/composer/blueprints/:id/validate', requireAdmin, handleValidate);
router.post('/api/admin/composer/blueprints/:id/publish', requireAdmin, handlePublish);
router.get('/api/admin/composer/blueprints/:id', requireAdmin, handleGetBlueprint);
router.put('/api/admin/composer/blueprints/:id', requireAdmin, handleUpdateBlueprint);
router.delete('/api/admin/composer/blueprints/:id', requireAdmin, handleDeleteBlueprint);

export default router;
