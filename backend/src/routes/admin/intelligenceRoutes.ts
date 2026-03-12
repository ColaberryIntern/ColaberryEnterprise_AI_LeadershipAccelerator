import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetHealth,
  handleListDatasets,
  handleGetDataset,
  handleListProcesses,
  handleGetConfig,
  handleUpdateConfig,
  handleTriggerDiscovery,
  handleGetDictionary,
  handleQueryOrchestrator,
  handleGetExecutiveSummary,
  handleGetRankedInsights,
  handleGetEntityNetwork,
  handleGetQAHistory,
  handleGetKPIs,
  handleGetAnomalies,
  handleGetForecasts,
  handleGetRiskEntities,
  handleGetBusinessHierarchy,
  handleDataAccessReport,
  handleAssistantQuery,
} from '../../controllers/intelligenceController';

const router = Router();

// Health
router.get('/api/admin/intelligence/health', requireAdmin, handleGetHealth);

// Dataset Registry
router.get('/api/admin/intelligence/datasets', requireAdmin, handleListDatasets);
router.get('/api/admin/intelligence/datasets/:id', requireAdmin, handleGetDataset);

// System Processes
router.get('/api/admin/intelligence/processes', requireAdmin, handleListProcesses);

// Configuration
router.get('/api/admin/intelligence/config', requireAdmin, handleGetConfig);
router.put('/api/admin/intelligence/config', requireAdmin, handleUpdateConfig);

// Discovery
router.post('/api/admin/intelligence/discovery/run', requireAdmin, handleTriggerDiscovery);
router.get('/api/admin/intelligence/discovery/dictionary', requireAdmin, handleGetDictionary);

// AI Query
router.post('/api/admin/intelligence/query', requireAdmin, handleQueryOrchestrator);
router.get('/api/admin/intelligence/executive-summary', requireAdmin, handleGetExecutiveSummary);
router.get('/api/admin/intelligence/insights', requireAdmin, handleGetRankedInsights);
router.get('/api/admin/intelligence/entity-network', requireAdmin, handleGetEntityNetwork);

// Q&A History
router.get('/api/admin/intelligence/qa-history', requireAdmin, handleGetQAHistory);

// Analytics
router.get('/api/admin/intelligence/kpis', requireAdmin, handleGetKPIs);
router.get('/api/admin/intelligence/anomalies', requireAdmin, handleGetAnomalies);
router.get('/api/admin/intelligence/forecasts', requireAdmin, handleGetForecasts);
router.get('/api/admin/intelligence/risk-entities', requireAdmin, handleGetRiskEntities);

// Business Hierarchy
router.get('/api/admin/intelligence/business-hierarchy', requireAdmin, handleGetBusinessHierarchy);

// Data Access Verification
router.get('/api/admin/intelligence/data-access-report', requireAdmin, handleDataAccessReport);

// Deterministic AI Assistant Pipeline
router.post('/api/admin/intelligence/assistant', requireAdmin, handleAssistantQuery);

// Situational Awareness
router.get('/api/admin/intelligence/situational-awareness', requireAdmin, async (_req, res) => {
  try {
    const { getSituationalSnapshot } = await import('../../services/situationalAwarenessService');
    const snapshot = await getSituationalSnapshot();
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
