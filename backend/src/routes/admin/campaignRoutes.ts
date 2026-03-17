import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getRampStatus, manualAdvanceRamp } from '../../services/autonomousRampService';
import {
  freezeEvolution,
  unfreezeEvolution,
  approveVariant,
  rejectVariant,
} from '../../services/campaignEvolutionService';
import { CampaignVariant } from '../../models';
import {
  submitForApproval,
  approveCampaign,
  rejectCampaign,
  goLive,
  pauseCampaignApproval,
  completeCampaignApproval,
} from '../../services/campaignApprovalService';
import { generateTrackedLink, getCampaignROI } from '../../services/campaignLinkService';
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
  handleGenerateICP,
  handleReverseEngineer,
  handleRebuildCampaign,
} from '../../controllers/adminCampaignController';
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
  handleSearchAndEnroll,
  handleScorePreview,
  handleBuildColdCampaign,
  handleGetSequenceTemplates,
} from '../../controllers/icpProfileController';
import {
  handleListRecommendations,
  handleGetRecommendationStats,
  handleApproveRecommendation as handleApproveLeadRec,
  handleRejectRecommendation as handleRejectLeadRec,
  handleBulkApproveRecommendations,
} from '../../controllers/leadRecommendationController';

const router = Router();

// Campaigns
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
router.post('/api/admin/campaigns/:id/generate-icp', requireAdmin, handleGenerateICP);
router.post('/api/admin/campaigns/:id/reverse-engineer', requireAdmin, handleReverseEngineer);
router.post('/api/admin/campaigns/:id/rebuild', requireAdmin, handleRebuildCampaign);

// ICP Profiles
router.get('/api/admin/icp-profiles', requireAdmin, handleListICPProfiles);
router.post('/api/admin/icp-profiles', requireAdmin, handleCreateICPProfile);
router.get('/api/admin/icp-profiles/:id', requireAdmin, handleGetICPProfile);
router.patch('/api/admin/icp-profiles/:id', requireAdmin, handleUpdateICPProfile);
router.delete('/api/admin/icp-profiles/:id', requireAdmin, handleDeleteICPProfile);
router.post('/api/admin/icp-profiles/:id/search', requireAdmin, handleSearchApolloFromProfile);
router.post('/api/admin/icp-profiles/:id/refresh-stats', requireAdmin, handleRefreshProfileStats);
router.get('/api/admin/icp-profiles/:id/recommendations', requireAdmin, handleGetProfileRecommendations);
router.post('/api/admin/icp-profiles/:id/apply-recommendation', requireAdmin, handleApplyRecommendation);
router.post('/api/admin/icp-profiles/:id/search-and-enroll', requireAdmin, handleSearchAndEnroll);
router.post('/api/admin/icp-profiles/:id/score-preview', requireAdmin, handleScorePreview);

// Apollo Integration
router.post('/api/admin/apollo/search', requireAdmin, handleApolloSearch);
router.post('/api/admin/apollo/import', requireAdmin, handleApolloImport);
router.post('/api/admin/apollo/enrich', requireAdmin, handleApolloEnrich);
router.get('/api/admin/apollo/quota', requireAdmin, handleApolloQuota);

// AI Preview
router.post('/api/admin/ai/preview', requireAdmin, handleAIPreview);

// Lead Recommendations (Apollo Lead Intelligence)
router.get('/api/admin/lead-recommendations', requireAdmin, handleListRecommendations);
router.get('/api/admin/lead-recommendations/stats', requireAdmin, handleGetRecommendationStats);
router.post('/api/admin/lead-recommendations/:id/approve', requireAdmin, handleApproveLeadRec);
router.post('/api/admin/lead-recommendations/:id/reject', requireAdmin, handleRejectLeadRec);
router.post('/api/admin/lead-recommendations/bulk-approve', requireAdmin, handleBulkApproveRecommendations);

// ── Autonomous Campaign Endpoints ────────────────────────────────────────

router.get('/api/admin/campaigns/:id/ramp-status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getRampStatus(req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/ramp-advance', requireAdmin, async (req: Request, res: Response) => {
  try {
    const rampState = await manualAdvanceRamp(req.params.id as string);
    res.json({ ok: true, ramp_state: rampState });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/admin/campaigns/:id/variants', requireAdmin, async (req: Request, res: Response) => {
  try {
    const variants = await CampaignVariant.findAll({
      where: { campaign_id: req.params.id as string },
      order: [['step_index', 'ASC'], ['variant_label', 'ASC']],
    });
    res.json(variants);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/variants/:vid/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    await approveVariant(req.params.vid as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/variants/:vid/reject', requireAdmin, async (req: Request, res: Response) => {
  try {
    await rejectVariant(req.params.vid as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/evolution/freeze', requireAdmin, async (req: Request, res: Response) => {
  try {
    await freezeEvolution(req.params.id as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/evolution/unfreeze', requireAdmin, async (req: Request, res: Response) => {
  try {
    await unfreezeEvolution(req.params.id as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Campaign Link Registry & Approval Workflow ──────────────────────────

router.post('/api/admin/campaigns/:id/submit-approval', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaign = await submitForApproval(req.params.id as string);
    res.json({ ok: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.id || (req as any).user?.id;
    const campaign = await approveCampaign(req.params.id as string, adminId);
    res.json({ ok: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/reject', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const campaign = await rejectCampaign(req.params.id as string, reason || 'No reason provided');
    res.json({ ok: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/go-live', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaign = await goLive(req.params.id as string);
    res.json({ ok: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/pause-approval', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaign = await pauseCampaignApproval(req.params.id as string);
    res.json({ ok: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/complete-approval', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaign = await completeCampaignApproval(req.params.id as string);
    res.json({ ok: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/admin/campaigns/:id/roi', requireAdmin, async (req: Request, res: Response) => {
  try {
    const roi = await getCampaignROI(req.params.id as string);
    res.json(roi);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/campaigns/:id/tracking-link', requireAdmin, async (req: Request, res: Response) => {
  try {
    const Campaign = (await import('../../models/Campaign')).default;
    const campaign = await Campaign.findByPk(req.params.id as string);
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    res.json({ tracking_link: campaign.tracking_link || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/campaigns/:id/generate-link', requireAdmin, async (req: Request, res: Response) => {
  try {
    const link = await generateTrackedLink(req.params.id as string);
    res.json({ ok: true, tracking_link: link });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Scheduler Safety Controls
// ---------------------------------------------------------------------------

router.post('/api/admin/scheduler/pause', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { pauseScheduler } = require('../../services/schedulerService');
    await pauseScheduler((req as any).admin?.sub);
    res.json({ ok: true, paused: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/scheduler/resume', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { resumeScheduler } = require('../../services/schedulerService');
    await resumeScheduler((req as any).admin?.sub);
    res.json({ ok: true, paused: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/scheduler/status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getSchedulerStatus } = require('../../services/schedulerService');
    const status = await getSchedulerStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/campaigns/launch-readiness', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getLaunchReadiness } = require('../../services/schedulerService');
    const readiness = await getLaunchReadiness();
    res.json(readiness);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
