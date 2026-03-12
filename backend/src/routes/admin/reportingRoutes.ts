// ─── Reporting Routes ─────────────────────────────────────────────────────
// API endpoints for the Reporting Intelligence Department.

import { Router, Request, Response } from 'express';
import * as insightDiscoveryService from '../../services/reporting/insightDiscoveryService';
import * as kpiService from '../../services/reporting/kpiService';
import * as narrativeService from '../../services/reporting/narrativeService';
import * as experimentService from '../../services/reporting/experimentService';
import * as revenueOpportunityService from '../../services/reporting/revenueOpportunityService';
import * as agentPerformanceService from '../../services/reporting/agentPerformanceService';
import * as reportingOrchestrationService from '../../services/reporting/reportingOrchestrationService';
import * as insightPersonalizationService from '../../services/reporting/insightPersonalizationService';
import * as intelligenceMapsService from '../../services/reporting/intelligenceMapsService';
import * as coryKnowledgeGraphService from '../../services/reporting/coryKnowledgeGraphService';
import { ReportingInsight } from '../../models';

const router = Router();

// ─── Insights ─────────────────────────────────────────────────────────────

router.get('/intelligence/reporting/insights', async (req: Request, res: Response) => {
  try {
    const result = await insightDiscoveryService.listInsights({
      insight_type: req.query.insight_type as string,
      entity_type: req.query.entity_type as string,
      department: req.query.department as string,
      status: req.query.status as string,
      alert_severity: req.query.alert_severity as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });

    // Personalize if user is authenticated
    const userId = (req as any).adminUser?.id;
    if (userId && result.rows.length > 0) {
      result.rows = await insightPersonalizationService.rankInsightsForUser(userId, result.rows);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intelligence/reporting/insights/:id', async (req: Request, res: Response) => {
  try {
    const insight = await ReportingInsight.findByPk(req.params.id as string);
    if (!insight) return res.status(404).json({ error: 'Insight not found' });
    res.json(insight);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/insights/:id/action', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await insightDiscoveryService.updateInsightStatus(req.params.id as string, status);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/insights/:id/feedback', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).adminUser?.id || 'anonymous';
    const { feedback_type } = req.body;
    const feedback = await insightPersonalizationService.recordFeedback(userId, req.params.id as string, feedback_type);
    res.json(feedback);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── KPIs ─────────────────────────────────────────────────────────────────

router.get('/intelligence/reporting/kpis', async (_req: Request, res: Response) => {
  try {
    const kpis = await kpiService.getSystemWideKPIs();
    res.json(kpis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intelligence/reporting/kpis/:scopeType/:scopeId', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'daily';
    const limit = Number(req.query.limit) || 30;
    const history = await kpiService.getKPIHistory(
      req.params.scopeType as any,
      req.params.scopeId as string,
      period as any,
      limit,
    );
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trends ───────────────────────────────────────────────────────────────

router.get('/intelligence/reporting/trends', async (req: Request, res: Response) => {
  try {
    const { forecastEnrollments } = await import('../../services/reporting/predictiveAnalyticsService');
    const enrollmentForecast = await forecastEnrollments(
      Number(req.query.horizon) || 30,
    );
    res.json({ enrollment_forecast: enrollmentForecast });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Maps ─────────────────────────────────────────────────────────────────

router.get('/intelligence/reporting/maps/:mapType', async (req: Request, res: Response) => {
  try {
    const mapData = await intelligenceMapsService.getMapData(req.params.mapType as string);
    res.json(mapData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Experiments ──────────────────────────────────────────────────────────

router.get('/intelligence/reporting/experiments', async (req: Request, res: Response) => {
  try {
    const result = await experimentService.listExperiments({
      status: req.query.status as string,
      department: req.query.department as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/experiments/:id/approve', async (req: Request, res: Response) => {
  try {
    const ticket = await experimentService.approveExperiment(req.params.id as string);
    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Revenue Opportunities ────────────────────────────────────────────────

router.get('/intelligence/reporting/opportunities', async (req: Request, res: Response) => {
  try {
    const result = await revenueOpportunityService.listOpportunities({
      status: req.query.status as string,
      department: req.query.department as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent Performance ────────────────────────────────────────────────────

router.get('/intelligence/reporting/agent-performance', async (req: Request, res: Response) => {
  try {
    const metric = (req.query.metric as string) || 'impact_score';
    const limit = Number(req.query.limit) || 20;
    const rankings = await agentPerformanceService.getAgentRankings(metric, limit);
    res.json(rankings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Executive Briefing ───────────────────────────────────────────────────

router.get('/intelligence/reporting/executive-brief', async (_req: Request, res: Response) => {
  try {
    const kpis = await kpiService.getSystemWideKPIs();
    const { rows: insights } = await insightDiscoveryService.listInsights({ status: 'new', limit: 10 });
    const summary = await narrativeService.generateExecutiveSummary(insights, kpis);
    res.json({ summary, insights_count: insights.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Manual Scan ──────────────────────────────────────────────────────────

router.post('/intelligence/reporting/scan', async (_req: Request, res: Response) => {
  try {
    const result = await reportingOrchestrationService.runSystemScan();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Knowledge Graph ──────────────────────────────────────────────────────

router.get('/intelligence/reporting/graph/node/:nodeId', async (req: Request, res: Response) => {
  try {
    const related = await coryKnowledgeGraphService.traverseRelationships(req.params.nodeId as string, 2);
    res.json({ node_id: req.params.nodeId, related });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intelligence/reporting/graph/path', async (req: Request, res: Response) => {
  try {
    const path = await coryKnowledgeGraphService.findPath(
      req.query.from as string,
      req.query.to as string,
    );
    res.json({ path });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intelligence/reporting/graph/impact/:nodeId', async (req: Request, res: Response) => {
  try {
    const impact = await coryKnowledgeGraphService.traceImpact(req.params.nodeId as string);
    res.json({ impact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cory Modes ───────────────────────────────────────────────────────────

router.post('/intelligence/reporting/cory/explain', async (req: Request, res: Response) => {
  try {
    const { chartData, chartType, title } = req.body;
    const explanation = await narrativeService.explainChart(chartData, chartType, title);
    res.json({ explanation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/cory/research', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, question } = req.body;
    const research = await narrativeService.researchEntity(entityType, entityId, question);
    res.json({ research });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/cory/recommend', async (req: Request, res: Response) => {
  try {
    const { insightId } = req.body;
    const recommendations = await narrativeService.recommendActions(insightId);
    res.json({ recommendations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Simulation & Execution ───────────────────────────────────────────────

import * as coryDecisionEngine from '../../services/reporting/coryDecisionEngine';
import { SimulationAccuracy } from '../../models';

router.post('/intelligence/reporting/cory/simulate', async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, strategy_type, parameters, insight_id } = req.body;
    const result = await coryDecisionEngine.handleSimulate({
      entity_type, entity_id, strategy_type, parameters, insight_id,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/cory/execute', async (req: Request, res: Response) => {
  try {
    const { simulation_id } = req.body;
    const result = await coryDecisionEngine.handleExecute(simulation_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intelligence/reporting/executions', async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.status) where.status = req.query.status as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { rows, count } = await SimulationAccuracy.findAndCountAll({
      where, order: [['created_at', 'DESC']], limit, offset: (page - 1) * limit,
    });
    res.json({ rows, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intelligence/reporting/executions/:id', async (req: Request, res: Response) => {
  try {
    const record = await SimulationAccuracy.findByPk(req.params.id as string);
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intelligence/reporting/executions/:id/track', async (req: Request, res: Response) => {
  try {
    const record = await SimulationAccuracy.findByPk(req.params.id as string);
    if (!record) return res.status(404).json({ error: 'Not found' });
    const { actual_outcome } = req.body;
    const predicted = (record as any).predicted_outcome || {};
    const fields = ['leads', 'conversions', 'enrollments', 'revenue'];
    let totalAccuracy = 0;
    let fieldCount = 0;
    for (const f of fields) {
      if (predicted[f] && actual_outcome[f]) {
        totalAccuracy += 1 - Math.abs(predicted[f] - actual_outcome[f]) / Math.max(predicted[f], 1);
        fieldCount++;
      }
    }
    const accuracy_score = fieldCount > 0 ? Math.max(0, totalAccuracy / fieldCount) : 0;
    await record.update({ actual_outcome, accuracy_score, status: 'completed' });
    res.json({ accuracy_score, status: 'completed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
