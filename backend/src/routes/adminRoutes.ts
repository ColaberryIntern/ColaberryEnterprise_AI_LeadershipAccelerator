import { Router } from 'express';
import { requireAdmin } from '../middlewares/authMiddleware';
import { handleAdminLogin, handleAdminLogout } from '../controllers/adminAuthController';
import {
  handleAdminListCohorts,
  handleAdminGetCohort,
  handleAdminUpdateCohort,
  handleAdminExportCohort,
  handleAdminGetStats,
} from '../controllers/adminCohortController';
import {
  handleAdminListLeads,
  handleAdminGetLeadStats,
  handleAdminGetLead,
  handleAdminUpdateLead,
  handleAdminExportLeads,
} from '../controllers/adminLeadController';

const router = Router();

// Public auth routes
router.post('/api/admin/login', handleAdminLogin);
router.post('/api/admin/logout', handleAdminLogout);

// Protected admin routes — Cohorts
router.get('/api/admin/stats', requireAdmin, handleAdminGetStats);
router.get('/api/admin/cohorts', requireAdmin, handleAdminListCohorts);
router.get('/api/admin/cohorts/:id', requireAdmin, handleAdminGetCohort);
router.patch('/api/admin/cohorts/:id', requireAdmin, handleAdminUpdateCohort);
router.get('/api/admin/cohorts/:id/export', requireAdmin, handleAdminExportCohort);

// Protected admin routes — Leads
router.get('/api/admin/leads/stats', requireAdmin, handleAdminGetLeadStats);
router.get('/api/admin/leads/export', requireAdmin, handleAdminExportLeads);
router.get('/api/admin/leads', requireAdmin, handleAdminListLeads);
router.get('/api/admin/leads/:id', requireAdmin, handleAdminGetLead);
router.patch('/api/admin/leads/:id', requireAdmin, handleAdminUpdateLead);

export default router;
