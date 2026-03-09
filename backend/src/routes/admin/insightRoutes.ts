import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetInsights,
  handleGetInsightSummary,
  handleGetRecommendations,
  handleComputeInsights,
  handleGetOutcomes,
  handleGetOutcomeStats,
  handleGetCampaignOutcomes,
  handleGetLeadOutcomes,
} from '../../controllers/adminInsightController';
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
} from '../../controllers/adminVisitorController';
import {
  handleGetVisitorJourney,
  handleGetOpportunityScores,
  handleGetOpportunitySummary,
  handleGetForecastProjections,
  handleRecomputeOpportunities,
} from '../../controllers/adminOpportunityController';
import { handleListEvents, handleGetEventTypes } from '../../controllers/adminSettingsController';

const router = Router();

// ICP Insights & Interaction Outcomes
router.get('/api/admin/insights/summary', requireAdmin, handleGetInsightSummary);
router.get('/api/admin/insights/recommendations', requireAdmin, handleGetRecommendations);
router.get('/api/admin/insights/outcomes', requireAdmin, handleGetOutcomes);
router.get('/api/admin/insights/outcome-stats', requireAdmin, handleGetOutcomeStats);
router.get('/api/admin/insights/campaigns/:id/outcomes', requireAdmin, handleGetCampaignOutcomes);
router.get('/api/admin/insights/leads/:id/outcomes', requireAdmin, handleGetLeadOutcomes);
router.get('/api/admin/insights', requireAdmin, handleGetInsights);
router.post('/api/admin/insights/compute', requireAdmin, handleComputeInsights);

// Event Ledger
router.get('/api/admin/events/types', requireAdmin, handleGetEventTypes);
router.get('/api/admin/events', requireAdmin, handleListEvents);

// Visitor Intelligence
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

// Journey & Opportunities
router.get('/api/admin/visitors/:id/journey', requireAdmin, handleGetVisitorJourney);
router.get('/api/admin/opportunities/summary', requireAdmin, handleGetOpportunitySummary);
router.get('/api/admin/opportunities/forecast', requireAdmin, handleGetForecastProjections);
router.post('/api/admin/opportunities/recompute', requireAdmin, handleRecomputeOpportunities);
router.get('/api/admin/opportunities', requireAdmin, handleGetOpportunityScores);

// Chat Conversations
router.get('/api/admin/chat/stats', requireAdmin, handleGetChatStats);
router.get('/api/admin/chat/conversations', requireAdmin, handleListChatConversations);
router.get('/api/admin/chat/conversations/:id', requireAdmin, handleGetChatConversation);

export default router;
