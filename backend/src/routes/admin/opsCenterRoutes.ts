/**
 * AI Operations Center (Phase 4) — admin routes. Namespaced /api/admin/school
 * (School Intelligence Platform) to avoid the existing /api/admin/ops routes.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleHome, handleHealth, handleDirectors, handleWorkQueue, handleUpdateWorkItem, handleTwinSimulate, handleSearch,
} from '../../controllers/opsCenterController';

const router = Router();

router.get('/api/admin/school/home', requireAdmin, handleHome);
router.get('/api/admin/school/health', requireAdmin, handleHealth);
router.get('/api/admin/school/directors', requireAdmin, handleDirectors);
router.get('/api/admin/school/work-queue', requireAdmin, handleWorkQueue);
router.put('/api/admin/school/work-queue/:id', requireAdmin, handleUpdateWorkItem);
router.post('/api/admin/school/twin/simulate', requireAdmin, handleTwinSimulate);
router.get('/api/admin/school/search', requireAdmin, handleSearch);

export default router;
