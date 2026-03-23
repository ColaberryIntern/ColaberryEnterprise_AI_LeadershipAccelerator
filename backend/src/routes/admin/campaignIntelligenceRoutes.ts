import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { harvestInsights, getRelevantInsights, getKnowledgeSummary } from '../../services/campaignKnowledgeService';
import { generateOptimizations } from '../../services/campaignOptimizationService';
import { recommendCampaignsForLead, recommendLeadsForCampaign } from '../../services/campaignStrategyService';
import { scoreMessageEffectiveness } from '../../services/aiMessageService';
import { calculateMultiTouchAttribution } from '../../services/revenueDashboardService';
import { parseNaturalLanguageCampaign } from '../../services/campaignBuilderService';
import { getPersonaArchetypes } from '../../services/testing/testLeadGenerator';
import { getCampaignGraphData, getNodeUsers, getEdgeUsers, getSlicedGraphData, buildTimelineBuckets, getCachedLeadPaths } from '../../services/reporting/campaignGraphService';

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

// ── Visitor Linkage Diagnostics ──────────────────────────────────────────

router.get('/api/admin/campaign-intelligence/visitor-diagnostics', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { Visitor, Lead, VisitorSession } = require('../../models');
    const { Op, fn, col } = require('sequelize');

    const [totalVisitors, visitorsWithLeadId, totalLeads, leadsWithVisitorId, sessionsWithLeadId, totalSessions] = await Promise.all([
      Visitor.count(),
      Visitor.count({ where: { lead_id: { [Op.ne]: null } } }),
      Lead.count(),
      Lead.count({ where: { visitor_id: { [Op.ne]: null } } }),
      VisitorSession.count({ where: { lead_id: { [Op.ne]: null } } }),
      VisitorSession.count(),
    ]);

    // Sample: first 5 visitors with lead_id
    const sampleLinked = await Visitor.findAll({
      attributes: ['id', 'lead_id', 'total_sessions', 'total_pageviews', 'first_seen_at'],
      where: { lead_id: { [Op.ne]: null } },
      limit: 5,
      raw: true,
    });

    // Sample: first 5 leads with visitor_id
    const sampleLeadsWithVisitor = await Lead.findAll({
      attributes: ['id', 'email', 'visitor_id', 'source'],
      where: { visitor_id: { [Op.ne]: null } },
      limit: 5,
      raw: true,
    });

    res.json({
      total_visitors: totalVisitors,
      visitors_with_lead_id: visitorsWithLeadId,
      total_leads: totalLeads,
      leads_with_visitor_id: leadsWithVisitorId,
      total_sessions: totalSessions,
      sessions_with_lead_id: sessionsWithLeadId,
      sample_linked_visitors: sampleLinked,
      sample_leads_with_visitor: sampleLeadsWithVisitor,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Campaign Intelligence Graph ─────────────────────────────────────────

router.get('/api/admin/campaign-intelligence/graph', requireAdmin, async (req: Request, res: Response) => {
  try {
    const timeWindow = req.query.timeWindow as string | undefined;
    const data = await getCampaignGraphData(timeWindow);
    if (req.query.timeline === 'true') {
      const paths = getCachedLeadPaths();
      if (paths) data.timeline_buckets = buildTimelineBuckets(paths);
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Graph Drilldown: Users for a specific node ──────────────────────────

router.get('/api/admin/campaign-intelligence/graph/node-users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string;
    if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const result = await getNodeUsers(nodeId, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Graph Slice: Cohort-filtered graph for a node ───────────────────────

router.get('/api/admin/campaign-intelligence/graph/slice', requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = req.query.nodeIds as string;
    if (!raw) return res.status(400).json({ error: 'nodeIds is required' });
    const nodeIds = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!nodeIds.length) return res.status(400).json({ error: 'at least one nodeId required' });
    const data = await getSlicedGraphData(nodeIds);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Graph Drilldown: Users for a specific edge ──────────────────────────

router.get('/api/admin/campaign-intelligence/graph/edge-users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const result = await getEdgeUsers(from, to, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
