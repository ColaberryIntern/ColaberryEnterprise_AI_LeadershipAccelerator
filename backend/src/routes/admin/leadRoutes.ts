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
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

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

// Fetch scheduled email content for email preview popup
router.get('/api/admin/scheduled-emails/:id/content', requireAdmin, async (req, res) => {
  try {
    const { ScheduledEmail } = require('../../models');
    const email = await ScheduledEmail.findByPk(req.params.id, {
      attributes: ['id', 'subject', 'body', 'to_email', 'sent_at', 'channel', 'lead_id'],
    });
    if (!email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }
    res.json({ email });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lead engagement data (opens, clicks, calls, campaign status)
router.get('/api/admin/leads/:id/engagement', requireAdmin, async (req, res) => {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    const [outcomes, calls, campaign] = await Promise.all([
      sequelize.query(`
        SELECT outcome, COUNT(*) as cnt,
          json_agg(json_build_object('at', created_at, 'step_index', step_index, 'metadata', metadata) ORDER BY created_at DESC) as events
        FROM interaction_outcomes
        WHERE lead_id = :leadId AND outcome IN ('sent','opened','clicked','replied','bounced')
        GROUP BY outcome
      `, { replacements: { leadId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT created_at as at, status,
          provider_response->>'duration' as duration,
          provider_response->>'end_call_reason' as outcome,
          LEFT(provider_response->>'transcript', 200) as transcript_preview,
          metadata->>'trigger' as trigger
        FROM communication_logs
        WHERE lead_id = :leadId AND channel = 'voice'
        ORDER BY created_at DESC LIMIT 10
      `, { replacements: { leadId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT c.name as campaign_name, c.status as campaign_status, cl.status as enrollment_status,
          cl.enrolled_at,
          (SELECT COUNT(*) FROM scheduled_emails se WHERE se.lead_id = :leadId AND se.campaign_id = c.id AND se.status = 'sent') as steps_completed,
          (SELECT jsonb_array_length(fs.steps) FROM follow_up_sequences fs WHERE fs.id = c.sequence_id) as total_steps,
          (SELECT MIN(se.scheduled_for) FROM scheduled_emails se WHERE se.lead_id = :leadId AND se.campaign_id = c.id AND se.status = 'pending') as next_scheduled
        FROM campaign_leads cl
        JOIN campaigns c ON c.id = cl.campaign_id
        WHERE cl.lead_id = :leadId AND cl.status = 'active'
        ORDER BY cl.enrolled_at DESC LIMIT 1
      `, { replacements: { leadId }, type: QueryTypes.SELECT }),
    ]);
    const outcomesMap: Record<string, any> = {};
    for (const row of outcomes as any[]) {
      outcomesMap[row.outcome] = { count: parseInt(row.cnt, 10), events: row.events?.slice(0, 20) || [] };
    }
    res.json({
      emails_sent: outcomesMap.sent?.count || 0,
      opens: outcomesMap.opened || { count: 0, events: [] },
      clicks: outcomesMap.clicked || { count: 0, events: [] },
      replies: outcomesMap.replied?.count || 0,
      bounces: outcomesMap.bounced?.count || 0,
      voice_calls: calls,
      campaign: (campaign as any[])[0] || null,
    });
  } catch (err: any) {
    console.error('[LeadEngagement] Error:', err.message);
    res.status(500).json({ error: 'Failed to load engagement data' });
  }
});

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
