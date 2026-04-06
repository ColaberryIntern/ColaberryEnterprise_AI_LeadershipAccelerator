import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// List all platform business processes
router.get('/api/admin/business-processes', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { Capability } = await import('../../models');
    const processes = await Capability.findAll({
      where: { process_type: 'platform_process' },
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });
    res.json(processes);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Get single process detail
router.get('/api/admin/business-processes/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { Capability } = await import('../../models');
    const process = await Capability.findByPk(req.params.id as string);
    if (!process) { res.status(404).json({ error: 'Process not found' }); return; }
    res.json(process);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Update HITL config
router.put('/api/admin/business-processes/:id/hitl-config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { updateHITLConfig, getHITLConfig } = await import('../../intelligence/hitl/hitlEngine');
    await updateHITLConfig(req.params.id as string, req.body);
    res.json(await getHITLConfig(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Set autonomy level
router.put('/api/admin/business-processes/:id/autonomy', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { applyAutonomyChange, assessAutonomy } = await import('../../intelligence/autonomyProgressionEngine');
    await applyAutonomyChange(req.params.id as string, req.body.level, req.body.reason || 'Admin override');
    res.json(await assessAutonomy(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Get approval history
router.get('/api/admin/business-processes/:id/approvals', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getApprovalHistory } = await import('../../intelligence/hitl/hitlEngine');
    res.json(await getApprovalHistory(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Trigger process evaluation (scoring)
router.post('/api/admin/business-processes/:id/evaluate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { scoreProcess } = await import('../../intelligence/processScoringEngine');
    const { assessAutonomy } = await import('../../intelligence/autonomyProgressionEngine');
    const scores = await scoreProcess(req.params.id as string);
    const autonomy = await assessAutonomy(req.params.id as string);
    res.json({ scores, autonomy });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Get evolution recommendations
router.get('/api/admin/business-processes/:id/evolution', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { analyzeProcessEvolution } = await import('../../intelligence/agentEvolutionEngine');
    res.json(await analyzeProcessEvolution(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Generate improvement prompt
router.post('/api/admin/business-processes/:id/generate-prompt', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { target } = req.body;
    if (!target) { res.status(400).json({ error: 'target is required' }); return; }
    const { generateImprovementPrompt } = await import('../../intelligence/promptGenerator');
    res.json(await generateImprovementPrompt(req.params.id as string, target));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Seed initial processes
router.post('/api/admin/business-processes/seed', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { seedBusinessProcesses } = await import('../../services/businessProcessSeedService');
    res.json(await seedBusinessProcesses());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Run self-optimization scan
router.post('/api/admin/business-processes/optimize', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { runOptimizationScan } = await import('../../intelligence/selfOptimizationEngine');
    res.json(await runOptimizationScan());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Debug: view context graph for a process
router.get('/api/admin/graph/:projectId/:capabilityId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { buildProcessGraph } = await import('../../intelligence/graph/graphBuilder');
    const { getProcessPriority } = await import('../../intelligence/graph/graphQueryEngine');
    const graph = await buildProcessGraph(req.params.projectId as string, req.params.capabilityId as string);
    res.json(graph.toJSON());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Debug: view full project graph with priorities + execution data
router.get('/api/admin/graph/:projectId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { buildProjectGraph, buildExecutionGraph } = await import('../../intelligence/graph/graphBuilder');
    const { getProcessPriority, getExecutionStats, getFailingPaths, getSlowPaths, getUnusedComponents } = await import('../../intelligence/graph/graphQueryEngine');
    const graph = await buildProjectGraph(req.params.projectId as string);

    // Level 3: Add behavioral edges from real execution data
    const executionSummary = await buildExecutionGraph(graph);

    const priorities = getProcessPriority(graph);
    const executionStats = getExecutionStats(graph);
    const graphJson = graph.toJSON();
    res.json({
      ...graphJson,
      priorities: Object.fromEntries(priorities),
      execution: {
        ...executionSummary,
        stats: executionStats,
        failing: getFailingPaths(graph).map(n => ({ id: n.id, label: n.label, failure_rate: n.metadata.failure_rate })),
        slow: getSlowPaths(graph).map(n => ({ id: n.id, label: n.label, avg_ms: n.metadata.avg_duration_ms })),
        unused: getUnusedComponents(graph).map(n => ({ id: n.id, label: n.label, type: n.type })),
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
