import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
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
  handleGetTemperatureHistory,
  handleUpdateTemperature,
  handleGetLeadStrategyPrep,
  handleDeleteLead,
} from '../../controllers/adminLeadController';
import {
  handleListActivities,
  handleCreateActivity,
} from '../../controllers/adminActivityController';
import {
  handleListAppointments,
  handleGetUpcomingAppointments,
  handleCreateAppointment,
  handleUpdateAppointment,
} from '../../controllers/adminAppointmentController';
import {
  handleListSequences,
  handleGetSequence,
  handleCreateSequence,
  handleUpdateSequence,
  handleDeleteSequence,
  handleEnrollLeadInSequence,
  handleCancelLeadSequence,
  handleGetLeadSequenceStatus,
} from '../../controllers/adminSequenceController';
import {
  uploadMiddleware,
  handleImportLeads,
  handleGetImportTemplate,
} from '../../controllers/adminImportController';
import { handleGetLeadJourney } from '../../controllers/adminOpportunityController';

const router = Router();

// Leads
router.get('/api/admin/leads/stats', requireAdmin, handleAdminGetLeadStats);
router.get('/api/admin/leads/export', requireAdmin, handleAdminExportLeads);
router.get('/api/admin/leads', requireAdmin, handleAdminListLeads);
router.post('/api/admin/leads', requireAdmin, handleAdminCreateLead);
router.patch('/api/admin/leads/batch', requireAdmin, handleAdminBatchUpdate);
router.get('/api/admin/leads/:id', requireAdmin, handleAdminGetLead);
router.patch('/api/admin/leads/:id', requireAdmin, handleAdminUpdateLead);
router.delete('/api/admin/leads/:id', requireAdmin, handleDeleteLead);
router.patch('/api/admin/leads/:id/pipeline', requireAdmin, handleAdminUpdatePipelineStage);
router.get('/api/admin/leads/:id/temperature-history', requireAdmin, handleGetTemperatureHistory);
router.patch('/api/admin/leads/:id/temperature', requireAdmin, handleUpdateTemperature);
router.get('/api/admin/leads/:id/strategy-prep', requireAdmin, handleGetLeadStrategyPrep);
router.get('/api/admin/leads/:id/journey', requireAdmin, handleGetLeadJourney);

// Pipeline
router.get('/api/admin/pipeline/stats', requireAdmin, handleAdminGetPipelineStats);

// Activities
router.get('/api/admin/leads/:id/activities', requireAdmin, handleListActivities);
router.post('/api/admin/leads/:id/activities', requireAdmin, handleCreateActivity);

// Appointments
router.get('/api/admin/appointments/upcoming', requireAdmin, handleGetUpcomingAppointments);
router.get('/api/admin/appointments', requireAdmin, handleListAppointments);
router.post('/api/admin/appointments', requireAdmin, handleCreateAppointment);
router.patch('/api/admin/appointments/:id', requireAdmin, handleUpdateAppointment);

// Follow-Up Sequences
router.get('/api/admin/sequences', requireAdmin, handleListSequences);
router.get('/api/admin/sequences/:id', requireAdmin, handleGetSequence);
router.post('/api/admin/sequences', requireAdmin, handleCreateSequence);
router.patch('/api/admin/sequences/:id', requireAdmin, handleUpdateSequence);
router.delete('/api/admin/sequences/:id', requireAdmin, handleDeleteSequence);
router.post('/api/admin/leads/:id/enroll-sequence', requireAdmin, handleEnrollLeadInSequence);
router.delete('/api/admin/leads/:id/cancel-sequence', requireAdmin, handleCancelLeadSequence);
router.get('/api/admin/leads/:id/sequence-status', requireAdmin, handleGetLeadSequenceStatus);

// CSV Import
router.get('/api/admin/leads/import/template', requireAdmin, handleGetImportTemplate);
router.post('/api/admin/leads/import', requireAdmin, uploadMiddleware, handleImportLeads);

export default router;
