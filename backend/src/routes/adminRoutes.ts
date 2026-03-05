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
  handleGetTemperatureHistory,
  handleUpdateTemperature,
  handleGetLeadStrategyPrep,
  handleDeleteLead,
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
  handleSendTestDigest,
} from '../controllers/adminSettingsController';
import {
  handleGetLeadJourney,
  handleGetVisitorJourney,
  handleGetOpportunityScores,
  handleGetOpportunitySummary,
  handleGetForecastProjections,
  handleRecomputeOpportunities,
} from '../controllers/adminOpportunityController';
import {
  handleGetInsights,
  handleGetInsightSummary,
  handleGetRecommendations,
  handleComputeInsights,
  handleGetOutcomes,
  handleGetOutcomeStats,
  handleGetCampaignOutcomes,
  handleGetLeadOutcomes,
} from '../controllers/adminInsightController';
import {
  handleListVisitors,
  handleGetVisitorStats,
  handleGetLiveVisitors,
  handleGetVisitorTrend,
  handleGetVisitorProfile,
  handleGetVisitorSessions,
  handleGetSessionEvents,
  handleGetVisitorSignals,
  handleGetVisitorIntent,
  handleGetHighIntentVisitors,
  handleGetIntentDistribution,
  handleGetSignalDefinitions,
  handleListChatConversations,
  handleGetChatConversation,
  handleGetChatStats,
} from '../controllers/adminVisitorController';
import {
  handleCreateICPProfile,
  handleListICPProfiles,
  handleGetICPProfile,
  handleUpdateICPProfile,
  handleDeleteICPProfile,
  handleSearchApolloFromProfile,
  handleRefreshProfileStats,
  handleGetProfileRecommendations,
  handleApplyRecommendation,
  handleBuildColdCampaign,
  handleGetSequenceTemplates,
} from '../controllers/icpProfileController';
import {
  handleListCampaigns,
  handleCreateCampaign,
  handleGetCampaign,
  handleUpdateCampaign,
  handleDeleteCampaign,
  handleActivateCampaign,
  handlePauseCampaign,
  handleCompleteCampaign,
  handleEnrollLeads,
  handleRemoveLeadFromCampaign,
  handleGetMatchingLeads,
  handleGetCampaignStats,
  handleGetCampaignLeads,
  handleApolloSearch,
  handleApolloImport,
  handleApolloEnrich,
  handleApolloQuota,
  handleAIPreview,
  handleGetCampaignAnalytics,
  handleGetCampaignSettings,
  handleUpdateCampaignSettings,
  handleUpdateCampaignGTM,
  handleGetEnrichedCampaignLeads,
  handleGetLeadCampaignTimeline,
  handleGhlSync,
  handleGhlStatus,
  handleGhlTestSms,
  handleGhlResyncLead,
} from '../controllers/adminCampaignController';

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
router.delete('/api/admin/leads/:id', requireAdmin, handleDeleteLead);
router.patch('/api/admin/leads/:id/pipeline', requireAdmin, handleAdminUpdatePipelineStage);
router.get('/api/admin/leads/:id/temperature-history', requireAdmin, handleGetTemperatureHistory);
router.patch('/api/admin/leads/:id/temperature', requireAdmin, handleUpdateTemperature);
router.get('/api/admin/leads/:id/strategy-prep', requireAdmin, handleGetLeadStrategyPrep);
router.get('/api/admin/leads/:id/journey', requireAdmin, handleGetLeadJourney);

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
router.post('/api/admin/digest/test', requireAdmin, handleSendTestDigest);

// Protected admin routes — Campaigns
router.get('/api/admin/campaigns', requireAdmin, handleListCampaigns);
router.post('/api/admin/campaigns', requireAdmin, handleCreateCampaign);
router.post('/api/admin/campaigns/build-cold', requireAdmin, handleBuildColdCampaign);
router.get('/api/admin/campaigns/sequence-templates', requireAdmin, handleGetSequenceTemplates);
router.get('/api/admin/campaigns/:id', requireAdmin, handleGetCampaign);
router.patch('/api/admin/campaigns/:id', requireAdmin, handleUpdateCampaign);
router.delete('/api/admin/campaigns/:id', requireAdmin, handleDeleteCampaign);
router.post('/api/admin/campaigns/:id/activate', requireAdmin, handleActivateCampaign);
router.post('/api/admin/campaigns/:id/pause', requireAdmin, handlePauseCampaign);
router.post('/api/admin/campaigns/:id/complete', requireAdmin, handleCompleteCampaign);
router.post('/api/admin/campaigns/:id/enroll-leads', requireAdmin, handleEnrollLeads);
router.delete('/api/admin/campaigns/:id/leads/:leadId', requireAdmin, handleRemoveLeadFromCampaign);
router.get('/api/admin/campaigns/:id/matching-leads', requireAdmin, handleGetMatchingLeads);
router.get('/api/admin/campaigns/:id/stats', requireAdmin, handleGetCampaignStats);
router.get('/api/admin/campaigns/:id/analytics', requireAdmin, handleGetCampaignAnalytics);
router.get('/api/admin/campaigns/:id/settings', requireAdmin, handleGetCampaignSettings);
router.patch('/api/admin/campaigns/:id/settings', requireAdmin, handleUpdateCampaignSettings);
router.patch('/api/admin/campaigns/:id/gtm', requireAdmin, handleUpdateCampaignGTM);
router.get('/api/admin/campaigns/:id/lead-details', requireAdmin, handleGetEnrichedCampaignLeads);
router.get('/api/admin/campaigns/:id/leads/:leadId/timeline', requireAdmin, handleGetLeadCampaignTimeline);
router.get('/api/admin/campaigns/:id/leads', requireAdmin, handleGetCampaignLeads);
router.post('/api/admin/campaigns/:id/ghl-sync', requireAdmin, handleGhlSync);
router.get('/api/admin/campaigns/:id/ghl-status', requireAdmin, handleGhlStatus);
router.post('/api/admin/campaigns/:id/ghl-test-sms', requireAdmin, handleGhlTestSms);
router.post('/api/admin/campaigns/:id/ghl-resync-lead', requireAdmin, handleGhlResyncLead);

// Protected admin routes — ICP Profiles
router.get('/api/admin/icp-profiles', requireAdmin, handleListICPProfiles);
router.post('/api/admin/icp-profiles', requireAdmin, handleCreateICPProfile);
router.get('/api/admin/icp-profiles/:id', requireAdmin, handleGetICPProfile);
router.patch('/api/admin/icp-profiles/:id', requireAdmin, handleUpdateICPProfile);
router.delete('/api/admin/icp-profiles/:id', requireAdmin, handleDeleteICPProfile);
router.post('/api/admin/icp-profiles/:id/search', requireAdmin, handleSearchApolloFromProfile);
router.post('/api/admin/icp-profiles/:id/refresh-stats', requireAdmin, handleRefreshProfileStats);
router.get('/api/admin/icp-profiles/:id/recommendations', requireAdmin, handleGetProfileRecommendations);
router.post('/api/admin/icp-profiles/:id/apply-recommendation', requireAdmin, handleApplyRecommendation);

// Protected admin routes — Apollo Integration
router.post('/api/admin/apollo/search', requireAdmin, handleApolloSearch);
router.post('/api/admin/apollo/import', requireAdmin, handleApolloImport);
router.post('/api/admin/apollo/enrich', requireAdmin, handleApolloEnrich);
router.get('/api/admin/apollo/quota', requireAdmin, handleApolloQuota);

// Protected admin routes — AI Preview
router.post('/api/admin/ai/preview', requireAdmin, handleAIPreview);

// Protected admin routes — ICP Insights & Interaction Outcomes
router.get('/api/admin/insights/summary', requireAdmin, handleGetInsightSummary);
router.get('/api/admin/insights/recommendations', requireAdmin, handleGetRecommendations);
router.get('/api/admin/insights/outcomes', requireAdmin, handleGetOutcomes);
router.get('/api/admin/insights/outcome-stats', requireAdmin, handleGetOutcomeStats);
router.get('/api/admin/insights/campaigns/:id/outcomes', requireAdmin, handleGetCampaignOutcomes);
router.get('/api/admin/insights/leads/:id/outcomes', requireAdmin, handleGetLeadOutcomes);
router.get('/api/admin/insights', requireAdmin, handleGetInsights);
router.post('/api/admin/insights/compute', requireAdmin, handleComputeInsights);

// Protected admin routes — Event Ledger
router.get('/api/admin/events/types', requireAdmin, handleGetEventTypes);
router.get('/api/admin/events', requireAdmin, handleListEvents);

// Protected admin routes — Visitor Intelligence
router.get('/api/admin/visitors/stats', requireAdmin, handleGetVisitorStats);
router.get('/api/admin/visitors/live', requireAdmin, handleGetLiveVisitors);
router.get('/api/admin/visitors/trend', requireAdmin, handleGetVisitorTrend);
router.get('/api/admin/visitors/high-intent', requireAdmin, handleGetHighIntentVisitors);
router.get('/api/admin/visitors/intent-distribution', requireAdmin, handleGetIntentDistribution);
router.get('/api/admin/visitors/signal-definitions', requireAdmin, handleGetSignalDefinitions);
router.get('/api/admin/visitors', requireAdmin, handleListVisitors);
router.get('/api/admin/visitors/:id', requireAdmin, handleGetVisitorProfile);
router.get('/api/admin/visitors/:id/sessions', requireAdmin, handleGetVisitorSessions);
router.get('/api/admin/visitors/:id/signals', requireAdmin, handleGetVisitorSignals);
router.get('/api/admin/visitors/:id/intent', requireAdmin, handleGetVisitorIntent);
router.get('/api/admin/sessions/:id/events', requireAdmin, handleGetSessionEvents);

// Protected admin routes — Journey & Opportunities
router.get('/api/admin/visitors/:id/journey', requireAdmin, handleGetVisitorJourney);
router.get('/api/admin/opportunities/summary', requireAdmin, handleGetOpportunitySummary);
router.get('/api/admin/opportunities/forecast', requireAdmin, handleGetForecastProjections);
router.post('/api/admin/opportunities/recompute', requireAdmin, handleRecomputeOpportunities);
router.get('/api/admin/opportunities', requireAdmin, handleGetOpportunityScores);

// Protected admin routes — Chat Conversations
router.get('/api/admin/chat/stats', requireAdmin, handleGetChatStats);
router.get('/api/admin/chat/conversations', requireAdmin, handleListChatConversations);
router.get('/api/admin/chat/conversations/:id', requireAdmin, handleGetChatConversation);

export default router;
