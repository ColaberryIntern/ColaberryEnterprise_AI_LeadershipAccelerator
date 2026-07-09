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
  handleAnalyticsOverview, handleComponentAnalytics, handleSeedAnalytics,
  handleDependencyGraph, handleSetDependencies, handleCompareVersions,
  handleGenerateThumbnail, handleBackfillThumbnails, handleExportComponent, handleImportComponent,
  handleRenderSurface, handleBackfillRenderers, handleRendererSurfaces, handleGetLifecycle, handleSetLifecycle,
} from '../../controllers/componentController';

const router = Router();

// Experience Studio — AI-native + composition library.
router.get('/api/admin/capabilities', requireAdmin, handleListCapabilities);
router.get('/api/admin/recipes', requireAdmin, handleListRecipes);
router.get('/api/admin/components/analytics', requireAdmin, handleAnalyticsOverview);
router.post('/api/admin/components/analytics/seed', requireAdmin, handleSeedAnalytics);
router.post('/api/admin/components/thumbnails/backfill', requireAdmin, handleBackfillThumbnails);
router.get('/api/admin/components/renderers/surfaces', requireAdmin, handleRendererSurfaces);
router.post('/api/admin/components/renderers/backfill', requireAdmin, handleBackfillRenderers);
router.post('/api/admin/components/import', requireAdmin, handleImportComponent);
router.post('/api/admin/components/generate', requireAdmin, handleGenerateComponent);
router.post('/api/admin/components/backfill', requireAdmin, handleBackfillComponents);
router.get('/api/admin/components/:slug/analytics', requireAdmin, handleComponentAnalytics);
router.get('/api/admin/components/:slug/dependencies', requireAdmin, handleDependencyGraph);
router.put('/api/admin/components/:slug/dependencies', requireAdmin, handleSetDependencies);
router.get('/api/admin/components/:slug/compare/:a/:b', requireAdmin, handleCompareVersions);
router.post('/api/admin/components/:slug/thumbnail', requireAdmin, handleGenerateThumbnail);
router.get('/api/admin/components/:slug/export', requireAdmin, handleExportComponent);
router.post('/api/admin/components/:slug/codesign', requireAdmin, handleCoDesign);
router.post('/api/admin/components/:slug/preview', requireAdmin, handleRuntimePreview);
router.get('/api/admin/components/:slug/lifecycle', requireAdmin, handleGetLifecycle);
router.put('/api/admin/components/:slug/lifecycle', requireAdmin, handleSetLifecycle);
router.post('/api/admin/components/:slug/render/:surface', requireAdmin, handleRenderSurface);
router.post('/api/admin/components', requireAdmin, handleCreateComponent);
router.get('/api/admin/components', requireAdmin, handleListComponents);
router.get('/api/admin/components/:slug/estimate', requireAdmin, handleEstimateComponent);
router.get('/api/admin/components/:slug/versions', requireAdmin, handleListVersions);
router.post('/api/admin/components/:slug/versions/:version/restore', requireAdmin, handleRestoreVersion);
router.post('/api/admin/components/:slug/test', requireAdmin, handleTestComponentPrompt);
router.get('/api/admin/components/:slug', requireAdmin, handleGetComponent);
router.put('/api/admin/components/:slug', requireAdmin, handleUpdateComponent);

export default router;
