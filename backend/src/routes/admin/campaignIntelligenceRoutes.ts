import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { harvestInsights, getRelevantInsights, getKnowledgeSummary } from '../../services/campaignKnowledgeService';
import { generateOptimizations } from '../../services/campaignOptimizationService';
import { recommendCampaignsForLead, recommendLeadsForCampaign } from '../../services/campaignStrategyService';
import { scoreMessageEffectiveness } from '../../services/aiMessageService';
import { calculateMultiTouchAttribution } from '../../services/revenueDashboardService';
import { parseNaturalLanguageCampaign } from '../../services/campaignBuilderService';
import { getPersonaArchetypes } from '../../services/testing/testLeadGenerator';

const router = Router();

// ── Campaign Knowledge Memory ───────────────────────────────────────────

router.get('/api/admin/campaign-knowledge', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const summary = await getKnowledgeSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/campaign-knowledge/insights', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { insight_type, category, campaign_type, channel, min_confidence, limit } = req.query;
    const insights = await getRelevantInsights({
      insight_type: insight_type as any,
      category: category as string,
      campaign_type: campaign_type as string,
      channel: channel as string,
      min_confidence: min_confidence ? parseFloat(min_confidence as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/campaign-knowledge/harvest/:campaignId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaignId = String(req.params.campaignId);
    const insights = await harvestInsights(campaignId);
    res.json({ harvested: insights.length, insights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Campaign Optimization ───────────────────────────────────────────────

router.get('/api/admin/campaign-optimization/:campaignId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaignId = String(req.params.campaignId);
    const report = await generateOptimizations(campaignId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Campaign Strategy ───────────────────────────────────────────────────

router.get('/api/admin/campaign-strategy/lead/:leadId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(String(req.params.leadId), 10);
    const profile = await recommendCampaignsForLead(leadId);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/campaign-strategy/campaign/:campaignId/leads', requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaignId = String(req.params.campaignId);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
    const leads = await recommendLeadsForCampaign(campaignId, limit);
    res.json(leads);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Message Scoring ─────────────────────────────────────────────────────

router.post('/api/admin/message-score', requireAdmin, async (req: Request, res: Response) => {
  try {
    const score = scoreMessageEffectiveness(req.body);
    res.json(score);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Multi-Touch Attribution ─────────────────────────────────────────────

router.get('/api/admin/attribution/lead/:leadId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const attribution = await calculateMultiTouchAttribution(parseInt(String(req.params.leadId), 10));
    res.json(attribution);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── NLP Campaign Builder ────────────────────────────────────────────────

router.post('/api/admin/campaign-builder/parse', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }
    const config = await parseNaturalLanguageCampaign(description);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Persona Archetypes ──────────────────────────────────────────────────

router.get('/api/admin/persona-archetypes', requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(getPersonaArchetypes());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
