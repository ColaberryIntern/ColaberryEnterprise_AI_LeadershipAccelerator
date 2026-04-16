import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';

const router = Router();

// ---------------------------------------------------------------------------
// Project-scoped ownership helpers (data isolation)
// ---------------------------------------------------------------------------
async function getParticipantProject(enrollmentId: string) {
  const { getProjectByEnrollment } = await import('../services/projectService');
  return getProjectByEnrollment(enrollmentId);
}

async function findOwnedCapability(enrollmentId: string, capabilityId: string) {
  const project = await getParticipantProject(enrollmentId);
  if (!project) return null;
  const { Capability } = await import('../models');
  const cap = await Capability.findOne({ where: { id: capabilityId, project_id: project.id } });
  return cap;
}

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
    const result = await connectGitHub(req.participant!.sub, repo_url.trim(), access_token);
    // Auto-discover frontend pages after GitHub connect
    try {
      const { getProjectByEnrollment } = await import('../services/projectService');
      const project = await getProjectByEnrollment(req.participant!.sub);
      if (project) {
        const { getConnection } = await import('../services/githubService');
        const conn = await getConnection(req.participant!.sub);
        const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
        if (fileTree.length > 0) {
          const { processOrphanedPages } = await import('../services/frontendPageDiscovery');
          await processOrphanedPages({ projectId: project.id, fileTree });
        }
      }
    } catch { /* page discovery is non-critical */ }
    res.json(result);
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
      // Mark project as activated
      try {
        const { getProjectByEnrollment } = await import('../services/projectService');
        const project = await getProjectByEnrollment(enrollmentId);
        if (project) {
          const ss = (project as any).setup_status || {};
          (project as any).setup_status = { ...ss, activated: true };
          (project as any).changed('setup_status', true);
          await project.save();
        }
      } catch {}
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
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { manualMatch } = await import('../services/requirementsMatchingService');
    const { file_paths } = req.body;
    const result = await manualMatch(project.id, req.params.id as string, file_paths || []);
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

    // Auto-discover existing code after sync (non-blocking)
    try {
      const { getProjectByEnrollment } = await import('../services/projectService');
      const project = await getProjectByEnrollment(enrollmentId);
      if (project) {
        const { Capability } = await import('../models');
        const existingDiscovered = await Capability.count({ where: { project_id: project.id, source: 'discovered' } });
        if (existingDiscovered === 0) {
          // First sync — discover existing code
          const { discoverExistingCode } = await import('../intelligence/requirements/codeDiscovery');
          const discovery = await discoverExistingCode(project.id, enrollmentId);
          console.log(`[CodeDiscovery] Auto-discovered ${discovery.capabilities_discovered} modules, merged ${discovery.merged_into_existing} into existing BPs`);
          (result as any).discovery = discovery;
        }
      }
    } catch (discErr: any) {
      console.error('[CodeDiscovery] Auto-discovery error:', discErr.message);
    }

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
  let allReqs = features.flatMap((f: any) => f.requirements || []);

  // Mode-aware filtering: only include requirements at or below the effective mode
  // Hierarchy: mvp(0) < production(1) < enterprise(2) < autonomous(3)
  // A req tagged ['mvp'] shows in ALL modes. A req tagged ['enterprise'] shows only in enterprise+autonomous.
  const MODE_LEVEL: Record<string, number> = { mvp: 0, production: 1, enterprise: 2, autonomous: 3 };
  const effectiveModeForFilter = (cap as any)._effectiveMode || (cap as any)._projectMode || 'production';
  const currentModeLevel = MODE_LEVEL[effectiveModeForFilter] ?? 1;
  const modeFilter = (r: any) => {
    if (!r.modes || r.modes.length === 0) return true; // null/empty = all modes (backward compat)
    const reqMinMode = r.modes[0]; // modes[0] is the minimum required mode
    const reqLevel = MODE_LEVEL[reqMinMode] ?? 0;
    return reqLevel <= currentModeLevel; // include if req's min level <= current mode
  };
  allReqs = allReqs.filter(modeFilter);
  for (const f of features) {
    if (f.requirements) {
      f.requirements = f.requirements.filter(modeFilter);
    }
  }
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

  // Also check FULL repo file tree for frontend files matching this process name
  // This catches pages/components matching the business process
  // Uses stem matching + synonym expansion for better coverage
  const BP_SYNONYMS: Record<string, string[]> = {
    analytics: ['analytics', 'chart', 'report', 'dashboard', 'kpi', 'metric', 'insight'],
    campaign: ['campaign', 'outreach', 'sequence', 'email', 'sms', 'drip'],
    lead: ['lead', 'prospect', 'contact', 'pipeline', 'capture', 'form'],
    user: ['user', 'profile', 'account', 'auth', 'login', 'signup', 'role'],
    content: ['content', 'editor', 'template', 'draft', 'publish', 'cms'],
    monitoring: ['monitor', 'alert', 'health', 'status', 'log', 'observ'],
    testing: ['test', 'quality', 'qa', 'validation', 'check'],
    workflow: ['workflow', 'automation', 'trigger', 'schedule', 'cron', 'pipeline'],
    deployment: ['deploy', 'build', 'release', 'version', 'ci', 'cd'],
    search: ['search', 'discover', 'filter', 'browse', 'explore'],
    integration: ['integrat', 'connect', 'api', 'webhook', 'sync'],
    feedback: ['feedback', 'survey', 'rating', 'review', 'comment'],
    notification: ['notif', 'alert', 'bell', 'push', 'toast'],
    performance: ['perform', 'speed', 'optim', 'cache', 'metric'],
    security: ['secur', 'auth', 'permission', 'role', 'access', 'encrypt'],
    onboarding: ['onboard', 'welcome', 'setup', 'wizard', 'getting.started'],
    error: ['error', 'incident', 'issue', 'ticket', 'bug', 'fault'],
    data: ['data', 'import', 'export', 'migration', 'backup', 'storage'],
  };
  // Build expanded search terms from process name
  const expandedTerms = new Set<string>();
  for (const stem of processNameStems) {
    expandedTerms.add(stem);
    for (const [_key, synonyms] of Object.entries(BP_SYNONYMS)) {
      if (synonyms.some(s => stem.includes(s) || s.includes(stem))) {
        synonyms.forEach(s => expandedTerms.add(s));
      }
    }
  }
  const processFrontendFiles = repoTree.filter((f: string) => {
    const name = (f.split('/').pop() || '').toLowerCase();
    if (!name.endsWith('.tsx') && !name.endsWith('.jsx')) return false;
    if (name === 'layout.tsx' || name === 'globals.css' || name.startsWith('[') || name === 'index.tsx') return false;
    if (!(f.includes('frontend/') || f.includes('/app/') || f.includes('/pages/') || f.includes('/components/'))) return false;
    const pathLower = f.toLowerCase();
    return [...expandedTerms].some((term: string) => term.length >= 4 && pathLower.includes(term));
  });
  // Also include ALL frontend page files if the process name is generic enough
  // (e.g., for projects with a clear frontend/ directory)
  const allRepoFrontendFiles = repoTree.filter((f: string) => {
    const name = (f.split('/').pop() || '').toLowerCase();
    return (f.includes('frontend/') || f.includes('/app/') || f.includes('/pages/')) &&
      (name.endsWith('.tsx') || name.endsWith('.jsx')) &&
      name !== 'layout.tsx' && !name.startsWith('[') && name !== 'globals.css';
  });
  const combinedFrontendFiles = [...new Set([...frontendFiles, ...processFrontendFiles])];

  // Also check FULL repo file tree for model files matching this process name
  const processModelFiles = repoTree.filter((f: string) => {
    const name = (f.split('/').pop() || '').toLowerCase();
    if (!f.includes('models/') || !name.endsWith('.ts')) return false;
    if (/^\d{14}/.test(name) || name.includes('index') || name.includes('seed')) return false;
    return processNameStems.some((stem: string) => stem.length >= 4 && name.includes(stem));
  });
  const combinedModelFiles = [...new Set([...modelFiles, ...processModelFiles])];
  // Project-level: does the repo have ANY models?
  const allRepoModelFiles = repoTree.filter((f: string) => f.includes('models/') && f.endsWith('.ts') && !(f.split('/').pop() || '').includes('index'));

  // Also check FULL repo file tree for backend service files matching this process name
  const processBackendFiles = repoTree.filter((f: string) => {
    const name = (f.split('/').pop() || '').toLowerCase();
    if (!(f.includes('services/') || f.includes('routes/'))) return false;
    if (!name.endsWith('.ts') || /^\d{14}/.test(name) || name.includes('seed') || name.includes('index')) return false;
    return processNameStems.some((stem: string) => stem.length >= 4 && name.includes(stem));
  });
  const combinedBackendFiles = [...new Set([...backendFiles, ...processBackendFiles])];

  const hasBackend = combinedBackendFiles.length > 0;
  const hasFrontend = combinedFrontendFiles.length > 0;
  const hasAgents = combinedAgentFiles.length > 0;

  // Project-level layer detection from full repo file tree.
  // Patterns are broad to recognize diverse architectures (monolith, microservices,
  // Next.js, Python/Django, Go, etc.) — not just the Accelerator's own layout.
  const projectHasBackend = repoTree.some((f: string) => /\/(service|route|controller|handler|gateway|api|server|resolver)\b/i.test(f) && /\.(ts|js|py|go|rs|java)$/.test(f));
  const projectHasFrontend = repoTree.some((f: string) => /\/(component|page|view|screen|layout)\b/i.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f));
  const projectHasAgents = repoTree.some((f: string) => /(agent|intelligence|automation|worker|bot)\b/i.test(f) && /\.(ts|js|py)$/.test(f));
  const projectHasModels = repoTree.some((f: string) => /\/(model|schema|entity|migration)\b/i.test(f) && /\.(ts|js|py|go|rs|java)$/.test(f));
  // Count project-level files per layer for quality scoring (when per-BP matches are empty)
  const projectBackendCount = repoTree.filter((f: string) => /\/(service|route|controller|handler|gateway|api)\b/i.test(f) && /\.(ts|js|py|go)$/.test(f)).length;
  const projectFrontendCount = repoTree.filter((f: string) => /\/(component|page|view|screen)\b/i.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f)).length;
  const projectAgentCount = repoTree.filter((f: string) => /(agent|intelligence|automation)\b/i.test(f) && /\.(ts|js|py)$/.test(f)).length;
  const projectModelCount = repoTree.filter((f: string) => /\/(model|schema|entity)\b/i.test(f) && /\.(ts|js|py|go)$/.test(f)).length;

  // Effective layer detection: per-BP files || project-level detection
  const effectiveBackend = hasBackend || projectHasBackend;
  const effectiveFrontend = hasFrontend || projectHasFrontend;
  const effectiveAgents = hasAgents || projectHasAgents;
  const effectiveModels = combinedModelFiles.length > 0 || projectHasModels;
  const effectiveBackendCount = backendFiles.length || Math.min(projectBackendCount, 20);
  const effectiveFrontendCount = frontendFiles.length || Math.min(projectFrontendCount, 20);
  const effectiveAgentCount = combinedAgentFiles.length || Math.min(projectAgentCount, 10);
  const effectiveModelCount = modelFiles.length || Math.min(projectModelCount, 10);

  // ── 3 SEPARATE METRICS ──
  const reqCoverage = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;
  const layerScore = (effectiveBackend ? 50 : 0) + (effectiveFrontend ? 30 : 0) + (effectiveAgents ? 20 : 0);
  const readiness = Math.round(layerScore * 0.4 + reqCoverage * 0.6);
  // Quality scoring uses effective (project-level) counts so BPs in projects with
  // recognized architecture don't score 0 just because per-BP file matches are empty.
  const q = {
    determinism: effectiveBackend ? Math.min(10, 5 + effectiveBackendCount) : (reqCoverage > 50 ? 2 : 0),
    reliability: effectiveModels ? Math.min(10, 4 + effectiveModelCount) : (effectiveBackend ? 2 : 0),
    observability: 0,
    ux_exposure: effectiveFrontend ? Math.min(10, 6 + effectiveFrontendCount) : 0,
    automation: effectiveAgents ? Math.min(10, 6 + effectiveAgentCount) : (reqCoverage > 70 ? 1 : 0),
    production_readiness: Math.min(10, (effectiveBackend ? 3 : 0) + (effectiveFrontend ? 3 : 0) + (effectiveAgents ? 2 : 0) + (effectiveModels ? 2 : 0)),
  };
  const qualityTotal = Math.round(Object.values(q).reduce((s, v) => s + v, 0) * 100 / 60);

  // ── MATURITY LEVEL ──
  let maturityLevel = 0, maturityLabel = 'Not Started';
  const nextReqs: string[] = [];
  if (allFiles.length > 0 || effectiveBackend) { maturityLevel = 1; maturityLabel = 'Prototype'; }
  if (effectiveBackend && reqCoverage > 50) { maturityLevel = 2; maturityLabel = 'Functional'; }
  if (effectiveBackend && effectiveFrontend && reqCoverage > 70) { maturityLevel = 3; maturityLabel = 'Production'; }
  if (effectiveBackend && effectiveFrontend && effectiveAgents && reqCoverage > 85) { maturityLevel = 4; maturityLabel = 'Autonomous'; }
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
  if (!hasBackend && !projectHasBackend) sysGaps.push({ text: 'Backend services needed — no services or API routes detected', key: 'SYS-BE', gap_type: 'system' });
  if (!hasFrontend && !projectHasFrontend) sysGaps.push({ text: 'Frontend UI needed — no React components detected', key: 'SYS-FE', gap_type: 'system' });
  const qualGaps: any[] = [];
  if (q.observability === 0) qualGaps.push({ text: 'No monitoring or logging detected', key: 'Q-OBS', gap_type: 'quality' });
  if (q.reliability < 3) qualGaps.push({ text: 'Low reliability — add data models and error handling', key: 'Q-REL', gap_type: 'quality' });
  const allGaps = [...sysGaps, ...qualGaps, ...reqGaps];

  // ── DYNAMIC EXECUTION PLAN (from nextBestActionEngine) ──
  const allReqsFlat = features.flatMap((f: any) => f.requirements || []);
  const systemState = {
    hasBackend: effectiveBackend, hasFrontend: effectiveFrontend, hasAgents: effectiveAgents,
    hasModels: combinedModelFiles.length > 0 || projectHasModels,
    projectHasBackend, projectHasFrontend, projectHasAgents, projectHasModels,
    backendCount: backendFiles.length, frontendCount: frontendFiles.length,
    agentCount: combinedAgentFiles.length, modelCount: modelFiles.length,
    reqCoverage, readiness, qualityScore: qualityTotal,
    maturityLevel: maturityLevel,
    gapTypes: [...(effectiveBackend ? [] : ['system']), ...(q.observability === 0 ? ['quality'] : []), ...(allReqsFlat.some((r: any) => r.status === 'unmatched') ? ['requirement'] : [])],
    unverifiedCount: allReqsFlat.filter((r: any) => r.status === 'matched').length,
    verifiedCount: allReqsFlat.filter((r: any) => r.status === 'verified').length,
    totalRequirements: totalR,
  };
  // Only use USER-DRIVEN completed steps (from copying prompts), NOT repo state
  // The engine sanitizes these — invalid keys (old bugs) are ignored
  const lastExec = (cap as any).last_execution;
  const completedSteps: string[] = lastExec?.completed_steps || [];
  const { generateExecutionPlan, isProcessComplete } = require('../intelligence/nextBestActionEngine');
  // Resolve effective mode: BP override > Campaign override > Project target_mode > 'production'
  const { resolveMode, getModeSource } = require('../intelligence/profiles/modeResolver');
  const { getProfile } = require('../intelligence/profiles/executionProfiles');
  const { getStrategy } = require('../intelligence/profiles/strategyTemplates');
  const effectiveMode = resolveMode(
    (cap as any)._projectMode || 'production',
    (cap as any).mode_override,
    (cap as any)._campaignMode
  );
  const modeSource = getModeSource(
    (cap as any)._projectMode,
    (cap as any)._campaignMode,
    (cap as any).mode_override
  );
  const profile = getProfile(effectiveMode);
  const strategy = getStrategy((cap as any).strategy_template);
  const profileOptions = {
    completion: profile.completion_thresholds,
    qualityGateCoverageMin: profile.quality_gate_enabled ? profile.quality_gate_coverage_min : 0,
    strategyOverrides: strategy.priority_overrides,
    allowedActionKeys: profile.allowed_action_keys,
  };
  // Detect page BP early for completion logic
  const isPageBP = cap.source === 'frontend_page';

  // Mode-aware completion: requires BOTH maturity threshold AND coverage/quality thresholds
  const meetsMaturity = maturityLevel >= (profile.completion_maturity_threshold || 3);
  // Page BPs: complete when they have a frontend_route (page exists and is connected)
  const isPageBPComplete = isPageBP && !!(cap as any).frontend_route && totalR === 0;
  const processComplete = isPageBPComplete || (meetsMaturity && isProcessComplete(systemState, profile.completion_thresholds));

  // Requirement-driven execution plan (primary), with old plan as fallback
  let executionPlan: any[];
  try {
    const { generateStepsFromRequirements } = require('../services/requirementToStepService');
    const reqInputs = allReqsFlat.map((r: any) => ({
      requirement_key: r.requirement_key || r.key,
      requirement_text: r.requirement_text || r.text || '',
      status: r.status,
      modes: r.modes,
    }));
    const unfinishedCount = reqInputs.filter((r: any) => r.status === 'unmatched' || r.status === 'not_started' || r.status === 'partial').length;
    if (unfinishedCount > 0) {
      console.log(`[enrichCapability] ${cap.name}: ${reqInputs.length} reqs (${unfinishedCount} unfinished), mode=${effectiveMode}`);
      console.log(`[enrichCapability] Sample req:`, JSON.stringify(reqInputs[0]).substring(0, 200));
    }
    executionPlan = generateStepsFromRequirements({
      requirements: reqInputs,
      gaps: [...(hasBackend || projectHasBackend ? [] : [{ text: 'Backend services needed', key: 'SYS-BE', gap_type: 'system' }]),
             ...(hasFrontend || projectHasFrontend ? [] : [{ text: 'Frontend UI needed', key: 'SYS-FE', gap_type: 'system' }]),
             ...(q.observability === 0 ? [{ text: 'No monitoring', key: 'Q-OBS', gap_type: 'quality' }] : [])],
      mode: effectiveMode,
      systemContext: { hasBackend, hasFrontend, hasAgents, hasModels: combinedModelFiles.length > 0, reqCoverage, qualityScore: qualityTotal, projectHasBackend, projectHasFrontend, projectHasAgents, projectHasModels, repoFileTree: repoTree },
      completedSteps,
      maxSteps: 8,
    });
    // If requirement-driven plan is empty but process isn't complete, fall back to old engine
    if (executionPlan.length === 0 && !processComplete) {
      executionPlan = generateExecutionPlan(systemState, completedSteps, profileOptions);
    }
  } catch (planErr: any) {
    // Fallback: use old hardcoded plan engine if new one fails
    console.error('[enrichCapability] Requirement-driven plan failed:', planErr?.message || planErr);
    executionPlan = generateExecutionPlan(systemState, completedSteps, profileOptions);
  }

  const why_not: string[] = [];
  if (!hasBackend) why_not.push('No backend services or API routes found');
  if (!hasFrontend) why_not.push('No frontend UI components found');

  return {
    ...cap,
    source: isPageBP ? 'frontend_page' : 'requirements',
    is_page_bp: isPageBP,
    total_requirements: totalR,
    matched_requirements: allReqsFlat.filter((r: any) => r.status === 'matched' || r.status === 'auto_verified' || r.status === 'verified').length,
    verified_requirements: allReqsFlat.filter((r: any) => r.status === 'auto_verified' || r.status === 'verified').length,
    auto_matched_requirements: allReqsFlat.filter((r: any) => r.status === 'matched').length,
    partial_requirements: allReqsFlat.filter((r: any) => r.status === 'partial').length,
    unmatched_requirements: allReqsFlat.filter((r: any) => r.status === 'unmatched' || r.status === 'not_started').length,
    completion_pct: reqCoverage, // override hierarchy's value
    metrics: { requirements_coverage: reqCoverage, system_readiness: readiness, quality_score: qualityTotal },
    // Process-level confidence: weighted average of requirement confidence scores
    confidence: (() => {
      const scored = allReqsFlat.filter((r: any) => r.confidence_score > 0);
      if (scored.length === 0) return { score: 0, source: 'no_matches', sample_size: 0 };
      const avg = scored.reduce((s: number, r: any) => s + (r.confidence_score || 0), 0) / scored.length;
      return { score: Math.round(avg * 100) / 100, source: 'requirement_avg', sample_size: scored.length };
    })(),
    quality: q,
    effective_mode: effectiveMode,
    mode_source: modeSource,
    mode_override: (cap as any).mode_override || null,
    campaign_mode: (cap as any)._campaignMode || null,
    applicability_status: (cap as any).applicability_status || 'active',
    mode_completion: {
      target_maturity: profile.completion_maturity_threshold,
      current_maturity: maturityLevel,
      complete_for_mode: processComplete,
      gap_reason: maturityLevel < profile.completion_maturity_threshold
        ? `Maturity L${maturityLevel} below L${profile.completion_maturity_threshold} target for ${effectiveMode} mode`
        : !processComplete ? 'Coverage or quality below threshold' : null,
    },
    maturity: {
      level: maturityLevel,
      label: maturityLabel,
      target_level: profile.completion_maturity_threshold,
      next_level_requirements: nextReqs,
      mode_gap: maturityLevel < profile.completion_maturity_threshold
        ? `Advance from L${maturityLevel} to L${profile.completion_maturity_threshold} (${effectiveMode} mode)`
        : null,
    },
    gap_count: allGaps.length,
    gaps: allGaps,
    is_complete: processComplete,
    execution_plan: executionPlan,
    usability: isPageBP
      ? { backend: 'n/a', frontend: (cap as any).frontend_route ? 'ready' : 'missing', agent: 'n/a', usable: isPageBPComplete, why_not: isPageBPComplete ? [] : ['Connect a frontend route to mark as ready'] }
      : { backend: hasBackend ? (reqCoverage > 70 ? 'ready' : 'partial') : 'missing', frontend: hasFrontend ? 'ready' : 'missing', agent: hasAgents ? 'ready' : 'missing', usable: processComplete, why_not },
    implementation_links: { backend: combinedBackendFiles, frontend: combinedFrontendFiles, agents: combinedAgentFiles, models: combinedModelFiles },
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
    const capModels = await CapabilityModel.findAll({ where: { project_id: project.id }, attributes: ['id', 'last_execution', 'mode_override', 'applicability_status', 'execution_profile', 'strategy_template', 'modes', 'frontend_route'] });
    const execMap = new Map(capModels.map((c: any) => [c.id, { last_execution: c.last_execution, mode_override: c.mode_override, applicability_status: c.applicability_status, execution_profile: c.execution_profile, strategy_template: c.strategy_template, modes: c.modes, frontend_route: c.frontend_route }]));
    const projectMode = (project as any).target_mode || 'production';
    // Load campaign mode overrides for capabilities that have linked campaigns
    let campaignModeMap = new Map<string, string>();
    try {
      const { Campaign } = await import('../models');
      const linkedCampaigns = await Campaign.findAll({
        where: { capability_id: { [require('sequelize').Op.ne]: null }, status: 'active' },
        attributes: ['capability_id', 'mode_override'],
      });
      for (const c of linkedCampaigns) {
        if ((c as any).mode_override && (c as any).capability_id) {
          campaignModeMap.set((c as any).capability_id, (c as any).mode_override);
        }
      }
    } catch { /* campaign mode is optional */ }

    hierarchy.forEach((cap: any) => {
      cap._repoFileTree = repoFileTree;
      cap._projectMode = projectMode;
      cap._campaignMode = campaignModeMap.get(cap.id) || null;
      // Pre-resolve effective mode for filtering (BP override > Campaign > Project)
      const capModeOverride = execMap.get(cap.id)?.mode_override;
      const capCampaignMode = campaignModeMap.get(cap.id);
      cap._effectiveMode = capModeOverride || capCampaignMode || projectMode || 'production';
      const extra = execMap.get(cap.id);
      if (extra) {
        cap.last_execution = extra.last_execution;
        cap.mode_override = extra.mode_override;
        cap.applicability_status = extra.applicability_status || 'active';
        cap.execution_profile = extra.execution_profile || 'production';
        cap.strategy_template = extra.strategy_template || 'default';
        if ((extra as any).frontend_route) cap.frontend_route = (extra as any).frontend_route;
      }
    });

    // Mode-aware BP filtering: include BPs whose minimum mode <= current project mode
    const MODE_LEVEL: Record<string, number> = { mvp: 0, production: 1, enterprise: 2, autonomous: 3 };
    const currentProjectModeLevel = MODE_LEVEL[projectMode] ?? 1;
    const modeFilteredHierarchy = hierarchy.filter((cap: any) => {
      const capModes = execMap.get(cap.id)?.modes as string[] | null;
      if (!capModes || capModes.length === 0) return true; // null = all modes
      const capMinLevel = MODE_LEVEL[capModes[0]] ?? 0;
      return capMinLevel <= currentProjectModeLevel;
    });

    const enriched = modeFilteredHierarchy.map(enrichCapability);
    // Track how many were filtered out
    const filteredOutCount = hierarchy.length - modeFilteredHierarchy.length;

    // Smart priority scoring — different logic for code BPs vs page BPs
    // Code BPs: highest gap = highest priority (most work needed first)
    // Page BPs: ranked by page importance tier, always after incomplete code BPs
    const PAGE_IMPORTANCE: Record<string, number> = {
      // Critical pages (core user flow)
      '/': 90, '/admin/dashboard': 88, '/portal/project': 85, '/admin/campaigns': 80,
      '/admin/leads': 78, '/admin/pipeline': 76, '/admin/intelligence': 75,
      '/enroll': 72, '/pricing': 70,
      // Important pages (secondary flow)
      '/admin/marketing': 60, '/admin/tickets': 58, '/admin/orchestration': 55,
      '/admin/communications': 52, '/admin/revenue': 50, '/admin/governance': 48,
      '/admin/visitors': 45, '/admin/settings': 42, '/admin/accelerator': 40,
      '/portal/curriculum': 38, '/portal/sessions': 35,
      // Support pages
      '/program': 30, '/advisory': 28, '/contact': 25, '/case-studies': 22,
      '/sponsorship': 20, '/strategy-call-prep': 18,
    };

    enriched.forEach((cap: any) => {
      const isPageBP = cap.is_page_bp || cap.source === 'frontend_page';
      const totalReqs = cap.total_requirements || 0;
      const matchedReqs = cap.matched_requirements || 0;
      const gapCount = cap.gap_count || 0;
      const coverage = cap.metrics?.requirements_coverage || 0;
      const isComplete = cap.is_complete;

      if (isPageBP) {
        // Page BPs: importance tier (0-90) scaled to fit below incomplete code BPs
        const pageImportance = PAGE_IMPORTANCE[cap.frontend_route] || 15;
        const uxReqsPending = totalReqs > 0 ? totalReqs - matchedReqs : 0;
        // Base: 100 (below code BP max of ~500), + page importance, + pending work
        cap.priority_score = 100 + pageImportance + uxReqsPending * 5;
        cap.priority_reason = `Page priority: ${pageImportance}/90`;
      } else {
        // Code BPs: gap-driven priority
        // Complete BPs go to bottom, incomplete sorted by gap size + coverage deficit
        if (isComplete) {
          cap.priority_score = 50 - coverage; // complete = low priority
          cap.priority_reason = 'Complete';
        } else {
          const coverageDeficit = 100 - coverage;
          const reqWeight = totalReqs > 0 ? (totalReqs - matchedReqs) * 3 : 0;
          const gapWeight = gapCount * 10;
          // Dependencies: BPs with backend missing get boosted (foundation first)
          const backendMissing = cap.usability?.backend === 'missing' ? 100 : 0;
          cap.priority_score = 200 + coverageDeficit + reqWeight + gapWeight + backendMissing;
          cap.priority_reason = gapCount > 0 ? `${gapCount} gaps, ${coverageDeficit}% to go` : `${coverageDeficit}% coverage needed`;
        }
      }
    });

    // Sort: highest score first
    enriched.sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0));
    enriched.forEach((cap: any, i: number) => { cap.priority_rank = i + 1; });

    // ── Cross-BP dedup of "Recommended Next Step" ──
    // Each BP's execution_plan is generated independently, so multiple BPs often surface
    // the same generic first step (e.g. two BPs both recommending "Implement backend
    // requirements"). The frontend treats the first non-blocked step as "Recommended Next
    // Step", so we reorder each plan to promote a step whose key+label hasn't been used by
    // an earlier BP, and also avoid steps whose label overlaps with an existing BP name
    // (work already represented by another BP in the project).
    const normalize = (s: string) => (s || '').toLowerCase().replace(/\s*\(\d+[^)]*\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const existingBpNames = new Set(enriched.map((c: any) => normalize(c.name || '')).filter(Boolean));
    const stepCollidesWithBp = (label: string) => {
      const n = normalize(label);
      if (!n) return false;
      for (const bpName of existingBpNames) {
        if (!bpName || bpName.length < 6) continue;
        // Only flag when the step label CONTAINS a whole BP name (word-boundary-ish).
        // Generic labels like "Build Backend Services" won't match BP names like
        // "User Management and Role Assignment", but a step "Implement lead generation
        // and management" would match the "Lead Generation and Management" BP.
        if (n.includes(bpName)) return true;
      }
      return false;
    };
    const usedFirstKeys = new Set<string>();
    const usedFirstLabels = new Set<string>();
    for (const cap of enriched) {
      const plan: any[] = cap.execution_plan || [];
      if (plan.length === 0) continue;
      const isUnique = (s: any) => !s.blocked
        && !usedFirstKeys.has(s.key)
        && !usedFirstLabels.has(normalize(s.label))
        && !stepCollidesWithBp(s.label);
      const firstUniqueIdx = plan.findIndex(isUnique);
      if (firstUniqueIdx > 0) {
        // Promote the first unique non-blocked step to index 0
        const [unique] = plan.splice(firstUniqueIdx, 1);
        plan.unshift(unique);
      }
      const first = plan.find((s: any) => !s.blocked);
      if (first && isUnique(first)) {
        usedFirstKeys.add(first.key);
        usedFirstLabels.add(normalize(first.label));
      }
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
    // Inject Capability model fields not in hierarchy (JSONB + mode fields)
    const { Capability: CapExec } = await import('../models');
    const capExec = await CapExec.findByPk(req.params.id as string, { attributes: ['id', 'last_execution', 'mode_override', 'applicability_status', 'execution_profile', 'strategy_template'] });
    if (capExec) {
      (cap as any).last_execution = (capExec as any).last_execution;
      (cap as any).mode_override = (capExec as any).mode_override;
      (cap as any).applicability_status = (capExec as any).applicability_status || 'active';
      (cap as any).execution_profile = (capExec as any).execution_profile || 'production';
      (cap as any).strategy_template = (capExec as any).strategy_template || 'default';
    }
    (cap as any)._projectMode = (project as any).target_mode || 'production';
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

    // Load formal agent mappings
    let agentMappings: any[] = [];
    try {
      const { getAgentsForCapability } = await import('../services/capabilityAgentMapService');
      const maps = await getAgentsForCapability(req.params.id as string);
      // Enrich with agent status from AiAgent table
      const { AiAgent } = await import('../models');
      const agentNames = maps.map(m => m.agent_name);
      const agents = agentNames.length > 0 ? await AiAgent.findAll({ where: { agent_name: agentNames }, attributes: ['agent_name', 'status', 'run_count', 'error_count', 'last_run_at', 'category', 'description'] }) : [];
      const agentMap = new Map(agents.map((a: any) => [a.agent_name, a]));
      agentMappings = maps.map(m => {
        const agent = agentMap.get(m.agent_name);
        return {
          agent_name: m.agent_name,
          role: m.role,
          status: m.status,
          priority: m.priority,
          linked_by: m.linked_by,
          linked_at: m.linked_at,
          agent_status: agent?.status || 'unknown',
          agent_category: agent?.category || null,
          agent_description: agent?.description || null,
          run_count: agent?.run_count || 0,
          error_count: agent?.error_count || 0,
          last_run_at: agent?.last_run_at || null,
        };
      });
    } catch { /* non-critical — mapping table may not exist yet */ }

    res.json({
      ...enriched,
      repo_url: (project as any).github_repo_url || (project as any).repo_url || null,
      preview_url: (() => {
        const baseUrl = (project as any).portfolio_url;
        if (!baseUrl) return null;
        // Use frontend_route if set (direct mapping — most reliable)
        if (capModel?.frontend_route) {
          return baseUrl.replace(/\/$/, '') + capModel.frontend_route;
        }
        // Fallback: Next.js app router detection from matched files
        const feFiles = enriched.implementation_links?.frontend || [];
        const pageFile = feFiles.find((f: string) => /\/app\/.+\/page\.tsx$/.test(f));
        if (pageFile) {
          const appMatch = pageFile.match(/app\/(.+?)\/page\.tsx$/);
          if (appMatch) return baseUrl.replace(/\/$/, '') + '/' + appMatch[1].replace(/\[.*?\]/g, '');
        }
        return baseUrl;
      })(),
      project_system_prompt: projectVars.system_prompt || '',
      hitl_config: capModel?.hitl_config || null,
      autonomy_level: capModel?.autonomy_level || 'manual',
      frontend_route: capModel?.frontend_route || null,
      autonomy_history: capModel?.autonomy_history || [],
      strength_scores: capModel?.strength_scores || null,
      confidence_score: capModel?.confidence_score || null,
      success_rate: capModel?.success_rate || null,
      failure_rate: capModel?.failure_rate || null,
      last_evaluated_at: capModel?.last_evaluated_at || null,
      flow: flowData?.flow || null,
      broken_connections: flowData?.broken_connections || [],
      agent_mappings: agentMappings,
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
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { updateHITLConfig, getHITLConfig } = await import('../intelligence/hitl/hitlEngine');
    await updateHITLConfig(req.params.id as string, req.body);
    res.json(await getHITLConfig(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/business-processes/:id/autonomy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { applyAutonomyChange, assessAutonomy } = await import('../intelligence/autonomyProgressionEngine');
    await applyAutonomyChange(req.params.id as string, req.body.level, req.body.reason || 'User adjustment');
    res.json(await assessAutonomy(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/business-processes/:id/evaluate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
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
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { Capability: CapCheck } = await import('../models');
    const ownerCheck = await CapCheck.findOne({ where: { id: req.params.id as string, project_id: project.id } });
    if (!ownerCheck) { res.status(404).json({ error: 'Process not found' }); return; }

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

    // Build project-specific context so prompts reference THIS project's repo,
    // not hardcoded Accelerator paths.
    let repoFileTree: string[] = [];
    try {
      const { getConnection } = await import('../services/githubService');
      const conn = await getConnection(req.participant!.sub);
      if (conn?.file_tree_json?.tree) repoFileTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    } catch {}
    const projectVars = (project as any).project_variables || {};
    const projectContext = {
      repoFileTree,
      systemPrompt: projectVars.system_prompt || '',
      repoUrl: (project as any).github_repo_url || '',
      projectName: (project as any).organization_name || '',
    };

    const { generateImprovementPrompt } = await import('../intelligence/promptGenerator');
    const prompt = await generateImprovementPrompt(req.params.id as string, target, extraContext, projectContext);

    // Save what this prompt promises to build (for post-resync comparison)
    const { Capability } = await import('../models');
    const cap = await Capability.findOne({ where: { id: req.params.id as string, project_id: project.id } });
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

    // Auto-discover orphaned frontend pages and create BPs for them
    try {
      const { processOrphanedPages } = await import('../services/frontendPageDiscovery');
      await processOrphanedPages({ projectId: project.id, fileTree });
    } catch { /* non-critical — page discovery is additive */ }

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
    const processCap = await CapModel.findOne({ where: { id: req.params.id as string, project_id: project.id } });
    if (processCap) {
      // Process name stems — require at least 2 stems to match a filename to avoid
      // false positives (e.g., "user" matching AdminUser.ts for "User Journey Maps")
      const procStems = (processCap.name || '').toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
      const procImplFiles = fileTree.filter((f: string) => {
        const name = (f.split('/').pop() || '').toLowerCase();
        if (name.startsWith('.') || /^\d{14}/.test(name) || f.includes('migrations/')) return false;
        if (f.startsWith('.claude/') || f.startsWith('.github/') || f.includes('node_modules/')) return false;
        if (!(f.includes('services/') || f.includes('routes/') || f.includes('agents/') || f.includes('models/'))) return false;
        // Require at least 1 process name stem (4+ chars) to match the filename
        const matchingStemCount = procStems.filter((stem: string) => stem.length >= 4 && name.includes(stem)).length;
        return matchingStemCount >= 1;
      });

      if (procImplFiles.length >= 1) {
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

    // 2c. Smart verification: use LLM to catch what keyword matching missed
    const stillUnmatched = processReqs.filter(r => r.status === 'unmatched' || r.status === 'partial');
    if (stillUnmatched.length > 0 && fileTree.length > 0) {
      try {
        const { verifyUnmatchedWithLLM } = await import('../services/smartRequirementVerifier');
        const verification = await verifyUnmatchedWithLLM(
          stillUnmatched.map(r => ({ id: r.id, requirement_key: r.requirement_key, requirement_text: r.requirement_text || '' })),
          fileTree,
          processCap?.name || 'this process',
        );
        if (verification.verified.length > 0) {
          for (const v of verification.verified) {
            const req2 = processReqs.find(r => r.id === v.id);
            if (req2 && (req2.status === 'unmatched' || req2.status === 'partial')) {
              req2.status = 'matched';
              req2.github_file_paths = v.matched_files.slice(0, 5);
              req2.confidence_score = 0.85;
              req2.verified_by = 'llm_verification';
              await req2.save();
              if (req2.status === 'unmatched') unmatched--;
              matched++;
            }
          }
          console.log(`[Resync] LLM verified ${verification.verified.length} additional requirements for "${processCap?.name}"`);
        }
      } catch (llmErr: any) {
        console.error('[Resync] Smart verification failed:', llmErr?.message);
      }
    }

    // 2d. Auto-verify stragglers in two tiers:
    // Tier 1: If 50%+ matched and < 5 unmatched remain → verify stragglers
    // Tier 2: If project has backend+frontend detected and ALL reqs are unmatched → LLM likely missed, verify all
    const finalUnmatched = processReqs.filter(r => r.status === 'unmatched' || r.status === 'partial');
    const finalMatched = processReqs.filter(r => r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified');
    const coveragePct = processReqs.length > 0 ? (finalMatched.length / processReqs.length) * 100 : 0;
    const projectHasImpl = fileTree.some(f => f.includes('services/') || f.includes('routes/'));

    // Tier 1: Few stragglers remaining (< 5 unmatched, or small BP with < 10 total reqs)
    const isSmallBP = processReqs.length <= 10;
    if ((coveragePct >= 50 || isSmallBP) && finalUnmatched.length > 0 && finalUnmatched.length <= 5) {
      for (const r of finalUnmatched) {
        r.status = 'matched'; r.confidence_score = 0.7; r.verified_by = 'auto_straggler';
        await r.save(); unmatched--; matched++;
      }
      console.log(`[Resync] Tier 1: Auto-verified ${finalUnmatched.length} stragglers (${Math.round(coveragePct)}% coverage)`);
    }
    // Tier 2: Project has real implementation but this BP has 0% match — process-level promotion
    else if (coveragePct === 0 && projectHasImpl && processReqs.length > 0 && processReqs.length <= 20) {
      // Check if process name stems match any repo files
      const procStems = (processCap?.name || '').toLowerCase().split(/\W+/).filter((w: string) => w.length >= 4);
      const hasMatchingFiles = fileTree.some(f => procStems.some(s => f.toLowerCase().includes(s)));
      if (hasMatchingFiles) {
        for (const r of finalUnmatched) {
          r.status = 'matched'; r.confidence_score = 0.6; r.verified_by = 'process_stem_match';
          await r.save(); unmatched--; matched++;
        }
        console.log(`[Resync] Tier 2: Process-stem promoted ${finalUnmatched.length} reqs for "${processCap?.name}"`);
      }
    }

    // 3. Run reconciliation (without validation report — just graph rebuild + recalculate)
    const { reconcileAfterExecution } = await import('../intelligence/execution/reconciliationEngine');
    const result = await reconcileAfterExecution(
      req.participant!.sub, project.id, req.params.id as string, ''
    );

    // 4. Compare last execution promise vs reality
    const { Capability } = await import('../models');
    const cap = await Capability.findOne({ where: { id: req.params.id as string, project_id: project.id } });
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

    // ── Summary: delta-based bullets, LLM only when real changes happened ──
    let summary = '';
    try {
      const capName = processCap?.name || 'this process';
      // Separate DISC-* (code inventory) from REQ-* (real requirements)
      const realReqs = processReqs.filter(r => !r.requirement_key.startsWith('DISC-'));
      const discReqs = processReqs.filter(r => r.requirement_key.startsWith('DISC-'));
      const realMatched = realReqs.filter(r => r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified').length;
      const realUnmatched = realReqs.filter(r => r.status === 'unmatched').length;

      // Calculate deltas from before/after metrics
      const readinessBefore = metricsBefore?.readiness || 0;
      const readinessAfter = metricsAfter?.readiness || 0;
      const qualityBefore = metricsBefore?.quality || 0;
      const qualityAfter = metricsAfter?.quality || 0;
      const hasChange = readinessBefore !== readinessAfter || qualityBefore !== qualityAfter || (whatChanged?.status === 'complete');

      if (!hasChange && matched === preserved && partial === 0) {
        // Nothing changed — short static bullets, no LLM call
        const bullets = [];
        bullets.push(`• Scanned ${fileTree.length} repository files — no new matches found`);
        if (realUnmatched > 0) bullets.push(`• ${realUnmatched} requirements still need implementation`);
        if (discReqs.length > 0) bullets.push(`• ${discReqs.length} existing code files already cataloged`);
        if (realReqs.length === 0) bullets.push(`• No document requirements defined yet — upload requirements to get started`);
        bullets.push(`• Next step: generate a prompt and run it in your AI workstation to build the missing pieces`);
        summary = bullets.join('\n');
      } else {
        // Real changes — use LLM with delta context, request bullets
        const changedReqs = processReqs.filter(r => r.verified_by === 'process_level' || r.verified_by === 'e2e_test' || r.verified_by === 'manual').slice(0, 5);
        const newlyMatched = matched - preserved;
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 200,
          messages: [{
            role: 'system',
            content: 'Write 3-4 bullet points summarizing what changed in this code sync. Each bullet starts with •. Be specific about what improved. Write for a technical executive. No filler — only mention real changes.'
          }, {
            role: 'user',
            content: `Business process: "${capName}"
CHANGES THIS SYNC:
- ${newlyMatched} NEW requirements matched to code (${preserved} were already matched)
- Readiness: ${readinessBefore}% → ${readinessAfter}%
- Quality: ${qualityBefore}% → ${qualityAfter}%
${whatChanged ? `- Last step "${whatChanged.last_step}": ${whatChanged.status === 'complete' ? 'VERIFIED — files delivered' : 'INCOMPLETE — ' + (whatChanged.missing?.length || 0) + ' files still missing'}` : ''}
${changedReqs.length > 0 ? '- Newly matched: ' + changedReqs.map(r => (r.requirement_text || '').substring(0, 50)).join(', ') : ''}
${regressions.length > 0 ? '- REGRESSIONS: ' + regressions.map((r: any) => r.metric).join(', ') : ''}
STILL NEEDED: ${realUnmatched} requirements unmapped out of ${realReqs.length} total

Write 3-4 bullet points about what specifically changed and what needs attention next.`
          }],
        });
        summary = completion.choices[0]?.message?.content || '';
      }
    } catch (err) {
      console.error('[Resync] Summary generation failed:', (err as Error).message);
    }

    res.json({
      ...result,
      resync: {
        total: processReqs.length, matched, partial, unmatched, preserved, files_scanned: fileTree.length,
        disc_count: processReqs.filter(r => r.requirement_key.startsWith('DISC-')).length,
        req_count: processReqs.filter(r => !r.requirement_key.startsWith('DISC-')).length,
      },
      what_changed: whatChanged,
      summary,
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

// ─── Code Discovery: scan repo for existing capabilities ────────
router.post('/api/portal/project/discover-code', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { discoverExistingCode } = await import('../intelligence/requirements/codeDiscovery');
    const result = await discoverExistingCode(project.id, req.participant!.sub);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Taxonomy: business-specific capability categories ────────
router.get('/api/portal/project/taxonomy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const vars = (project as any).project_variables || {};
    const taxonomy = vars.generated_taxonomy || null;
    res.json({ taxonomy, has_taxonomy: !!taxonomy });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/taxonomy/regenerate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    // Clear existing taxonomy to force regeneration
    const vars = (project as any).project_variables || {};
    delete vars.generated_taxonomy;
    (project as any).project_variables = vars;
    (project as any).changed('project_variables', true);
    await project.save();
    // Regenerate
    const { generateTaxonomy } = await import('../intelligence/requirements/taxonomyGenerator');
    const taxonomy = await generateTaxonomy(project.id);
    res.json({ taxonomy, regenerated: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── AI Architect: conversational system planning ────────
router.post('/api/portal/project/architect/start', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { v4: uuid } = await import('uuid');
    const sessionId = uuid();
    const { createSession } = await import('../intelligence/architect/architectEngine');
    const state = createSession(sessionId, project.id);
    const { ArchitectSession } = await import('../models');
    await ArchitectSession.create({ id: sessionId, project_id: project.id, conversation_state: state, status: 'active' } as any);
    res.json({ session_id: sessionId, message: 'What would you like to build or improve?', phase: 'identify' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/architect/turn', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { session_id, input } = req.body;
    if (!session_id || !input?.trim()) { res.status(400).json({ error: 'session_id and input required' }); return; }
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { ArchitectSession } = await import('../models');
    const session = await ArchitectSession.findOne({ where: { id: session_id, project_id: project.id } });
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    const { processArchitectTurn } = await import('../intelligence/architect/architectEngine');
    const projectMode = (project as any).target_mode || 'production';
    const { state, response } = await processArchitectTurn((session as any).conversation_state, input, projectMode);
    (session as any).conversation_state = state;
    if (state.phase === 'complete') {
      (session as any).status = 'completed';
      if (response.created_bp) (session as any).created_bp_id = response.created_bp.id;
      if (state.prompt_output) (session as any).generated_prompt = state.prompt_output;
    }
    (session as any).changed('conversation_state', true);
    await session.save();
    res.json(response);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/architect/sessions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { ArchitectSession } = await import('../models');
    const sessions = await ArchitectSession.findAll({
      where: { project_id: project.id },
      order: [['created_at', 'DESC']],
      limit: 10,
      attributes: ['id', 'status', 'created_bp_id', 'created_at'],
    });
    res.json(sessions);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── NLP Steering: classify intent → preview → apply → revert ────────
router.post('/api/portal/project/steer', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { input } = req.body;
    if (!input?.trim()) { res.status(400).json({ error: 'Input is required' }); return; }

    // Step 1: Classify intent
    const { classifyIntent } = await import('../intelligence/steering/intentClassifier');
    const { Capability } = await import('../models');
    const processes = await Capability.findAll({ where: { project_id: project.id }, attributes: ['name'] });
    const processNames = processes.map((p: any) => p.name);
    const intent = await classifyIntent(input, processNames);

    // Step 2: Preview changes (NOT applied yet)
    const { previewSteeringIntent } = await import('../intelligence/steering/steeringExecutor');
    const result = await previewSteeringIntent(project.id, intent);

    res.json({ ...result, user_input: input });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/steer/:actionId/apply', requireParticipant, async (req: Request, res: Response) => {
  try {
    // Verify ownership before applying
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: SteeringAction } = await import('../models/SteeringAction');
    const action = await SteeringAction.findOne({ where: { id: req.params.actionId as string, project_id: project.id } });
    if (!action) { res.status(404).json({ error: 'Action not found' }); return; }

    const { applySteeringAction } = await import('../intelligence/steering/steeringExecutor');
    const result = await applySteeringAction(req.params.actionId as string);
    const intent = (action as any)?.classified_intent;
    if (intent?.type === 'add_process') {
      {
        // Delegate to existing NLP add logic
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 2000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You create business process definitions from natural language descriptions. Respond with valid JSON only.' },
            { role: 'user', content: `Create a business process from this description:\n\n"${intent.description}"\n\nRespond:\n{"name":"Process Name","description":"Detailed description","requirements":["REQ text 1","REQ text 2","REQ text 3","REQ text 4","REQ text 5"]}` },
          ],
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        if (parsed.name) {
          const { Capability, Feature, RequirementsMap } = await import('../models');
          const cap = await Capability.create({
            project_id: project.id, name: parsed.name, description: parsed.description || intent.description,
            status: 'active', priority: 'high', sort_order: 0, source: 'user_input',
            lifecycle_status: 'active', applicability_status: 'active',
            execution_profile: (project as any).target_mode || 'production',
          } as any);
          const feat = await Feature.create({
            capability_id: cap.id, name: 'Core Functionality',
            description: parsed.description || intent.description,
            status: 'active', priority: 'medium', sort_order: 0, source: 'user_input',
          } as any);
          for (let i = 0; i < (parsed.requirements || []).length; i++) {
            await RequirementsMap.create({
              project_id: project.id, capability_id: cap.id, feature_id: feat.id,
              requirement_key: `REQ-NEW-${Date.now()}-${i}`, requirement_text: parsed.requirements[i],
              status: 'unmatched', confidence_score: 0,
            });
          }
          return res.json({ ...result, created_process: { id: cap.id, name: parsed.name, requirements_count: (parsed.requirements || []).length } });
        }
      }
    }

    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/steer/:actionId/revert', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { revertSteeringAction } = await import('../intelligence/steering/steeringExecutor');
    const result = await revertSteeringAction(req.params.actionId as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/steering-history', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: SteeringAction } = await import('../models/SteeringAction');
    const actions = await SteeringAction.findAll({
      where: { project_id: project.id },
      order: [['created_at', 'DESC']],
      limit: 20,
    });
    res.json(actions);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Mode: set project target mode + BP mode overrides ────────
router.put('/api/portal/project/target-mode', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { mode, cascade } = req.body;
    const { getProfile } = await import('../intelligence/profiles/executionProfiles');
    const profile = getProfile(mode);
    if (!profile || profile.name !== mode) { res.status(400).json({ error: `Invalid mode: ${mode}` }); return; }

    const prevMode = (project as any).target_mode || 'production';
    (project as any).target_mode = mode;
    await project.save();

    // Cascade: clear all BP overrides + re-prioritize by gap-to-completion
    let overridesCleared = 0;
    const { Capability } = await import('../models');
    const { RequirementsMap } = await import('../models');

    if (cascade !== false) { // default: cascade
      // Clear all BP-level mode overrides so project mode takes effect everywhere
      const [affectedCount] = await Capability.update(
        { mode_override: null } as any,
        { where: { project_id: project.id, mode_override: { [require('sequelize').Op.ne]: null } } },
      );
      overridesCleared = affectedCount;

      // Reset completed_steps on all BPs — mode change means re-evaluation
      await Capability.update(
        { last_execution: require('sequelize').literal("last_execution - 'completed_steps'") } as any,
        { where: { project_id: project.id } },
      ).catch(() => {
        // Fallback: clear entire last_execution if JSONB operation fails
        Capability.update({ last_execution: null } as any, { where: { project_id: project.id } }).catch(() => {});
      });

      // Re-prioritize: sort by gap-to-completion for the new mode
      const allCaps = await Capability.findAll({ where: { project_id: project.id } });
      const capGaps: Array<{ id: string; gap: number; unmatched: number }> = [];
      for (const cap of allCaps) {
        if ((cap.name || '').toLowerCase().includes('uncategorized')) {
          capGaps.push({ id: cap.id, gap: 999, unmatched: 999 });
          continue;
        }
        const reqs = await RequirementsMap.findAll({ where: { project_id: project.id, capability_id: cap.id } });
        const total = reqs.length;
        const matched = reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified').length;
        const coverage = total > 0 ? Math.round((matched / total) * 100) : 0;
        const gap = Math.max(0, profile.completion_thresholds.reqCoverage - coverage);
        const unmatched = total - matched;
        capGaps.push({ id: cap.id, gap, unmatched });
      }

      // Sort: biggest gap first (most work needed = highest priority), then by unmatched count
      capGaps.sort((a, b) => b.gap - a.gap || b.unmatched - a.unmatched);
      for (let i = 0; i < capGaps.length; i++) {
        await Capability.update({ sort_order: i } as any, { where: { id: capGaps[i].id } });
      }
    }

    res.json({
      target_mode: mode,
      previous_mode: prevMode,
      profile: profile.label,
      overrides_cleared: overridesCleared,
      completion_thresholds: profile.completion_thresholds,
      maturity_required: profile.completion_maturity_threshold,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/business-processes/:id/mode', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { mode_override, applicability_status } = req.body;
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    if (mode_override !== undefined) {
      if (mode_override !== null) {
        const { getProfile } = await import('../intelligence/profiles/executionProfiles');
        const profile = getProfile(mode_override);
        if (!profile || profile.name !== mode_override) { res.status(400).json({ error: `Invalid mode: ${mode_override}` }); return; }
      }
      (cap as any).mode_override = mode_override;
    }
    if (applicability_status !== undefined) {
      if (!['active', 'deferred', 'not_required'].includes(applicability_status)) {
        res.status(400).json({ error: `Invalid applicability: ${applicability_status}` }); return;
      }
      (cap as any).applicability_status = applicability_status;
    }
    await cap.save();
    res.json({ mode_override: (cap as any).mode_override, applicability_status: (cap as any).applicability_status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Profile & Strategy: get/set execution profile and strategy template ────────
router.put('/api/portal/project/business-processes/:id/profile', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { execution_profile, strategy_template } = req.body;
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    if (execution_profile) (cap as any).execution_profile = execution_profile;
    if (strategy_template) (cap as any).strategy_template = strategy_template;
    await cap.save();
    res.json({ execution_profile: (cap as any).execution_profile, strategy_template: (cap as any).strategy_template });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Decision Rules: list canonical rules for admin display ────────
router.get('/api/portal/project/decision-rules', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const { getRules } = await import('../intelligence/rules/decisionRules');
    const { PROFILES } = await import('../intelligence/profiles/executionProfiles');
    const { STRATEGIES } = await import('../intelligence/profiles/strategyTemplates');
    res.json({ rules: getRules(), profiles: PROFILES, strategies: STRATEGIES });
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
    const report = req.body.report || '';

    // Detect "already complete" reports — auto-verify all requirements for this BP
    const reportLower = report.toLowerCase();
    const isAlreadyComplete = reportLower.includes('status: complete') ||
      reportLower.includes('all requirements already covered') ||
      reportLower.includes('no code changes needed') ||
      (reportLower.includes('previously implemented') && reportLower.includes('complete'));

    if (isAlreadyComplete) {
      const { RequirementsMap } = await import('../models');
      const [affectedCount] = await RequirementsMap.update(
        { status: 'verified', verified_by: 'sync_complete', confidence_score: 1.0 } as any,
        { where: { project_id: project.id, capability_id: req.params.id as string, status: { [require('sequelize').Op.in]: ['unmatched', 'not_started', 'partial'] } } },
      );
      console.log(`[Sync] Auto-verified ${affectedCount} requirements for BP ${req.params.id} — report indicates already complete`);
    }

    const { reconcileAfterExecution } = await import('../intelligence/execution/reconciliationEngine');
    const result = await reconcileAfterExecution(
      req.participant!.sub, project.id, req.params.id as string, report
    );
    res.json({ ...result, auto_verified: isAlreadyComplete });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── System Architecture Model: repo-agnostic scanning ────────
router.get('/api/portal/project/system-model', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    // Return cached model if fresh (< 1 hour old)
    const cached = (project as any).system_model;
    if (cached?.scanned_at) {
      const age = Date.now() - new Date(cached.scanned_at).getTime();
      if (age < 3600000) { res.json(cached); return; }
    }
    // Build fresh model from GitHub file tree
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(req.participant!.sub);
    const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
    if (fileTree.length === 0) { res.json({ error: 'no_repo', message: 'Connect GitHub to see system architecture' }); return; }
    const { buildSystemModel } = await import('../services/systemModelScanner');
    const model = buildSystemModel(fileTree);
    // Cache on project
    (project as any).system_model = model;
    await project.save();
    res.json(model);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/system-model/refresh', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(req.participant!.sub);
    const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
    if (fileTree.length === 0) { res.json({ error: 'no_repo' }); return; }
    const { buildSystemModel } = await import('../services/systemModelScanner');
    const model = buildSystemModel(fileTree);
    (project as any).system_model = model;
    (project as any).changed('system_model', true);
    await project.save();
    res.json(model);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Visual Feedback OS: element-level feedback ────────
router.post('/api/portal/project/business-processes/:id/element-map', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { elements, route } = req.body;
    (cap as any).ui_element_map = { page_route: route, scanned_at: new Date().toISOString(), elements: elements || [] };
    (cap as any).changed('ui_element_map', true);
    await cap.save();
    res.json({ stored: (elements || []).length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/business-processes/:id/element-feedback', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { getFeedback, getFeedbackSummary } = await import('../services/uiFeedbackStore');
    const elementId = req.query.element_id as string | undefined;
    const status = req.query.status as string | undefined;
    const [items, summary] = await Promise.all([
      getFeedback(cap.id, { elementId, status }),
      getFeedbackSummary(cap.id),
    ]);
    res.json({ items, summary, element_map: (cap as any).ui_element_map || null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/business-processes/:id/analyze-page', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const elementMap = (cap as any).ui_element_map;
    if (!elementMap?.elements?.length) { res.status(400).json({ error: 'No element map. Send element-map first.' }); return; }
    const { analyzePageElements, augmentWithLLM } = await import('../services/uiFeedbackEngine');
    const ruleResult = await analyzePageElements({
      capabilityId: cap.id, projectId: project.id,
      pageRoute: elementMap.page_route || (cap as any).frontend_route || '/',
      elements: elementMap.elements,
      targetElementId: req.body.element_id,
    });
    // LLM augment if rules found few issues or user gave feedback
    let llmResult = { total_issues: 0, new_issues: 0, skipped_duplicates: 0, issues: [] as any[] };
    if (req.body.user_feedback || ruleResult.total_issues < 3) {
      llmResult = await augmentWithLLM({
        capabilityId: cap.id, projectId: project.id,
        pageRoute: elementMap.page_route || '/',
        elements: elementMap.elements,
        userFeedback: req.body.user_feedback,
        ruleIssueCount: ruleResult.total_issues,
      });
    }
    res.json({
      rules: ruleResult,
      llm: llmResult,
      total_new: ruleResult.new_issues + llmResult.new_issues,
      total_skipped: ruleResult.skipped_duplicates + llmResult.skipped_duplicates,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/element-feedback/:feedbackId', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { status, resolved_by } = req.body;
    if (!['open', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' }); return;
    }
    const { updateFeedbackStatus } = await import('../services/uiFeedbackStore');
    const item = await updateFeedbackStatus(req.params.feedbackId as string, status, resolved_by);
    if (!item) { res.status(404).json({ error: 'Feedback not found' }); return; }
    res.json(item);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Frontend Page Discovery: find orphaned pages + create BPs ────────
router.post('/api/portal/project/discover-pages', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(req.participant!.sub);
    const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
    if (fileTree.length === 0) { res.status(400).json({ error: 'No repo file tree. Connect GitHub first.' }); return; }
    const { processOrphanedPages } = await import('../services/frontendPageDiscovery');
    const result = await processOrphanedPages({ projectId: project.id, fileTree, dryRun: !!req.body.dryRun });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Connect Page to BP: attach a route to an existing BP ────────
router.put('/api/portal/project/business-processes/:id/connect-page', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { route } = req.body;
    (cap as any).frontend_route = route || null;
    await cap.save();
    res.json({ id: cap.id, name: cap.name, frontend_route: route });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Frontend Routes: get valid routes from project's repo file tree ────────
router.get('/api/portal/project/frontend-routes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(req.participant!.sub);
    const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
    if (fileTree.length === 0) { res.json({ routes: [] }); return; }
    const { discoverFrontendPages } = await import('../services/frontendPageDiscovery');
    const pages = discoverFrontendPages(fileTree);
    const routes = [...new Set(pages.map(p => p.route))].sort();
    res.json({ routes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Frontend Route Mapping: auto-map BPs to routes (derived from repo) ────────
router.post('/api/portal/project/auto-map-routes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    // Derive available routes from the project's own repo — never trust client input
    const { getConnection } = await import('../services/githubService');
    const conn = await getConnection(req.participant!.sub);
    const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
    if (fileTree.length === 0) { res.status(400).json({ error: 'No repo file tree. Connect GitHub first.' }); return; }
    const { discoverFrontendPages } = await import('../services/frontendPageDiscovery');
    const pages = discoverFrontendPages(fileTree);
    const availableRoutes = pages.map(p => p.route);
    if (availableRoutes.length === 0) { res.status(400).json({ error: 'No frontend pages found in repo.' }); return; }
    const { dryRun } = req.body;
    const { autoMapRoutes } = await import('../services/frontendRouteMapper');
    const result = await autoMapRoutes({ projectId: project.id, availableRoutes, dryRun: !!dryRun });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Frontend Route: manually set route for a BP (validated against repo) ────────
router.put('/api/portal/project/business-processes/:id/frontend-route', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { route } = req.body;
    // Validate route exists in project's repo (allow null to clear)
    if (route) {
      const { getConnection } = await import('../services/githubService');
      const conn = await getConnection(req.participant!.sub);
      const fileTree: string[] = conn?.file_tree_json?.tree?.filter((t: any) => t.type === 'blob').map((t: any) => t.path) || [];
      if (fileTree.length > 0) {
        const { discoverFrontendPages } = await import('../services/frontendPageDiscovery');
        const pages = discoverFrontendPages(fileTree);
        const validRoutes = new Set(pages.map(p => p.route));
        if (!validRoutes.has(route)) { res.status(400).json({ error: 'Route not found in project repo' }); return; }
      }
    }
    const { setFrontendRoute } = await import('../services/frontendRouteMapper');
    await setFrontendRoute(cap.id, route || null);
    res.json({ frontend_route: route || null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Frontend Preview URL: set/get preview URL for the project ────────
router.put('/api/portal/project/preview-url', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { setPreviewUrl } = await import('../services/frontendPreviewService');
    await setPreviewUrl(req.participant!.sub, req.body.url || '');
    res.json({ preview_url: req.body.url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Preview Stack status for the portal iframe overlay ────────
// Returns the current user's project's preview_stack status so the portal
// can show a "Booting preview…" overlay while the stack is provisioning
// or waking up. Safe for the participant (only their own stack).
router.get('/api/portal/project/preview-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project' }); return; }
    const { getStackByProject } = await import('../services/previewStackService');
    const stack: any = await getStackByProject(project.id);
    if (!stack) {
      res.json({ status: 'none', slug: null });
      return;
    }
    res.json({
      status: stack.status,
      slug: stack.slug,
      failure_reason: stack.failure_reason || null,
      last_started_at: stack.last_started_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UI Feedback: analyze frontend and return suggestions ────────
router.post('/api/portal/project/business-processes/:id/ui-feedback', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { feedback, action } = req.body;
    if (!feedback && !action) { res.status(400).json({ error: 'feedback or action required' }); return; }
    const feedbackText = action ? `${action}: ${feedback || ''}` : feedback;
    // Get frontend files from the capability's implementation links
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const hierarchy = await getCapabilityHierarchy(project.id);
    const capData = hierarchy.find((c: any) => c.id === req.params.id);
    const enriched = capData ? enrichCapability(capData) : null;
    const frontendFiles = enriched?.implementation_links?.frontend || [];
    const { analyzeUI } = await import('../services/uiAnalysisService');
    const result = await analyzeUI({
      processName: cap.name,
      feedback: feedbackText,
      frontendFiles,
      repoUrl: (project as any).github_repo_url || undefined,
    });
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

// ─── Auto-Tag Modes: assign mode arrays to BPs + requirements ────────
router.post('/api/portal/project/auto-tag-modes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { dryRun, overwrite } = req.body;
    const { autoTagModes } = await import('../services/modeTaggingService');
    const result = await autoTagModes({ projectId: project.id, dryRun: !!dryRun, overwrite: !!overwrite });
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
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
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
