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
    // Enrich with capability names
    const { Capability } = await import('../models');
    const caps = await Capability.findAll({ where: { project_id: project.id }, attributes: ['id', 'name'] });
    const capMap = new Map(caps.map((c: any) => [c.id, c.name]));
    status.requirements = status.requirements.map((r: any) => {
      const json = r.toJSON ? r.toJSON() : r;
      json.capability_name = capMap.get(json.capability_id) || 'Unassigned';
      return json;
    });
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
    const limit = parseInt(req.query.limit as string) || 5;
    const offset = parseInt(req.query.offset as string) || 0;
    const allCommits = conn.commit_summary_json || [];
    res.json({
      connected: true,
      repo_url: conn.repo_url,
      repo_owner: conn.repo_owner,
      repo_name: conn.repo_name,
      language: conn.repo_language,
      file_count: conn.file_count,
      last_sync: conn.last_sync_at,
      recent_commits: allCommits.slice(offset, offset + limit),
      total_commits: allCommits.length,
      has_more: offset + limit < allCommits.length,
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

  // Also check FULL repo file tree for agent files matching this process name
  // This catches agents like "userManagementAgent.ts" that weren't keyword-matched to any requirement
  const processNameStems = (cap.name || '').toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
  // _repoFileTree is injected by the caller (list/detail endpoints) if available
  const repoTree: string[] = (cap as any)._repoFileTree || allFiles;
  const processAgentFiles = repoTree.filter((f: string) => {
    const name = (f.split('/').pop() || '').toLowerCase();
    if (!name.includes('agent') || !name.endsWith('.ts')) return false;
    if (/^\d{14}/.test(name)) return false; // migrations
    if (name.includes('seed')) return false;
    if (f.includes('migrations/') || f.includes('scripts/')) return false;
    // Must match at least one process name stem
    return processNameStems.some((stem: string) => name.includes(stem));
  });
  // Merge with existing agent detection
  const combinedAgentFiles = [...new Set([...agentFiles, ...processAgentFiles])];

  const hasBackend = backendFiles.length > 0;
  const hasFrontend = frontendFiles.length > 0;
  const hasAgents = combinedAgentFiles.length > 0;

  // Project-level layer detection from full repo file tree
  // If the PROJECT has backend/frontend/agents, don't tell each process to "Build Backend" etc.
  const projectHasBackend = repoTree.some((f: string) => f.includes('service') || f.includes('route') || f.includes('controller'));
  const projectHasFrontend = repoTree.some((f: string) => (f.includes('component') || f.includes('page') || f.includes('Page')) && f.endsWith('.tsx'));
  const projectHasAgents = repoTree.some((f: string) => (f.includes('agents/') || f.includes('intelligence/')) && f.endsWith('.ts') && f.toLowerCase().includes('agent'));
  const projectHasModels = repoTree.some((f: string) => f.includes('models/') && f.endsWith('.ts'));

  // ── 3 SEPARATE METRICS ──
  const reqCoverage = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;
  // Readiness = 40% layer existence + 60% requirement coverage
  // A system with all layers but 0% req coverage is only 40% ready, not 100%
  const layerScore = (hasBackend ? 50 : 0) + (hasFrontend ? 30 : 0) + (hasAgents ? 20 : 0);
  const readiness = Math.round(layerScore * 0.4 + reqCoverage * 0.6);
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
  const allReqsFlat = features.flatMap((f: any) => f.requirements || []);
  const systemState = {
    hasBackend, hasFrontend, hasAgents,
    hasModels: modelFiles.length > 0,
    projectHasBackend, projectHasFrontend, projectHasAgents, projectHasModels,
    backendCount: backendFiles.length, frontendCount: frontendFiles.length,
    agentCount: combinedAgentFiles.length, modelCount: modelFiles.length,
    reqCoverage, readiness, qualityScore: qualityTotal,
    maturityLevel: maturityLevel,
    gapTypes: [...(hasBackend ? [] : ['system']), ...(q.observability === 0 ? ['quality'] : []), ...(allReqsFlat.some((r: any) => r.status === 'unmatched') ? ['requirement'] : [])],
    unverifiedCount: allReqsFlat.filter((r: any) => r.status === 'matched').length,
    verifiedCount: allReqsFlat.filter((r: any) => r.status === 'verified').length,
    totalRequirements: totalR,
  };
  // Only use USER-DRIVEN completed steps (from copying prompts), NOT repo state
  // The engine sanitizes these — invalid keys (old bugs) are ignored
  const lastExec = (cap as any).last_execution;
  const completedSteps: string[] = lastExec?.completed_steps || [];
  const { generateExecutionPlan, isProcessComplete } = require('../intelligence/nextBestActionEngine');
  const executionPlan = generateExecutionPlan(systemState, completedSteps);
  const processComplete = isProcessComplete(systemState);

  const why_not: string[] = [];
  if (!hasBackend) why_not.push('No backend services or API routes found');
  if (!hasFrontend) why_not.push('No frontend UI components found');

  return {
    ...cap,
    source: 'requirements',
    total_requirements: totalR,
    matched_requirements: allReqsFlat.filter((r: any) => r.status === 'matched' || r.status === 'auto_verified' || r.status === 'verified').length,
    verified_requirements: allReqsFlat.filter((r: any) => r.status === 'auto_verified' || r.status === 'verified').length,
    auto_matched_requirements: allReqsFlat.filter((r: any) => r.status === 'matched').length,
    partial_requirements: allReqsFlat.filter((r: any) => r.status === 'partial').length,
    unmatched_requirements: allReqsFlat.filter((r: any) => r.status === 'unmatched' || r.status === 'not_started').length,
    completion_pct: reqCoverage, // override hierarchy's value
    metrics: { requirements_coverage: reqCoverage, system_readiness: readiness, quality_score: qualityTotal },
    quality: q,
    maturity: { level: maturityLevel, label: maturityLabel, next_level_requirements: nextReqs },
    gap_count: allGaps.length,
    gaps: allGaps,
    is_complete: processComplete,
    execution_plan: executionPlan,
    usability: { backend: hasBackend ? (reqCoverage > 70 ? 'ready' : 'partial') : 'missing', frontend: hasFrontend ? 'ready' : 'missing', agent: hasAgents ? 'ready' : 'missing', usable: processComplete, why_not },
    implementation_links: { backend: backendFiles, frontend: frontendFiles, agents: combinedAgentFiles, models: modelFiles },
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
    // Inject repo file tree for agent detection by process name
    let repoFileTree: string[] = [];
    try {
      const { getConnection } = await import('../services/githubService');
      const conn = await getConnection(req.participant!.sub);
      if (conn?.file_tree_json?.tree) repoFileTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    } catch {}
    // Inject last_execution from Capability models (hierarchy doesn't include JSONB fields)
    const { Capability: CapabilityModel } = await import('../models');
    const capModels = await CapabilityModel.findAll({ where: { project_id: project.id }, attributes: ['id', 'last_execution'] });
    const execMap = new Map(capModels.map((c: any) => [c.id, c.last_execution]));
    hierarchy.forEach((cap: any) => { cap._repoFileTree = repoFileTree; cap.last_execution = execMap.get(cap.id) || null; });
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
    // Inject last_execution from Capability model
    const { Capability: CapExec } = await import('../models');
    const capExec = await CapExec.findByPk(req.params.id as string, { attributes: ['id', 'last_execution'] });
    if (capExec) (cap as any).last_execution = (capExec as any).last_execution;
    // Inject repo file tree for agent detection
    try {
      const { getConnection } = await import('../services/githubService');
      const conn = await getConnection(req.participant!.sub);
      if (conn?.file_tree_json?.tree) (cap as any)._repoFileTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    } catch {}
    const enriched = enrichCapability(cap);

    // Graph-driven execution plan disabled — enrichment plan uses correct agent/file detection
    // The graph planner doesn't have access to full repo tree, so it produces stale results

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

    // Include project system prompt for Learn context
    const projectVars = (project as any).project_variables || {};

    res.json({
      ...enriched,
      repo_url: (project as any).github_repo_url || (project as any).repo_url || null,
      project_system_prompt: projectVars.system_prompt || '',
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

    // For requirement_implementation, fetch unmapped requirements and pass as extra context
    let extraContext: any = undefined;
    if (target === 'requirement_implementation') {
      // Fetch ALL requirements for this process — not just DB "unmatched" status.
      // Reason: process-level matching may have set status='matched' in DB,
      // but enrichCapability demotes them back to 'unmatched' in memory because
      // the matched files are noise. The DB and UI disagree.
      // Solution: include ALL requirements so Claude knows what to implement.
      const { RequirementsMap } = await import('../models');
      const allReqs = await RequirementsMap.findAll({
        where: { capability_id: req.params.id },
        attributes: ['requirement_text', 'status', 'confidence_score'],
        order: [['requirement_key', 'ASC']],
        limit: 50,
      });
      // Filter: include unmatched, not_started, and low-confidence "matched" (< 0.7)
      const needsWork = allReqs.filter((r: any) =>
        r.status === 'unmatched' || r.status === 'not_started' ||
        (r.status === 'matched' && (r.confidence_score || 0) < 0.7)
      );
      // If all reqs appear matched but with low confidence, include them all
      const reqs = needsWork.length > 0 ? needsWork : allReqs;
      extraContext = { unmappedRequirements: reqs.map((r: any) => ({ requirement_text: r.requirement_text })) };
    }

    const { generateImprovementPrompt } = await import('../intelligence/promptGenerator');
    const prompt = await generateImprovementPrompt(req.params.id as string, target, extraContext);

    // Save what this prompt promises to build (for post-resync comparison)
    const { Capability } = await import('../models');
    const cap = await Capability.findByPk(req.params.id as string);
    if (cap) {
      const prevExec = (cap as any).last_execution || {};
      const prevCompleted = prevExec.completed_steps || [];
      // Derive the SPECIFIC step key from the prompt title
      const titleLower = (prompt.title || '').toLowerCase();
      const stepKey =
        titleLower.includes('implement') && titleLower.includes('requirement') ? 'implement_requirements' :
        titleLower.includes('optimize') ? 'optimize_performance' :
        titleLower.includes('reliab') ? 'improve_reliability' :
        titleLower.includes('monitor') ? 'add_monitoring' :
        titleLower.includes('verif') ? 'verify_requirements' :
        titleLower.includes('frontend') || titleLower.includes('ui') ? 'add_frontend' :
        titleLower.includes('database') || titleLower.includes('model') ? 'add_database' :
        titleLower.includes('enhance') && titleLower.includes('agent') ? 'enhance_agents' :
        titleLower.includes('agent') ? 'add_agents' :
        titleLower.includes('backend') ? 'build_backend' :
        target; // fallback to prompt target
      (cap as any).last_execution = {
        step: prompt.title,
        target,
        promised_files: prompt.affected_files || [],
        promised_at: new Date().toISOString(),
        status: 'pending',
        completed_steps: [...new Set([...prevCompleted, stepKey])],
      };
      (cap as any).changed('last_execution', true);
      await cap.save();
    }

    res.json(prompt);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Resync: re-match requirements to repo for a specific process ────────
router.post('/api/portal/project/business-processes/:id/resync', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    // ── VERIFICATION LAYER: Capture BEFORE snapshot ──
    let metricsBefore: any = null;
    try {
      const { getCapabilityHierarchy: getHierBefore } = await import('../services/projectScopeService');
      const hierBefore = await getHierBefore(project.id);
      const capBefore = hierBefore.find((c: any) => c.id === req.params.id);
      if (capBefore) {
        const enrichedBefore = enrichCapability(capBefore);
        const { captureSnapshot } = await import('../intelligence/verification/regressionDetector');
        metricsBefore = captureSnapshot(enrichedBefore);
      }
    } catch { /* non-critical */ }

    // 1. Full GitHub sync (file tree + commits + stats) — keeps Code Intelligence in sync
    try {
      const { fullSync } = await import('../services/githubService');
      await fullSync(req.participant!.sub);
    } catch { /* non-critical */ }

    // 2. Re-run requirement matching for this process's requirements only
    const { RequirementsMap } = await import('../models');
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(req.participant!.sub);
    const fileTree: string[] = [];
    if (conn?.file_tree_json?.tree) {
      for (const item of (conn.file_tree_json as any).tree) {
        if (item.type === 'blob') fileTree.push(item.path);
      }
    }

    const processReqs = await RequirementsMap.findAll({
      where: { project_id: project.id, capability_id: req.params.id as string },
    });

    // Strict keyword matching — filters noise files, requires higher overlap
    const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'with', 'that', 'this', 'be', 'as', 'by', 'at', 'it', 'must', 'should', 'will', 'can', 'all', 'each', 'from', 'have', 'has', 'not', 'but', 'use', 'using', 'used', 'also', 'such', 'may', 'would', 'could', 'when', 'where', 'how', 'what', 'which', 'their', 'they', 'them', 'then', 'than', 'been', 'being', 'its', 'into', 'only', 'any', 'some', 'more', 'most', 'other', 'over', 'new', 'just', 'get', 'set', 'add', 'make', 'like', 'about', 'after', 'before', 'between', 'through', 'during', 'without', 'within', 'across', 'along', 'based', 'need', 'needs', 'include', 'ensure', 'provide', 'support', 'system', 'data', 'process', 'user', 'create', 'manage', 'track', 'allow', 'enable']);
    // Noise file patterns to exclude from matching
    const noisePatterns = new Set(['.gitignore', '.env.example', '.env.dev', '.env.production.example', '.prettierrc', '.sequelizerc', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'next-env.d.ts', 'next.config.ts', 'jest.config.ts', 'postcss.config.mjs', 'eslint.config.mjs', 'globals.css', 'layout.tsx', 'docker-compose.yml', 'docker-compose.dev.yml', 'docker-compose.dev2.yml', 'docker-compose.production.yml', 'CLAUDE.md', '.dockerignore', 'CODEOWNERS', 'eslint.config.mjs']);
    // Only match against REAL implementation files — not dotdirs, configs, or metadata
    const implFileTree = fileTree.filter(f => {
      const name = f.split('/').pop() || '';
      if (noisePatterns.has(name)) return false;
      if (name.startsWith('.')) return false;
      if (/^\d{14}/.test(name)) return false; // migration timestamps
      // Exclude entire directories that are never implementation code
      if (f.startsWith('.claude/') || f.startsWith('.github/') || f.startsWith('.git/')) return false;
      if (f.includes('migrations/') || f.includes('node_modules/') || f.includes('dist/')) return false;
      if (f.includes('__tests__/') || f.includes('scripts/')) return false;
      // Must be a code file (ts, tsx, js, jsx, py, sql) or meaningful config
      if (!/\.(ts|tsx|js|jsx|py|sql|json)$/.test(name)) return false;
      if (name === 'package.json' || name === 'tsconfig.json') return false; // already in noise
      return true;
    });

    let matched = 0, partial = 0, unmatched = 0, preserved = 0;

    for (const req2 of processReqs) {
      // ADDITIVE ONLY: never demote already-matched or verified requirements
      if (req2.status === 'matched' || req2.status === 'verified' || req2.status === 'auto_verified') {
        matched++;
        preserved++;
        continue; // skip re-matching — preserve existing match
      }

      const text = (req2.requirement_text || '').toLowerCase();
      const keywords = text.split(/\W+/).filter(w => w.length > 2 && !stopwords.has(w));
      if (keywords.length === 0) { req2.status = 'unmatched'; req2.github_file_paths = []; req2.confidence_score = 0; await req2.save(); unmatched++; continue; }

      const matchedFiles: string[] = [];
      for (const filePath of implFileTree) {
        const fileTokens = filePath.toLowerCase().split(/[\/\.\-_]+/).filter(t => t.length > 2);
        // Require 30% keyword overlap — balanced between false positives and false negatives
        const overlap = keywords.filter(k => fileTokens.some(t => t === k || (t.length > 3 && k.length > 3 && (t.includes(k) || k.includes(t)))));
        if (overlap.length >= Math.max(2, keywords.length * 0.3)) {
          matchedFiles.push(filePath);
        }
      }

      const score = matchedFiles.length > 0 ? Math.min(1, matchedFiles.length / Math.max(2, keywords.length * 0.4)) : 0;
      req2.github_file_paths = matchedFiles.slice(0, 10);
      req2.confidence_score = score;
      req2.status = score >= 0.7 ? 'matched' : score >= 0.3 ? 'partial' : 'unmatched';
      await req2.save();

      if (score >= 0.7) matched++;
      else if (score >= 0.3) partial++;
      else unmatched++;
    }

    // 2b. Process-level matching: if implementation files exist for this process name,
    // promote remaining unmatched requirements to "matched" (the process IS being built)
    const { Capability: CapModel } = await import('../models');
    const processCap = await CapModel.findByPk(req.params.id as string);
    if (processCap) {
      // Process name stems — require at least 2 stems to match a filename to avoid
      // false positives (e.g., "user" matching AdminUser.ts for "User Journey Maps")
      const procStems = (processCap.name || '').toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
      const procImplFiles = fileTree.filter((f: string) => {
        const name = (f.split('/').pop() || '').toLowerCase();
        if (name.startsWith('.') || /^\d{14}/.test(name) || f.includes('migrations/')) return false;
        if (f.startsWith('.claude/') || f.startsWith('.github/') || f.includes('node_modules/')) return false;
        if (!(f.includes('services/') || f.includes('routes/') || f.includes('agents/') || f.includes('models/'))) return false;
        // Require at least 2 process name stems to match the filename
        // This prevents "user" alone from matching AdminUser.ts
        const matchingStemCount = procStems.filter((stem: string) => name.includes(stem)).length;
        return matchingStemCount >= Math.min(2, procStems.length);
      });

      if (procImplFiles.length >= 2) {
        // Process has real implementation files — promote unmatched AND partial reqs
        // Confidence 0.75 ensures enrichCapability treats them as auto_verified
        let promoted = 0;
        for (const req2 of processReqs) {
          const prevStatus = req2.status;
          if ((prevStatus === 'unmatched' || prevStatus === 'partial') && req2.verified_by !== 'process_level') {
            req2.status = 'matched';
            req2.github_file_paths = procImplFiles.slice(0, 5);
            req2.confidence_score = 0.75; // above enrichCapability's 0.7 threshold
            req2.verified_by = 'process_level';
            await req2.save();
            if (prevStatus === 'unmatched') unmatched--;
            else if (prevStatus === 'partial') partial--;
            matched++;
            promoted++;
          }
        }
        if (promoted > 0) console.log(`[Resync] Process-level matching: promoted ${promoted} reqs for "${processCap.name}" (${procImplFiles.length} impl files found)`);
      }
    }

    // 3. Run reconciliation (without validation report — just graph rebuild + recalculate)
    const { reconcileAfterExecution } = await import('../intelligence/execution/reconciliationEngine');
    const result = await reconcileAfterExecution(
      req.participant!.sub, project.id, req.params.id as string, ''
    );

    // 4. Compare last execution promise vs reality
    const { Capability } = await import('../models');
    const cap = await Capability.findByPk(req.params.id as string);
    const lastExec = (cap as any)?.last_execution;
    let whatChanged: any = null;

    if (lastExec && lastExec.status === 'pending') {
      const promisedFiles = lastExec.promised_files || [];
      const foundFiles: string[] = [];
      const missingFiles: string[] = [];

      for (const pf of promisedFiles) {
        // Check if promised file (or similar) exists in repo
        const pfName = (pf.split('/').pop() || '').toLowerCase().replace(/\.(ts|tsx|js)$/, '');
        const found = fileTree.some(f => {
          const fName = (f.split('/').pop() || '').toLowerCase().replace(/\.(ts|tsx|js)$/, '');
          return fName === pfName || fName.includes(pfName) || pfName.includes(fName);
        });
        if (found) foundFiles.push(pf);
        else missingFiles.push(pf);
      }

      const newFilesInRepo = fileTree.filter(f => {
        const fTime = new Date(lastExec.promised_at || 0).getTime();
        // Can't check file timestamps from tree — just check if file is in agents/services/routes
        return (f.includes('agents/') || f.includes('services/') || f.includes('routes/')) &&
          !promisedFiles.some((pf: string) => f.includes(pf.split('/').pop() || '___'));
      });

      whatChanged = {
        last_step: lastExec.step,
        promised_files: promisedFiles.length,
        found: foundFiles.length,
        missing: missingFiles,
        status: missingFiles.length === 0 ? 'complete' : 'incomplete',
        follow_up_needed: missingFiles.length > 0,
      };

      // Update execution status
      if (cap) {
        const prevCompleted = lastExec.completed_steps || [];

        // CRITICAL: If the step was verified as "already complete" (no new files created),
        // auto-complete this step so it doesn't reappear. The engine will then show the next step.
        // But if that next step would ALSO be "already in place" (because quality scores are
        // based on matched files, not repo state), we'd loop forever.
        // Solution: when a step completes with 0 changes, also auto-complete all
        // quality/infrastructure steps — the only real work left is requirement implementation.
        let autoCompleted: string[] = [];
        if (missingFiles.length === 0) {
          // Step verified — auto-complete ALL infrastructure/quality steps
          // because they're based on static quality scores that won't change
          // until requirements are actually mapped to files.
          autoCompleted = [
            'build_backend', 'add_database', 'add_frontend', 'add_agents',
            'add_monitoring', 'improve_reliability', 'optimize_performance',
            'enhance_agents', 'verify_requirements',
          ];
        }

        (cap as any).last_execution = {
          ...lastExec,
          status: missingFiles.length === 0 ? 'verified' : 'incomplete',
          verified_at: new Date().toISOString(),
          found_files: foundFiles,
          missing_files: missingFiles,
          completed_steps: [...new Set([...prevCompleted, ...autoCompleted])],
        };
        (cap as any).changed('last_execution', true);
        await cap.save();
      }
    }

    // ── VERIFICATION LAYER: Capture AFTER snapshot + detect regressions ──
    let regressions: any[] = [];
    let metricsAfter: any = null;
    try {
      const { getCapabilityHierarchy: getHierAfter } = await import('../services/projectScopeService');
      const hierAfter = await getHierAfter(project.id);
      const capAfter = hierAfter.find((c: any) => c.id === req.params.id);
      if (capAfter) {
        // Inject repo file tree for accurate enrichment
        (capAfter as any)._repoFileTree = fileTree;
        const { Capability: CapAfterModel } = await import('../models');
        const capAfterExec = await CapAfterModel.findByPk(req.params.id as string, { attributes: ['id', 'last_execution'] });
        if (capAfterExec) (capAfter as any).last_execution = (capAfterExec as any).last_execution;
        const enrichedAfter = enrichCapability(capAfter);
        const { captureSnapshot, detectRegressions } = await import('../intelligence/verification/regressionDetector');
        metricsAfter = captureSnapshot(enrichedAfter);
        if (metricsBefore) {
          regressions = detectRegressions(metricsBefore, metricsAfter);
        }
      }

      // Store snapshot in BposExecutionSnapshot
      const { BposExecutionSnapshot } = await import('../models');
      await BposExecutionSnapshot.create({
        process_id: req.params.id,
        step_key: whatChanged?.last_step || null,
        execution_type: 'resync',
        metrics_before: metricsBefore,
        metrics_after: metricsAfter,
        regressions,
        triggered_by: req.participant!.sub,
      });
    } catch (snapErr: any) {
      console.error('[Resync] Snapshot capture error:', snapErr.message);
    }

    res.json({
      ...result,
      resync: { total: processReqs.length, matched, partial, unmatched, preserved, files_scanned: fileTree.length },
      what_changed: whatChanged,
      verification: {
        regressions,
        metrics_before: metricsBefore,
        metrics_after: metricsAfter,
        regression_count: regressions.length,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Verify: on-demand structural + regression check ────────
router.get('/api/portal/project/business-processes/:id/verify', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    // Build graph for this process
    const { buildProcessGraph } = await import('../intelligence/graph/graphBuilder');
    const graph = await buildProcessGraph(project.id, req.params.id as string);

    // Run structural checks
    const { runStructuralChecks } = await import('../intelligence/verification/structuralVerifier');
    const structuralReport = runStructuralChecks(graph, req.params.id as string);

    // Get recent snapshots for trend analysis
    const { BposExecutionSnapshot } = await import('../models');
    const recentSnapshots = await BposExecutionSnapshot.findAll({
      where: { process_id: req.params.id },
      order: [['created_at', 'DESC']],
      limit: 10,
    });

    res.json({
      structural: structuralReport,
      history: recentSnapshots.map((s: any) => ({
        id: s.id,
        step_key: s.step_key,
        execution_type: s.execution_type,
        metrics_before: s.metrics_before,
        metrics_after: s.metrics_after,
        regressions: s.regressions,
        created_at: s.created_at,
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Sync Engine: paste Claude output → full reconciliation ────────
router.post('/api/portal/project/business-processes/:id/sync', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    // Full GitHub sync first — keeps Code Intelligence tab current
    try {
      const { fullSync } = await import('../services/githubService');
      await fullSync(req.participant!.sub);
    } catch { /* non-critical */ }
    const { reconcileAfterExecution } = await import('../intelligence/execution/reconciliationEngine');
    const result = await reconcileAfterExecution(
      req.participant!.sub, project.id, req.params.id as string, req.body.report || ''
    );
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Reclassify: redistribute uncategorized requirements ────────
router.post('/api/portal/project/business-processes/reclassify', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { groupRequirements } = await import('../intelligence/requirements/requirementGrouper');
    const result = await groupRequirements(project.id);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Add Business Process (NLP) ────────
router.post('/api/portal/project/business-processes/add', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const description = req.body.description || '';
    if (!description.trim()) { res.status(400).json({ error: 'Description is required' }); return; }

    // Use LLM to generate process name + requirements from description
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You create business process definitions from natural language descriptions. Respond with valid JSON only.' },
        { role: 'user', content: `Create a business process from this description:\n\n"${description}"\n\nRespond:\n{"name":"Process Name","description":"Detailed description","requirements":["REQ text 1","REQ text 2","REQ text 3"]}` },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    if (!parsed.name) { res.status(400).json({ error: 'Could not generate process' }); return; }

    const { Capability, Feature, RequirementsMap } = await import('../models');

    // Create capability
    const cap = await Capability.create({
      project_id: project.id, name: parsed.name, description: parsed.description || description,
      status: 'active', priority: 'medium', sort_order: 50, source: 'user_input',
      lifecycle_status: 'active',
    } as any);

    // Create default feature
    const feat = await Feature.create({
      capability_id: cap.id, name: 'Core Functionality',
      description: parsed.description || description,
      status: 'active', priority: 'medium', sort_order: 0, source: 'user_input',
    } as any);

    // Create requirements
    let reqCount = 0;
    const reqs = parsed.requirements || [];
    for (let i = 0; i < reqs.length; i++) {
      await RequirementsMap.create({
        project_id: project.id, capability_id: cap.id, feature_id: feat.id,
        requirement_key: `REQ-NEW-${Date.now()}-${i}`,
        requirement_text: reqs[i], status: 'unmatched', confidence_score: 0,
      });
      reqCount++;
    }

    res.json({ success: true, id: cap.id, name: parsed.name, description: parsed.description, requirements_count: reqCount });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Process Lifecycle Management ────────
router.put('/api/portal/project/business-processes/:id/lifecycle', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { Capability } = await import('../models');
    const cap = await Capability.findByPk(req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const status = req.body.status;
    if (!['active', 'deferred', 'future'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
    cap.lifecycle_status = status;
    await cap.save();
    res.json({ success: true, lifecycle_status: status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Project System Prompt ────────
router.get('/api/portal/project/system-prompt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const vars = (project as any).project_variables || {};
    res.json({
      system_prompt: vars.system_prompt || '',
      organization_name: project.organization_name,
      primary_business_problem: project.primary_business_problem,
      selected_use_case: project.selected_use_case,
      automation_goal: (project as any).automation_goal,
      industry: project.industry,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/system-prompt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const vars = { ...((project as any).project_variables || {}), system_prompt: req.body.system_prompt || '' };
    (project as any).project_variables = vars;
    (project as any).changed('project_variables', true);
    await project.save();
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
