import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleAdminListCohorts,
  handleAdminGetCohort,
  handleAdminUpdateCohort,
  handleAdminExportCohort,
  handleAdminGetStats,
} from '../../controllers/adminCohortController';

const router = Router();

router.get('/api/admin/stats', requireAdmin, handleAdminGetStats);
router.get('/api/admin/cohorts', requireAdmin, handleAdminListCohorts);
router.get('/api/admin/cohorts/:id', requireAdmin, handleAdminGetCohort);
router.patch('/api/admin/cohorts/:id', requireAdmin, handleAdminUpdateCohort);
router.get('/api/admin/cohorts/:id/export', requireAdmin, handleAdminExportCohort);

export default router;
