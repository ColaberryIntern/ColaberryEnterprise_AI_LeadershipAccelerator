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
  handleBuildColdCampaign,
  handleGetSequenceTemplates,
} from '../../controllers/icpProfileController';

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

// Apollo Integration
router.post('/api/admin/apollo/search', requireAdmin, handleApolloSearch);
router.post('/api/admin/apollo/import', requireAdmin, handleApolloImport);
router.post('/api/admin/apollo/enrich', requireAdmin, handleApolloEnrich);
router.get('/api/admin/apollo/quota', requireAdmin, handleApolloQuota);

// AI Preview
router.post('/api/admin/ai/preview', requireAdmin, handleAIPreview);

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

export default router;
