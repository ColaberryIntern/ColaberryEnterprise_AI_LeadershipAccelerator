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
  handleAdminUpdatePipelineStage,
  handleAdminGetPipelineStats,
  handleAdminCreateLead,
  handleAdminBatchUpdate,
} from '../controllers/adminLeadController';
import {
  handleListActivities,
  handleCreateActivity,
} from '../controllers/adminActivityController';
import {
  handleListAppointments,
  handleGetUpcomingAppointments,
  handleCreateAppointment,
  handleUpdateAppointment,
} from '../controllers/adminAppointmentController';
import {
  handleListSequences,
  handleGetSequence,
  handleCreateSequence,
  handleUpdateSequence,
  handleDeleteSequence,
  handleEnrollLeadInSequence,
  handleCancelLeadSequence,
  handleGetLeadSequenceStatus,
} from '../controllers/adminSequenceController';
import {
  uploadMiddleware,
  handleImportLeads,
  handleGetImportTemplate,
} from '../controllers/adminImportController';
import { handleGetRevenueDashboard } from '../controllers/adminRevenueController';
import {
  handleGetSettings,
  handleUpdateSettings,
  handleListEvents,
  handleGetEventTypes,
} from '../controllers/adminSettingsController';

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
router.post('/api/admin/leads', requireAdmin, handleAdminCreateLead);
router.patch('/api/admin/leads/batch', requireAdmin, handleAdminBatchUpdate);
router.get('/api/admin/leads/:id', requireAdmin, handleAdminGetLead);
router.patch('/api/admin/leads/:id', requireAdmin, handleAdminUpdateLead);
router.patch('/api/admin/leads/:id/pipeline', requireAdmin, handleAdminUpdatePipelineStage);

// Protected admin routes — Pipeline
router.get('/api/admin/pipeline/stats', requireAdmin, handleAdminGetPipelineStats);

// Protected admin routes — Activities
router.get('/api/admin/leads/:id/activities', requireAdmin, handleListActivities);
router.post('/api/admin/leads/:id/activities', requireAdmin, handleCreateActivity);

// Protected admin routes — Appointments
router.get('/api/admin/appointments/upcoming', requireAdmin, handleGetUpcomingAppointments);
router.get('/api/admin/appointments', requireAdmin, handleListAppointments);
router.post('/api/admin/appointments', requireAdmin, handleCreateAppointment);
router.patch('/api/admin/appointments/:id', requireAdmin, handleUpdateAppointment);

// Protected admin routes — Follow-Up Sequences
router.get('/api/admin/sequences', requireAdmin, handleListSequences);
router.get('/api/admin/sequences/:id', requireAdmin, handleGetSequence);
router.post('/api/admin/sequences', requireAdmin, handleCreateSequence);
router.patch('/api/admin/sequences/:id', requireAdmin, handleUpdateSequence);
router.delete('/api/admin/sequences/:id', requireAdmin, handleDeleteSequence);
router.post('/api/admin/leads/:id/enroll-sequence', requireAdmin, handleEnrollLeadInSequence);
router.delete('/api/admin/leads/:id/cancel-sequence', requireAdmin, handleCancelLeadSequence);
router.get('/api/admin/leads/:id/sequence-status', requireAdmin, handleGetLeadSequenceStatus);

// Protected admin routes — Revenue Dashboard
router.get('/api/admin/revenue/dashboard', requireAdmin, handleGetRevenueDashboard);

// Protected admin routes — CSV Import
router.get('/api/admin/leads/import/template', requireAdmin, handleGetImportTemplate);
router.post('/api/admin/leads/import', requireAdmin, uploadMiddleware, handleImportLeads);

// Protected admin routes — Settings
router.get('/api/admin/settings', requireAdmin, handleGetSettings);
router.patch('/api/admin/settings', requireAdmin, handleUpdateSettings);

// Protected admin routes — Event Ledger
router.get('/api/admin/events/types', requireAdmin, handleGetEventTypes);
router.get('/api/admin/events', requireAdmin, handleListEvents);

export default router;
