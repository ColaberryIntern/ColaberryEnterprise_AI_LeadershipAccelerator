/**
 * Experience Builder (Phase 1) — AI Component admin routes. All admin-only.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListComponents, handleGetComponent, handleUpdateComponent,
  handleTestComponentPrompt, handleEstimateComponent,
  handleListVersions, handleRestoreVersion, handleBackfillComponents,
  handleGenerateComponent, handleCreateComponent, handleCoDesign, handleRuntimePreview,
  handleListCapabilities, handleListRecipes,
} from '../../controllers/componentController';

const router = Router();

// Experience Studio — AI-native + composition library.
router.get('/api/admin/capabilities', requireAdmin, handleListCapabilities);
router.get('/api/admin/recipes', requireAdmin, handleListRecipes);
router.post('/api/admin/components/generate', requireAdmin, handleGenerateComponent);
router.post('/api/admin/components/backfill', requireAdmin, handleBackfillComponents);
router.post('/api/admin/components/:slug/codesign', requireAdmin, handleCoDesign);
router.post('/api/admin/components/:slug/preview', requireAdmin, handleRuntimePreview);
router.post('/api/admin/components', requireAdmin, handleCreateComponent);
router.get('/api/admin/components', requireAdmin, handleListComponents);
router.get('/api/admin/components/:slug/estimate', requireAdmin, handleEstimateComponent);
router.get('/api/admin/components/:slug/versions', requireAdmin, handleListVersions);
router.post('/api/admin/components/:slug/versions/:version/restore', requireAdmin, handleRestoreVersion);
router.post('/api/admin/components/:slug/test', requireAdmin, handleTestComponentPrompt);
router.get('/api/admin/components/:slug', requireAdmin, handleGetComponent);
router.put('/api/admin/components/:slug', requireAdmin, handleUpdateComponent);

export default router;
