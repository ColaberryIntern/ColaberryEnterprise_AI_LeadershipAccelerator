import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';

const router = Router();

// ---------------------------------------------------------------------------
// Project Setup Flow (user-driven input)
// ---------------------------------------------------------------------------

router.get('/api/portal/project/setup/status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getSetupStatus } = await import('../services/projectSetupService');
    res.json(await getSetupStatus(req.participant!.sub));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/setup/requirements', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      res.status(400).json({ error: 'Requirements content is required (minimum 10 characters)' });
      return;
    }
    const { uploadRequirements } = await import('../services/projectSetupService');
    res.json(await uploadRequirements(req.participant!.sub, content.trim()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/setup/claude-md', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      res.status(400).json({ error: 'CLAUDE.md content is required (minimum 10 characters)' });
      return;
    }
    const { uploadClaudeMd } = await import('../services/projectSetupService');
    res.json(await uploadClaudeMd(req.participant!.sub, content.trim()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/setup/github', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { repo_url, access_token } = req.body;
    if (!repo_url || typeof repo_url !== 'string') {
      res.status(400).json({ error: 'repo_url is required' });
      return;
    }
    const { connectGitHub } = await import('../services/projectSetupService');
    res.json(await connectGitHub(req.participant!.sub, repo_url.trim(), access_token));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/setup/activate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { activateProject } = await import('../services/projectSetupService');
    res.json(await activateProject(req.participant!.sub));
  } catch (err: any) {
    const status = err.message.includes('not') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/execution-status
 * Single source of truth for the project execution dashboard.
 * Returns requirements progress + repo analysis + current task.
 */
router.get('/api/portal/project/execution-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { calculateRequirementsProgress } = await import('../services/projectProgressService');
    const { analyzeRepo } = await import('../services/repoAnalysisService');
    const { NextAction } = await import('../models');
    const { getProjectByEnrollment } = await import('../services/projectService');

    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) {
      res.status(404).json({ error: 'No project found' });
      return;
    }

    // Parallel fetch: requirements progress + repo analysis + current action
    const [progress, repoAnalysis, currentAction] = await Promise.all([
      calculateRequirementsProgress(enrollmentId).catch(() => null),
      analyzeRepo(enrollmentId).catch(() => null),
      NextAction.findOne({
        where: { project_id: project.id, status: ['pending', 'accepted'] },
        order: [['created_at', 'DESC']],
      }).catch(() => null),
    ]);

    res.json({
      project_id: project.id,
      project_stage: project.project_stage,
      organization_name: project.organization_name,
      progress,
      repo: repoAnalysis,
      current_action: currentAction ? {
        id: currentAction.id,
        title: currentAction.title,
        reason: currentAction.reason,
        status: currentAction.status,
        metadata: (currentAction as any).metadata,
      } : null,
      setup_status: project.setup_status,
    });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /execution-status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Capability Hierarchy & Scope Control
// ---------------------------------------------------------------------------

// Capability/Feature/Scope routes removed — not yet implemented
// Will be restored when Capability and Feature models are created

// ---------------------------------------------------------------------------
// Core Project Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/portal/project
 * Get the current participant's project with stage and variables.
 */
router.get('/api/portal/project', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) {
      res.status(404).json({ error: 'No project found for this enrollment' });
      return;
    }
    res.json(project);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/artifacts
 * Get all artifacts linked to the participant's project, grouped by category.
 */
router.get('/api/portal/project/artifacts', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment, getProjectWithArtifacts } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) {
      res.status(404).json({ error: 'No project found for this enrollment' });
      return;
    }
    const projectWithArtifacts = await getProjectWithArtifacts(project.id);
    const artifacts = (projectWithArtifacts as any)?.projectArtifacts || [];

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const artifact of artifacts) {
      const category = artifact.artifact_category || artifact.artifact_stage || 'uncategorized';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(artifact);
    }

    res.json({ project_id: project.id, project_stage: project.project_stage, artifacts, grouped });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/artifacts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/portfolio
 * Generate or retrieve portfolio for the participant's project.
 */
router.get('/api/portal/project/portfolio', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generatePortfolio } = await import('../services/portfolioGenerationService');
    const portfolio = await generatePortfolio(enrollmentId);
    res.json(portfolio);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/portfolio error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/executive
 * Generate executive deliverable for the participant's project.
 */
router.get('/api/portal/project/executive', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generateExecutiveDeliverable } = await import('../services/executiveDeliverableService');
    const deliverable = await generateExecutiveDeliverable(enrollmentId);
    res.json(deliverable);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/executive error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/mentor
 * Generate AI project mentor guidance for the participant.
 */
router.get('/api/portal/project/mentor', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generateMentorGuidance } = await import('../services/projectMentorService');
    const guidance = await generateMentorGuidance(enrollmentId);
    res.json(guidance);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/mentor error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/workflow
 * Generate workflow state showing phase progress and task checklists.
 */
router.get('/api/portal/project/workflow', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generateWorkflowState } = await import('../services/projectWorkflowService');
    const workflow = await generateWorkflowState(enrollmentId);
    res.json(workflow);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/workflow error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/portal/project/refresh
 * Trigger portfolio enhancement — regenerate portfolio, executive, and maturity score.
 */
router.post('/api/portal/project/refresh', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { refreshProjectOutputs } = await import('../services/portfolioEnhancementService');
    const result = await refreshProjectOutputs(enrollmentId);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /project/refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/portal/project/requirements/generate
 * Start requirements document generation job.
 */
router.post('/api/portal/project/requirements/generate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { mode, user_prompt } = req.body;
    const { startRequirementsGeneration } = await import('../services/requirementsGenerationService');
    const result = await startRequirementsGeneration(
      enrollmentId,
      mode || 'professional',
      user_prompt,
    );
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /project/requirements/generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/interventions
 * Get active mentor interventions for the current project.
 */
router.get('/api/portal/project/interventions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) {
      res.status(404).json({ error: 'No project found' });
      return;
    }
    const { getActiveInterventions } = await import('../services/mentorInterventionService');
    const interventions = await getActiveInterventions(project.id);
    res.json({ interventions });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/interventions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/requirements/job/:id
 * Get status of a requirements generation job.
 */
router.get('/api/portal/project/requirements/job/:id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getJobStatus } = await import('../services/requirementsGenerationService');
    const status = await getJobStatus(req.params.id as string);
    if (!status) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(status);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /project/requirements/job error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Artifact Compiler Routes (V2)
// ---------------------------------------------------------------------------

router.post('/api/portal/project/compile', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { document_type } = req.body;
    if (!document_type) {
      res.status(400).json({ error: 'document_type is required' });
      return;
    }
    const { compileDocument } = await import('../services/artifactCompilerService');
    const result = await compileDocument(enrollmentId, document_type);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /compile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/compile/all', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { compileAll } = await import('../services/artifactCompilerService');
    const results = await compileAll(enrollmentId);
    res.json(results);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /compile/all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/compile/status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getCompilationStatus } = await import('../services/artifactCompilerService');
    const status = await getCompilationStatus(enrollmentId);
    res.json(status);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /compile/status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Requirements Matching Routes (V2)
// ---------------------------------------------------------------------------

router.post('/api/portal/project/requirements/extract', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { extractRequirements } = await import('../services/requirementsMatchingService');
    const result = await extractRequirements(project.id);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /requirements/extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/requirements/match', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { matchRequirementsToRepo } = await import('../services/requirementsMatchingService');
    const result = await matchRequirementsToRepo(project.id);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /requirements/match error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/requirements/map', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getRequirementsStatus } = await import('../services/requirementsMatchingService');
    const status = await getRequirementsStatus(project.id);
    res.json(status);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /requirements/map error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/portal/project/requirements/map/:id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { manualMatch } = await import('../services/requirementsMatchingService');
    const { file_paths } = req.body;
    const result = await manualMatch(req.params.id as string, file_paths || []);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] PUT /requirements/map error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GitHub Sync Routes (V2)
// ---------------------------------------------------------------------------

router.post('/api/portal/project/github/sync', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { fullSync } = await import('../services/githubService');
    const result = await fullSync(enrollmentId);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /github/sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/github/tree', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getFileTree } = await import('../services/githubService');
    const tree = await getFileTree(enrollmentId);
    res.json({ tree });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /github/tree error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/github/status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(enrollmentId);
    if (!conn) { res.json({ connected: false }); return; }
    res.json({
      connected: true,
      repo_url: conn.repo_url,
      repo_owner: conn.repo_owner,
      repo_name: conn.repo_name,
      language: conn.repo_language,
      file_count: conn.file_count,
      last_sync: conn.last_sync_at,
      recent_commits: (conn.commit_summary_json || []).slice(0, 5),
    });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /github/status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Progress Routes (V2)
// ---------------------------------------------------------------------------

router.get('/api/portal/project/progress', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { calculateProgress } = await import('../services/projectProgressService');
    const progress = await calculateProgress(enrollmentId);
    res.json(progress);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /progress error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/progress/refresh', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { calculateProgress } = await import('../services/projectProgressService');
    const progress = await calculateProgress(enrollmentId);
    res.json(progress);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /progress/refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Export/Import Routes (V2)
// ---------------------------------------------------------------------------

router.get('/api/portal/project/export', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { exportProjectState } = await import('../services/projectExportService');
    const state = await exportProjectState(enrollmentId);
    res.json(state);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Next Action Engine Routes
// ---------------------------------------------------------------------------

router.get('/api/portal/project/next-action', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getNextAction } = await import('../services/nextAction/nextActionService');
    const action = await getNextAction(enrollmentId);
    if (!action) {
      res.json({ action: null, message: 'No next action available — all requirements are complete or none have been extracted.' });
      return;
    }
    res.json({ action });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /next-action error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/next-action/accept', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { action_id } = req.body;
    if (!action_id) {
      res.status(400).json({ error: 'action_id is required' });
      return;
    }
    const { acceptAction } = await import('../services/nextAction/nextActionService');
    const action = await acceptAction(action_id);
    res.json({ action });
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /next-action/accept error:', err.message);
    const status = err.message.includes('not found') || err.message.includes('not pending') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/api/portal/project/next-action/complete', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { action_id } = req.body;
    if (!action_id) {
      res.status(400).json({ error: 'action_id is required' });
      return;
    }
    const { completeAction } = await import('../services/nextAction/nextActionService');
    const action = await completeAction(action_id);
    res.json({ action });
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /next-action/complete error:', err.message);
    const status = err.message.includes('not found') || err.message.includes('cannot be') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Guided Execution Engine Routes
// ---------------------------------------------------------------------------

router.get('/api/portal/project/guided-execution', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const actionId = req.query.action_id as string;
    if (!actionId) {
      res.status(400).json({ error: 'action_id query parameter is required' });
      return;
    }
    const { getGuidedExecution } = await import('../services/guidedExecution/guidedExecutionService');
    const payload = await getGuidedExecution(enrollmentId, actionId);
    res.json(payload);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /guided-execution error:', err.message);
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Verification Engine Routes
// ---------------------------------------------------------------------------

router.post('/api/portal/project/verify', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { verifyProject } = await import('../services/verification/verificationOrchestrator');
    const summary = await verifyProject(enrollmentId);
    res.json(summary);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/verification-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getVerificationStatus } = await import('../services/verification/verificationOrchestrator');
    const details = await getVerificationStatus(project.id);
    res.json({ requirements: details });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /verification-status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Adaptive Progression Routes
// ---------------------------------------------------------------------------

router.post('/api/portal/project/progression-evaluate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { action_id } = req.body;
    if (!action_id) {
      res.status(400).json({ error: 'action_id is required' });
      return;
    }
    const { evaluateProgression } = await import('../services/adaptive/progressionOrchestrator');
    const result = await evaluateProgression(enrollmentId, action_id);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /progression-evaluate error:', err.message);
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// War Room Aggregation Route
// ---------------------------------------------------------------------------

router.get('/api/portal/project/warroom', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    // Parallel data fetching
    const [progressResult, nextActionResult, verificationResult, recentActivity, graphResult, riskResult] = await Promise.all([
      import('../services/projectProgressService').then(m => m.calculateProgress(enrollmentId).catch(() => null)),
      import('../services/nextAction/nextActionService').then(m => m.getNextAction(enrollmentId).catch(() => null)),
      import('../services/verification/verificationOrchestrator').then(m => m.getVerificationStatus(project.id).catch(() => [])),
      buildActivityFeed(project.id),
      import('../services/artifactGraphService').then(m => m.getFullGraph().catch(() => ({ nodes: [], edges: [] }))),
      import('../services/risk/riskOrchestrator').then(m => m.evaluateProjectRisk(enrollmentId).catch(() => ({ risks: [], anomalies: [], health: { health_score: 0, velocity_score: 0, stability_score: 0 } }))),
    ]);

    // Coverage summary
    const requirements = verificationResult || [];
    const coverageSummary = {
      total: requirements.length,
      verified_complete: requirements.filter((r: any) => r.verification_status === 'verified_complete').length,
      verified_partial: requirements.filter((r: any) => r.verification_status === 'verified_partial').length,
      not_verified: requirements.filter((r: any) => r.verification_status === 'not_verified' || !r.verification_status).length,
    };

    res.json({
      progress: progressResult,
      current_action: nextActionResult,
      requirements,
      recent_activity: recentActivity,
      artifact_graph: graphResult,
      coverage_summary: coverageSummary,
      risk_summary: riskResult,
    });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /warroom error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function buildActivityFeed(projectId: string): Promise<any[]> {
  const { VerificationLog, ProgressionLog } = await import('../models');

  const [verLogs, progLogs] = await Promise.all([
    VerificationLog.findAll({ where: { project_id: projectId }, order: [['created_at', 'DESC']], limit: 15 }),
    ProgressionLog.findAll({ where: { project_id: projectId }, order: [['created_at', 'DESC']], limit: 15 }),
  ]);

  const feed: any[] = [];

  for (const log of verLogs) {
    feed.push({
      type: 'verification',
      timestamp: log.created_at?.toISOString(),
      title: `Verification: ${log.status}`,
      detail: log.notes || '',
      confidence: log.confidence,
    });
  }

  for (const log of progLogs) {
    feed.push({
      type: 'progression',
      timestamp: log.created_at?.toISOString(),
      title: `Decision: ${log.decision_type}`,
      detail: log.reason || '',
      confidence: log.confidence,
    });
  }

  // Sort by timestamp descending and limit
  feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return feed.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Risk + Anomaly Route
// ---------------------------------------------------------------------------

router.get('/api/portal/project/risk-summary', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { evaluateProjectRisk } = await import('../services/risk/riskOrchestrator');
    const result = await evaluateProjectRisk(enrollmentId);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /risk-summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// System Design Contract Routes
// ---------------------------------------------------------------------------

router.post('/api/portal/project/contract/generate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { slug } = req.body;
    if (!slug) { res.status(400).json({ error: 'slug is required' }); return; }
    const { fetchAndStoreContract } = await import('../services/architectIntegrationService');
    const contract = await fetchAndStoreContract(enrollmentId, slug);
    res.json(contract);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /contract/generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/contract', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getStoredContract } = await import('../services/architectIntegrationService');
    const contract = await getStoredContract(enrollmentId);
    if (!contract) { res.json({ contract: null }); return; }
    res.json(contract);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /contract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/contract/lock', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { lockContract } = await import('../services/architectIntegrationService');
    const contract = await lockContract(enrollmentId);
    res.json(contract);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /contract/lock error:', err.message);
    const status = err.message.includes('already locked') || err.message.includes('No contract') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Project Suggestion + Selection Routes
// ---------------------------------------------------------------------------

router.post('/api/portal/project/suggestions/generate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generateSuggestions } = await import('../services/projectSuggestionService');
    const suggestions = await generateSuggestions(enrollmentId);
    res.json({ suggestions });
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /suggestions/generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/suggestions/select', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { suggestion_id, suggestions } = req.body;
    if (!suggestion_id || !suggestions) {
      res.status(400).json({ error: 'suggestion_id and suggestions are required' });
      return;
    }
    const { selectProject } = await import('../services/projectSelectionService');
    const result = await selectProject(enrollmentId, suggestion_id, suggestions);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /suggestions/select error:', err.message);
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// CLAUDE.md & Project State
// ---------------------------------------------------------------------------

/**
 * GET /api/portal/project/claude-md
 * Generate CLAUDE.md content from current project state.
 */
router.get('/api/portal/project/claude-md', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generateClaudeMd, generateProjectState } = await import('../services/claudeMdService');
    const claudeMd = await generateClaudeMd(enrollmentId);
    const projectState = await generateProjectState(enrollmentId);
    res.json({ claudeMd, projectState: JSON.parse(projectState) });
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /claude-md error:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

/**
 * POST /api/portal/project/claude-md/push
 * Push CLAUDE.md + PROJECT_STATE.json to participant's GitHub repo.
 */
router.post('/api/portal/project/claude-md/push', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { pushClaudeMdToRepo } = await import('../services/claudeMdService');
    const result = await pushClaudeMdToRepo(enrollmentId);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /claude-md/push error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/portal/project/scaffold/generate
 * Generate project scaffold and push to GitHub repo.
 */
router.post('/api/portal/project/scaffold/generate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { generateAndPushScaffold } = await import('../services/projectScaffoldService');
    const result = await generateAndPushScaffold(enrollmentId);
    res.json(result);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /scaffold/generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/portal/project/reconcile
 * Compare DB state with repo CLAUDE.md/PROJECT_STATE.json.
 */
router.post('/api/portal/project/reconcile', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { reconcile } = await import('../services/projectReconciliationService');
    const report = await reconcile(enrollmentId);
    res.json(report);
  } catch (err: any) {
    console.error('[ProjectRoutes] POST /reconcile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/portal/project/workstation-context
 * Get full context for launching AI Workstation (Claude Code).
 */
router.get('/api/portal/project/workstation-context', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { buildWorkstationContext } = await import('../services/workstationService');
    const context = await buildWorkstationContext(enrollmentId);
    res.json(context);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /workstation-context error:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

export default router;
