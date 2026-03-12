import { Router, Request, Response } from 'express';

const router = Router();

// ─── Current Strategic Metrics ──────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/metrics', async (_req: Request, res: Response) => {
  try {
    const { getStrategicMetrics } = await import('../../services/strategic-intelligence/metricCollector');
    const metrics = await getStrategicMetrics();
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trend Analysis ─────────────────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/trends', async (_req: Request, res: Response) => {
  try {
    const { analyzeStrategicTrends } = await import('../../services/strategic-intelligence/trendAnalyzer');
    const trends = await analyzeStrategicTrends();
    res.json(trends);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Anomaly Detection ──────────────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/anomalies', async (_req: Request, res: Response) => {
  try {
    const { detectAnomalies } = await import('../../services/strategic-intelligence/anomalyDetectionEngine');
    const anomalies = await detectAnomalies();
    res.json(anomalies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Strategic Inferences ───────────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/inferences', async (_req: Request, res: Response) => {
  try {
    const { getStrategicMetrics } = await import('../../services/strategic-intelligence/metricCollector');
    const { analyzeStrategicTrends } = await import('../../services/strategic-intelligence/trendAnalyzer');
    const { detectAnomalies } = await import('../../services/strategic-intelligence/anomalyDetectionEngine');
    const { generateInferences } = await import('../../services/strategic-intelligence/strategicInferenceEngine');

    const [metrics, trends, anomalies] = await Promise.all([
      getStrategicMetrics(),
      analyzeStrategicTrends(),
      detectAnomalies(),
    ]);
    const inferences = await generateInferences(trends, anomalies, metrics);
    res.json({ inferences });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Recommendations ────────────────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/recommendations', async (_req: Request, res: Response) => {
  try {
    const { getStrategicMetrics } = await import('../../services/strategic-intelligence/metricCollector');
    const { analyzeStrategicTrends } = await import('../../services/strategic-intelligence/trendAnalyzer');
    const { detectAnomalies } = await import('../../services/strategic-intelligence/anomalyDetectionEngine');
    const { generateInferences } = await import('../../services/strategic-intelligence/strategicInferenceEngine');
    const { generateRecommendations } = await import('../../services/strategic-intelligence/recommendationEngine');

    const [metrics, trends, anomalies] = await Promise.all([
      getStrategicMetrics(),
      analyzeStrategicTrends(),
      detectAnomalies(),
    ]);
    const inferences = await generateInferences(trends, anomalies, metrics);
    const recommendations = await generateRecommendations(inferences, metrics);
    res.json({ recommendations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scenario Simulation ────────────────────────────────────────────────────

router.post('/api/admin/strategic-intelligence/simulate', async (req: Request, res: Response) => {
  try {
    const { simulateScenario } = await import('../../services/strategic-intelligence/scenarioSimulationEngine');
    const { type, magnitude } = req.body;
    if (!type || magnitude === undefined) {
      res.status(400).json({ error: 'type and magnitude required' });
      return;
    }
    const result = await simulateScenario({ type, magnitude });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Risk Assessment / Stability Score ──────────────────────────────────────

router.get('/api/admin/strategic-intelligence/risk', async (_req: Request, res: Response) => {
  try {
    const { getStrategicMetrics } = await import('../../services/strategic-intelligence/metricCollector');
    const { analyzeStrategicTrends } = await import('../../services/strategic-intelligence/trendAnalyzer');
    const { detectAnomalies } = await import('../../services/strategic-intelligence/anomalyDetectionEngine');
    const { assessStrategicRisk } = await import('../../services/strategic-intelligence/riskAssessmentEngine');

    const [metrics, trends, anomalies] = await Promise.all([
      getStrategicMetrics(),
      analyzeStrategicTrends(),
      detectAnomalies(),
    ]);
    const risk = await assessStrategicRisk(metrics, trends, anomalies);
    res.json(risk);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Executive Narrative ────────────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/narrative/:period', async (req: Request, res: Response) => {
  try {
    const period = req.params.period as 'morning' | 'evening';
    if (period !== 'morning' && period !== 'evening') {
      res.status(400).json({ error: 'period must be morning or evening' });
      return;
    }

    const { getStrategicMetrics } = await import('../../services/strategic-intelligence/metricCollector');
    const { analyzeStrategicTrends } = await import('../../services/strategic-intelligence/trendAnalyzer');
    const { detectAnomalies } = await import('../../services/strategic-intelligence/anomalyDetectionEngine');
    const { generateInferences } = await import('../../services/strategic-intelligence/strategicInferenceEngine');
    const { generateRecommendations } = await import('../../services/strategic-intelligence/recommendationEngine');
    const { assessStrategicRisk } = await import('../../services/strategic-intelligence/riskAssessmentEngine');
    const { composeExecutiveNarrative } = await import('../../services/strategic-intelligence/executiveNarrativeComposer');

    const [metrics, trends, anomalies] = await Promise.all([
      getStrategicMetrics(),
      analyzeStrategicTrends(),
      detectAnomalies(),
    ]);
    const inferences = await generateInferences(trends, anomalies, metrics);
    const recommendations = await generateRecommendations(inferences, metrics);
    const risk = await assessStrategicRisk(metrics, trends, anomalies);
    const narrative = await composeExecutiveNarrative(period, metrics, trends, anomalies, recommendations, risk);

    res.json(narrative);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Snapshot History ───────────────────────────────────────────────────────

router.get('/api/admin/strategic-intelligence/history', async (req: Request, res: Response) => {
  try {
    const { getSnapshotHistory } = await import('../../services/strategic-intelligence/strategicStateStore');
    const days = parseInt(req.query.days as string, 10) || 7;
    const snapshots = await getSnapshotHistory(Math.min(days, 90));
    res.json({ snapshots, count: snapshots.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
