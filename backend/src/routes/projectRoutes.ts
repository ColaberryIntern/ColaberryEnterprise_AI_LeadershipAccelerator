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

// In-memory activation progress tracker
const activationProgress: Map<string, { status: string; message: string; batch?: number; total_batches?: number; capabilities?: number; error?: string }> = new Map();

router.post('/api/portal/project/setup/activate', requireParticipant, async (req: Request, res: Response) => {
  const enrollmentId = req.participant!.sub;
  // Start activation in background, return immediately
  activationProgress.set(enrollmentId, { status: 'processing', message: 'Starting activation...' });
  res.json({ status: 'processing', message: 'Activation started' });

  // Run async
  (async () => {
    try {
      const { activateProject } = await import('../services/projectSetupService');
      const result = await activateProject(enrollmentId);
      activationProgress.set(enrollmentId, { status: 'complete', message: 'Activation complete', capabilities: result.requirements_count || 0 });
    } catch (err: any) {
      activationProgress.set(enrollmentId, { status: 'failed', message: err.message, error: err.message });
    }
  })();
});

router.get('/api/portal/project/setup/activation-progress', requireParticipant, async (req: Request, res: Response) => {
  const enrollmentId = req.participant!.sub;
  const progress = activationProgress.get(enrollmentId);

  // Check clustering-level progress for granular updates
  const { clusteringProgress } = await import('../services/requirementClusteringService');
  const clusterProg = clusteringProgress.get(enrollmentId);

  if (clusterProg && clusterProg.status === 'processing') {
    res.json({
      status: 'processing',
      message: clusterProg.message,
      batch: clusterProg.batch,
      total_batches: clusterProg.total_batches,
      capabilities_so_far: clusterProg.capabilities_so_far,
      percent: clusterProg.total_batches > 0 ? Math.round((clusterProg.batch / clusterProg.total_batches) * 100) : 0,
    });
    return;
  }

  if (!progress) {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (project) { res.json({ status: 'complete', message: 'Project already activated' }); return; }
    res.json({ status: 'not_started', message: 'Activation not started' });
    return;
  }
  res.json(progress);
  if (progress.status === 'complete' || progress.status === 'failed') {
    setTimeout(() => { activationProgress.delete(enrollmentId); clusteringProgress.delete(enrollmentId); }, 300000);
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
// ---------------------------------------------------------------------------
// Capability Hierarchy & Scope Control
// ---------------------------------------------------------------------------

router.get('/api/portal/project/capabilities', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    res.json(await getCapabilityHierarchy(project.id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/capabilities/scope', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { type, id, active } = req.body;
    if (!type || !id || typeof active !== 'boolean') { res.status(400).json({ error: 'type, id, active required' }); return; }
    const scope = await import('../services/projectScopeService');
    if (type === 'capability') await scope.toggleCapability(id, active);
    else if (type === 'feature') await scope.toggleFeature(id, active);
    else if (type === 'requirement') await scope.toggleRequirement(id, active);
    else { res.status(400).json({ error: 'type must be capability/feature/requirement' }); return; }
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    res.json(await scope.getCapabilityHierarchy(project!.id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/capabilities/add-feature', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { description, capability_id } = req.body;
    if (!description) { res.status(400).json({ error: 'description required' }); return; }
    const { generateFeature } = await import('../services/aiFeatureBuilderService');
    res.json(await generateFeature(req.participant!.sub, description.trim(), capability_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/capabilities/recluster', requireParticipant, async (req: Request, res: Response) => {
  try {
    if (!req.body.confirm) { res.status(400).json({ error: 'Set confirm: true' }); return; }
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project?.requirements_document) { res.status(400).json({ error: 'No requirements document' }); return; }
    const { Capability: Cap } = await import('../models');
    await Cap.destroy({ where: { project_id: project.id } });
    const { parseRequirementsWithSections } = await import('../services/requirementsParserService');
    const { clusterRequirements, persistHierarchy } = await import('../services/requirementClusteringService');
    const parsed = parseRequirementsWithSections(project.requirements_document);
    const hierarchy = await clusterRequirements(project.id, parsed);
    res.json(await persistHierarchy(project.id, hierarchy));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

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

    // If project has uploaded requirements_document, parse from that (new flow)
    if (project.requirements_document) {
      const { parseRequirementsWithSections } = await import('../services/requirementsParserService');
      const { parseRequirements } = await import('../services/requirementsMatchingService');
      const { RequirementsMap } = await import('../models');

      // Parse flat requirements
      const parsed = parseRequirements(project.requirements_document);
      // Clear existing
      await RequirementsMap.destroy({ where: { project_id: project.id } });
      // Create rows
      for (const req of parsed) {
        await RequirementsMap.create({
          project_id: project.id, requirement_key: req.key, requirement_text: req.text,
          status: 'unmatched', github_file_paths: [], confidence_score: 0, is_active: true,
        } as any);
      }

      // Run clustering (non-critical)
      let clustered = false;
      try {
        const parsedWithSections = parseRequirementsWithSections(project.requirements_document);
        const { clusterRequirements, persistHierarchy } = await import('../services/requirementClusteringService');
        const hierarchy = await clusterRequirements(project.id, parsedWithSections);
        await persistHierarchy(project.id, hierarchy);
        clustered = true;
      } catch (clusterErr) {
        console.warn('[Extract] Clustering failed:', (clusterErr as Error).message);
      }

      res.json({ total: parsed.length, clustered, source: 'uploaded_document' });
      return;
    }

    // Fallback: old flow (compiled artifact)
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

// ---------------------------------------------------------------------------
// Business Processes (BPOS) — portal-scoped
// ---------------------------------------------------------------------------

// ─── Shared enrichment for business processes ────────────────────────────────
const NOISE_FILES_SET = new Set(['[id]', 'next-env.d.ts', '.gitignore', '.prettierrc', '.sequelizerc', '.env.example', 'package.json', 'tsconfig.json', 'README.md', 'package-lock.json']);
function enrichCapability(cap: any) {
  const features = cap.features || [];
  const allReqs = features.flatMap((f: any) => f.requirements || []);
  // Auto-promote or demote requirements based on actual file quality
  const IMPL_PATTERNS = [/service/i, /route/i, /controller/i, /models?\//i, /\.tsx$/, /agent/i, /middleware/i, /component/i, /page/i];
  for (const r of allReqs) {
    if (r.status === 'matched' || r.status === 'partial') {
      const files = (r.github_file_paths || []) as string[];
      // Filter to only real implementation files (not noise)
      const realFiles = files.filter((f: string) => {
        const name = f.split('/').pop() || '';
        if (NOISE_FILES_SET.has(name)) return false;
        if (/^\d{14}/.test(name)) return false;
        if (name.startsWith('.')) return false;
        return IMPL_PATTERNS.some(p => p.test(f));
      });
      if (realFiles.length > 0 && r.confidence_score >= 0.7) {
        r.status = 'auto_verified';
        r.github_file_paths = realFiles; // only show real files
      } else if (realFiles.length === 0) {
        // Matched only to noise files → demote to unmatched
        r.status = 'unmatched';
        r.github_file_paths = [];
        r.confidence_score = 0;
      }
    }
  }
  const verified = allReqs.filter((r: any) => r.status === 'verified' || r.status === 'auto_verified');
  const autoMatched = allReqs.filter((r: any) => r.status === 'matched');
  const matched = [...verified, ...autoMatched]; // combined for coverage calc
  const partial = allReqs.filter((r: any) => r.status === 'partial');
  const unmatched = allReqs.filter((r: any) => r.status === 'unmatched' || r.status === 'not_started');
  const totalR = allReqs.length;
  const matchedR = matched.length;
  const verifiedR = verified.length;

  // Filter noise files
  const isReal = (f: string) => { const n = f.split('/').pop() || f; return !NOISE_FILES_SET.has(n) && !n.startsWith('.'); };
  const allFiles: string[] = [...new Set<string>(allReqs.flatMap((r: any) => r.github_file_paths || []))].filter(isReal);
  const backendFiles = allFiles.filter((f: string) => f.includes('service') || f.includes('route') || f.includes('controller') || f.includes('middleware') || (f.includes('models/') && !f.includes('frontend')));
  const frontendFiles = allFiles.filter((f: string) => (f.includes('component') || f.includes('page') || f.includes('Page')) && f.endsWith('.tsx'));
  // Agent detection: must be actual agent implementation files, NOT migrations, seeds, or scripts
  const agentFiles = allFiles.filter((f: string) => {
    const name = f.split('/').pop() || '';
    // Exclude: migration files (timestamp prefix), seed files, .js files (compiled), scripts
    if (/^\d{14}/.test(name)) return false; // migration files like 20260327000014-...
    if (name.includes('seed') || name.includes('Seed')) return false;
    if (name.endsWith('.js') && !f.includes('/dist/')) return false; // raw JS = likely migration
    if (f.includes('scripts/') || f.includes('migrations/')) return false;
    // Must be in agents/ or intelligence/agents/ directory AND be a .ts file
    return (f.includes('agents/') || f.includes('intelligence/')) && name.endsWith('.ts') && (name.includes('Agent') || name.includes('agent'));
  });
  const modelFiles = allFiles.filter((f: string) => f.includes('models/') && f.endsWith('.ts'));

  const hasBackend = backendFiles.length > 0;
  const hasFrontend = frontendFiles.length > 0;
  const hasAgents = agentFiles.length > 0;

  // ── 3 SEPARATE METRICS ──
  const reqCoverage = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;
  const readiness = (hasBackend ? 50 : 0) + (hasFrontend ? 30 : 0) + (hasAgents ? 20 : 0);
  // Quality scoring (each 0-10) — based on what exists + requirements coverage
  const q = {
    determinism: hasBackend ? Math.min(10, 5 + backendFiles.length) : (reqCoverage > 50 ? 2 : 0),
    reliability: modelFiles.length > 0 ? Math.min(10, 4 + modelFiles.length) : (hasBackend ? 2 : 0),
    observability: 0, // honest — no monitoring detected
    ux_exposure: hasFrontend ? Math.min(10, 6 + frontendFiles.length) : 0,
    automation: hasAgents ? Math.min(10, 6 + agentFiles.length) : (reqCoverage > 70 ? 1 : 0),
    production_readiness: Math.min(10, (hasBackend ? 3 : 0) + (hasFrontend ? 3 : 0) + (hasAgents ? 2 : 0) + (modelFiles.length > 0 ? 2 : 0)),
  };
  const qualityTotal = Math.round(Object.values(q).reduce((s, v) => s + v, 0) * 100 / 60); // normalize to 0-100

  // ── MATURITY LEVEL ──
  let maturityLevel = 0, maturityLabel = 'Not Started';
  const nextReqs: string[] = [];
  if (allFiles.length > 0) { maturityLevel = 1; maturityLabel = 'Prototype'; }
  if (hasBackend && reqCoverage > 50) { maturityLevel = 2; maturityLabel = 'Functional'; }
  if (hasBackend && hasFrontend && reqCoverage > 70) { maturityLevel = 3; maturityLabel = 'Production'; }
  if (hasBackend && hasFrontend && hasAgents && reqCoverage > 85) { maturityLevel = 4; maturityLabel = 'Autonomous'; }
  if (hasBackend && hasFrontend && hasAgents && reqCoverage > 95 && qualityTotal > 70) { maturityLevel = 5; maturityLabel = 'Self-Optimizing'; }
  // Next level requirements
  if (maturityLevel < 2) { if (!hasBackend) nextReqs.push('Build backend services'); if (reqCoverage <= 50) nextReqs.push('Implement >50% of requirements'); }
  if (maturityLevel === 2) { if (!hasFrontend) nextReqs.push('Create frontend UI'); if (reqCoverage <= 70) nextReqs.push('Increase requirement coverage to >70%'); }
  if (maturityLevel === 3) { if (!hasAgents) nextReqs.push('Add AI agent automation'); if (reqCoverage <= 85) nextReqs.push('Cover >85% of requirements'); }
  if (maturityLevel === 4) { if (reqCoverage <= 95) nextReqs.push('Cover >95% of requirements'); if (qualityTotal <= 70) nextReqs.push('Improve quality score above 70'); }

  // ── GAPS (unified) ──
  const reqGaps = features.flatMap((f: any) =>
    (f.requirements || []).filter((r: any) => r.status === 'unmatched' || r.status === 'partial' || r.status === 'not_started')
      .map((r: any) => ({ ...r, feature_name: f.name, gap_type: 'requirement' }))
  );
  const sysGaps: any[] = [];
  if (!hasBackend) sysGaps.push({ text: 'Backend services needed — no services or API routes detected', key: 'SYS-BE', gap_type: 'system' });
  if (!hasFrontend) sysGaps.push({ text: 'Frontend UI needed — no React components detected', key: 'SYS-FE', gap_type: 'system' });
  const qualGaps: any[] = [];
  if (q.observability === 0) qualGaps.push({ text: 'No monitoring or logging detected', key: 'Q-OBS', gap_type: 'quality' });
  if (q.reliability < 3) qualGaps.push({ text: 'Low reliability — add data models and error handling', key: 'Q-REL', gap_type: 'quality' });
  const allGaps = [...sysGaps, ...qualGaps, ...reqGaps];

  // ── DYNAMIC EXECUTION PLAN (from nextBestActionEngine) ──
  const { generateExecutionPlan } = require('../intelligence/nextBestActionEngine');
  const allReqsFlat = features.flatMap((f: any) => f.requirements || []);
  const systemState = {
    hasBackend, hasFrontend, hasAgents,
    hasModels: modelFiles.length > 0,
    backendCount: backendFiles.length, frontendCount: frontendFiles.length,
    agentCount: agentFiles.length, modelCount: modelFiles.length,
    reqCoverage, readiness, qualityScore: qualityTotal,
    maturityLevel: maturityLevel,
    gapTypes: [...(hasBackend ? [] : ['system']), ...(q.observability === 0 ? ['quality'] : []), ...(allReqsFlat.some((r: any) => r.status === 'unmatched') ? ['requirement'] : [])],
    unverifiedCount: allReqsFlat.filter((r: any) => r.status === 'matched').length,
    verifiedCount: allReqsFlat.filter((r: any) => r.status === 'verified').length,
    totalRequirements: totalR,
  };
  const executionPlan = generateExecutionPlan(systemState);

  const why_not: string[] = [];
  if (!hasBackend) why_not.push('No backend services or API routes found');
  if (!hasFrontend) why_not.push('No frontend UI components found');

  return {
    ...cap,
    source: 'requirements',
    total_requirements: totalR,
    matched_requirements: matchedR,
    verified_requirements: verifiedR,
    auto_matched_requirements: autoMatched.length,
    partial_requirements: partial.length,
    unmatched_requirements: unmatched.length,
    completion_pct: reqCoverage, // override hierarchy's value
    metrics: { requirements_coverage: reqCoverage, system_readiness: readiness, quality_score: qualityTotal },
    quality: q,
    maturity: { level: maturityLevel, label: maturityLabel, next_level_requirements: nextReqs },
    gap_count: allGaps.length,
    gaps: allGaps,
    execution_plan: executionPlan,
    usability: { backend: hasBackend ? (reqCoverage > 70 ? 'ready' : 'partial') : 'missing', frontend: hasFrontend ? 'ready' : 'missing', agent: hasAgents ? 'ready' : 'missing', usable: hasBackend && reqCoverage > 50, why_not },
    implementation_links: { backend: backendFiles, frontend: frontendFiles, agents: agentFiles, models: modelFiles },
    vision: features.map((f: any) => f.description || f.name).filter(Boolean),
  };
}

router.get('/api/portal/project/business-processes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const enriched = hierarchy.map(enrichCapability);

    // Graph-based prioritization
    try {
      const { buildProjectGraph } = await import('../intelligence/graph/graphBuilder');
      const { getProcessPriority } = await import('../intelligence/graph/graphQueryEngine');
      const graph = await buildProjectGraph(project.id);
      const priorities = getProcessPriority(graph);
      // Sort by priority score (highest first)
      enriched.sort((a: any, b: any) => {
        const pa = priorities.get(`proc:${a.id}`)?.score || 0;
        const pb = priorities.get(`proc:${b.id}`)?.score || 0;
        return pb - pa;
      });
      // Add rank + reason
      enriched.forEach((cap: any, i: number) => {
        const p = priorities.get(`proc:${cap.id}`);
        cap.priority_rank = i + 1;
        cap.priority_reason = p?.reason || 'Standard priority';
        cap.priority_score = p?.score || 0;
      });
    } catch (graphErr) {
      // Graph is optional — fallback to unsorted
      enriched.forEach((cap: any, i: number) => { cap.priority_rank = i + 1; cap.priority_reason = 'Default order'; cap.priority_score = 0; });
    }

    res.json(enriched);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/business-processes/:id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const cap = hierarchy.find((c: any) => c.id === (req.params.id as string));
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const enriched = enrichCapability(cap);

    // Try graph-driven execution plan
    try {
      const { buildProcessGraph } = await import('../intelligence/graph/graphBuilder');
      const { getNextBestActions } = await import('../intelligence/graph/graphQueryEngine');
      const graph = await buildProcessGraph(project.id, req.params.id as string);
      const graphActions = getNextBestActions(graph, `proc:${req.params.id as string}`);
      if (graphActions.length > 0) enriched.execution_plan = graphActions;
    } catch { /* fallback to heuristic plan already in enriched */ }

    // Add BPOS fields from Capability model
    const { Capability } = await import('../models');
    const capModel = await Capability.findByPk(req.params.id as string);
    // Level 2: Add flow data from graph
    let flowData = null;
    try {
      const { buildProcessGraph } = await import('../intelligence/graph/graphBuilder');
      const { getProcessFlow } = await import('../intelligence/graph/graphQueryEngine');
      const graph = await buildProcessGraph(project.id, req.params.id as string);
      flowData = getProcessFlow(graph, `proc:${req.params.id as string}`);
    } catch { /* graph is optional */ }

    res.json({
      ...enriched,
      repo_url: (project as any).github_repo_url || (project as any).repo_url || null,
      hitl_config: capModel?.hitl_config || null,
      autonomy_level: capModel?.autonomy_level || 'manual',
      autonomy_history: capModel?.autonomy_history || [],
      strength_scores: capModel?.strength_scores || null,
      confidence_score: capModel?.confidence_score || null,
      success_rate: capModel?.success_rate || null,
      failure_rate: capModel?.failure_rate || null,
      last_evaluated_at: capModel?.last_evaluated_at || null,
      flow: flowData?.flow || null,
      broken_connections: flowData?.broken_connections || [],
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/business-processes/:id/predict', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const cap = hierarchy.find((c: any) => c.id === (req.params.id as string));
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const enriched = enrichCapability(cap);
    const { predictImpact } = await import('../intelligence/predictiveEngine');
    const prediction = predictImpact(
      { metrics: enriched.metrics, quality: enriched.quality, maturity: enriched.maturity, usability: enriched.usability },
      req.body.action
    );
    res.json(prediction);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Execution Intelligence (real data from agent activity logs) ──────────
router.get('/api/portal/project/execution-intelligence', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const { sequelize: seq } = await import('../config/database');

    // Recent activity timeline (last 50 events)
    const [timeline] = await seq.query(`
      SELECT l.id, l.agent_id, a.agent_name, l.action, l.result, l.confidence, l.duration_ms, l.created_at, l.reason
      FROM ai_agent_activity_logs l
      LEFT JOIN ai_agents a ON a.id = l.agent_id
      ORDER BY l.created_at DESC LIMIT 50
    `);

    // Agent summary stats
    const [agentStats] = await seq.query(`
      SELECT agent_name, status, run_count, error_count
      FROM ai_agents WHERE run_count > 0
      ORDER BY run_count DESC LIMIT 20
    `);

    // Recent failure count (last 24h)
    const [failures] = await seq.query(`
      SELECT COUNT(*) as count FROM ai_agent_activity_logs
      WHERE result = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
    `);

    // Recent success count (last 24h)
    const [successes] = await seq.query(`
      SELECT COUNT(*) as count FROM ai_agent_activity_logs
      WHERE result = 'success' AND created_at > NOW() - INTERVAL '24 hours'
    `);

    // Total runs last 24h
    const [total24h] = await seq.query(`
      SELECT COUNT(*) as count FROM ai_agent_activity_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    // Most common failure reasons (last 7 days)
    const [failureInsights] = await seq.query(`
      SELECT a.agent_name, l.action, COUNT(*) as count
      FROM ai_agent_activity_logs l
      LEFT JOIN ai_agents a ON a.id = l.agent_id
      WHERE l.result = 'failed' AND l.created_at > NOW() - INTERVAL '7 days'
      GROUP BY a.agent_name, l.action
      ORDER BY count DESC LIMIT 10
    `);

    const totalRuns24h = parseInt((total24h as any)[0]?.count || '0');
    const failCount24h = parseInt((failures as any)[0]?.count || '0');
    const successCount24h = parseInt((successes as any)[0]?.count || '0');
    const successRate = totalRuns24h > 0 ? Math.round((successCount24h / totalRuns24h) * 100) : 0;

    res.json({
      timeline,
      agent_stats: agentStats,
      summary: {
        total_runs_24h: totalRuns24h,
        success_count_24h: successCount24h,
        failure_count_24h: failCount24h,
        success_rate: successRate,
      },
      failure_insights: failureInsights,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/business-processes/:id/hitl', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { updateHITLConfig, getHITLConfig } = await import('../intelligence/hitl/hitlEngine');
    await updateHITLConfig(req.params.id as string, req.body);
    res.json(await getHITLConfig(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/business-processes/:id/autonomy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { applyAutonomyChange, assessAutonomy } = await import('../intelligence/autonomyProgressionEngine');
    await applyAutonomyChange(req.params.id as string, req.body.level, req.body.reason || 'User adjustment');
    res.json(await assessAutonomy(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/business-processes/:id/evaluate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { scoreProcess } = await import('../intelligence/processScoringEngine');
    const { assessAutonomy } = await import('../intelligence/autonomyProgressionEngine');
    const scores = await scoreProcess(req.params.id as string);
    const autonomy = await assessAutonomy(req.params.id as string);
    res.json({ scores, autonomy });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/business-processes/:id/prompt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { target } = req.body;
    if (!target) { res.status(400).json({ error: 'target required' }); return; }
    const { generateImprovementPrompt } = await import('../intelligence/promptGenerator');
    res.json(await generateImprovementPrompt(req.params.id as string, target));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Sync Engine: paste Claude output → full reconciliation ────────
router.post('/api/portal/project/business-processes/:id/sync', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { reconcileAfterExecution } = await import('../intelligence/execution/reconciliationEngine');
    const result = await reconcileAfterExecution(
      req.participant!.sub, project.id, req.params.id as string, req.body.report || ''
    );
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
