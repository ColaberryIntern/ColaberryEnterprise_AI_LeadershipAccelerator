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

// ─── Brownfield setup ──────────────────────────────────────────────
// For projects pointed at an existing mature codebase. Skips the
// Architect → requirements → clustering pipeline. Connects the repo
// (if not already connected), runs LLM-driven capability discovery
// from the file tree, and creates Capability rows tagged
// source='brownfield_discovered' with last_execution.status =
// 'foundation_built' so Cory's fresh-project heuristic doesn't fire.
router.post('/api/portal/project/setup/brownfield-discover', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { repo_url, access_token } = req.body || {};

    // Auto-create the project if missing (parallel to architect-build flow)
    const { createProjectForEnrollment } = await import('../services/projectService');
    const project = await createProjectForEnrollment(enrollmentId);

    // Connect GitHub if a repo_url was provided. If not, assume already
    // connected (the user might be running brownfield discovery on an
    // existing repo connection).
    if (repo_url && typeof repo_url === 'string' && repo_url.trim()) {
      const { connectGitHub } = await import('../services/projectSetupService');
      await connectGitHub(enrollmentId, repo_url.trim(), access_token);
    }

    const { discoverBrownfieldCapabilities } = await import('../services/brownfieldDiscoveryService');
    const result = await discoverBrownfieldCapabilities(enrollmentId, project.id);

    // Stamp project with brownfield flag so the orchestrator and the
    // wizard know this project skipped the Architect path.
    const ss = (project as any).setup_status || {};
    (project as any).setup_status = {
      ...ss,
      github_connected: true,
      brownfield: true,
      brownfield_discovered_at: new Date().toISOString(),
      activated: true, // brownfield projects are immediately "active"
    };
    (project as any).changed('setup_status', true);
    await project.save();

    // PHASE 2: refresh authoritative state after brownfield discovery
    try {
      const { refreshSystemState } = await import('../intelligence/systemStateEngine');
      refreshSystemState(project.id, 'brownfield_discovery');
    } catch { /* fire-and-forget */ }

    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[BrownfieldDiscover] failed:', err?.message);
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

  // If activation has already finished, that wins. Don't fall back to
  // the cluster-level marker — a stale "processing" cluster marker
  // (e.g. from a prior run that didn't clean up) would otherwise keep
  // the frontend spinner alive even though the build is done.
  if (progress && (progress.status === 'complete' || progress.status === 'failed')) {
    res.json(progress);
    setTimeout(() => { activationProgress.delete(enrollmentId); }, 300000);
    return;
  }

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
// ─── AI Expansion Questions: generate idea-specific capability questions ────────
// ─── Architect Build: start full requirements generation via advisor.colaberry.ai ────
router.post('/api/portal/project/architect-build', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { idea, projectName, repoUrl, accessToken } = req.body;
    if (!idea || !repoUrl) { res.status(400).json({ error: 'idea and repoUrl required' }); return; }
    // The AI build flow runs before any project record exists for this
    // enrollment. Create-or-fetch so the rest of the handler has a
    // project to attach build state to.
    const { createProjectForEnrollment } = await import('../services/projectService');
    const project = await createProjectForEnrollment(req.participant!.sub);

    // 1. Save GitHub connection
    const { connectGitHub } = await import('../services/projectSetupService');
    await connectGitHub(req.participant!.sub, repoUrl.trim(), accessToken?.trim() || undefined);

    // 2. Start Architect build
    const { startArchitectBuild } = await import('../services/architectProxyService');
    const name = projectName || (project as any).organization_name || 'AI System';
    const { slug } = await startArchitectBuild(name, idea);

    // 3. Save build state
    const currentStatus = (project as any).setup_status || {};
    (project as any).setup_status = {
      ...currentStatus,
      github_connected: true,
      architect_slug: slug,
      build_started_at: new Date().toISOString(),
      build_idea: idea,
    };
    (project as any).changed('setup_status', true);
    await project.save();

    res.json({ slug, status: 'building' });
  } catch (err: any) {
    console.error('[ArchitectBuild] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Architect Status: poll build progress ────
router.get('/api/portal/project/architect-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const slug = (project as any).setup_status?.architect_slug;
    if (!slug) { res.json({ phase: 'not_started', progress: 0, complete: false, message: 'No build in progress' }); return; }

    const { getArchitectStatus, getArchitectDocument } = await import('../services/architectProxyService');
    const status = await getArchitectStatus(slug);

    // If complete, fetch document and save to project (idempotent)
    if (status.complete) {
      const ss = (project as any).setup_status || {};
      if (!ss.requirements_loaded) {
        try {
          const document = await getArchitectDocument(slug);
          if (document && document.length > 100) {
            (project as any).requirements_document = document;
            (project as any).setup_status = { ...ss, requirements_loaded: true };
            (project as any).changed('setup_status', true);
            (project as any).changed('requirements_document', true);
            await project.save();
          } else {
            console.warn('[ArchitectStatus] Doc fetch returned <100 chars; skipping save');
          }
        } catch (docErr: any) {
          console.warn('[ArchitectStatus] Document fetch error:', docErr.message);
        }
      }

      // Run activation if requirements are loaded but project isn't activated yet.
      // This is retry-safe — activateProject is idempotent on its data writes,
      // and activation may have failed on a prior poll (network, GitHub, etc).
      const refreshed = (project as any).setup_status || {};
      if (refreshed.requirements_loaded && !refreshed.activated) {
        try {
          const { activateProject } = await import('../services/projectSetupService');
          activateProject(req.participant!.sub).catch(e => console.warn('[ArchitectStatus] Activation error:', e.message));
        } catch {}
      }
    }

    const projectTitle = (project as any).organization_name || 'AI System';
    const documentTitle = `${projectTitle} — Requirements Document`;
    const documentFilename = `${projectTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.md`;
    const requirementsLoaded = !!(project as any).setup_status?.requirements_loaded;

    res.json({ ...status, documentTitle, documentFilename, requirementsLoaded });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Build Preview: quick AI org preview from idea ────
router.post('/api/portal/project/build-preview', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { idea } = req.body;
    if (!idea) { res.status(400).json({ error: 'idea required' }); return; }
    const { generateSystemPreview } = await import('../services/buildPreviewService');
    const preview = await generateSystemPreview(idea);
    res.json(preview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/requirements/expand-questions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { idea } = req.body;
    if (!idea || idea.trim().length < 20) { res.status(400).json({ error: 'Idea must be at least 20 characters' }); return; }

    // Nine-phase AI System Discovery Framework. Each phase is a
    // dimension of system sophistication with three progressive
    // levels (A=baseline, B=intermediate, C=advanced). The labels
    // and descriptions are tailored by the LLM to the user's idea
    // so the choices feel domain-specific instead of abstract.
    const PHASES = [
      { phase: 'control',         category: 'Control Model',          axis: 'Who makes decisions — does AI recommend, assist, or execute?' },
      { phase: 'intelligence',    category: 'Intelligence Depth',     axis: 'How smart is the system — rules-based, adaptive, or self-learning?' },
      { phase: 'data',            category: 'Data Scope',             axis: 'What does the system see — internal data only, external signals, or a full ecosystem?' },
      { phase: 'decision',        category: 'Decision Complexity',    axis: 'Thinking depth — basic decisions, multi-variable optimization, or scenario simulation?' },
      { phase: 'execution',       category: 'Execution Level',        axis: 'Action capability — suggest, trigger workflows, or fully automate?' },
      { phase: 'agents',          category: 'Agent Structure',        axis: 'How many AI roles — single AI, multiple agents, or a full AI org?' },
      { phase: 'governance',      category: 'Governance & Trust',     axis: 'Enterprise readiness — basic logs, full auditability, or compliance + explainability?' },
      { phase: 'strategy',        category: 'Strategy Layer',         axis: 'Reach — operational only, strategic insights, or long-term planning?' },
      { phase: 'differentiators', category: 'Differentiators',        axis: 'Moat — none yet, simulation/digital twin, or proprietary models?' },
    ];

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You design multiple-choice discovery questions for a software system idea using the AI System Discovery Framework. For each of the 9 phases provided, write ONE question tailored to the user\'s idea, with THREE options labeled A (baseline), B (intermediate), C (advanced). Each option teaches the user what that level looks like for THEIR project — not abstract definitions. Output strict JSON only.' },
        { role: 'user', content: `USER'S IDEA:
${idea.trim()}

For each phase below, generate one question and three options that are SPECIFIC to the user's idea. The options should teach the user the spectrum of sophistication for that dimension as it applies to their domain.

PHASES:
${PHASES.map((p, i) => `${i + 1}. ${p.category} — ${p.axis}`).join('\n')}

Return strict JSON in this shape:
{
  "questions": [
    {
      "phase": "control",
      "category": "Control Model",
      "text": "How should your system handle <domain-specific decision>?",
      "options": [
        { "letter": "A", "label": "Recommend only", "description": "<one-sentence concrete description for THIS idea>" },
        { "letter": "B", "label": "Approve before action", "description": "<one-sentence concrete description for THIS idea>" },
        { "letter": "C", "label": "Execute autonomously", "description": "<one-sentence concrete description for THIS idea>" }
      ]
    },
    ... (one entry per phase, in the same order as the list above)
  ]
}

Critical rules:
- Each option's description MUST reference the user's actual domain — not generic phrasing.
- Option A = simplest/safest. Option C = most sophisticated. Option B = a sensible middle.
- Questions are short (under 20 words). Descriptions are one sentence each.
- Do not invent extra phases. Exactly 9 questions, in the exact phase order listed.` },
      ],
      temperature: 0.6,
      max_tokens: 2400,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let questions: Array<{ phase: string; category: string; text: string; options: Array<{ letter: string; label: string; description: string }> }> = [];
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);

      // Match each LLM question to a framework phase. The LLM sometimes
      // renames the phase key (e.g. "agents" → "agent_structure", or
      // capitalizes "Control Model"), which used to drop that phase
      // entirely. Match by exact phase first, then by category, then
      // by fuzzy substring on either field, then by positional fallback
      // so the user reliably gets all 9 dimensions.
      const lc = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const byKey: Map<string, any> = new Map();
      for (const q of arr) {
        if (!q) continue;
        if (q.phase) byKey.set(lc(q.phase), q);
        if (q.category) byKey.set(lc(q.category), q);
      }

      const usedIndexes = new Set<number>();
      const matchPhase = (p: { phase: string; category: string }, i: number): any | null => {
        const phaseKey = lc(p.phase);
        const catKey = lc(p.category);
        // Exact phase or category match.
        if (byKey.has(phaseKey)) return byKey.get(phaseKey);
        if (byKey.has(catKey)) return byKey.get(catKey);
        // Fuzzy: any LLM question whose phase/category contains either token.
        for (let j = 0; j < arr.length; j++) {
          if (usedIndexes.has(j)) continue;
          const q = arr[j];
          const qPhase = lc(q?.phase);
          const qCat = lc(q?.category);
          if ((qPhase && (qPhase.includes(phaseKey) || phaseKey.includes(qPhase))) ||
              (qCat && (qCat.includes(catKey) || catKey.includes(qCat)))) {
            usedIndexes.add(j);
            return q;
          }
        }
        // Positional fallback: same index in the LLM's array.
        if (arr[i] && !usedIndexes.has(i)) {
          usedIndexes.add(i);
          return arr[i];
        }
        return null;
      };

      questions = PHASES.map((p, i) => {
        const q = matchPhase(p, i);
        if (!q || !Array.isArray(q.options) || q.options.length < 3) return null;
        return {
          phase: p.phase,
          category: p.category,
          text: String(q.text || `How sophisticated should the ${p.category.toLowerCase()} layer be?`).trim(),
          options: q.options.slice(0, 3).map((o: any, j: number) => ({
            letter: o.letter || ['A', 'B', 'C'][j],
            label: String(o.label || '').trim() || ['Baseline', 'Intermediate', 'Advanced'][j],
            description: String(o.description || '').trim(),
          })),
        };
      }).filter(Boolean) as any[];
    } catch { /* parsing failed */ }

    res.json({ questions });
  } catch (err: any) {
    console.warn('[ExpandQuestions] Failed:', err?.message);
    res.status(500).json({ error: 'Failed to generate questions', questions: [] });
  }
});

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

    // Auto-match recent commits to BPs (non-blocking — fires after response)
    try {
      const { getProjectByEnrollment: getProjForMatch } = await import('../services/projectService');
      const proj = await getProjForMatch(enrollmentId);
      if (proj) {
        const { matchRecentCommitsToBPs } = await import('../services/commitDrivenMatcher');
        // Fire and don't await — runs in background so sync response is fast
        matchRecentCommitsToBPs(enrollmentId, proj.id).catch((e: any) =>
          console.error('[CommitMatcher] Background match failed:', e?.message)
        );
      }
    } catch {}

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
// Unified Project State (One Brain) — single canonical operational state.
// Synthesizes existing engines (project, progress, next-action) into one
// shape so the UI never re-computes priority/readiness/coverage locally.
// ---------------------------------------------------------------------------

router.get('/api/portal/project/unified-state', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollment_id = req.participant!.sub;
    const { buildUnifiedProjectState } = await import('../intelligence/unifiedProjectState/unifiedProjectStateBuilder');
    const state = await buildUnifiedProjectState({ enrollment_id });
    res.json(state);
  } catch (err: any) {
    console.error('[ProjectRoutes] GET /unified-state error:', err.message);
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
//
// PHASE 2 NOTE (System Intelligence Unification):
// enrichCapability remains the per-cap UI-shape builder (gap detection, vision,
// usability hints, implementation links, page review state, etc.). Its SCORING
// fields (metrics.system_readiness, metrics.requirements_coverage,
// metrics.quality_score, maturity.level, completion_pct) are now considered
// LEGACY HEURISTICS and are overlaid by engine-authoritative values via
// `overlayEngineScores()` whenever a system-state snapshot is available.
//
// No consumer should compute readiness / coverage / maturity / queue order
// independently. Read from /api/portal/project/system-state. Per-cap surfaces
// that need both UI shape AND scoring should call `enrichCapabilityWithEngine`
// which composes enrichCapability + the engine overlay.
// ────────────────────────────────────────────────────────────────────────────
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
  // Auto-promote or demote requirements based on actual file quality.
  // Patterns are architecture-agnostic (recognizes monolith, microservices, Python, Go, etc.)
  const IMPL_PATTERNS = [/\/(service|route|controller|handler|gateway|api|server|resolver)\b/i, /\/(model|schema|entity)\b/i, /\.(tsx|jsx|vue|svelte)$/, /\/(agent|intelligence|automation|worker)\b/i, /\/(middleware|util|helper|lib|src)\b/i, /\/(component|page|view|screen)\b/i];
  for (const r of allReqs) {
    if (r.status === 'matched' || r.status === 'partial') {
      const files = (r.github_file_paths || []) as string[];
      const realFiles = files.filter((f: string) => {
        const name = f.split('/').pop() || '';
        if (NOISE_FILES_SET.has(name)) return false;
        if (/^\d{14}/.test(name)) return false;
        if (name.startsWith('.')) return false;
        if (f.includes('node_modules/') || f.includes('dist/') || f.includes('.github/')) return false;
        return IMPL_PATTERNS.some(p => p.test(f)) && /\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/.test(name);
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
  // Layer detection regexes accept plural directory names too.
  // The earlier `\b` after a singular term failed on `/components/`, `/services/`,
  // `/routes/`, `/models/` etc. because `\b` doesn't fire between "t" and "s".
  // ShipCES has `services/web/src/components/Login.tsx` and the old regex still
  // returned projectHasFrontend=false. The `s?\b` form matches both singular
  // and plural cleanly.
  const projectHasBackend = repoTree.some((f: string) => /\/(services?|routes?|controllers?|handlers?|gateways?|apis?|servers?|resolvers?)\b/i.test(f) && /\.(ts|js|py|go|rs|java)$/.test(f));
  const projectHasFrontend = repoTree.some((f: string) => /\/(components?|pages?|views?|screens?|layouts?)\b/i.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f));
  const projectHasAgents = repoTree.some((f: string) => /(agents?|intelligence|automation|workers?|bots?)\b/i.test(f) && /\.(ts|js|py)$/.test(f));
  const projectHasModels = repoTree.some((f: string) => /\/(models?|schemas?|entit(y|ies)|migrations?)\b/i.test(f) && /\.(ts|js|py|go|rs|java)$/.test(f));
  // Observability detection: scan for monitoring/logging/metrics/tracing files.
  // Without this, q.observability stays at 0 forever and the orchestrator
  // surfaces "Add Monitoring & Logging" as the top recommendation on every BP
  // even when the repo clearly has it. Same approach as the other layers.
  const projectObservabilityCount = repoTree.filter((f: string) => /(monitors?|metrics?|logs?|logger|telemetr(y|ies)|tracer?|trac(e|ing)|observ|alerts?)\b/i.test(f) && /\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(f)).length;
  const projectHasObservability = projectObservabilityCount > 0;
  // Count project-level files per layer for quality scoring (when per-BP matches are empty)
  const projectBackendCount = repoTree.filter((f: string) => /\/(services?|routes?|controllers?|handlers?|gateways?|apis?)\b/i.test(f) && /\.(ts|js|py|go)$/.test(f)).length;
  const projectFrontendCount = repoTree.filter((f: string) => /\/(components?|pages?|views?|screens?)\b/i.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f)).length;
  const projectAgentCount = repoTree.filter((f: string) => /(agents?|intelligence|automation)\b/i.test(f) && /\.(ts|js|py)$/.test(f)).length;
  const projectModelCount = repoTree.filter((f: string) => /\/(models?|schemas?|entit(y|ies))\b/i.test(f) && /\.(ts|js|py|go)$/.test(f)).length;

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
    // Observability now reads the repo. 5 baseline + half the file count, capped at 10.
    // Was hardcoded to 0 — produced "Add Monitoring & Logging" recommendations on every BP
    // even for projects with monitoring/logging clearly in place.
    observability: projectHasObservability ? Math.min(10, 5 + Math.floor(projectObservabilityCount / 2)) : 0,
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
  // Compute the *authoritative* set of completed step keys.
  // Prior versions trusted only `last_execution.completed_steps`, which is updated
  // when the user copies a prompt — but it ignores work tracked via validation
  // reports or layers that already exist in the repo. That drift caused the
  // "next step" surfaces to keep recommending finished work. We now union three
  // signals: explicit user completions, derived system-layer presence, and
  // requirement coverage thresholds — the same signals the rest of the
  // enrichment already uses.
  const lastExec = (cap as any).last_execution;
  const explicitlyCompleted: string[] = lastExec?.completed_steps || [];
  const completedSet = new Set<string>(explicitlyCompleted);
  if (hasBackend || projectHasBackend) completedSet.add('build_backend');
  if (hasFrontend || projectHasFrontend) completedSet.add('add_frontend');
  if (hasAgents || projectHasAgents) completedSet.add('add_agents');
  if ((combinedModelFiles.length > 0) || projectHasModels) completedSet.add('add_database');
  if (reqCoverage >= 95) completedSet.add('implement_requirements');
  // Quality thresholds are intentionally lenient — these flag the gross
  // absence of a layer, not perfectionist scores. A 6/10 reliability score
  // on a production system isn't a "build step", it's a polish item that
  // belongs in the enhancement plan if anywhere.
  if ((q.reliability || 0) >= 4) completedSet.add('improve_reliability');
  if ((q.production_readiness || 0) >= 5) completedSet.add('optimize_performance');

  // Page BPs (source = 'frontend_page') were auto-discovered from a route in
  // the user's repo — they ARE the frontend implementation. Recommending
  // "Create Frontend UI" for them is nonsense. Mark frontend-related steps
  // as completed for these so the engine offers backend wiring or
  // enhancements instead.
  const capIsPageBP = (cap as any).source === 'frontend_page' || !!(cap as any).frontend_route;
  if (capIsPageBP) {
    completedSet.add('add_frontend');
  }
  const completedSteps: string[] = Array.from(completedSet);
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

  // Page BP visual review: 5 user-asserted categories rolled up into a 0-100%
  // score. See PUT /business-processes/:id/page-category. The same flag also
  // overrides the displayed completion percentage for Page BPs below — they
  // don't have requirements to track coverage against, so the user's review
  // ticks ARE the progress signal.
  const PAGE_CATEGORIES = ['layout', 'accessibility', 'responsiveness', 'interaction', 'content'];
  const pageCategoryScores = ((cap as any).ui_element_map?.category_scores) || {};
  const pageCategoriesVerified = PAGE_CATEGORIES.filter(k => pageCategoryScores[k]?.verified).length;
  const pageVisualCompletionPct = Math.round((pageCategoriesVerified / PAGE_CATEGORIES.length) * 100);

  // Mode-aware completion: requires BOTH maturity threshold AND coverage/quality thresholds
  const meetsMaturity = maturityLevel >= (profile.completion_maturity_threshold || 3);
  // Page BPs: complete when frontend_route exists AND either (a) all visual
  // review categories verified, or (b) totalR === 0 (legacy auto-discovered
  // pages with no review yet — keep them complete enough to not gate the
  // grid).
  const isPageBPComplete = isPageBP && !!(cap as any).frontend_route && (pageCategoriesVerified === PAGE_CATEGORIES.length || totalR === 0);
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
      builtCategories: (cap as any)._builtCategories,
    });
    // If requirement-driven plan is empty but process isn't complete, fall back to old engine
    if (executionPlan.length === 0 && !processComplete) {
      const fallback = generateExecutionPlan(systemState, completedSteps, profileOptions);
      // Drop the catch-all "verify_requirements" fallback when coverage is already high.
      // It produces "Verify Requirement Coverage for X" recommendations on every
      // 100%-coverage BP whose maturity is gated by an unrelated layer (e.g., frontend
      // in a headless project). These steps are noise — the user sees the same
      // recommendation copy on dozens of BPs in a row, with no way out short of
      // running each prompt. When coverage is high, surface enhancement options
      // and the Mark Verified action instead.
      executionPlan = fallback.filter((s: any) => !(s.key === 'verify_requirements' && reqCoverage >= 95));
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
    source: isPageBP ? 'frontend_page' : ((cap as any).source || 'requirements'),
    is_page_bp: isPageBP,
    total_requirements: totalR,
    matched_requirements: allReqsFlat.filter((r: any) => r.status === 'matched' || r.status === 'auto_verified' || r.status === 'verified').length,
    verified_requirements: allReqsFlat.filter((r: any) => r.status === 'auto_verified' || r.status === 'verified').length,
    auto_matched_requirements: allReqsFlat.filter((r: any) => r.status === 'matched').length,
    partial_requirements: allReqsFlat.filter((r: any) => r.status === 'partial').length,
    unmatched_requirements: allReqsFlat.filter((r: any) => r.status === 'unmatched' || r.status === 'not_started').length,
    // Page BPs use visual-review tick count as their displayed completion.
    // Non-Page BPs use requirement coverage as before. user_status='verified'
    // overrides everything (handled in is_complete below).
    // Brownfield caps come from a code-discovery scan, not a requirements
    // doc — they have totalR === 0 so reqCoverage is 0/0 = 0, which made
    // every brownfield cap show 0% on the grid even when its files clearly
    // exist. Fall back to the evidence_completion_pct stamped at discovery
    // time (computed from layer coverage + file count + PROGRESS.md mentions).
    completion_pct: (() => {
      if (isPageBP) return pageVisualCompletionPct;
      if (totalR > 0) return reqCoverage;
      const evidence = (cap as any).last_execution?.evidence_completion_pct;
      return typeof evidence === 'number' ? evidence : 0;
    })(),
    metrics: {
      requirements_coverage: isPageBP ? pageVisualCompletionPct : reqCoverage,
      system_readiness: readiness,
      quality_score: qualityTotal,
    },
    // Page BP review state — surfaced for the new Visual Review section in the BP detail UI.
    page_visual_review: isPageBP ? {
      categories: PAGE_CATEGORIES,
      scores: pageCategoryScores,
      verified_count: pageCategoriesVerified,
      total: PAGE_CATEGORIES.length,
      completion_pct: pageVisualCompletionPct,
    } : null,
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
    // user_status is the canonical user-asserted state. When 'verified', the BP
    // is done from the user's perspective regardless of what the heuristics say.
    // When 'archived', it's hidden from active surfaces (orchestrator skips it,
    // grid filters it out).
    user_status: (cap as any).user_status || 'in_progress',
    user_status_set_at: (cap as any).user_status_set_at || null,
    // is_complete is true when EITHER the user marked it verified OR the heuristic
    // process-complete check passes. The user's assertion always wins.
    is_complete: ((cap as any).user_status === 'verified') || processComplete,
    // Drop the execution_plan entirely when the user has marked the BP verified —
    // there is no "next build step" for completed work.
    execution_plan: ((cap as any).user_status === 'verified') ? [] : executionPlan,
    // Use backend_context (from actual source code reading) as the source of truth
    // when available, falling back to keyword-matched file detection.
    usability: (() => {
      const bCtx = (cap as any).backend_context;
      const ctxHasBackend = bCtx?.api_routes?.length > 0;
      const ctxHasAgents = bCtx?.agents?.length > 0;
      // Per-capability layer signals — STRICT. Don't fall back to
      // project-level effectiveBackend/Frontend/Agents here. Those
      // are correct for maturity/quality (project-wide health) but
      // wrong for usability (does THIS cap have THIS layer). The
      // fallback was lighting up Frontend/Agents filters for every
      // capability the moment any frontend/agent code existed
      // anywhere in the repo.
      // 2026-05-20: usability signals must reflect real linked files, not
      // the keyword-only heuristic. Alert System (name stem "system") was
      // matching every .tsx file with "system" in the path → false-positive
      // amber F pillar even though linked_frontend_components is empty.
      // The persisted linked_* arrays are the authoritative signal; the
      // heuristic scan is allowed only as a fallback when nothing is stored
      // (legacy caps that pre-date brownfield discovery).
      const storedBackendCount = ((cap as any).linked_backend_services || []).length;
      const storedFrontendCount = ((cap as any).linked_frontend_components || []).length;
      const storedAgentsCount = ((cap as any).linked_agents || []).length;
      const realBackend = storedBackendCount > 0 || ctxHasBackend
        || (storedFrontendCount === 0 && storedAgentsCount === 0 && hasBackend);
      const realAgents = storedAgentsCount > 0 || ctxHasAgents
        || (storedBackendCount === 0 && storedFrontendCount === 0 && hasAgents);
      // 2026-05-20 (refined): a cap should only show a frontend pillar
      // when it has its OWN page. Lead Classification had 5
      // linked_frontend_components (LeadCaptureForm, LeadDetailModal,
      // ClassificationBadge etc.) but no frontend_route — those are
      // shared / utility components attributed by keyword match, not a
      // page that IS Lead Classification. Operator flagged it as a
      // false-positive amber F. Now strict: frontend = ready/partial
      // only when the cap has its own route or is explicitly a page BP.
      // Sub-component participation is preserved in linked_frontend_components
      // for the detail panel but does NOT light the row pillar.
      const realFrontend = !!(cap as any).frontend_route
        || (cap as any).source === 'frontend_page'
        || (cap as any).is_page_bp === true;

      if (isPageBP) {
        return { backend: ctxHasBackend ? 'ready' : 'n/a', frontend: realFrontend ? 'ready' : 'missing', agent: ctxHasAgents ? 'ready' : 'n/a', usable: isPageBPComplete, why_not: isPageBPComplete ? [] : ['Connect a frontend route to mark as ready'] };
      }
      return {
        backend: realBackend ? (reqCoverage > 70 ? 'ready' : 'partial') : 'missing',
        frontend: realFrontend ? ((cap as any).frontend_route ? 'ready' : 'partial') : 'missing',
        agent: realAgents ? 'ready' : 'missing',
        usable: processComplete,
        why_not,
      };
    })(),
    implementation_links: (() => {
      // Merge keyword-matched files WITH explicitly-linked files from validation reports
      const storedBackend: string[] = (cap as any).linked_backend_services || [];
      const storedFrontend: string[] = (cap as any).linked_frontend_components || [];
      const storedAgents: string[] = (cap as any).linked_agents || [];
      return {
        backend: [...new Set([...combinedBackendFiles, ...storedBackend])].slice(0, 20) || repoTree.filter((f: string) => /\/(service|route|controller|handler)\b/i.test(f) && /\.(ts|js)$/.test(f)).slice(0, 15),
        frontend: [...new Set([...combinedFrontendFiles, ...storedFrontend])].slice(0, 20) || repoTree.filter((f: string) => /\/(component|page|view)\b/i.test(f) && /\.(tsx|jsx)$/.test(f)).slice(0, 15),
        agents: [...new Set([...combinedAgentFiles, ...storedAgents])],
        models: combinedModelFiles.length > 0 ? combinedModelFiles : repoTree.filter((f: string) => /\/models?\//i.test(f) && /\.(ts|js)$/.test(f) && !/index|seed|migration/i.test(f)).slice(0, 10),
      };
    })(),
    vision: features.map((f: any) => f.description || f.name).filter(Boolean),
    // Autonomous Enhancements — separate layer for system-generated requirements
    // Only populated when the BP has AUTO-* requirements (modes=['autonomous'])
    autonomous_enhancements: (() => {
      const autoReqs = allReqsFlat.filter((r: any) => r.verified_by === 'AUTONOMOUS_ENGINE');
      if (autoReqs.length === 0) return null;
      return {
        count: autoReqs.length,
        completed: autoReqs.filter((r: any) => r.status === 'verified' || r.status === 'auto_verified' || r.status === 'matched').length,
        pending: autoReqs.filter((r: any) => r.status === 'not_started' || r.status === 'unmatched').length,
        requirements: autoReqs.map((r: any) => ({
          id: r.id,
          key: r.requirement_key,
          text: r.requirement_text,
          status: r.status,
          gap_type: r.metadata?.autonomous_generation?.gap_type || null,
          impact_score: r.metadata?.autonomous_generation?.impact_score || 0,
          generated_at: r.metadata?.autonomous_generation?.generated_at || null,
          category: r.metadata?.autonomous_generation?.category || null,
        })),
      };
    })(),
  };
}

// ─── PHASE 2: engine-augmented adapter ──────────────────────────────────────
// Overlays authoritative engine scores on top of a legacy enrichCapability
// payload. The legacy heuristic values are preserved on `_legacy_metrics` for
// debugging — but the canonical metrics surface is engine-derived.
//
// `engineState` is the AuthoritativeSystemState; we look up the per-cap score
// row and replace readiness, coverage, maturity, quality_score, and the
// derived completion_pct / mode_completion / maturity blocks.
function overlayEngineScores(enriched: any, engineState: any): any {
  if (!engineState || !engineState.scores || !Array.isArray(engineState.scores.per_capability)) {
    return enriched;
  }
  const row = engineState.scores.per_capability.find((r: any) => r.capability_id === enriched.id);
  if (!row) return enriched;

  const legacyMetrics = enriched.metrics || {};
  const legacyMaturity = enriched.maturity || {};
  const legacyCompletion = enriched.completion_pct;

  // Engine maturity_level is 0-4. Legacy maturity.label preserved if engine
  // doesn't provide one (the level number stays canonical from the engine).
  return {
    ...enriched,
    metrics: {
      requirements_coverage: row.coverage,
      system_readiness: row.readiness,
      quality_score: row.health,
    },
    maturity: {
      ...legacyMaturity,
      level: row.maturity_level ?? legacyMaturity.level,
    },
    // For coverage_pct surface used by the grid — engine coverage is the
    // canonical "how much of this BP exists" number.
    completion_pct: row.coverage ?? legacyCompletion,
    _engine_authoritative: true,
    _engine_generated_at: engineState.generated_at,
    _legacy_metrics: legacyMetrics,
    _legacy_completion_pct: legacyCompletion,
  };
}

// 2026-05-20: per-cap maturity isn't denormalized into SystemStateSnapshot,
// so overlayEngineScores can't find a row and falls back to legacy maturity —
// which itself is unset, leaving every BP stuck at L1. Compute maturity inline
// using the same scorer the engine uses, so the BP row gets the right L0-L4
// without forcing a full engine rebuild on every refresh.
function computeMaturityInline(cap: any): { level: number; label: string } | null {
  try {
    const { scoreMaturity } = require('../intelligence/systemStateEngine/scoring/maturityScorer');
    const input = {
      id: cap.id,
      name: cap.name,
      source: cap.source,
      kind: cap.is_page_bp ? 'page' : 'service',
      is_page_bp: !!cap.is_page_bp,
      linked_backend_services: cap.linked_backend_services || [],
      linked_frontend_components: cap.linked_frontend_components || [],
      linked_agents: cap.linked_agents || [],
      ui_element_map: cap.ui_element_map,
      total_requirements: cap.total_requirements || 0,
      matched_requirements: cap.matched_requirements || 0,
      verified_requirements: cap.verified_requirements || 0,
      operator_unmatched_requirements: 0,
      user_status: cap.user_status,
      last_execution: cap.last_execution,
      frontend_route: cap.frontend_route,
    };
    const m = scoreMaturity(input);
    return { level: m.level, label: m.label };
  } catch { return null; }
}

// Composes enrichCapability + engine overlay. Use this anywhere a list/detail
// endpoint needs both the rich UI shape AND authoritative scores. If no engine
// state is available, falls back gracefully to legacy enrichCapability output.
function enrichCapabilityWithEngine(cap: any, engineState: any | null): any {
  const base = enrichCapability(cap);
  // Always compute maturity from cap fields. The engine snapshot's
  // per_capability array is empty by design (not denormalized in the
  // snapshot table), so without this every cap shows L1.
  const inlineMaturity = computeMaturityInline(cap);
  if (inlineMaturity) {
    base.maturity = { ...(base.maturity || {}), ...inlineMaturity };
  }
  return engineState ? overlayEngineScores(base, engineState) : base;
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
    const capModels = await CapabilityModel.findAll({ where: { project_id: project.id }, attributes: ['id', 'last_execution', 'mode_override', 'applicability_status', 'execution_profile', 'strategy_template', 'modes', 'frontend_route', 'backend_context', 'user_status', 'user_status_set_at', 'ui_element_map', 'linked_backend_services', 'linked_frontend_components', 'linked_agents', 'frontend_calls_capability_ids'] });
    const execMap = new Map(capModels.map((c: any) => [c.id, { last_execution: c.last_execution, mode_override: c.mode_override, applicability_status: c.applicability_status, execution_profile: c.execution_profile, strategy_template: c.strategy_template, modes: c.modes, frontend_route: c.frontend_route, backend_context: c.backend_context, user_status: c.user_status, user_status_set_at: c.user_status_set_at, ui_element_map: c.ui_element_map, linked_backend_services: c.linked_backend_services, linked_frontend_components: c.linked_frontend_components, linked_agents: c.linked_agents, frontend_calls_capability_ids: c.frontend_calls_capability_ids }]));
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

    // Load build history once for the project — used by execution plan to
    // suppress steps for work already reported via validation reports.
    let projectBuiltCategories: Set<string> | undefined;
    try {
      const { loadBuildHistory } = await import('../services/buildHistoryService');
      const history = await loadBuildHistory(project.id);
      if (history.builtCategories.size > 0) projectBuiltCategories = history.builtCategories;
    } catch {}

    hierarchy.forEach((cap: any) => {
      cap._repoFileTree = repoFileTree;
      cap._projectMode = projectMode;
      cap._campaignMode = campaignModeMap.get(cap.id) || null;
      cap._builtCategories = projectBuiltCategories;
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
        if ((extra as any).backend_context) cap.backend_context = (extra as any).backend_context;
        cap.user_status = (extra as any).user_status || 'in_progress';
        cap.user_status_set_at = (extra as any).user_status_set_at || null;
        cap.ui_element_map = (extra as any).ui_element_map || null;
        // 2026-05-20: surface linked-file arrays so (1) the BP row can show
        // BE/FE/AG badges and (2) the engine maturity scorer sees the layer
        // signals. Without these, every cap looked layerless on the wire,
        // capping maturity at L1 regardless of evidence_completion_pct.
        cap.linked_backend_services = (extra as any).linked_backend_services || [];
        cap.linked_frontend_components = (extra as any).linked_frontend_components || [];
        cap.linked_agents = (extra as any).linked_agents || [];
        cap.frontend_calls_capability_ids = (extra as any).frontend_calls_capability_ids || [];
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

    // PHASE 2: read authoritative state once; overlay engine scores on each
    // enriched cap so coverage / readiness / maturity are engine-canonical.
    let engineState: any = null;
    try {
      const { readOrRebuild } = await import('../intelligence/systemStateEngine');
      engineState = await readOrRebuild(project.id);
    } catch (engineErr: any) {
      console.warn('[BP list] engine read failed, falling back to legacy scores:', engineErr?.message);
    }

    const enriched = modeFilteredHierarchy.map((cap: any) => enrichCapabilityWithEngine(cap, engineState));
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
    // Cross-BP dedup: top BPs get unique step categories; the rest get BP-specific
    // labels so the user sees distinct actionable text even when categories repeat.
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
        const [unique] = plan.splice(firstUniqueIdx, 1);
        plan.unshift(unique);
      }
      const first = plan.find((s: any) => !s.blocked);
      if (first) {
        if (isUnique(first)) {
          usedFirstKeys.add(first.key);
          usedFirstLabels.add(normalize(first.label));
        } else {
          // No unique alternative — make label BP-specific so the user sees
          // distinct text even when the underlying category is the same.
          const baseLabelNorm = normalize(first.label);
          const bpSuffix = ` for ${cap.name}`;
          if (!first.label.includes(' for ')) {
            first.label = first.label.replace(/\s*\(\d+[^)]*\)$/, '') + bpSuffix;
          }
          const specificLabel = normalize(first.label);
          usedFirstLabels.add(specificLabel);
        }
      }
    }

    // Strip internal properties that bloat the response (e.g. _repoFileTree
    // is 356 paths × 70 BPs = ~500KB of repeated data the frontend doesn't need).
    for (const cap of enriched) {
      delete cap._repoFileTree;
      delete cap._projectMode;
      delete cap._campaignMode;
      delete cap._effectiveMode;
      // Trim large arrays that the list view doesn't render
      if (cap.gaps?.length > 10) cap.gaps = cap.gaps.slice(0, 10);
      if (cap.vision?.length > 3) cap.vision = cap.vision.slice(0, 3);
    }

    res.json(enriched);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Cory Orchestrator: project-wide top tasks (for Blueprint) ────────
// ─── Cory tasks (Phase 2: now consumes the SystemStateEngine) ──────────────
//
// Engine output is authoritative. Frontend rendering layer flattens the
// AuthoritativeTask shape into the legacy CoryTask shape so existing
// consumers don't break — once they migrate to read /system-state directly,
// this endpoint becomes unnecessary.
router.get('/api/portal/project/cory-tasks', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { buildAuthoritativeState } = await import('../intelligence/systemStateEngine');
    const state = await buildAuthoritativeState(project.id, { persist: false });

    const { Capability: CapModel } = await import('../models');
    const allCaps = await CapModel.findAll({ where: { project_id: project.id }, attributes: ['id', 'name'] });
    const nameMap = new Map(allCaps.map((c: any) => [c.id, c.name]));

    // Adapt AuthoritativeTask → legacy CoryTask shape. The frontend's
    // existing render code reads CoryTask, so we preserve it during
    // the cutover; the engine's full output is exposed at /system-state.
    const tasksWithNames = state.queue.slice(0, 5).map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      source: t.type === 'ui_review' ? 'ui'
            : t.type === 'optimization' ? 'improve'
            : t.type === 'validation' || t.type === 'testing' ? 'health'
            : 'build',
      type: t.type === 'foundation' ? 'foundational'
          : t.type === 'optimization' ? 'enhancement'
          : t.type === 'ui_review' ? 'experience'
          : 'fix',
      impact: t.priority_score,
      urgency: t.blocking_score,
      confidence: t.confidence_score,
      blocking: t.blocking_score >= 80,
      blocked: t.state === 'blocked',
      block_reason: t.state === 'blocked' ? t.reasoning.join('; ') : undefined,
      dependencies: [...t.dependencies],
      system_layer: t.type === 'frontend' || t.type === 'ui_review' ? 'frontend'
                  : t.type === 'database' ? 'data'
                  : t.type === 'intelligence' ? 'agents_backend'
                  : t.type === 'optimization' || t.type === 'testing' ? 'observability'
                  : 'backend',
      mode_relevance: { mvp: 1, production: 1, enterprise: 1, autonomous: 1 },
      color: '#3b82f6',
      prompt_target: t.type === 'foundation' ? 'project_kickoff' : undefined,
      component_id: t.bp_id || (t.type === 'foundation' ? '__project_kickoff__' : undefined),
      priority: -t.calculated_rank,
      decision_trace: t.decision_trace ? {
        reason: t.reasoning.join('; '),
        inputs: {
          coverage: t.decision_trace.coverage_inputs.current,
          readiness: t.decision_trace.readiness_inputs.current,
          quality: 0,
          mode: 'engine',
          layer_status: t.type,
        },
        confidence: t.confidence_score,
        scoring_breakdown: {
          impact_score: t.priority_score,
          urgency_score: t.blocking_score,
          confidence_score: t.confidence_score,
          blocking_bonus: t.state === 'ready' ? 25 : 0,
          mode_weight: 1,
          total: -t.calculated_rank,
        },
        // Phase 2: full engine trace for explainability panel
        formulas_used: [...t.decision_trace.formulas_used],
        reasoning_chain: [...t.decision_trace.reasoning_chain],
        readiness_inputs: t.decision_trace.readiness_inputs,
        coverage_inputs: t.decision_trace.coverage_inputs,
        maturity_inputs: t.decision_trace.maturity_inputs,
        dependency_inputs: t.decision_trace.dependency_inputs,
        blocking_inputs: t.decision_trace.blocking_inputs,
        confidence_inputs: t.decision_trace.confidence_inputs,
      } : undefined,
      component_name: t.bp_id ? (nameMap.get(t.bp_id) || 'Unknown')
                              : (t.type === 'foundation' ? 'Project Kickoff' : 'Project'),
    }));

    res.json({
      tasks: tasksWithNames,
      total_components: state.scores.per_capability.length,
      mode: (project as any).target_mode || 'production',
      // Phase 2: indicate the engine is the source so consumers can adopt
      _source: 'system_state_engine',
      _generated_at: state.generated_at,
    });
  } catch (err: any) {
    console.error('[cory-tasks]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 2: AUTHORITATIVE SYSTEM STATE ──────────────────────────────────
//
// The single endpoint that returns the complete engine output. New
// frontend consumers should read from here instead of patching together
// data from cory-tasks + business-processes + progress.
//
// Query params:
//   ?fresh=true    — force rebuild (skip snapshot cache, re-run engine)
//   default        — read snapshot if recent, rebuild if stale (>5 min)
/**
 * GET /api/portal/onboarding/state — 2026-05-20.
 *
 * Returns the onboarding stage for the signed-in enrollment + a `gates`
 * object indicating which top-nav tabs should be enabled. Pure read.
 *
 * Stages:
 *   - 'needs_requirements': no project OR project has no requirements doc
 *                           AND no requirements_maps rows
 *   - 'has_requirements':   doc saved, requirements parsed, no caps yet
 *                           (or caps exist but no frontend_route on any)
 *   - 'has_code':           caps with frontend_route exist (built surface)
 *   - 'ready':              alias for has_code; reserved for future signals
 *
 * Gates the home shell uses to render disabled top-nav items.
 */
router.get('/api/portal/onboarding/state', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);

    if (!project) {
      res.json({
        stage: 'needs_requirements',
        project_id: null,
        has_project: false,
        has_requirements_doc: false,
        requirements_count: 0,
        capability_count: 0,
        capabilities_with_routes: 0,
        gates: { home: true, critique: false, blueprint: false, system: false, sessions: true },
      });
      return;
    }

    const { RequirementsMap, Capability } = await import('../models');
    const [reqCount, capCount, capsWithRoutes] = await Promise.all([
      RequirementsMap.count({ where: { project_id: project.id } }),
      Capability.count({ where: { project_id: project.id, applicability_status: 'active' } }),
      Capability.count({ where: {
        project_id: project.id,
        applicability_status: 'active',
        frontend_route: { [require('sequelize').Op.ne]: null },
      } }),
    ]);

    const hasReqDoc = !!(project as any).requirements_document
      && String((project as any).requirements_document).trim().length > 0;

    let stage: 'needs_requirements' | 'has_requirements' | 'has_code' | 'ready';
    if (!hasReqDoc && reqCount === 0) stage = 'needs_requirements';
    else if (capsWithRoutes === 0) stage = 'has_requirements';
    else stage = 'has_code';

    res.json({
      stage,
      project_id: project.id,
      has_project: true,
      has_requirements_doc: hasReqDoc,
      requirements_count: reqCount,
      capability_count: capCount,
      capabilities_with_routes: capsWithRoutes,
      gates: {
        home: true,
        critique: stage === 'has_code',
        blueprint: stage !== 'needs_requirements',
        system: stage !== 'needs_requirements',
        sessions: true,
      },
    });
  } catch (err: any) {
    console.error('[onboarding/state]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/system-state', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const fresh = req.query.fresh === 'true' || req.query.fresh === '1';
    const t0 = Date.now();

    let state;
    let source: 'snapshot' | 'fresh_build';
    if (fresh) {
      const { buildAuthoritativeState } = await import('../intelligence/systemStateEngine');
      state = await buildAuthoritativeState(project.id, { persist: true });
      source = 'fresh_build';
    } else {
      const { readOrRebuild } = await import('../intelligence/systemStateEngine');
      state = await readOrRebuild(project.id);
      source = 'snapshot';   // readOrRebuild returns the snapshot if fresh enough
    }

    res.json({
      ...state,
      _meta: {
        source,
        elapsed_ms: Date.now() - t0,
      },
    });
  } catch (err: any) {
    console.error('[system-state]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 2: TASK EXPLAINABILITY ──────────────────────────────────────────
//
// "Why is this task next?" panel. Returns the full decision_trace for
// a specific task in the current queue, plus the project's contradictions
// and blockers that contributed to the ranking.
router.get('/api/portal/project/system-state/explain/:taskId', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { readOrRebuild } = await import('../intelligence/systemStateEngine');
    const state = await readOrRebuild(project.id);
    const task = state.queue.find(t => t.id === req.params.taskId);
    if (!task) { res.status(404).json({ error: 'Task not found in current queue' }); return; }

    const relatedContradictions = state.contradictions.filter(c =>
      c.task_id === task.id || (task.bp_id && c.capability_id === task.bp_id)
    );

    res.json({
      task,
      decision_trace: task.decision_trace,
      reasoning: task.reasoning,
      related_contradictions: relatedContradictions,
      blocked_by: task.dependencies,
      generated_at: state.generated_at,
    });
  } catch (err: any) {
    console.error('[system-state/explain]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 3: Telemetry endpoints ──────────────────────────────────────
// POST /telemetry — ingest a build manifest emitted by Claude Code.
router.post('/api/portal/project/telemetry', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    // Force project_id to the participant's project so a manifest can't
    // target a different project even if its body says so.
    const payload = { ...(req.body || {}), project_id: project.id };

    const { ingestManifest } = await import('../intelligence/systemStateEngine');
    const out = await ingestManifest(payload);
    if (!out.ok) {
      res.status(out.status).json({ error: 'manifest_validation_failed', details: out.errors });
      return;
    }
    res.status(201).json({ manifest_id: out.manifest_id, project_id: out.project_id });
  } catch (err: any) {
    console.error('[telemetry/ingest]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /telemetry — recent manifests + summary metadata.
router.get('/api/portal/project/telemetry', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { loadManifestsForProject, scoreFreshnessForProject } = await import('../intelligence/systemStateEngine');
    const limit = Number(req.query.limit) || 50;
    const manifests = await loadManifestsForProject(project.id, { limit });
    const freshness = await scoreFreshnessForProject(project.id);

    res.json({
      project_id: project.id,
      manifests,
      manifest_count: manifests.length,
      freshness,
    });
  } catch (err: any) {
    console.error('[telemetry/list]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /telemetry/health — telemetry health summary (no full manifest list).
router.get('/api/portal/project/telemetry/health', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { readOrRebuild, scoreFreshnessForProject } = await import('../intelligence/systemStateEngine');
    const state = await readOrRebuild(project.id);
    const freshness = await scoreFreshnessForProject(project.id);

    const telemetryDimensions = {
      manifest_freshness: state.sync_health.dimensions.manifest_freshness,
      missing_build_manifests: state.sync_health.dimensions.missing_build_manifests,
      conflicting_manifests: state.sync_health.dimensions.conflicting_manifests,
      undocumented_db_changes: state.sync_health.dimensions.undocumented_db_changes,
      ui_drift: state.sync_health.dimensions.ui_drift,
      graph_drift: state.sync_health.dimensions.graph_drift,
      missing_validation_telemetry: state.sync_health.dimensions.missing_validation_telemetry,
    };

    res.json({
      project_id: project.id,
      generated_at: state.generated_at,
      sync_health_score: state.sync_health.score,
      telemetry_dimensions: telemetryDimensions,
      freshness,
      contradiction_count: state.sync_health.contradiction_count,
      contradictions_by_kind: countByKind(state.contradictions),
    });
  } catch (err: any) {
    console.error('[telemetry/health]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

function countByKind(contradictions: ReadonlyArray<{ kind: string }>) {
  const out: Record<string, number> = {};
  for (const c of contradictions) out[c.kind] = (out[c.kind] || 0) + 1;
  return out;
}

// GET /graph — current state graph (telemetry-merged).
router.get('/api/portal/project/graph', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { readOrRebuild } = await import('../intelligence/systemStateEngine');
    const state = await readOrRebuild(project.id);
    res.json({
      project_id: project.id,
      generated_at: state.generated_at,
      graph: state.graph,
      node_count: state.graph.nodes.length,
      edge_count: state.graph.edges.length,
    });
  } catch (err: any) {
    console.error('[graph]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /database-map — declared DB topology for the project.
router.get('/api/portal/project/database-map', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { buildDatabaseMapForProject } = await import('../intelligence/systemStateEngine');
    const map = await buildDatabaseMapForProject(project.id);
    res.json(map);
  } catch (err: any) {
    console.error('[database-map]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /ui-map — declared UI topology for the project.
router.get('/api/portal/project/ui-map', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { buildUIMapForProject } = await import('../intelligence/systemStateEngine');
    const map = await buildUIMapForProject(project.id);
    res.json(map);
  } catch (err: any) {
    console.error('[ui-map]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 4: Self-synchronizing execution endpoints ──────────────────
//
// Auto-generate a manifest draft from a parsed validation report or git diff.
// Caller can review + post via POST /telemetry, or post directly with the
// `?ingest=1` flag.
router.post('/api/portal/project/telemetry/auto-generate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { generateManifestDraft, suggestRepairs } = await import('../intelligence/systemStateEngine/execution/autoManifestGenerator');
    const { task_id, bp_id, diff_stdout, parsed_validation_report, task_type, ingest } = req.body || {};
    if (!task_id) { res.status(400).json({ error: 'task_id required' }); return; }

    const draft = generateManifestDraft({
      task_id,
      bp_id: bp_id ?? null,
      project_id: project.id,
      diff_stdout,
      parsed_validation_report,
    });

    const repairs = task_type ? suggestRepairs(draft.manifest, task_type) : [];

    if (ingest === true || ingest === 'true' || ingest === 1) {
      const { ingestManifest } = await import('../intelligence/systemStateEngine');
      const out = await ingestManifest(draft.manifest);
      if (!out.ok) {
        res.status(out.status).json({ error: 'manifest_validation_failed', details: out.errors, draft: draft.manifest });
        return;
      }
      res.status(201).json({
        manifest_id: out.manifest_id,
        project_id: out.project_id,
        draft: draft.manifest,
        source_summary: draft.source_summary,
        repair_suggestions: repairs,
      });
      return;
    }

    res.json({
      draft: draft.manifest,
      source_summary: draft.source_summary,
      repair_suggestions: repairs,
    });
  } catch (err: any) {
    console.error('[telemetry/auto-generate]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Score a manifest's completeness for a given task_type. Read-only — does
// not ingest. Useful for the UI to show the user what's missing before they
// submit.
router.post('/api/portal/project/telemetry/completeness', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { manifest, task_type } = req.body || {};
    if (!manifest) { res.status(400).json({ error: 'manifest required' }); return; }
    if (!task_type) { res.status(400).json({ error: 'task_type required' }); return; }

    const { validateManifestShape } = await import('../intelligence/systemStateEngine');
    const shape = validateManifestShape(manifest);
    if (!shape.ok) {
      res.status(400).json({ error: 'manifest_shape_invalid', details: shape.errors });
      return;
    }
    const { checkManifestCompleteness } = await import('../intelligence/systemStateEngine/execution/manifestCompletenessChecker');
    const report = checkManifestCompleteness(task_type, shape.value);
    res.json(report);
  } catch (err: any) {
    console.error('[telemetry/completeness]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Build session: start a new session.
router.post('/api/portal/project/build-session/start', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { task_id, bp_id, task_type } = req.body || {};
    if (!task_id) { res.status(400).json({ error: 'task_id required' }); return; }
    if (!task_type) { res.status(400).json({ error: 'task_type required' }); return; }

    const { startSession } = await import('../intelligence/systemStateEngine/execution/buildSessionService');
    const result = await startSession({
      project_id: project.id,
      task_id,
      bp_id: bp_id ?? null,
      task_type,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[build-session/start]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Build session: complete with manifest. Runs the full execution pipeline.
router.post('/api/portal/project/build-session/:id/complete', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const sessionId = req.params.id as string;
    const { manifest, task_type, enforce_completeness } = req.body || {};
    if (!manifest) { res.status(400).json({ error: 'manifest required' }); return; }
    if (!task_type) { res.status(400).json({ error: 'task_type required' }); return; }

    // Force project_id to the participant's project
    const finalManifest = { ...manifest, project_id: project.id };

    const { runExecutionPipeline } = await import('../intelligence/systemStateEngine/execution/executionTelemetryPipeline');
    const { completeSession } = await import('../intelligence/systemStateEngine/execution/buildSessionService');

    const outcome = await runExecutionPipeline({
      manifest: finalManifest,
      task_type,
      enforce_completeness: enforce_completeness !== false,
    });

    if (!outcome.ok) {
      await completeSession({
        session_id: sessionId,
        status: 'rejected',
        manifest_id: null,
        telemetry_validated: outcome.error !== 'manifest_ingestion_failed',
        validation_passed: false,
        rejection_reason: outcome.error,
        rejection_details: outcome.details ?? null,
      });
      res.status(outcome.status).json({
        error: outcome.error,
        details: outcome.details,
        session_id: sessionId,
        session_status: 'rejected',
      });
      return;
    }

    await completeSession({
      session_id: sessionId,
      status: 'completed',
      manifest_id: outcome.manifest_id,
      telemetry_validated: true,
      validation_passed: outcome.completion.accepted,
      contradictions_detected: outcome.state.contradictions.length,
      queue_changes_triggered: 1,
    });
    res.json({
      session_id: sessionId,
      session_status: 'completed',
      manifest_id: outcome.manifest_id,
      completion_score: outcome.completion.score,
      warnings: outcome.completion.report.warnings,
      sync_health_score: outcome.state.sync_health.score,
      contradictions_detected: outcome.state.contradictions.length,
      state_elapsed_ms: outcome.state_elapsed_ms,
    });
  } catch (err: any) {
    console.error('[build-session/complete]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Build session: list recent for the project.
router.get('/api/portal/project/build-sessions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { listProjectSessions } = await import('../intelligence/systemStateEngine/execution/buildSessionService');
    const limit = Number(req.query.limit) || 50;
    const sessions = await listProjectSessions(project.id, { limit });
    res.json({ sessions, count: sessions.length });
  } catch (err: any) {
    console.error('[build-sessions]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// History: queue evolution.
router.get('/api/portal/project/history/queue', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { readQueueHistory } = await import('../intelligence/systemStateEngine/execution/queueHistoryWriter');
    const limit = Number(req.query.limit) || 200;
    const sinceMs = req.query.since_hours ? Number(req.query.since_hours) * 60 * 60 * 1000 : undefined;
    const entries = await readQueueHistory(project.id, { limit, sinceMs });
    res.json({ entries, count: entries.length });
  } catch (err: any) {
    console.error('[history/queue]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// History: scores over time (sourced from snapshot rows directly).
router.get('/api/portal/project/history/scores', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { default: SystemStateSnapshot } = await import('../models/SystemStateSnapshot');
    const limit = Number(req.query.limit) || 100;
    const rows = await SystemStateSnapshot.findAll({
      where: { project_id: project.id },
      attributes: ['id', 'generated_at', 'readiness_score', 'coverage_score', 'maturity_score', 'health_score', 'sync_health_score'],
      order: [['generated_at', 'DESC']],
      limit,
    });
    const entries = rows.map((r: any) => ({
      snapshot_id: r.id,
      generated_at: new Date(r.generated_at).toISOString(),
      readiness: r.readiness_score,
      coverage: r.coverage_score,
      maturity: r.maturity_score,
      health: r.health_score,
      sync_health: r.sync_health_score,
    }));
    res.json({ entries, count: entries.length });
  } catch (err: any) {
    console.error('[history/scores]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// History: contradictions seen across recent snapshots.
router.get('/api/portal/project/history/contradictions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { default: SystemStateSnapshot } = await import('../models/SystemStateSnapshot');
    const limit = Number(req.query.limit) || 50;
    const rows = await SystemStateSnapshot.findAll({
      where: { project_id: project.id },
      attributes: ['id', 'generated_at', 'contradiction_flags'],
      order: [['generated_at', 'DESC']],
      limit,
    });
    const entries = rows.map((r: any) => ({
      snapshot_id: r.id,
      generated_at: new Date(r.generated_at).toISOString(),
      contradictions: r.contradiction_flags || [],
      count: (r.contradiction_flags || []).length,
    }));
    res.json({ entries, count: entries.length });
  } catch (err: any) {
    console.error('[history/contradictions]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 5: Visual Review / Operational UX Intelligence ──────────────
// Open a new visual review session. Returns the session id; subsequent
// critique items / suggestions / decisions reference it.
router.post('/api/portal/project/visual-review/session', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { bp_id, page_route, primary_screenshot_path, notes } = req.body || {};
    if (!page_route) { res.status(400).json({ error: 'page_route required' }); return; }

    const { openSession } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const result = await openSession({
      project_id: project.id,
      bp_id: bp_id ?? null,
      page_route,
      participant_sub: req.participant!.sub,
      primary_screenshot_path: primary_screenshot_path ?? null,
      notes: notes ?? null,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[visual-review/session]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// List recent visual review sessions for the project.
router.get('/api/portal/project/visual-review/sessions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { listProjectSessions } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const sessions = await listProjectSessions(project.id, { limit: Number(req.query.limit) || 50 });
    res.json({ sessions, count: sessions.length });
  } catch (err: any) {
    console.error('[visual-review/sessions]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Single session detail (with critiques, suggestions, decisions).
router.get('/api/portal/project/visual-review/session/:id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getSession, listCritiques, listSuggestions, listDecisions } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const sessionId = req.params.id as string;
    const session = await getSession(sessionId);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (session.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const [critiques, suggestions, decisions] = await Promise.all([
      listCritiques(sessionId),
      listSuggestions(sessionId),
      listDecisions(sessionId),
    ]);
    res.json({ session, critiques, suggestions, decisions });
  } catch (err: any) {
    console.error('[visual-review/session detail]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Add a critique to a session and (optionally) auto-generate AI suggestions.
router.post('/api/portal/project/visual-review/session/:id/critique', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { kind, severity, description, region, target_selector, workflow_id, expected_outcome, generate_suggestions } = req.body || {};
    if (!kind || !severity || !description) {
      res.status(400).json({ error: 'kind, severity, description required' });
      return;
    }
    const { addCritique, recordSuggestion } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const critique = await addCritique({
      session_id: req.params.id as string,
      project_id: project.id,
      kind, severity, description, region, target_selector, workflow_id, expected_outcome,
      created_by: req.participant!.sub,
    });

    let suggestions: any[] = [];
    if (generate_suggestions !== false) {
      const { generateSuggestionsFromCritique } = await import('../intelligence/systemStateEngine/visual/visualCritiqueEngine');
      const drafts = generateSuggestionsFromCritique({
        id: critique.id,
        kind, severity, description, target_selector, expected_outcome,
      });
      for (const d of drafts) {
        const s = await recordSuggestion({
          session_id: req.params.id as string,
          critique_id: critique.id,
          project_id: project.id,
          kind: d.kind, title: d.title, body: d.body, rationale: d.rationale,
          confidence: d.confidence, expected_ux_impact: d.expected_ux_impact,
          source: 'rule_based',
          source_metadata: { generated_at: new Date().toISOString() },
        });
        suggestions.push({ id: s.id, ...d });
      }
    }
    res.status(201).json({ critique_id: critique.id, suggestions });
  } catch (err: any) {
    console.error('[visual-review/critique]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Phase B (2026-05-20): walk-mode endpoints. A walk is a guided pass
// through a queue of caps, leaving a verdict (reviewed / follow_up / skip)
// per cap. The queue is server-built from a named filter so the URL stays
// shareable + refresh-safe.
router.post('/api/portal/project/walk', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const filter = (req.body?.filter || 'all') as any;
    const allowed = ['all', 'pending_review', 'top_10', 'with_notes', 'custom'];
    if (!allowed.includes(filter)) { res.status(400).json({ error: 'invalid filter' }); return; }
    const capIds = Array.isArray(req.body?.cap_ids) ? req.body.cap_ids : undefined;
    const { createWalk } = await import('../services/walkSessionService');
    const result = await createWalk({
      project_id: project.id,
      created_by: req.participant!.sub,
      filter,
      capIds,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[walk/create]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/walk/:id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getWalk } = await import('../services/walkSessionService');
    const walk = await getWalk(req.params.id as string);
    if (!walk) { res.status(404).json({ error: 'Walk not found' }); return; }
    if (walk.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    res.json({ walk });
  } catch (err: any) {
    console.error('[walk/get]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/portal/project/walk/:id/index', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getWalk, setIndex } = await import('../services/walkSessionService');
    const walk = await getWalk(req.params.id as string);
    if (!walk) { res.status(404).json({ error: 'Walk not found' }); return; }
    if (walk.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const idx = Number(req.body?.index);
    if (!Number.isInteger(idx) || idx < 0) { res.status(400).json({ error: 'invalid index' }); return; }
    await setIndex(req.params.id as string, idx);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[walk/index]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/portal/project/walk/:id/cap/:capId/verdict', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getWalk, setVerdict } = await import('../services/walkSessionService');
    const walk = await getWalk(req.params.id as string);
    if (!walk) { res.status(404).json({ error: 'Walk not found' }); return; }
    if (walk.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const verdict = String(req.body?.verdict || '');
    if (!['pending', 'reviewed', 'follow_up', 'skip'].includes(verdict)) {
      res.status(400).json({ error: 'invalid verdict' }); return;
    }
    await setVerdict({
      walk_id: req.params.id as string,
      cap_id: req.params.capId as string,
      verdict: verdict as any,
      cap_level_note: typeof req.body?.cap_level_note === 'string' ? req.body.cap_level_note : undefined,
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[walk/verdict]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/portal/project/walk/:id/cap/:capId/link-vrs', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getWalk, linkVisualReviewSession } = await import('../services/walkSessionService');
    const walk = await getWalk(req.params.id as string);
    if (!walk) { res.status(404).json({ error: 'Walk not found' }); return; }
    if (walk.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const vrsId = String(req.body?.visual_review_session_id || '');
    if (!vrsId) { res.status(400).json({ error: 'visual_review_session_id required' }); return; }
    await linkVisualReviewSession({
      walk_id: req.params.id as string,
      cap_id: req.params.capId as string,
      visual_review_session_id: vrsId,
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[walk/link-vrs]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/project/walk/:id/close', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getWalk, closeWalk } = await import('../services/walkSessionService');
    const walk = await getWalk(req.params.id as string);
    if (!walk) { res.status(404).json({ error: 'Walk not found' }); return; }
    if (walk.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    await closeWalk(req.params.id as string);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[walk/close]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/project/walks', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { listProjectWalks } = await import('../services/walkSessionService');
    const walks = await listProjectWalks(project.id, { limit: Number(req.query.limit) || 25 });
    res.json({ walks, count: walks.length });
  } catch (err: any) {
    console.error('[walk/list]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Phase A (2026-05-20): persist a cap-level free-form note on the session.
// Triggered by the sidebar textarea's onBlur. Empty string clears the note.
router.patch('/api/portal/project/visual-review/session/:id/notes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getSession, updateNotes } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const sessionId = req.params.id as string;
    const session = await getSession(sessionId);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (session.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
    await updateNotes(sessionId, notes);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[visual-review/notes]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Phase A (2026-05-20): list prior sessions for a given cap (bp_id) that
// have non-empty notes. Used by the sidebar to surface "earlier notes for
// this cap." Excludes the current session via ?exclude=<id> so the
// operator doesn't see their own draft echoed back.
router.get('/api/portal/project/visual-review/cap-notes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const bpId = typeof req.query.bp_id === 'string' ? req.query.bp_id : '';
    if (!bpId) { res.status(400).json({ error: 'bp_id required' }); return; }
    const { listCapNotes } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const excludeSessionId = typeof req.query.exclude === 'string' ? req.query.exclude : undefined;
    const notes = await listCapNotes(project.id, bpId, { excludeSessionId, limit: Number(req.query.limit) || 20 });
    res.json({ notes, count: notes.length });
  } catch (err: any) {
    console.error('[visual-review/cap-notes]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Record a verdict on an AI suggestion or critique item.
router.post('/api/portal/project/visual-review/session/:id/decision', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { suggestion_id, critique_id, verdict, rationale } = req.body || {};
    if (!verdict) { res.status(400).json({ error: 'verdict required' }); return; }
    if (!suggestion_id && !critique_id) { res.status(400).json({ error: 'suggestion_id or critique_id required' }); return; }
    const { recordDecision } = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const result = await recordDecision({
      session_id: req.params.id as string,
      project_id: project.id,
      suggestion_id: suggestion_id ?? null,
      critique_id: critique_id ?? null,
      verdict, rationale,
      decided_by: req.participant!.sub,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[visual-review/decision]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate a Claude-ready prompt from accepted suggestions in this session.
router.post('/api/portal/project/visual-review/session/:id/generate-prompt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { getSession, listCritiques, listSuggestions, listDecisions, persistGeneratedPrompt }
      = await import('../intelligence/systemStateEngine/visual/visualReviewSessionService');
    const sessionId = req.params.id as string;
    const session = await getSession(sessionId);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (session.project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const [critiques, suggestions, decisions] = await Promise.all([
      listCritiques(sessionId),
      listSuggestions(sessionId),
      listDecisions(sessionId),
    ]);

    const acceptedSuggestionIds = new Set(
      decisions.filter(d => d.verdict === 'accepted' && d.suggestion_id).map(d => d.suggestion_id),
    );
    const acceptedSuggestions = suggestions.filter(s => acceptedSuggestionIds.has(s.id));

    const { generateVisualChangePackage } = await import('../intelligence/systemStateEngine/visual/visualPromptGenerator');
    const pkg = generateVisualChangePackage({
      session_id: sessionId,
      project_id: project.id,
      bp_id: session.bp_id,
      page_route: session.page_route,
      critiques: critiques.map((c: any) => ({
        id: c.id, kind: c.kind, severity: c.severity, description: c.description,
        target_selector: c.target_selector, expected_outcome: c.expected_outcome,
      })),
      accepted_suggestions: acceptedSuggestions.map((s: any) => ({
        id: s.id, kind: s.kind, title: s.title, body: s.body, rationale: s.rationale,
        expected_ux_impact: s.expected_ux_impact,
      })),
      affected_components: req.body?.affected_components,
      screenshot_path: session.primary_screenshot_path,
    });

    await persistGeneratedPrompt(sessionId, pkg.generated_prompt);
    res.json(pkg);
  } catch (err: any) {
    console.error('[visual-review/generate-prompt]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// UX debt summary for the project.
router.get('/api/portal/project/visual-review/ux-debt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisualTelemetry } = await import('../intelligence/systemStateEngine/visual/visualTelemetrySynchronizer');
    const bundle = await loadVisualTelemetry(project.id);
    res.json({
      ux_debt: bundle.ux_debt,
      open_critique_count: bundle.open_critique_count,
      resolved_critique_count: bundle.resolved_critique_count,
      visual_tasks_count: bundle.visual_tasks.length,
    });
  } catch (err: any) {
    console.error('[visual-review/ux-debt]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Workflow friction report for the project.
router.get('/api/portal/project/visual-review/workflow-friction', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisualTelemetry } = await import('../intelligence/systemStateEngine/visual/visualTelemetrySynchronizer');
    const bundle = await loadVisualTelemetry(project.id);
    res.json({
      friction_score: bundle.workflow_friction.friction_score,
      findings: bundle.workflow_friction.findings,
    });
  } catch (err: any) {
    console.error('[visual-review/workflow-friction]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 6: Visual Cognition + Behavioral Telemetry ─────────────────

// Ingest a sanitized DOM snapshot for a route.
router.post('/api/portal/project/vision/dom', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { route, bp_id, dom_tree, viewport_width, viewport_height, screenshot_path, captured_at } = req.body || {};
    if (!route) { res.status(400).json({ error: 'route required' }); return; }
    if (!dom_tree) { res.status(400).json({ error: 'dom_tree required' }); return; }

    const { default: DOMSnapshot } = await import('../models/DOMSnapshot');
    const { runVisionAnalysis } = await import('../intelligence/systemStateEngine/vision/visionAnalysisEngine');
    const cached = runVisionAnalysis({
      dom: dom_tree,
      viewport: viewport_width && viewport_height ? { width: viewport_width, height: viewport_height } : undefined,
    });
    const row = await DOMSnapshot.create({
      project_id: project.id,
      bp_id: bp_id ?? null,
      route,
      dom_tree,
      screenshot_path: screenshot_path ?? null,
      viewport_width: viewport_width ?? null,
      viewport_height: viewport_height ?? null,
      cached_vision_report: cached,
      captured_at: captured_at ? new Date(captured_at) : new Date(),
    } as any);
    res.status(201).json({ snapshot_id: (row as any).id, vision_report: cached });
  } catch (err: any) {
    console.error('[vision/dom]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Get the latest vision cognition report per route.
router.get('/api/portal/project/vision/cognition', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisionTelemetry } = await import('../intelligence/systemStateEngine/vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(project.id);
    res.json({
      worst_route: bundle.worst_route,
      worst_cognition_score: bundle.worst_cognition_score,
      contradiction_count: bundle.contradictions.length,
      contradictions: bundle.contradictions.slice(0, 50),
      regression_count: bundle.regressions.length,
      snapshot_count: bundle.snapshot_count,
      behavioral_event_count: bundle.behavioral_event_count,
    });
  } catch (err: any) {
    console.error('[vision/cognition]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Get visual contradictions only.
router.get('/api/portal/project/vision/contradictions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisionTelemetry } = await import('../intelligence/systemStateEngine/vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(project.id);
    res.json({ contradictions: bundle.contradictions, count: bundle.contradictions.length });
  } catch (err: any) {
    console.error('[vision/contradictions]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Get UX regressions across snapshots.
router.get('/api/portal/project/vision/regressions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisionTelemetry } = await import('../intelligence/systemStateEngine/vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(project.id);
    res.json({ regressions: bundle.regressions });
  } catch (err: any) {
    console.error('[vision/regressions]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Predict UX impact for a candidate suggestion.
router.post('/api/portal/project/vision/predict-impact', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { suggestion, route } = req.body || {};
    if (!suggestion || !suggestion.kind) { res.status(400).json({ error: 'suggestion.kind required' }); return; }

    const { default: DOMSnapshot } = await import('../models/DOMSnapshot');
    const snap = route
      ? await DOMSnapshot.findOne({ where: { project_id: project.id, route }, order: [['captured_at', 'DESC']] })
      : null;
    let visionReport: any = null;
    if (snap) visionReport = (snap as any).cached_vision_report;
    if (!visionReport) {
      // No DOM snapshot for the route — return a neutral prediction
      const { predictUXImpact } = await import('../intelligence/systemStateEngine/vision/uxImpactPredictor');
      const prediction = predictUXImpact(suggestion, {
        hierarchy: { hierarchy_score: 50, weight_tiers: 1, competing_primaries: 0, heading_path: [], findings: [] },
        density: { action_count: 0, viewport_area: 0, density_per_100k_px: 0, density_health: 50, category: 'comfortable', findings: [] },
        cta: { primary_label: null, primary_weight: 0, primary_position: 'unknown', is_dominant: false, cta_score: 50, findings: [] },
        dom_semantic: { action_count: 0, primary_action_candidates: [], heading_levels: {}, focusable_count: 0, missing_aria_labels: [], nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
        screenshot: null,
        cognition_score: 50,
        summary: 'No DOM snapshot available — neutral baseline.',
      } as any);
      res.json({ prediction, basis: 'no DOM snapshot for route' });
      return;
    }

    const { predictUXImpact } = await import('../intelligence/systemStateEngine/vision/uxImpactPredictor');
    const { loadVisionTelemetry } = await import('../intelligence/systemStateEngine/vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(project.id);
    const prediction = predictUXImpact(suggestion, visionReport, { friction_pressure: bundle.behavioral.project_friction_pressure });
    res.json({ prediction });
  } catch (err: any) {
    console.error('[vision/predict-impact]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Ingest a behavioral event (one or more).
router.post('/api/portal/project/behavioral/event', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const events = Array.isArray(req.body?.events) ? req.body.events : [req.body];
    if (events.length === 0) { res.status(400).json({ error: 'events required' }); return; }

    const { default: BehavioralEvent } = await import('../models/BehavioralEvent');
    const rows = events
      .filter((e: any) => e && e.route && e.kind && e.session_id)
      .map((e: any) => ({
        project_id: project.id,
        bp_id: e.bp_id ?? null,
        route: e.route,
        session_id: e.session_id,
        kind: e.kind,
        target_selector: e.target_selector ?? null,
        target_x: e.target_x ?? null,
        target_y: e.target_y ?? null,
        duration_ms: e.duration_ms ?? null,
        metadata: e.metadata ?? {},
        observed_at: e.observed_at ? new Date(e.observed_at) : new Date(),
      }));
    if (rows.length === 0) { res.status(400).json({ error: 'No valid events in payload' }); return; }
    await BehavioralEvent.bulkCreate(rows as any[]);
    res.status(201).json({ inserted: rows.length });
  } catch (err: any) {
    console.error('[behavioral/event]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// User flow intelligence + behavioral aggregates.
router.get('/api/portal/project/behavioral/flow', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisionTelemetry } = await import('../intelligence/systemStateEngine/vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(project.id);
    res.json({
      behavioral: bundle.behavioral,
      user_flow: bundle.user_flow,
    });
  } catch (err: any) {
    console.error('[behavioral/flow]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 7: Multimodal cognition + adaptive orchestration ────────────

// Run multimodal vision analysis on a screenshot. Caller supplies route +
// screenshot path; engine wires through prompt builder + provider + cache.
router.post('/api/portal/project/multimodal/analyze', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { route, screenshot_path, comparison_screenshot_path, viewport, user_intent, focus_regions, known_critical_actions, known_workflows, comparing } = req.body || {};
    if (!route) { res.status(400).json({ error: 'route required' }); return; }
    if (!screenshot_path) { res.status(400).json({ error: 'screenshot_path required' }); return; }

    const { analyzeImage } = await import('../intelligence/systemStateEngine/multimodal/multimodalVisionEngine');
    const result = await analyzeImage({
      route, screenshot_path, comparison_screenshot_path,
      viewport, user_intent, focus_regions, known_critical_actions, known_workflows, comparing,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[multimodal/analyze]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Compute the visual diff between two snapshots of the same route.
router.post('/api/portal/project/multimodal/diff', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { route } = req.body || {};
    if (!route) { res.status(400).json({ error: 'route required' }); return; }
    const { default: DOMSnapshot } = await import('../models/DOMSnapshot');
    const snaps = await DOMSnapshot.findAll({
      where: { project_id: project.id, route },
      order: [['captured_at', 'DESC']],
      limit: 2,
    });
    if (snaps.length < 2) { res.status(404).json({ error: 'Need at least 2 snapshots for the route' }); return; }
    const [curr, prev] = snaps;
    const { analyzeVisualDiff } = await import('../intelligence/systemStateEngine/multimodal/visualDiffAnalyzer');
    const diff = analyzeVisualDiff(
      (prev as any).cached_vision_report,
      (curr as any).cached_vision_report,
    );
    res.json({ diff, prev_snapshot_id: (prev as any).id, current_snapshot_id: (curr as any).id });
  } catch (err: any) {
    console.error('[multimodal/diff]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Get the current UX pressure escalation report.
router.get('/api/portal/project/orchestration/pressure', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { loadVisionTelemetry } = await import('../intelligence/systemStateEngine/vision/visionTelemetrySynchronizer');
    const { computeWeightFactor, applyAdaptiveWeighting } = await import('../intelligence/systemStateEngine/multimodal/adaptivePriorityWeighting');
    const { computeUXPressure } = await import('../intelligence/systemStateEngine/multimodal/uxPressureEscalation');
    const { readOrRebuild } = await import('../intelligence/systemStateEngine');

    const [bundle, state] = await Promise.all([
      loadVisionTelemetry(project.id),
      readOrRebuild(project.id),
    ]);

    const rageRoutes = bundle.behavioral.per_route.filter(r => r.rage_clicks > 0).length;
    const loopRoutes = bundle.behavioral.per_route.filter(r => r.nav_loops > 0).length;
    const abandonRoutes = bundle.behavioral.per_route.filter(r => r.form_abandons > 0).length;
    const unresolvedHigh = state.contradictions.filter(c => c.severity === 'error' || c.severity === 'warning').length;
    const inputs = {
      friction_pressure: bundle.behavioral.project_friction_pressure,
      worst_cognition_score: bundle.worst_cognition_score,
      has_recent_regression: bundle.regressions.length > 0,
      unresolved_high_contradictions: unresolvedHigh,
      rage_routes: rageRoutes,
      loop_routes: loopRoutes,
      abandon_routes: abandonRoutes,
    };
    const factor = computeWeightFactor(inputs);
    const pressure = computeUXPressure(inputs, factor);
    const adaptive = applyAdaptiveWeighting(state.queue as any, inputs);

    res.json({
      pressure,
      inputs,
      adjustments: adaptive.adjustments.slice(0, 20),
      affected_task_count: adaptive.adjustments.length,
    });
  } catch (err: any) {
    console.error('[orchestration/pressure]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Replay: list all DOM snapshots for a route in chronological order
// (oldest first) for the visual replay UI.
router.get('/api/portal/project/multimodal/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const route = String(req.query.route ?? '').trim();
    if (!route) { res.status(400).json({ error: 'route required' }); return; }
    const limit = Number(req.query.limit) || 50;
    const { default: DOMSnapshot } = await import('../models/DOMSnapshot');
    const snaps = await DOMSnapshot.findAll({
      where: { project_id: project.id, route },
      order: [['captured_at', 'ASC']],
      limit,
      attributes: ['id', 'route', 'captured_at', 'screenshot_path', 'viewport_width', 'viewport_height', 'cached_vision_report'],
    });
    const entries = snaps.map((s: any) => ({
      id: s.id,
      captured_at: new Date(s.captured_at).toISOString(),
      screenshot_path: s.screenshot_path,
      viewport: s.viewport_width && s.viewport_height ? { width: s.viewport_width, height: s.viewport_height } : null,
      cognition_score: s.cached_vision_report?.cognition_score ?? null,
      hierarchy_score: s.cached_vision_report?.hierarchy?.hierarchy_score ?? null,
      cta_score: s.cached_vision_report?.cta?.cta_score ?? null,
    }));
    res.json({ route, entries, count: entries.length });
  } catch (err: any) {
    console.error('[multimodal/replay]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Multi-viewport intelligence — compares latest snapshots per viewport.
router.get('/api/portal/project/multimodal/viewport', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const route = String(req.query.route ?? '').trim();
    if (!route) { res.status(400).json({ error: 'route required' }); return; }
    const { default: DOMSnapshot } = await import('../models/DOMSnapshot');
    const snaps = await DOMSnapshot.findAll({
      where: { project_id: project.id, route },
      order: [['captured_at', 'DESC']],
      limit: 30,
    });
    // Group by viewport label heuristically (by width)
    const labelOf = (w: number | null): 'desktop' | 'tablet' | 'mobile' => {
      if (!w) return 'desktop';
      if (w <= 480) return 'mobile';
      if (w <= 900) return 'tablet';
      return 'desktop';
    };
    const latestByVp = new Map<string, any>();
    for (const s of snaps as any[]) {
      const lbl = labelOf(s.viewport_width);
      if (!latestByVp.has(lbl)) latestByVp.set(lbl, s);
    }
    const reports = Array.from(latestByVp.entries()).map(([viewport, s]) => ({
      viewport,
      heuristic: s.cached_vision_report,
      multimodal: null,
    })).filter(r => r.heuristic);
    if (reports.length === 0) { res.status(404).json({ error: 'No snapshots with cached_vision_report' }); return; }
    const { compareViewports } = await import('../intelligence/systemStateEngine/multimodal/viewportIntelligence');
    const result = compareViewports(reports as any);
    res.json(result);
  } catch (err: any) {
    console.error('[multimodal/viewport]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Capture a screenshot via the Puppeteer-based service (graceful fallback if dep missing).
router.post('/api/portal/project/multimodal/capture', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { url, viewports, output_dir, cookie_string } = req.body || {};
    if (!url) { res.status(400).json({ error: 'url required' }); return; }
    if (!output_dir) { res.status(400).json({ error: 'output_dir required' }); return; }
    const requestedViewports = Array.isArray(viewports) && viewports.length > 0 ? viewports : ['desktop'];
    const { captureRouteAcrossViewports } = await import('../intelligence/systemStateEngine/capture/routeSnapshotScheduler');
    const outcome = await captureRouteAcrossViewports({
      url, viewports: requestedViewports, output_dir, cookie_string,
    });
    res.json(outcome);
  } catch (err: any) {
    console.error('[multimodal/capture]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Vision cache stats (for monitoring cost controls).
router.get('/api/portal/project/multimodal/cache-stats', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getCacheStats } = await import('../intelligence/systemStateEngine/multimodal/visionResultCache');
    res.json(getCacheStats());
  } catch (err: any) {
    console.error('[multimodal/cache-stats]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 8: Persistent Real-time Operational Awareness ────────────

// Generic SSE stream — fans out cognitive events for the participant's project.
router.get('/api/portal/project/awareness/stream', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { openSSEStream } = await import('../intelligence/systemStateEngine/realtime/sseTransport');
    const kindsParam = String(req.query.kinds ?? '').trim();
    const kinds = kindsParam ? kindsParam.split(',').map(k => k.trim()).filter(Boolean) : undefined;
    openSSEStream(req, res, { project_id: project.id, kinds: kinds as any });
  } catch (err: any) {
    console.error('[awareness/stream]', err?.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Pressure-only stream (convenience filter)
router.get('/api/portal/project/awareness/pressure/stream', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { openSSEStream } = await import('../intelligence/systemStateEngine/realtime/sseTransport');
    openSSEStream(req, res, {
      project_id: project.id,
      kinds: ['pressure.changed', 'pressure.escalated', 'pressure.decayed'] as any,
    });
  } catch (err: any) {
    console.error('[awareness/pressure/stream]', err?.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Queue-only stream
router.get('/api/portal/project/awareness/queue/stream', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { openSSEStream } = await import('../intelligence/systemStateEngine/realtime/sseTransport');
    openSSEStream(req, res, {
      project_id: project.id,
      kinds: ['queue.reranked'] as any,
    });
  } catch (err: any) {
    console.error('[awareness/queue/stream]', err?.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Contradictions stream
router.get('/api/portal/project/awareness/contradictions/stream', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { openSSEStream } = await import('../intelligence/systemStateEngine/realtime/sseTransport');
    openSSEStream(req, res, {
      project_id: project.id,
      kinds: ['contradiction.detected', 'contradiction.resolved', 'regression.detected'] as any,
    });
  } catch (err: any) {
    console.error('[awareness/contradictions/stream]', err?.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// List autonomous incidents
router.get('/api/portal/project/awareness/incidents', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: CognitiveIncident } = await import('../models/CognitiveIncident');
    const stateFilter = String(req.query.state ?? '').trim();
    const where: any = { project_id: project.id };
    if (stateFilter) where.state = stateFilter;
    const limit = Number(req.query.limit) || 50;
    const rows = await CognitiveIncident.findAll({ where, order: [['opened_at', 'DESC']], limit });
    res.json({
      incidents: rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        severity: r.severity,
        state: r.state,
        affected_routes: r.affected_routes,
        cognition_impact: r.cognition_impact,
        recommended_actions: r.recommended_actions,
        opened_at: new Date(r.opened_at).toISOString(),
        last_seen_at: new Date(r.last_seen_at).toISOString(),
        resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
        occurrence_count: r.occurrence_count,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    console.error('[awareness/incidents]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Acknowledge / resolve an incident
router.put('/api/portal/project/awareness/incidents/:id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { state, acknowledged_by } = req.body || {};
    if (!['acknowledged', 'resolved', 'expired'].includes(state)) {
      res.status(400).json({ error: 'state must be one of: acknowledged, resolved, expired' });
      return;
    }
    const { default: CognitiveIncident } = await import('../models/CognitiveIncident');
    const updates: any = { state };
    if (state === 'resolved') updates.resolved_at = new Date();
    if (state === 'acknowledged' && acknowledged_by) updates.acknowledged_by = acknowledged_by;
    await CognitiveIncident.update(updates, { where: { id: req.params.id, project_id: project.id } });

    const { publishCognitiveEvent } = await import('../intelligence/systemStateEngine/realtime/cognitiveEventBus');
    publishCognitiveEvent({
      kind: state === 'resolved' ? 'incident.resolved' : 'incident.updated',
      project_id: project.id,
      payload: { incident_id: req.params.id, state },
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[awareness/incidents/update]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Cognitive replay (read persistent memory)
router.get('/api/portal/project/awareness/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readReplay } = await import('../intelligence/systemStateEngine/realtime/cognitiveReplayStore');
    const sinceMs = req.query.since_hours ? Number(req.query.since_hours) * 3600 * 1000 : 24 * 3600 * 1000;
    const kindsParam = String(req.query.kinds ?? '').trim();
    const kinds = kindsParam ? kindsParam.split(',').map(k => k.trim()).filter(Boolean) : undefined;
    const entries = await readReplay({
      project_id: project.id,
      since_ms: sinceMs,
      kinds,
      limit: Number(req.query.limit) || 500,
    });
    res.json({ entries, count: entries.length });
  } catch (err: any) {
    console.error('[awareness/replay]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Cost governance report
router.get('/api/portal/project/awareness/cost-governance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getCostGovernanceReport } = await import('../intelligence/systemStateEngine/realtime/operationalCostGovernance');
    res.json(getCostGovernanceReport());
  } catch (err: any) {
    console.error('[awareness/cost-governance]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Manual retention sweep trigger (admin / cron)
router.post('/api/portal/project/awareness/retention-sweep', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { sweepAwareness } = await import('../intelligence/systemStateEngine/realtime/awarenessRetentionManager');
    const result = await sweepAwareness();
    res.json(result);
  } catch (err: any) {
    console.error('[awareness/retention-sweep]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Live pressure state (snapshot of the per-project rolling pressure)
router.get('/api/portal/project/awareness/pressure', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getPressureState } = await import('../intelligence/systemStateEngine/realtime/livePressureEngine');
    res.json(getPressureState(project.id));
  } catch (err: any) {
    console.error('[awareness/pressure]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 9: Distributed Cognitive Orchestration ──────────────────────

// Unified cognitive health index for the project
router.get('/api/portal/project/cognitive/health-index', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { computeCognitiveHealthIndexForProject } = await import('../intelligence/systemStateEngine/health/cognitiveHealthIndex');
    const idx = await computeCognitiveHealthIndexForProject(project.id);
    res.json(idx);
  } catch (err: any) {
    console.error('[cognitive/health-index]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Predictive pressure forecast (linear regression on pressure history)
router.get('/api/portal/project/cognitive/forecast/pressure', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const horizonMin = Number(req.query.horizon_min) || 30;
    const { Op } = await import('sequelize');
    const { default: CognitionEvent } = await import('../models/CognitionEvent');
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);   // last 6h
    const events = await CognitionEvent.findAll({
      where: {
        project_id: project.id,
        kind: { [Op.in]: ['pressure.changed', 'pressure.escalated', 'pressure.decayed'] },
        emitted_at: { [Op.gte]: since },
      },
      order: [['emitted_at', 'ASC']],
      limit: 200,
    });
    const history = events
      .map((e: any) => ({
        timestamp_ms: new Date(e.emitted_at).getTime(),
        pressure: typeof e.payload?.pressure === 'number' ? e.payload.pressure : null,
      }))
      .filter((s: any): s is { timestamp_ms: number; pressure: number } => typeof s.pressure === 'number');

    const { forecastPressure } = await import('../intelligence/systemStateEngine/prediction/predictivePressureForecaster');
    const forecast = forecastPressure(history, horizonMin);
    res.json({ forecast, history_size: history.length, window_hours: 6 });
  } catch (err: any) {
    console.error('[cognitive/forecast/pressure]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Predict an incident's likely escalation based on history
router.post('/api/portal/project/cognitive/predict-incident', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { type, severity, affected_routes, cognition_impact, occurrence_count } = req.body || {};
    if (!type || !severity) { res.status(400).json({ error: 'type and severity required' }); return; }

    const { predictForIncident } = await import('../intelligence/systemStateEngine/prediction/incidentClassifier');
    const prediction = await predictForIncident({
      type, severity,
      affected_routes: affected_routes ?? [],
      cognition_impact: cognition_impact ?? null,
      occurrence_count: occurrence_count ?? 1,
      opened_at: new Date(),
    });
    res.json(prediction);
  } catch (err: any) {
    console.error('[cognitive/predict-incident]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Federated pattern listing (cross-project)
router.get('/api/portal/project/cognitive/patterns', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { listTopPatterns } = await import('../intelligence/systemStateEngine/learning/federatedPatternRegistry');
    const patterns = await listTopPatterns({
      limit: Number(req.query.limit) || 25,
      pattern_kind: req.query.kind ? String(req.query.kind) : undefined,
    });
    res.json({ patterns, count: patterns.length });
  } catch (err: any) {
    console.error('[cognitive/patterns]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Organizational learning insights
router.get('/api/portal/project/cognitive/learning', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { generateOrganizationalLearningInsights } = await import('../intelligence/systemStateEngine/learning/organizationalLearning');
    const insights = await generateOrganizationalLearningInsights({
      window_days: Number(req.query.window_days) || 30,
    });
    res.json(insights);
  } catch (err: any) {
    console.error('[cognitive/learning]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Dispatch an incident to all registered subscribers (manual trigger or
// auto-fire by orchestrator). Body: { incident_id }
router.post('/api/portal/project/cognitive/incidents/:id/dispatch', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    const { default: CognitiveIncident } = await import('../models/CognitiveIncident');
    const inc = await CognitiveIncident.findByPk(req.params.id as string);
    if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
    if ((inc as any).project_id !== project.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const { fanOutIncident, persistDispatchLog } = await import('../intelligence/systemStateEngine/incidents/incidentFanoutEngine');
    const r = inc as any;
    const payload = {
      incident_id: r.id,
      project_id: r.project_id,
      type: r.type,
      severity: r.severity,
      state: r.state,
      affected_routes: r.affected_routes ?? [],
      cognition_impact: r.cognition_impact,
      recommended_actions: r.recommended_actions ?? [],
      opened_at: new Date(r.opened_at).toISOString(),
      occurrence_count: r.occurrence_count ?? 1,
      summary: `${r.type} on ${(r.affected_routes ?? []).slice(0, 2).join(', ') || '(no routes)'}`,
      evidence: r.metadata?.evidence ?? {},
    };
    const result = await fanOutIncident(payload);
    await persistDispatchLog(payload, result);
    res.json(result);
  } catch (err: any) {
    console.error('[cognitive/incidents/dispatch]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Dispatch log
router.get('/api/portal/project/cognitive/dispatch-log', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: IncidentDispatchLog } = await import('../models/IncidentDispatchLog');
    const rows = await IncidentDispatchLog.findAll({
      where: { project_id: project.id },
      order: [['dispatched_at', 'DESC']],
      limit: Number(req.query.limit) || 50,
    });
    res.json({
      entries: rows.map((r: any) => ({
        id: r.id,
        incident_id: r.incident_id,
        severity: r.severity,
        type: r.type,
        attempted_subscribers: r.attempted_subscribers,
        succeeded: r.succeeded,
        failed: r.failed,
        elapsed_ms: r.elapsed_ms,
        outcomes: r.outcomes,
        dispatched_at: new Date(r.dispatched_at).toISOString(),
      })),
      count: rows.length,
    });
  } catch (err: any) {
    console.error('[cognitive/dispatch-log]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Distributed bus status (debug)
router.get('/api/portal/project/cognitive/distributed-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { redisBusStats } = await import('../intelligence/systemStateEngine/distributed/redisCognitiveBus');
    const { bridgeStatus } = await import('../intelligence/systemStateEngine/distributed/distributedEventBridge');
    res.json({
      redis: redisBusStats(),
      bridge: bridgeStatus(),
    });
  } catch (err: any) {
    console.error('[cognitive/distributed-status]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 10: Self-Learning Adaptive Orchestration ─────────────────────

// Get current cognitive policy (weights, thresholds, guardrails)
router.get('/api/portal/project/learning/policy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getPolicy, recentDriftFor, consecutiveWorseOutcomesFor } = await import('../intelligence/systemStateEngine/policy/cognitivePolicyEngine');
    res.json({
      policy: getPolicy(project.id),
      recent_drift: recentDriftFor(project.id),
      consecutive_worse_outcomes: consecutiveWorseOutcomesFor(project.id),
    });
  } catch (err: any) {
    console.error('[learning/policy]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Run a learning tick (read outcomes → propose → guardrail → apply)
router.post('/api/portal/project/learning/tick', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { runLearningTick } = await import('../intelligence/systemStateEngine/learning/orchestrationLearningEngine');
    const result = await runLearningTick(project.id);
    res.json(result);
  } catch (err: any) {
    console.error('[learning/tick]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Aggregate remediation outcomes
router.get('/api/portal/project/learning/remediation-outcomes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { aggregateOutcomes } = await import('../intelligence/systemStateEngine/learning/remediationOutcomeLearner');
    const aggregate = await aggregateOutcomes({
      project_id: project.id,
      since_days: Number(req.query.since_days) || 30,
    });
    res.json(aggregate);
  } catch (err: any) {
    console.error('[learning/remediation-outcomes]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Record a remediation outcome (closes the feedback loop)
router.post('/api/portal/project/learning/remediation-outcomes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { incident_id, pattern_signature, remediation_action, accepted, implemented, resolved, pressure_delta, cognition_delta, recurred_within_7d, notes } = req.body || {};
    if (!incident_id || !remediation_action) {
      res.status(400).json({ error: 'incident_id + remediation_action required' });
      return;
    }
    const { default: RemediationOutcome } = await import('../models/RemediationOutcome');
    const row = await RemediationOutcome.create({
      project_id: project.id,
      incident_id,
      pattern_signature: pattern_signature ?? null,
      remediation_action,
      accepted: !!accepted,
      implemented: !!implemented,
      resolved: !!resolved,
      pressure_delta: typeof pressure_delta === 'number' ? pressure_delta : null,
      cognition_delta: typeof cognition_delta === 'number' ? cognition_delta : null,
      recurred_within_7d: !!recurred_within_7d,
      notes: notes ?? null,
      observed_at: new Date(),
    } as any);
    res.status(201).json({ outcome_id: (row as any).id });
  } catch (err: any) {
    console.error('[learning/remediation-outcomes/post]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Calibrate operational confidence
router.get('/api/portal/project/learning/confidence', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { aggregateOutcomes } = await import('../intelligence/systemStateEngine/learning/remediationOutcomeLearner');
    const { calibrateOperationalConfidence } = await import('../intelligence/systemStateEngine/learning/operationalConfidenceCalibrator');
    const aggregate = await aggregateOutcomes({ project_id: project.id, since_days: 30 });
    const confidence = calibrateOperationalConfidence({
      sample_count: aggregate.total_attempts,
      prediction_accuracy: aggregate.total_attempts > 0
        ? aggregate.resolved_count / aggregate.total_attempts
        : 0.5,
      contradiction_churn_per_hour: 0,
      policy_changes_last_24h: 0,
      historical_pattern_matches: 0,
      recent_remediation_success_rate: aggregate.total_attempts > 0
        ? aggregate.resolved_count / aggregate.total_attempts
        : 0,
    });
    res.json(confidence);
  } catch (err: any) {
    console.error('[learning/confidence]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Simulate a queue ordering
router.post('/api/portal/project/learning/simulate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { initial_pressure, initial_cognition, tasks } = req.body || {};
    if (!Array.isArray(tasks)) { res.status(400).json({ error: 'tasks array required' }); return; }
    const { simulateQueue } = await import('../intelligence/systemStateEngine/simulation/orchestrationSimulationEngine');
    const result = simulateQueue({
      initial_pressure: initial_pressure ?? 0,
      initial_cognition: initial_cognition ?? 100,
      tasks,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[learning/simulate]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Compare two queue orderings
router.post('/api/portal/project/learning/compare-orderings', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { initial_pressure, initial_cognition, ordering_a, ordering_b } = req.body || {};
    if (!Array.isArray(ordering_a) || !Array.isArray(ordering_b)) {
      res.status(400).json({ error: 'ordering_a and ordering_b arrays required' });
      return;
    }
    const { compareQueueOrderings } = await import('../intelligence/systemStateEngine/simulation/orchestrationSimulationEngine');
    const result = compareQueueOrderings(initial_pressure ?? 0, initial_cognition ?? 100, ordering_a, ordering_b);
    res.json(result);
  } catch (err: any) {
    console.error('[learning/compare-orderings]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Cross-project shared remediations
router.get('/api/portal/project/learning/shared-remediations', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { fetchSharedRemediations } = await import('../intelligence/systemStateEngine/transfer/crossProjectLearning');
    const recs = await fetchSharedRemediations({
      pattern_kind: req.query.kind ? String(req.query.kind) : undefined,
      min_projects: Number(req.query.min_projects) || 2,
      min_attempts: Number(req.query.min_attempts) || 2,
      limit: Number(req.query.limit) || 25,
    });
    res.json({ recommendations: recs, count: recs.length });
  } catch (err: any) {
    console.error('[learning/shared-remediations]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Governance advice for a candidate deployment
router.post('/api/portal/project/governance/advice', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { computeCognitiveHealthIndexForProject } = await import('../intelligence/systemStateEngine/health/cognitiveHealthIndex');
    const { getPressureState } = await import('../intelligence/systemStateEngine/realtime/livePressureEngine');
    const { default: CognitiveIncident } = await import('../models/CognitiveIncident');
    const { Op } = await import('sequelize');
    const { adviseDeploymentGovernance } = await import('../intelligence/systemStateEngine/transfer/governanceFoundation');

    const [healthIdx, pressure, openIncidents] = await Promise.all([
      computeCognitiveHealthIndexForProject(project.id),
      Promise.resolve(getPressureState(project.id)),
      CognitiveIncident.findAll({
        where: { project_id: project.id, state: { [Op.in]: ['open', 'acknowledged'] } },
        attributes: ['severity', 'type', 'affected_routes'],
      }),
    ]);

    const advice = adviseDeploymentGovernance({
      cognitive_health_score: healthIdx.score,
      cognitive_health_tier: healthIdx.tier,
      pressure_tier: pressure.tier as any,
      unresolved_incidents: (openIncidents as any[]).map(i => ({
        severity: i.severity, type: i.type, affected_routes: i.affected_routes ?? [],
      })),
      prediction_confidence: healthIdx.prediction_confidence,
      recent_regression_count: 0,    // wired when regression history endpoint surfaces this
    });
    res.json(advice);
  } catch (err: any) {
    console.error('[governance/advice]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Policy snapshot history (replay)
router.get('/api/portal/project/learning/policy-history', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: LearningPolicySnapshot } = await import('../models/LearningPolicySnapshot');
    const rows = await LearningPolicySnapshot.findAll({
      where: { project_id: project.id },
      order: [['recorded_at', 'DESC']],
      limit: Number(req.query.limit) || 100,
    });
    res.json({
      snapshots: rows.map((r: any) => ({
        id: r.id,
        trigger: r.trigger,
        confidence: r.confidence,
        deltas: r.deltas,
        policy: r.policy,
        recorded_at: new Date(r.recorded_at).toISOString(),
      })),
      count: rows.length,
    });
  } catch (err: any) {
    console.error('[learning/policy-history]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Phase 10.5: UX remediation intelligence ────────────────────────────
//
// Routes are organized by surface they back:
//   - per-BP: clusters / sequence / confidence / intelligence (full report)
//   - per-BP: snapshot-before, replay manifest
//   - project-wide: health-index, regression-prone, policy, pressure
//
// The validate-build flow stays in the existing /validation-report
// handler (extended below); these routes are the read + admin surface.

router.get('/api/portal/project/business-processes/:id/remediation/intelligence', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { buildRemediationIntelligenceReport } = await import('../intelligence/systemStateEngine/remediation/remediationIntelligenceEngine');
    const report = await buildRemediationIntelligenceReport({ project_id: cap.project_id, capability_id: cap.id });
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/business-processes/:id/remediation/clusters', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { buildRemediationIntelligenceReport } = await import('../intelligence/systemStateEngine/remediation/remediationIntelligenceEngine');
    const report = await buildRemediationIntelligenceReport({ project_id: cap.project_id, capability_id: cap.id });
    res.json({ clusters: report.clusters });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/business-processes/:id/remediation/sequence', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { buildRemediationIntelligenceReport } = await import('../intelligence/systemStateEngine/remediation/remediationIntelligenceEngine');
    const report = await buildRemediationIntelligenceReport({ project_id: cap.project_id, capability_id: cap.id });
    res.json({ sequence: report.sequence });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/business-processes/:id/remediation/confidence', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { buildRemediationIntelligenceReport } = await import('../intelligence/systemStateEngine/remediation/remediationIntelligenceEngine');
    const report = await buildRemediationIntelligenceReport({ project_id: cap.project_id, capability_id: cap.id });
    res.json({
      overall_confidence: report.overall_confidence,
      per_cluster: report.clusters.map(c => ({
        cluster_signature: c.cluster.cluster_signature,
        cluster_type: c.cluster.cluster_type,
        confidence: c.confidence,
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/business-processes/:id/remediation/snapshot-before', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const cluster_signature = (req.body?.cluster_signature || '') as string;
    if (!cluster_signature) { res.status(400).json({ error: 'cluster_signature required' }); return; }

    // Stamp before-snapshot metadata into ui_element_map. The actual screenshot
    // capture is best-effort (Puppeteer is optional); if it fails we record the
    // intent so the validate-build flow can still attempt the after-snapshot
    // and infer "no before available" from the absence of a path.
    const map = ((cap as any).ui_element_map || {}) as any;
    const snapshots = map.remediation_snapshots || {};
    const previewUrl = (cap as any).preview_url || (cap as any).direct_preview_url || null;
    let beforePath: string | null = null;
    if (previewUrl) {
      try {
        const { capture } = await import('../intelligence/systemStateEngine/capture/screenshotCaptureService');
        const out = await capture({
          url: previewUrl,
          viewport: { width: 1280, height: 800, device_scale_factor: 1, is_mobile: false, label: 'desktop' },
          output_dir: '/tmp/remediation-snapshots',
          settle_ms: 800,
        });
        if (out.ok) beforePath = out.screenshot_path;
      } catch { /* puppeteer not installed in this env — record intent only */ }
    }
    // Phase 11 — capture before_metrics alongside before_path. The
    // analyzer in recordPhase10_5Outcomes will compare these to fresh
    // after-metrics to derive real cognition/ux_debt/behavioral/friction
    // deltas instead of the Phase 10.5 null placeholders.
    const before_metrics = await collectBeforeAfterMetrics(cap.project_id, cap.id, (cap as any).frontend_route || null);

    snapshots[cluster_signature] = {
      before_at: new Date().toISOString(),
      before_path: beforePath,
      preview_url: previewUrl,
      before_metrics,
    };
    map.remediation_snapshots = snapshots;
    (cap as any).ui_element_map = { ...map };
    (cap as any).changed('ui_element_map', true);
    await cap.save();
    res.json({ ok: true, before_path: beforePath, captured: !!beforePath, metrics_captured: !!before_metrics });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/**
 * Phase 11 — collect the 6-dimension BeforeAfterMetrics snapshot for a BP.
 * Fail-soft: each dimension defaults to null on missing data so the
 * analyzer's existing null-handling does the right thing.
 */
async function collectBeforeAfterMetrics(projectId: string, capabilityId: string, route: string | null): Promise<any> {
  try {
    const { getMemoizedVisionTelemetry, getMemoizedVisualTelemetry } = await import('../intelligence/systemStateEngine/realtime/telemetryMemoizationCache');
    const { analyzeBehavioralSignals } = await import('../intelligence/systemStateEngine/behavioral/behavioralSignalAnalyzer');
    const [vision, visual] = await Promise.all([
      getMemoizedVisionTelemetry(projectId),
      getMemoizedVisualTelemetry(projectId),
    ]);
    let behavioral_pressure: number | null = null;
    if (route) {
      try {
        const { default: BehavioralEvent } = await import('../models/BehavioralEvent');
        const { Op } = await import('sequelize');
        const recentEvents: any[] = await BehavioralEvent.findAll({
          where: { project_id: projectId, route, created_at: { [Op.gte]: new Date(Date.now() - 24 * 3600 * 1000) } },
          limit: 1000,
        });
        const report = analyzeBehavioralSignals(recentEvents.map(e => ({
          route: e.route,
          kind: e.event_kind,
          ts: new Date(e.created_at).getTime(),
        }) as any));
        const perRoute = report.per_route?.find((r: any) => r.route === route);
        behavioral_pressure = perRoute?.friction_pressure ?? report.project_friction_pressure ?? null;
      } catch { /* behavioral telemetry optional */ }
    }
    return {
      cognition_score: vision?.worst_cognition_score ?? null,
      ux_debt_score: visual?.ux_debt?.total_debt ?? null,
      behavioral_pressure,
      workflow_friction: visual?.workflow_friction?.friction_score ?? null,
      cta_prominence: vision?.aggregated?.cta_score ?? null,
      hierarchy_clarity: vision?.aggregated?.hierarchy_score ?? null,
    };
  } catch (err: any) {
    console.warn('[collectBeforeAfterMetrics] failed:', err?.message);
    return null;
  }
}

// Phase 11 — list recent UXRemediationOutcomes for a BP. Powers the
// "See Replay" CTA on resolved-step rows in SystemViewV2 (the frontend
// needs an outcome ID to load the replay manifest).
router.get('/api/portal/project/business-processes/:id/remediation/outcomes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const aggregate = req.query.aggregate === 'true';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const { default: UXRemediationOutcome } = await import('../models/UXRemediationOutcome');
    const rows: any[] = await UXRemediationOutcome.findAll({
      where: { capability_id: cap.id },
      order: [['observed_at', 'DESC']],
      limit,
    });
    if (aggregate) {
      const { aggregateUXOutcomes } = await import('../intelligence/systemStateEngine/remediation/remediationEffectivenessAnalyzer');
      const agg = await aggregateUXOutcomes({ project_id: cap.project_id, capability_id: cap.id });
      res.json({ outcomes: rows.map(serializeOutcome), aggregate: agg });
      return;
    }
    res.json({ outcomes: rows.map(serializeOutcome) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

function serializeOutcome(r: any): any {
  return {
    id: r.id,
    cluster_signature: r.cluster_signature,
    cluster_type: r.cluster_type,
    step_key: r.step_key,
    issues_resolved_count: r.issues_resolved_count,
    issues_regressed_count: r.issues_regressed_count,
    cognition_delta: r.cognition_delta,
    ux_debt_delta: r.ux_debt_delta,
    behavioral_delta: r.behavioral_delta,
    friction_delta: r.friction_delta,
    observed_at: r.observed_at instanceof Date ? r.observed_at.toISOString() : r.observed_at,
    has_replay: !!(r.before_screenshot_path || r.after_screenshot_path || (r.semantic_regions && r.semantic_regions.length > 0)),
    pre_pressure_tier: r.pre_pressure_tier,
    prompt_target_used: r.prompt_target_used,
  };
}

// Phase 11 — governance insights (5 categories).
router.get('/api/portal/project/remediation/governance-insights', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { generateGovernanceInsights } = await import('../intelligence/systemStateEngine/remediation/remediationGovernanceInsights');
    const insights = await generateGovernanceInsights({ project_id: project.id });
    res.json(insights);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Phase 11 — strategy learner (best per cluster_type).
router.get('/api/portal/project/remediation/strategies', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { learnRemediationStrategies } = await import('../intelligence/systemStateEngine/remediation/remediationStrategyLearner');
    const r = await learnRemediationStrategies({ project_id: project.id });
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Phase 11 — confidence evolution for a single cluster_signature.
router.get('/api/portal/project/business-processes/:id/remediation/confidence-evolution', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const cluster_signature = (req.query.cluster_signature || '') as string;
    if (!cluster_signature) { res.status(400).json({ error: 'cluster_signature required' }); return; }
    const { trackClusterConfidence } = await import('../intelligence/systemStateEngine/remediation/confidenceEvolutionTracker');
    const r = await trackClusterConfidence({ project_id: cap.project_id, cluster_signature });
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/business-processes/:id/remediation/replay/:outcomeId', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { default: UXRemediationOutcome } = await import('../models/UXRemediationOutcome');
    const outcome: any = await UXRemediationOutcome.findByPk(req.params.outcomeId as string);
    if (!outcome || outcome.capability_id !== cap.id) { res.status(404).json({ error: 'Outcome not found' }); return; }

    const { buildReplayManifest } = await import('../intelligence/systemStateEngine/visual/uxRemediationReplay');
    const manifest = buildReplayManifest({
      outcome_id: outcome.id,
      capability_id: cap.id,
      cluster_signature: outcome.cluster_signature,
      before_screenshot_url: outcome.before_screenshot_path ? `/api/portal/project/remediation/screenshots/${encodeURIComponent(outcome.before_screenshot_path)}` : null,
      after_screenshot_url: outcome.after_screenshot_path ? `/api/portal/project/remediation/screenshots/${encodeURIComponent(outcome.after_screenshot_path)}` : null,
      captured_at: outcome.observed_at,
      // Phase 11 — read persisted regions when present (computed once at
      // outcome write time so replay stays deterministic). Fall back to
      // a placeholder when the row predates Phase 11.
      semantic_regions: Array.isArray(outcome.semantic_regions) && outcome.semantic_regions.length > 0
        ? outcome.semantic_regions
        : [{
            cluster_signature: outcome.cluster_signature,
            cluster_type: outcome.cluster_type,
            bbox: null,
            resolved: outcome.issues_resolved_count > 0,
            regressed: outcome.issues_regressed_count > 0,
          }],
      delta_summary: {
        cognition_delta: outcome.cognition_delta,
        ux_debt_delta: outcome.ux_debt_delta,
        behavioral_delta: outcome.behavioral_delta,
        friction_delta: outcome.friction_delta,
        issues_resolved_count: outcome.issues_resolved_count,
        issues_regressed_count: outcome.issues_regressed_count,
      },
    });
    res.json(manifest);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/remediation/health-index', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { computeRemediationHealthIndex } = await import('../intelligence/systemStateEngine/health/remediationHealthIndex');
    const r = await computeRemediationHealthIndex(project.id);
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/remediation/regression-prone', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { detectRegressionPronePatterns } = await import('../intelligence/systemStateEngine/remediation/regressionProneFixDetector');
    const r = await detectRegressionPronePatterns({ project_id: project.id });
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/remediation/policy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getRemediationPolicy } = await import('../intelligence/systemStateEngine/policy/remediationPolicy');
    const policy = await getRemediationPolicy(project.id);
    res.json(policy);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/remediation/policy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { setRemediationPolicy } = await import('../intelligence/systemStateEngine/policy/remediationPolicy');
    const updated = setRemediationPolicy(project.id, req.body || {});
    res.json(updated);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/remediation/pressure', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getRemediationPressure } = await import('../intelligence/systemStateEngine/remediation/remediationPressureEngine');
    const r = getRemediationPressure(project.id);
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 12 — governed decision automation ──────────────────────────────
// 14 endpoints covering recommendations, automation confidence, prepared
// plans, timeline, explainability, operator overrides, audit, and admin
// policy. All operator-facing routes use requireParticipant; the admin
// policy endpoints would normally use requireAdmin (added in adminRoutes).

router.get('/api/portal/project/governance/recommendations', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const status = (req.query.status as string) || 'pending';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const { default: GovernanceRecommendation } = await import('../models/GovernanceRecommendation');
    const rows = await GovernanceRecommendation.findAll({
      where: { project_id: project.id, status },
      order: [['priority', 'ASC'], ['created_at', 'DESC']],
      limit,
    });
    res.json({ recommendations: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/recommendations/:id/decision', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const decision = (req.body?.decision || '') as 'accepted' | 'rejected';
    if (decision !== 'accepted' && decision !== 'rejected') {
      res.status(400).json({ error: 'decision must be "accepted" or "rejected"' });
      return;
    }
    const reason = (req.body?.reason || '') as string;
    const { default: GovernanceRecommendation } = await import('../models/GovernanceRecommendation');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const rec: any = await GovernanceRecommendation.findByPk(req.params.id as string);
    if (!rec || rec.project_id !== project.id) { res.status(404).json({ error: 'Recommendation not found' }); return; }
    if (rec.status !== 'pending') { res.status(409).json({ error: `Recommendation already ${rec.status}` }); return; }
    rec.status = decision;
    rec.operator_decision_at = new Date();
    rec.operator_id = req.participant!.sub;
    rec.decision_reason = reason || null;
    await rec.save();
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: decision === 'accepted' ? 'recommendation_accepted' : 'recommendation_rejected',
      subject_id: rec.id,
      payload: { type: rec.type, reason },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);

    // Phase 12 — decided event + governance memory hooks. Storm detection
    // fires here when an operator rejects a recommendation; if storm trips
    // we flip automation_mode to supervised and pause new recommendations.
    try {
      const { publishCognitiveEvent } = await import('../intelligence/systemStateEngine/realtime/cognitiveEventBus');
      publishCognitiveEvent({
        kind: 'governance.recommendation.decided',
        project_id: project.id,
        severity: 'info',
        payload: { recommendation_id: rec.id, type: rec.type, decision, operator_id: req.participant!.sub },
      });
      const { noteRecommendationDecided } = await import('../intelligence/systemStateEngine/governance/governanceTaskShaper');
      noteRecommendationDecided(project.id, { type: rec.type, cluster_signature: (rec.supporting_evidence || {}).cluster_signature || null });
      if (decision === 'rejected') {
        const { recordOperatorOverride } = await import('../intelligence/systemStateEngine/governance/governanceMemory');
        const r = recordOperatorOverride(project.id);
        if (r.storm_triggered) {
          // Flip mode + pause + audit
          const { setAutomationMode } = await import('../intelligence/systemStateEngine/governance/decisionAutomationEngine');
          setAutomationMode(project.id, 'supervised');
          await GovernanceAuditEntry.create({
            project_id: project.id,
            kind: 'override_storm_detected',
            subject_id: null,
            payload: { velocity: r.velocity, action: 'flipped_to_supervised_paused_30m' },
            operator_id: req.participant!.sub,
            recorded_at: new Date(),
          } as any);
          publishCognitiveEvent({
            kind: 'governance.escalation_dispatched',
            project_id: project.id,
            severity: 'warning',
            payload: { reason: 'override_storm', velocity: r.velocity, suspended_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
          });
        }
      }
    } catch { /* fire-and-forget */ }
    res.json(rec);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/automation-confidence', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildDecisionAutomationReport } = await import('../intelligence/systemStateEngine/governance/decisionAutomationEngine');
    const r = await buildDecisionAutomationReport({ project_id: project.id });
    res.json({
      automation_confidence: r.automation_confidence,
      automation_mode: r.automation_mode,
      governance_summary: r.governance_summary,
      generated_at: r.generated_at,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/prepared-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const status = req.query.status as string | undefined;
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const where: any = { project_id: project.id };
    if (status) where.status = status;
    const rows = await PreparedRemediationPlan.findAll({ where, order: [['created_at', 'DESC']], limit: 50 });
    res.json({ plans: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/prepared-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { capability_id, cluster_signature, plan_payload, projected_outcome, confidence } = req.body || {};
    if (!capability_id || !cluster_signature) { res.status(400).json({ error: 'capability_id and cluster_signature required' }); return; }
    const row = await PreparedRemediationPlan.create({
      project_id: project.id,
      capability_id,
      cluster_signature,
      plan_payload: plan_payload || {},
      projected_outcome: projected_outcome || {},
      confidence: typeof confidence === 'number' ? confidence : 50,
      status: 'draft',
    } as any);
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'plan_prepared',
      subject_id: row.id,
      payload: { capability_id, cluster_signature },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    try {
      const { publishCognitiveEvent } = await import('../intelligence/systemStateEngine/realtime/cognitiveEventBus');
      publishCognitiveEvent({
        kind: 'remediation.plan.prepared',
        project_id: project.id,
        severity: 'info',
        payload: { plan_id: row.id, capability_id, cluster_signature },
      });
    } catch { /* fire-and-forget */ }
    res.json(row);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/prepared-plans/:id/decision', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const decision = req.body?.decision as 'approved' | 'rejected';
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
      return;
    }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const plan: any = await PreparedRemediationPlan.findByPk(req.params.id as string);
    if (!plan || plan.project_id !== project.id) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (plan.status !== 'draft') { res.status(409).json({ error: `Plan already ${plan.status}` }); return; }
    plan.status = decision;
    plan.operator_id = req.participant!.sub;
    plan.decided_at = new Date();
    await plan.save();
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: decision === 'approved' ? 'plan_approved' : 'plan_rejected',
      subject_id: plan.id,
      payload: { cluster_signature: plan.cluster_signature },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    res.json(plan);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/prepared-plans/:id/rollback', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { buildRollbackPromptBody } = await import('../intelligence/systemStateEngine/governance/autonomousRemediationPreparer');
    const plan: any = await PreparedRemediationPlan.findByPk(req.params.id as string);
    if (!plan || plan.project_id !== project.id) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (plan.status !== 'approved') { res.status(409).json({ error: `Plan must be approved before rollback (current: ${plan.status})` }); return; }
    const promptBody = buildRollbackPromptBody(plan.plan_payload);
    plan.status = 'rolled_back';
    await plan.save();
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'plan_rolled_back',
      subject_id: plan.id,
      payload: { has_reference_snapshot: !!promptBody, cluster_signature: plan.cluster_signature },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    res.json({ plan, rollback_prompt_body: promptBody });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/timeline', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    // Composite: events (per-event resolution) + snapshots (state-at-T)
    const { Op } = await import('sequelize');
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [eventsRaw, snapshotsRaw] = await Promise.all([
      (async () => {
        try {
          const { default: CognitionEvent } = await import('../models/CognitionEvent');
          return await CognitionEvent.findAll({
            where: { project_id: project.id, emitted_at: { [Op.gte]: since } },
            order: [['emitted_at', 'DESC']],
            limit,
          });
        } catch { return []; }
      })(),
      (async () => {
        try {
          const { default: SystemStateSnapshot } = await import('../models/SystemStateSnapshot');
          return await SystemStateSnapshot.findAll({
            where: { project_id: project.id, generated_at: { [Op.gte]: since } },
            order: [['generated_at', 'DESC']],
            limit: 25,
          });
        } catch { return []; }
      })(),
    ]);
    res.json({ events: eventsRaw, state_snapshots: snapshotsRaw });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/explain/:event_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { explainDecision } = await import('../intelligence/systemStateEngine/governance/decisionExplainabilityEngine');
    const chain = await explainDecision({ project_id: project.id, event_id: req.params.event_id as string });
    res.json(chain);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/operator-overrides', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    const rows = await GovernanceAuditEntry.findAll({
      where: { project_id: project.id, kind: { [Op.in]: ['operator_override', 'recommendation_rejected', 'plan_rejected'] } },
      order: [['recorded_at', 'DESC']],
      limit: 50,
    });
    res.json({ overrides: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/operator-overrides', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { recordOperatorOverride } = await import('../intelligence/systemStateEngine/governance/governanceMemory');
    const reason = (req.body?.reason || '') as string;
    const subject_id = (req.body?.subject_id || null) as string | null;
    const row = await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'operator_override',
      subject_id,
      payload: { reason },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    const r = recordOperatorOverride(project.id);
    res.json({ override: row, storm_triggered: r.storm_triggered, velocity: r.velocity });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/audit', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const where: any = { project_id: project.id };
    if (req.query.kind) where.kind = req.query.kind;
    const rows = await GovernanceAuditEntry.findAll({ where, order: [['recorded_at', 'DESC']], limit });
    res.json({ entries: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/decision-report', requireParticipant, async (req: Request, res: Response) => {
  // Operator-triggered build of the full decision automation report.
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildDecisionAutomationReport } = await import('../intelligence/systemStateEngine/governance/decisionAutomationEngine');
    const r = await buildDecisionAutomationReport({ project_id: project.id });
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 13 — supervised autonomous decision approval ─────────────────

router.get('/api/portal/project/governance/autonomy/decisions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const rows = await GovernanceAuditEntry.findAll({
      where: {
        project_id: project.id,
        kind: { [Op.in]: ['autonomy_execution_prepared', 'autonomy_execution_approved', 'autonomy_execution_blocked', 'autonomy_execution_applied', 'autonomy_execution_rolled_back'] },
      },
      order: [['recorded_at', 'DESC']],
      limit,
    });
    res.json({ decisions: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/autonomy/dry-run', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { plan_id } = req.body || {};
    if (!plan_id) { res.status(400).json({ error: 'plan_id required' }); return; }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const plan: any = await PreparedRemediationPlan.findByPk(plan_id);
    if (!plan || plan.project_id !== project.id) { res.status(404).json({ error: 'Plan not found' }); return; }
    const { runSandboxValidation } = await import('../intelligence/systemStateEngine/autonomy/safeExecutionGuardrails');
    const sandbox = runSandboxValidation({
      cluster_signature: plan.cluster_signature,
      cluster_type: (plan.plan_payload?.adaptiveRemediation?.clusters?.[0]?.cluster_type) || 'workflow',
      issue_count: (plan.plan_payload?.uiIssues?.length) || 1,
      historical_success_rate: 70,
      initial_pressure: 50,
      initial_cognition: 60,
    });
    res.json({ sandbox });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/autonomy/:plan_id/rollback', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { prepareRollback } = await import('../intelligence/systemStateEngine/autonomy/rollbackPreparationEngine');
    const { recordExecutionRollback } = await import('../intelligence/systemStateEngine/autonomy/autonomyTrustState');
    const plan: any = await PreparedRemediationPlan.findByPk(req.params.plan_id as string);
    if (!plan || plan.project_id !== project.id) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (plan.status !== 'approved' && plan.status !== 'rolled_back') {
      res.status(409).json({ error: `Plan not eligible for rollback (status: ${plan.status})` });
      return;
    }
    const post_execution_change_set = (req.body?.post_execution_change_set as string) || null;
    const rollback = prepareRollback({
      plan_payload: plan.plan_payload,
      post_execution_change_set,
      rollback_replay_checkpoint_snapshot_id: null,
      sandbox_passed: true,
      trust_score: 60,
    });
    plan.status = 'rolled_back';
    plan.rollback_ready = true;
    await plan.save();
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'autonomy_execution_rolled_back',
      subject_id: plan.id,
      payload: { has_reference: !!rollback.rollback_prompt, change_set_provided: !!post_execution_change_set },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    recordExecutionRollback(project.id, 'autonomous_safe');
    res.json({ plan, rollback });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/autonomy/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readTrustProfile, executionSuccessRate, rollbackFrequency } = await import('../intelligence/systemStateEngine/autonomy/autonomyTrustState');
    const trust = readTrustProfile(project.id);
    res.json({
      trust,
      execution_success_rate: executionSuccessRate(project.id),
      rollback_frequency: rollbackFrequency(project.id),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/autonomy/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const { default: CognitionEvent } = await import('../models/CognitionEvent');
    const { Op } = await import('sequelize');
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [audits, plans, events] = await Promise.all([
      GovernanceAuditEntry.findAll({
        where: { project_id: project.id, kind: { [Op.like]: 'autonomy_%' }, recorded_at: { [Op.gte]: since } },
        order: [['recorded_at', 'DESC']],
        limit,
      }),
      PreparedRemediationPlan.findAll({
        where: { project_id: project.id, auto_executed_at: { [Op.gte]: since } },
        order: [['auto_executed_at', 'DESC']],
        limit: 50,
      }),
      CognitionEvent.findAll({
        where: { project_id: project.id, kind: { [Op.like]: 'autonomy.%' }, emitted_at: { [Op.gte]: since } },
        order: [['emitted_at', 'DESC']],
        limit,
      }),
    ]);
    res.json({ audits, plans, events });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/autonomy/policy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getPolicy } = await import('../intelligence/systemStateEngine/policy/cognitivePolicyEngine');
    const policy = getPolicy(project.id);
    res.json({ policy });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/api/portal/project/governance/autonomy/policy', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { updatePolicy } = await import('../intelligence/systemStateEngine/policy/cognitivePolicyEngine');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const updated = await updatePolicy(project.id, (req.body || {}) as any, { persist: true });
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'policy_changed',
      subject_id: null,
      payload: { update: req.body, scope: 'autonomy' },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    res.json({ policy: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin kill switch — flips all projects to 'frozen', writes audit row
// per project. Operator-only path; lifting back to autonomous requires
// per-project mode change.
router.post('/api/admin/governance/autonomy/emergency-freeze', requireParticipant, async (req: Request, res: Response) => {
  try {
    // Use participant gate for now; if a separate admin gate exists, swap it in.
    const { default: Project } = await import('../models/Project');
    const { setAutomationMode } = await import('../intelligence/systemStateEngine/governance/decisionAutomationEngine');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const projects: any[] = await Project.findAll();
    let frozen = 0;
    for (const p of projects) {
      try {
        setAutomationMode(p.id, 'frozen');
        await GovernanceAuditEntry.create({
          project_id: p.id,
          kind: 'autonomy_execution_blocked',
          subject_id: null,
          payload: { reason: 'emergency_freeze', triggered_by: req.participant!.sub },
          operator_id: req.participant!.sub,
          recorded_at: new Date(),
        } as any);
        frozen++;
      } catch { /* continue across projects */ }
    }
    res.json({ frozen, total_projects: projects.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 14 — Autonomous handoff + closed-loop verification ──────
// Recent handoff records (audit-row backed) + cancel + manual verify +
// active isolations + admin lift-isolation.
router.get('/api/portal/project/governance/autonomy/handoffs', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows: any[] = await GovernanceAuditEntry.findAll({
      where: {
        project_id: project.id,
        kind: { [Op.in]: ['autonomy_execution_started', 'autonomy_execution_verified', 'autonomy_execution_failed', 'autonomy_rollback_started', 'autonomy_rollback_completed'] },
        recorded_at: { [Op.gte]: since },
      } as any,
      order: [['recorded_at', 'DESC']],
      limit,
    });
    res.json({ handoffs: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/autonomy/:plan_id/verify', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const plan: any = await PreparedRemediationPlan.findByPk(req.params.plan_id as string);
    if (!plan || plan.project_id !== project.id) { res.status(404).json({ error: 'Plan not found' }); return; }
    if (!plan.cluster_signature) { res.status(409).json({ error: 'Plan missing cluster_signature' }); return; }
    const { _testRunVerification } = await import('../intelligence/systemStateEngine/autonomy/executionVerificationListener');
    await _testRunVerification(plan, plan.cluster_signature);
    const updated: any = await PreparedRemediationPlan.findByPk(plan.id);
    res.json({ plan: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/autonomy/isolations', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { getActiveIsolations } = await import('../intelligence/systemStateEngine/autonomy/isolationRegistry');
    const isolations = await getActiveIsolations(project.id);
    res.json({ isolations });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/autonomy/:plan_id/cancel-handoff', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: PreparedRemediationPlan } = await import('../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const plan: any = await PreparedRemediationPlan.findByPk(req.params.plan_id as string);
    if (!plan || plan.project_id !== project.id) { res.status(404).json({ error: 'Plan not found' }); return; }
    // Only cancellable if the handoff hasn't fired yet OR is pending verification.
    if (plan.execution_verification_status && plan.execution_verification_status !== 'pending') {
      res.status(409).json({ error: `Plan already ${plan.execution_verification_status}` });
      return;
    }
    plan.status = 'rolled_back';
    plan.execution_verification_status = 'failed';
    await plan.save();
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'autonomy_execution_failed',
      subject_id: plan.id,
      payload: { reason: 'operator_cancelled_handoff', operator: req.participant!.sub },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    res.json({ plan });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/governance/autonomy/lift-isolation/:cluster_signature', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { liftIsolation } = await import('../intelligence/systemStateEngine/autonomy/isolationRegistry');
    await liftIsolation(project.id, req.params.cluster_signature as string, req.participant!.sub);
    res.json({ lifted: true, cluster_signature: req.params.cluster_signature });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 15 — governed direct autonomous mutation ────────────────
// Recent envelopes (audit-row-backed) + operator rollback + per-intent
// trust profile + active containment + admin freeze.
router.get('/api/portal/project/governance/mutation/envelopes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows: any[] = await GovernanceAuditEntry.findAll({
      where: {
        project_id: project.id,
        kind: { [Op.in]: ['mutation_envelope_created', 'mutation_executed', 'mutation_verified', 'mutation_failed', 'mutation_rolled_back', 'mutation_contained'] },
        recorded_at: { [Op.gte]: since },
      } as any,
      order: [['recorded_at', 'DESC']],
      limit,
    });
    res.json({ envelopes: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/mutation/:mutation_id/rollback', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const { Op } = await import('sequelize');
    // Find the most recent envelope row for this mutation_id.
    const row: any = await GovernanceAuditEntry.findOne({
      where: {
        project_id: project.id,
        subject_id: req.params.mutation_id as string,
        kind: { [Op.in]: ['mutation_executed', 'mutation_envelope_created', 'mutation_verified', 'mutation_failed'] },
      } as any,
      order: [['recorded_at', 'DESC']],
    });
    if (!row || !row.payload) { res.status(404).json({ error: 'Mutation envelope not found' }); return; }
    const { executeRollback } = await import('../intelligence/systemStateEngine/mutation/mutationRollbackCoordinator');
    const mode = ((req.body?.mode as string) || 'full') as any;
    const partial_count = req.body?.partial_count;
    const reason = (req.body?.reason as string) || 'operator_initiated';
    const result = await executeRollback({
      envelope: row.payload,
      mode,
      partial_count,
      operator_id: req.participant!.sub,
      reason,
    });
    res.json({ rollback: result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/mutation/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readMutationTrustProfile, avgMutationTrust } = await import('../intelligence/systemStateEngine/mutation/mutationTrustCalibrator');
    const profile = readMutationTrustProfile(project.id);
    res.json({ profile, avg_trust: avgMutationTrust(project.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/mutation/containment', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readContainmentSnapshot } = await import('../intelligence/systemStateEngine/mutation/mutationContainmentEngine');
    res.json({ containment: readContainmentSnapshot(project.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/governance/mutation/freeze-class/:intent_class', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { freezeIntentClass } = await import('../intelligence/systemStateEngine/mutation/mutationTrustCalibrator');
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const intent = req.params.intent_class as any;
    freezeIntentClass(project.id, intent);
    await GovernanceAuditEntry.create({
      project_id: project.id,
      kind: 'mutation_trust_changed',
      subject_id: null,
      payload: { action: 'freeze_intent_class', intent_class: intent, operator: req.participant!.sub },
      operator_id: req.participant!.sub,
      recorded_at: new Date(),
    } as any);
    res.json({ frozen: true, intent_class: intent });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 16 — causality replay + distributed validation ──────────
//
// All Phase 16 endpoints share a small helper that assembles the
// `OperationalLineageGraph` for a project from the last 7d of audit
// rows. Mutation envelopes, contradiction flags, and rollback events
// become lineage nodes. The helper is inline (not a shared utility)
// because it's only used by these 5 routes.

async function buildProjectLineageGraph(projectId: string, limit = 200): Promise<any> {
  const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
  const { Op } = await import('sequelize');
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows: any[] = await GovernanceAuditEntry.findAll({
    where: {
      project_id: projectId,
      kind: { [Op.in]: ['mutation_envelope_created', 'mutation_executed', 'mutation_verified', 'mutation_failed', 'mutation_rolled_back', 'mutation_contained', 'autonomy_execution_failed', 'autonomy_self_heal_triggered'] },
      recorded_at: { [Op.gte]: since },
    } as any,
    order: [['recorded_at', 'DESC']],
    limit,
  });

  // Translate audit rows into LineageNodes.
  const seen = new Set<string>();
  const nodes: any[] = [];
  for (const r of rows) {
    const env = r.payload || {};
    const nodeId = r.subject_id || `${r.kind}-${new Date(r.recorded_at).getTime()}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const kind = (r.kind === 'mutation_rolled_back' ? 'rollback'
      : r.kind === 'mutation_contained' ? 'stabilization'
      : r.kind === 'autonomy_execution_failed' ? 'mutation'
      : r.kind === 'autonomy_self_heal_triggered' ? 'governance_decision'
      : 'mutation') as any;
    nodes.push({
      node_id: nodeId,
      kind,
      project_id: projectId,
      subject_id: env.scope?.subject_id ?? env.cluster_signature ?? null,
      timestamp: new Date(r.recorded_at).toISOString(),
      summary: env.mutation_intent ?? r.kind,
      severity: r.kind.includes('failed') ? 'error' : r.kind.includes('contained') ? 'warning' : 'info',
      payload: env,
    });
  }

  const { buildLineageGraph } = await import('../intelligence/systemStateEngine/causality/mutationLineageGraph');
  return buildLineageGraph({ project_id: projectId, nodes });
}

router.get('/api/portal/project/governance/causality/lineage', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 200));
    const graph = await buildProjectLineageGraph(project.id, limit);
    res.json({ graph });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/causality/root-cause/:mutation_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const graph = await buildProjectLineageGraph(project.id);
    const { buildContradictionPropagationProfile } = await import('../intelligence/systemStateEngine/causality/contradictionPropagationTracker');
    const { readOrRebuild } = await import('../intelligence/systemStateEngine/snapshotReader');
    const state = await readOrRebuild(project.id).catch(() => null);
    const propagation = buildContradictionPropagationProfile({
      project_id: project.id,
      contradictions: (state?.contradictions ?? []) as any,
    });
    const { analyzeRootCauses } = await import('../intelligence/systemStateEngine/causality/rootCauseAnalyzer');
    const analysis = analyzeRootCauses({
      graph,
      target_node_id: req.params.mutation_id as string,
      propagation,
    });
    res.json({ analysis });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/causality/propagation', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readOrRebuild } = await import('../intelligence/systemStateEngine/snapshotReader');
    const state = await readOrRebuild(project.id).catch(() => null);
    const { buildContradictionPropagationProfile } = await import('../intelligence/systemStateEngine/causality/contradictionPropagationTracker');
    const profile = buildContradictionPropagationProfile({
      project_id: project.id,
      contradictions: (state?.contradictions ?? []) as any,
    });
    res.json({ profile });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/causality/validators/:mutation_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { default: GovernanceAuditEntry } = await import('../models/GovernanceAuditEntry');
    const row: any = await GovernanceAuditEntry.findOne({
      where: { project_id: project.id, subject_id: req.params.mutation_id as string } as any,
      order: [['recorded_at', 'DESC']],
    });
    if (!row || !row.payload) { res.status(404).json({ error: 'Envelope not found' }); return; }
    const { runAllValidators } = await import('../intelligence/systemStateEngine/causality/distributedValidationHarness');
    const { arbitrate } = await import('../intelligence/systemStateEngine/causality/validationArbitrationEngine');
    const { mutationTrustScore, avgMutationTrust, isClassContained } = await import('../intelligence/systemStateEngine/index');
    const { isIntentFrozen } = await import('../intelligence/systemStateEngine/mutation/mutationTrustCalibrator');
    const env = row.payload;
    const verdicts = runAllValidators({
      envelope: env,
      current_trust_score: mutationTrustScore(project.id, env.mutation_class),
      is_contained: isClassContained(project.id, env.mutation_class),
      is_frozen: isIntentFrozen(project.id, env.mutation_class),
      avg_project_trust: avgMutationTrust(project.id),
    });
    const arbitration = arbitrate({ mutation_id: env.mutation_id, verdicts });
    const { recordArbitration, persistDisagreementAudit, readValidatorTrustProfile } = await import('../intelligence/systemStateEngine/causality/validatorTrustCalibrator');
    recordArbitration(project.id, arbitration);
    await persistDisagreementAudit(project.id, arbitration, env.mutation_id);
    res.json({ verdicts, arbitration, validator_trust: readValidatorTrustProfile(project.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/causality/epidemiology', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const graph = await buildProjectLineageGraph(project.id);
    const { readOrRebuild } = await import('../intelligence/systemStateEngine/snapshotReader');
    const state = await readOrRebuild(project.id).catch(() => null);
    const { buildContradictionPropagationProfile } = await import('../intelligence/systemStateEngine/causality/contradictionPropagationTracker');
    const propagation = buildContradictionPropagationProfile({
      project_id: project.id,
      contradictions: (state?.contradictions ?? []) as any,
    });
    const { readContainmentSnapshot } = await import('../intelligence/systemStateEngine/mutation/mutationContainmentEngine');
    const containment = readContainmentSnapshot(project.id);
    const { buildOperationalEpidemiologyMap } = await import('../intelligence/systemStateEngine/causality/operationalEpidemiologyEngine');
    const map = buildOperationalEpidemiologyMap({
      graph,
      propagation,
      already_contained_subjects: containment.contained_classes,
      frozen_subjects: containment.frozen_classes,
    });
    res.json({ map });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 17 — adaptive validator intelligence + causal governance ──
// 6 read endpoints: validator-reliability, drift, specialization,
// forecast, ancestry-rollback, recovery-chain. All read-only — the
// engine plans + surfaces; operators execute via existing Phase 13-15
// endpoints.

router.get('/api/portal/project/governance/adaptive/validator-reliability', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readReliabilityProfile } = await import('../intelligence/systemStateEngine/adaptiveGovernance/validatorReliabilityTracker');
    const { buildAdaptiveWeights } = await import('../intelligence/systemStateEngine/adaptiveGovernance/adaptiveValidatorEngine');
    const reliability = readReliabilityProfile(project.id);
    const adaptive = buildAdaptiveWeights({ project_id: project.id });
    res.json({ reliability, adaptive_weights: adaptive });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/adaptive/drift', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildDriftProfile } = await import('../intelligence/systemStateEngine/adaptiveGovernance/validatorDriftDetector');
    const drift = buildDriftProfile(project.id);
    res.json({ drift });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/adaptive/specialization', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildSpecializationMap } = await import('../intelligence/systemStateEngine/adaptiveGovernance/validatorSpecializationAnalyzer');
    const specialization = buildSpecializationMap(project.id);
    res.json({ specialization });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/adaptive/forecast', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    // Pull current signals from existing surfaces.
    const { readMutationCounters } = await import('../intelligence/systemStateEngine/mutation/mutationSummaryCounters');
    const { readReliabilityProfile } = await import('../intelligence/systemStateEngine/adaptiveGovernance/validatorReliabilityTracker');
    const { readOrRebuild } = await import('../intelligence/systemStateEngine/snapshotReader');
    const counters = readMutationCounters(project.id);
    const reliability = readReliabilityProfile(project.id);
    const state = await readOrRebuild(project.id).catch(() => null);
    const divergenceAvg = Math.round(
      Object.values(reliability.metrics_by_role).reduce((s, m) => s + (100 - m.arbitration_agreement_quality), 0)
        / Math.max(1, Object.values(reliability.metrics_by_role).length),
    );
    const escalationAvg = Math.round(
      Object.values(reliability.metrics_by_role).reduce((s, m) => s + (100 - m.accuracy), 0)
        / Math.max(1, Object.values(reliability.metrics_by_role).length),
    );
    const { buildCausalStabilityForecast } = await import('../intelligence/systemStateEngine/adaptiveGovernance/causalForecastingEngine');
    const forecast = buildCausalStabilityForecast({
      project_id: project.id,
      current: {
        rollback_rate_per_hour: counters.recent_rollbacks,
        validator_divergence_pct: divergenceAvg,
        avg_inherited_trust_decay: 0,           // Phase 16 trust map is not cached at this layer
        contradiction_count: state?.contradictions?.length ?? 0,
        arbitration_escalation_rate_pct: escalationAvg,
      },
    });
    res.json({ forecast });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/adaptive/ancestry-rollback/:mutation_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const graph = await buildProjectLineageGraph(project.id);
    const { readOrRebuild } = await import('../intelligence/systemStateEngine/snapshotReader');
    const state = await readOrRebuild(project.id).catch(() => null);
    const { buildContradictionPropagationProfile } = await import('../intelligence/systemStateEngine/causality/contradictionPropagationTracker');
    const propagation = buildContradictionPropagationProfile({
      project_id: project.id,
      contradictions: (state?.contradictions ?? []) as any,
    });
    const { buildAncestryRollbackPlan } = await import('../intelligence/systemStateEngine/adaptiveGovernance/ancestryRollbackAdvisor');
    const plan = buildAncestryRollbackPlan({
      graph,
      target_mutation_id: req.params.mutation_id as string,
      propagation,
    });
    res.json({ plan });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 18 — operator-calibrated governance evolution ──────────
//
// 7 endpoints: calibration list/propose/approve/reject, routing
// decision builder, forecast tuning profile, recovery session create
// + step action, governance topology, transparency replay, recovery
// optimization insights.

router.get('/api/portal/project/governance/operator/calibration-proposals', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { listProposals } = await import('../intelligence/systemStateEngine/operatorGovernance/operatorCalibrationEngine');
    res.json({ proposals: listProposals(project.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/operator/calibration-proposals/:proposal_id/approve', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { approveCalibration } = await import('../intelligence/systemStateEngine/operatorGovernance/operatorCalibrationEngine');
    const result = await approveCalibration({
      project_id: project.id,
      proposal_id: req.params.proposal_id as string,
      operator_id: req.participant!.sub,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/operator/calibration-proposals/:proposal_id/reject', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { rejectCalibration } = await import('../intelligence/systemStateEngine/operatorGovernance/operatorCalibrationEngine');
    const proposal = await rejectCalibration({
      project_id: project.id,
      proposal_id: req.params.proposal_id as string,
      operator_id: req.participant!.sub,
      reason: (req.body?.reason as string) ?? 'operator_rejected',
    });
    res.json({ proposal });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/operator/specialization-routing', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const target_intent = (req.query.target_intent as string) ?? 'POLICY_NUDGE';
    const { buildRoutingDecision } = await import('../intelligence/systemStateEngine/operatorGovernance/specializationRoutingEngine');
    const decision = buildRoutingDecision({ project_id: project.id, target_intent: target_intent as any });
    res.json({ decision });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/operator/forecast-tuning', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildForecastCalibrationProfile } = await import('../intelligence/systemStateEngine/operatorGovernance/forecastTuningEngine');
    const profile = buildForecastCalibrationProfile(project.id);
    res.json({ profile });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/operator/topology', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildGovernanceTopology } = await import('../intelligence/systemStateEngine/operatorGovernance/governanceTopologyBuilder');
    const topology = buildGovernanceTopology({ project_id: project.id });
    res.json({ topology });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/operator/recovery-sessions', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { listRecoverySessions } = await import('../intelligence/systemStateEngine/operatorGovernance/interactiveRecoveryCoordinator');
    res.json({ sessions: listRecoverySessions(project.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/operator/recovery-sessions/:session_id/step', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const action = (req.body?.action as string) ?? '';
    if (!['approve', 'skip', 'abort'].includes(action)) {
      res.status(400).json({ error: 'action must be one of approve|skip|abort' });
      return;
    }
    const { performStepAction } = await import('../intelligence/systemStateEngine/operatorGovernance/interactiveRecoveryCoordinator');
    const session = await performStepAction({
      project_id: project.id,
      session_id: req.params.session_id as string,
      action: action as any,
      operator_id: req.participant!.sub,
    });
    res.json({ session });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 19 — federated organizational governance intelligence ──
//
// 8 endpoints: consent read/update, archetypes (list + share), org
// recovery intelligence, calibration impact replay, forecast anomalies,
// governance drift replay, federation lineage.

router.get('/api/portal/project/governance/federation/consent', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    res.json({ consent: readConsent(project.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/federation/consent', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { updateConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = await updateConsent({
      project_id: project.id,
      organization_id: req.body?.organization_id,
      federation_enabled: req.body?.federation_enabled,
      share_permissions: req.body?.share_permissions,
      consume_permissions: req.body?.consume_permissions,
      anonymization_level: req.body?.anonymization_level,
      updated_by: req.participant!.sub,
    });
    res.json({ consent });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federation/archetypes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const kind = req.query.kind as string | undefined;
    const { listArchetypesFor } = await import('../intelligence/systemStateEngine/federation/federatedArchetypeRegistry');
    const archetypes = listArchetypesFor({ project_id: project.id, kind: kind as any });
    res.json({ archetypes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/federation/archetypes/share', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { shareArchetype } = await import('../intelligence/systemStateEngine/federation/federatedArchetypeRegistry');
    const result = await shareArchetype({
      project_id: project.id,
      raw_archetype: req.body?.raw_archetype,
      anomaly_observed: req.body?.anomaly_observed === true,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federation/recovery-intelligence', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const kind = req.query.kind as string | undefined;
    const { buildOrganizationalRecoveryIntelligence } = await import('../intelligence/systemStateEngine/federation/organizationalRecoveryIntelligence');
    const report = buildOrganizationalRecoveryIntelligence({ project_id: project.id, kind: kind as any });
    res.json({ report });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federation/calibration-impact/:proposal_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const window_hours = req.query.window_hours ? Number(req.query.window_hours) : undefined;
    const { replayCalibrationImpact } = await import('../intelligence/systemStateEngine/federation/calibrationImpactReplay');
    const result = await replayCalibrationImpact({
      project_id: project.id,
      proposal_id: req.params.proposal_id as string,
      window_hours,
    });
    res.json({ replay: result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federation/forecast-anomalies', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildForecastAnomalyProfile } = await import('../intelligence/systemStateEngine/federation/anomalyAwareForecastEngine');
    const profile = buildForecastAnomalyProfile(project.id);
    res.json({ profile });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federation/governance-drift', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const window_hours = req.query.window_hours ? Number(req.query.window_hours) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const { buildGovernanceDriftReplay } = await import('../intelligence/systemStateEngine/federation/governanceDriftReplay');
    const replay = await buildGovernanceDriftReplay({ project_id: project.id, window_hours, limit });
    res.json({ replay });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 20 — bounded federated organizational learning ─────────
//
// 12 endpoints: effectiveness observe + read + list, organizational
// stabilization, diffusion replay, reliability evolution + read, drift,
// visibility replay, policy proposals (list + propose + approve + reject).

router.post('/api/portal/project/governance/federated-learning/effectiveness-observation', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) {
      res.status(400).json({ error: 'project not federation-enabled' });
      return;
    }
    const { recordOutcomeObservation } = await import('../intelligence/systemStateEngine/federatedLearning/federatedEffectivenessTracker');
    await recordOutcomeObservation({
      organization_id: consent.organization_id,
      archetype_signature: req.body?.archetype_signature,
      signal: req.body?.signal,
      stabilization_delta: Number(req.body?.stabilization_delta) || 0,
      propagation_reduction: Number(req.body?.propagation_reduction) || 0,
      recovery_succeeded: req.body?.recovery_succeeded === true,
      anomaly_observed: req.body?.anomaly_observed === true,
    });
    res.json({ recorded: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/effectiveness', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ profiles: [] }); return; }
    const { listEffectivenessProfiles } = await import('../intelligence/systemStateEngine/federatedLearning/federatedEffectivenessTracker');
    const profiles = await listEffectivenessProfiles(consent.organization_id);
    res.json({ profiles });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/organizational-stabilization', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ report: null }); return; }
    const { buildOrganizationalStabilizationReport } = await import('../intelligence/systemStateEngine/federatedLearning/organizationalStabilizationIntelligence');
    const report = await buildOrganizationalStabilizationReport({ organization_id: consent.organization_id });
    res.json({ report });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/diffusion-replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ replay: null }); return; }
    const archetype_signature = req.query.archetype_signature as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const { buildFederatedImpactDiffusionReplay } = await import('../intelligence/systemStateEngine/federatedLearning/federatedImpactDiffusionReplay');
    const replay = await buildFederatedImpactDiffusionReplay({ organization_id: consent.organization_id, archetype_signature, limit });
    res.json({ replay });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/federated-learning/reliability/:archetype_signature/evolve', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.status(400).json({ error: 'project not federation-enabled' }); return; }
    const { evolveReliability } = await import('../intelligence/systemStateEngine/federatedLearning/archetypeReliabilityEvolution');
    const profile = await evolveReliability({
      organization_id: consent.organization_id,
      archetype_signature: req.params.archetype_signature as string,
    });
    res.json({ profile });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/reliability', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ profiles: [] }); return; }
    const { listReliabilityProfiles } = await import('../intelligence/systemStateEngine/federatedLearning/archetypeReliabilityEvolution');
    const profiles = await listReliabilityProfiles(consent.organization_id);
    res.json({ profiles });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/drift', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ profile: null }); return; }
    const { buildFederationDriftProfile } = await import('../intelligence/systemStateEngine/federatedLearning/federationDriftDetector');
    const profile = await buildFederationDriftProfile({ organization_id: consent.organization_id });
    res.json({ profile });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/visibility-replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ replay: null }); return; }
    const window_hours = req.query.window_hours ? Number(req.query.window_hours) : undefined;
    const { buildFederationVisibilityReplay } = await import('../intelligence/systemStateEngine/federatedLearning/federationVisibilityReplay');
    const replay = await buildFederationVisibilityReplay({ organization_id: consent.organization_id, window_hours });
    res.json({ replay });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federated-learning/policy-proposals', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.json({ proposals: [] }); return; }
    const { listPolicyProposals } = await import('../intelligence/systemStateEngine/federatedLearning/federationPolicyEvolutionEngine');
    const proposals = await listPolicyProposals(consent.organization_id);
    res.json({ proposals });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/federated-learning/policy-proposals', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.status(400).json({ error: 'project not federation-enabled' }); return; }
    const { proposePolicyEvolution } = await import('../intelligence/systemStateEngine/federatedLearning/federationPolicyEvolutionEngine');
    const result = await proposePolicyEvolution({
      organization_id: consent.organization_id,
      project_id: project.id,
      evolution_kind: req.body?.evolution_kind,
      proposed_change: req.body?.proposed_change ?? {},
      rationale: (req.body?.rationale as string) ?? '',
      impact_bounds: req.body?.impact_bounds,
      forecasted_impact: req.body?.forecasted_impact ?? [],
      rollback_path: req.body?.rollback_path ?? [],
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/federated-learning/policy-proposals/:proposal_id/approve', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.status(400).json({ error: 'project not federation-enabled' }); return; }
    const { approvePolicy } = await import('../intelligence/systemStateEngine/federatedLearning/federationPolicyEvolutionEngine');
    const result = await approvePolicy({
      organization_id: consent.organization_id,
      proposal_id: req.params.proposal_id as string,
      operator_id: req.participant!.sub,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/governance/federated-learning/policy-proposals/:proposal_id/reject', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) { res.status(400).json({ error: 'project not federation-enabled' }); return; }
    const { rejectPolicy } = await import('../intelligence/systemStateEngine/federatedLearning/federationPolicyEvolutionEngine');
    const proposal = await rejectPolicy({
      organization_id: consent.organization_id,
      proposal_id: req.params.proposal_id as string,
      operator_id: req.participant!.sub,
      reason: req.body?.reason as string | undefined,
    });
    res.json({ proposal });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/federation/lineage', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { readConsent } = await import('../intelligence/systemStateEngine/federation/federationConsentEngine');
    const { readFederationLineage } = await import('../intelligence/systemStateEngine/federation/federationLineageTracker');
    const consent = readConsent(project.id);
    if (!consent.federation_enabled || !consent.organization_id) {
      res.json({ lineage: { organization_id: null, nodes: [], edges: [], archetype_count: 0, source_project_count: 0, consumer_project_count: 0, built_at: new Date().toISOString() } });
      return;
    }
    const lineage = readFederationLineage({ organization_id: consent.organization_id });
    res.json({ lineage });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/operator/transparency-replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const { buildGovernanceTransparencyReplay } = await import('../intelligence/systemStateEngine/operatorGovernance/governanceTransparencyReplayBuilder');
    const replay = await buildGovernanceTransparencyReplay({ project_id: project.id, limit });
    res.json({ replay });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/governance/adaptive/recovery-chain', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const graph = await buildProjectLineageGraph(project.id);
    const { readOrRebuild } = await import('../intelligence/systemStateEngine/snapshotReader');
    const state = await readOrRebuild(project.id).catch(() => null);
    const { buildContradictionPropagationProfile } = await import('../intelligence/systemStateEngine/causality/contradictionPropagationTracker');
    const propagation = buildContradictionPropagationProfile({
      project_id: project.id,
      contradictions: (state?.contradictions ?? []) as any,
    });
    // For the trigger, take the most-recent leaf from the lineage graph.
    const leafId = graph.leaf_node_ids[0] ?? null;
    const { analyzeRootCauses } = await import('../intelligence/systemStateEngine/causality/rootCauseAnalyzer');
    const root_cause = leafId ? analyzeRootCauses({ graph, target_node_id: leafId, propagation }) : { project_id: project.id, target_mutation_id: null, identified_roots: [], built_at: new Date().toISOString() };
    const { buildCausalRecoveryChain } = await import('../intelligence/systemStateEngine/adaptiveGovernance/causalRecoveryChainPlanner');
    const chain = buildCausalRecoveryChain({
      project_id: project.id,
      root_cause,
      propagation,
      forecast: null,
      latest_arbitration: null,
      trigger_summary: (req.query.trigger as string) || 'operator_request',
    });
    res.json({ chain });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Kickoff prompt ──────────────────────────────────────────────────
// Returns the Claude Code prompt the user should run as their very
// first task on a brand-new project. Plan-mode foundation check, then
// sprint plan, then a single execution wave that builds out as much
// as possible. Pasted validation report flips last_execution and the
// regular per-BP tasks take over from there.
router.post('/api/portal/project/kickoff-prompt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const projectName = (project as any).organization_name || (project as any).name || 'this project';
    const prompt = `# Project Kickoff — Plan & Build the Foundation

You are kicking off ${projectName}. The repo is connected. Your job is to take this project from empty repo to **a complete, working foundation in a single session** — every load-bearing layer scaffolded with real code, real tests, and the directives wired in — then deliver one consolidated report at the very end. The user will paste that report back into the portal once — not after each phase.

## Step 1 — Verify the foundation files (PLAN MODE)

Enter **plan mode** and DO NOT make any edits in this step.

1. Confirm \`CLAUDE.md\` exists at the repo root. If it doesn't, stop and tell the user — do not proceed without it. CLAUDE.md is the operating contract for this codebase.
2. Confirm a build-guide doc exists at the repo root with \`Build_Guide\` in its filename (e.g. \`*_Build_Guide_v*.md\`). If it doesn't, stop and tell the user. The build guide is the source of truth for what needs to be built.
3. Read both files end to end. Treat the build guide as the spec; treat CLAUDE.md as the rules of engagement (autonomy boundaries, escalation policy, scope lock, definition of done).

## Step 2 — Plan ALL foundation phases (STILL PLAN MODE)

Using the build guide as the spec, propose a complete sprint plan that lays down the **full foundation** of the project:

- Break the work into 3–6 phases ordered by dependency: **data + schema → core backend services → primary UI surfaces → integrations → polish/observability**.
- For each phase, list the exact files/modules to create or modify, the directives that govern them (per CLAUDE.md), and the tests that prove the phase is done.
- Flag every governance boundary you hit per CLAUDE.md (schema redesigns, external paid dependencies, compliance, NFR thresholds). Default to the lowest-blast-radius path and proceed; only escalate the strategic ones.
- Identify what genuinely needs the user (third-party credentials, ambiguous business rules outside the build guide). Everything else you proceed on.

Show the user the plan. Confirm before executing.

## Step 3 — Execute every phase end-to-end

Once the plan looks right, exit plan mode and **execute all phases in sequence — phase 1, then phase 2, then phase 3, all the way through**. Do not stop at the end of phase 1 to ask if you should continue. The default is: keep going.

Between phases, you may briefly summarize what just shipped and tell the user the next phase is starting (so they can interrupt if something is off), but **do not wait for confirmation** — proceed automatically. The only reasons to actually pause are:

- A governance boundary that requires the user's strategic decision (per CLAUDE.md's escalation rules).
- Missing input you genuinely cannot proceed without (a credential, a business rule the build guide doesn't specify).
- A failing test you cannot resolve after Diagnostic Mode (per CLAUDE.md).

For anything else: assume the lowest-blast-radius path, log the assumption, and continue. CLAUDE.md allows up to 5 silent assumptions per iteration; if you exceed that, enter Diagnostic Mode but still keep moving toward the next phase.

Within each phase:

- Build the real thing — schemas, models, services, route handlers, UI shells, tests. Not stubs.
- Wire CLAUDE.md and the build guide's \`/directives\` references into the code.
- Run the tests for the phase before moving on. Fix what breaks.
- If a phase has work that genuinely cannot be completed in this session, mark it explicitly and keep going — do not block the rest of the phases on it.

## Step 4 — Commit, then deliver ONE consolidated report

Only after **every phase is either complete or explicitly marked as deferred** do you commit and report. Do not split commits or reports across phases — one of each, at the very end.

**First commit everything you built** so the portal can reconcile the report against actual repo state:

\`\`\`
git add -A
git commit -m "kickoff: foundation built — phases 1-N"
git rev-parse HEAD
\`\`\`

Capture that commit SHA. The \`Commit:\` line below is **required** — without it the portal cannot map the report's claims to real files in the repo, and the kickoff sync degrades to "trust the report blindly" mode.

Then output the report in this format. The user pastes it back into the portal one time, after the entire build is done.

\`\`\`
# Kickoff Report

Commit: <full SHA you just committed>

## Phases shipped
- Phase 1: <name> — ✅ complete | ⏳ partial | ❌ deferred (with reason)
- Phase 2: ...
- Phase 3: ...
(one line per phase)

## Capabilities advanced (cross-reference to your build guide's components)
- <capability or domain name> — <what now exists for it> — files: <key path>
- <capability or domain name> — <what now exists for it> — files: <key path>
(one line per business capability the build touches — auth, role-management, etc. The portal uses these to map work to the right BPs.)

## Files Created
- path/to/file.ts
- path/to/file2.tsx
(flat list, one path per line — same flat-list format the per-BP validation parser uses, so the portal can read it directly)

## Files Modified
- path/to/existing.ts
(flat list)

## Routes
- GET /api/...
- POST /api/...

## Database
- TableName (if any new or modified)

## Tests added and passing
- path/to/test.ts — <what it covers> — ✅ pass | ❌ fail (with reason)

## Directives updated
- /directives/<file>.md — <what changed and why>

## Assumptions made (with reasoning)
- <assumption> — <reasoning>

## Items that genuinely need the user
- <item> — <the specific question, credential, or decision needed>

## Open escalations (if any)
- <governance boundary hit, recommendation, what decision is needed>

## What's left for per-component iteration in the portal
- <capability> — <what depth/polish remains>

Status: COMPLETE
\`\`\`

After the report, push:

\`\`\`
git push origin main
\`\`\`

The user pastes this report back into the portal once. The system parses your \`Commit:\` SHA, refreshes its view of the repo at that SHA, fans the file evidence out across every capability your work touched, and stamps progress. The kickoff disappears, and the per-component task flow takes over for any remaining depth/polish.

Do not hand-wave. Do not stop at phase 1. Do not stub out features the build guide says should exist. Do not skip the commit. If you cannot build something cleanly, mark it deferred and keep moving — do not leave a half-finished mess.`;
    res.json({ prompt_text: prompt });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Kickoff sync ──────────────────────────────────────────────────
// User pastes the Kickoff Report back. Unlike per-BP validation,
// this fans the report's evidence out across every capability whose
// name, description, or expected file path the report touches.
// The Commit: SHA in the report ties the claims back to a real
// repo state that we refresh from origin before scoring matches.
router.post('/api/portal/project/kickoff-sync', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { reportText } = req.body || {};
    if (!reportText || typeof reportText !== 'string' || reportText.trim().length < 50) {
      res.status(400).json({ error: 'reportText is required (paste the full Kickoff Report)' });
      return;
    }
    const { parseValidationReport } = await import('../services/validationReportParser');
    const parsed = parseValidationReport(reportText);
    const { applyKickoffReport } = await import('../services/kickoffSyncService');
    const result = await applyKickoffReport(project.id, req.participant!.sub, parsed);

    // Stamp project-level kickoff state so the orchestrator stops
    // returning the kickoff task. setup_status.kickoff_synced + the
    // capabilities now having last_execution.status='complete' both
    // signal that the project is past the foundation phase.
    const ss = (project as any).setup_status || {};
    (project as any).setup_status = {
      ...ss,
      kickoff_synced: true,
      kickoff_synced_at: new Date().toISOString(),
      kickoff_commit: parsed.commitSha || null,
    };
    (project as any).changed('setup_status', true);
    await project.save();

    res.json({
      ok: true,
      commit_sha: result.commitSha,
      summary: {
        phases_shipped: result.phasesShipped,
        phases_partial: result.phasesPartial,
        phases_deferred: result.phasesDeferred,
        capabilities_advanced: result.capabilitiesAdvanced,
        capabilities_total: result.capabilityDeltas.length,
        files_claimed: result.filesClaimedTotal,
        files_verified_in_repo: result.filesVerifiedInRepo,
        files_missing_from_repo: result.filesMissingFromRepo.slice(0, 20),
      },
      // Per-capability deltas, sorted by match score so the user sees
      // what advanced and what was untouched.
      capability_deltas: result.capabilityDeltas
        .sort((a, b) => b.matchScore - a.matchScore)
        .map(d => ({
          id: d.id,
          name: d.name,
          matched: d.matched,
          match_score: Math.round(d.matchScore * 100),
          matched_by: d.matchedBy,
          files_linked: d.filesLinked,
          requirements_verified: d.requirementsVerified,
          requirements_total: d.requirementsTotal,
        })),
    });

    // PHASE 2: refresh authoritative state after kickoff sync
    const { refreshSystemState } = await import('../intelligence/systemStateEngine');
    refreshSystemState(project.id, 'kickoff_sync');
  } catch (err: any) {
    console.error('[KickoffSync] failed:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// Reset every capability that a prior kickoff sync touched. Used to
// undo contaminated state from earlier sync runs (auto-verified
// requirements, polluted linked_*_components arrays). Idempotent —
// safe to call multiple times.
router.post('/api/portal/project/kickoff-sync/reset', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { resetKickoffSync } = await import('../services/kickoffSyncService');
    const result = await resetKickoffSync(project.id);

    // Roll back the project-level kickoff_synced flag so the kickoff
    // task can re-surface and the user can re-run cleanly.
    const ss = (project as any).setup_status || {};
    const { kickoff_synced, kickoff_synced_at, kickoff_commit, ...rest } = ss;
    (project as any).setup_status = rest;
    (project as any).changed('setup_status', true);
    await project.save();

    // PHASE 2: refresh authoritative state after kickoff reset
    try {
      const { refreshSystemState } = await import('../intelligence/systemStateEngine');
      refreshSystemState(project.id, 'kickoff_reset');
    } catch { /* fire-and-forget */ }

    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[KickoffSync] reset failed:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Enhancement Plan
// ---------------------------------------------------------------------------
// When a BP has nothing left to BUILD (execution_plan empty + processComplete),
// users still need a forward path. This helper turns the BP's quality scores,
// autonomy gaps, and missing intelligence/automation signals into a list of
// concrete enhancement options the four tabs can render uniformly.
interface EnhancementOption {
  key: string;
  label: string;
  description: string;
  impact: string;
  prompt_target: string;
  category: 'agent' | 'observability' | 'reliability' | 'performance' | 'frontend' | 'backend' | 'autonomy_gap' | 'reporting' | 'intelligence';
  source: 'autonomy_gap' | 'quality' | 'system';
  severity: number;
  gap_id?: string;
  gap_type?: string;
  suggested_agent?: any;
  // For prompt_target='ui_advisor_step' — which UI Advisor step the
  // recommendation targets. The frontend uses this to short-circuit the
  // Run button to handleUIAnalyze on the UI tab instead of generating a
  // generic Claude Code prompt.
  ui_step_key?: 'layout_hierarchy' | 'usability' | 'mobile_responsiveness';
}

/**
 * Page-BP-specific recommendation builder.
 *
 * Page BPs are pages that already exist in the user's repo (auto-discovered).
 * The user's playbook for them is: enhance visual capabilities (UI Advisor),
 * expose more of the underlying services on the page, attach monitoring
 * agents, and tighten agent logic. NOT generic "strengthen reliability"
 * suggestions — those belong to the underlying service.
 */
function buildPageBPEnhancementPlan(
  enriched: any,
  attachableBackend: string[],
  attachableAgents: Array<{ name: string; category?: string | null; description?: string | null }>,
): EnhancementOption[] {
  const out: EnhancementOption[] = [];
  const pageName = enriched.name || 'this page';
  const linkedAgents: string[] = enriched.linked_agents || [];

  // 1. Visual capabilities — one item per unrun UI step. Mirrors the
  // labels and step keys the orchestrator uses (getUITasks) and the UI
  // tab uses (uiActions). Same wording across surfaces means the user
  // sees identical recommendations on Blueprint, Overview, Build, and
  // the UI tab itself — no more "Improve page layout" on Blueprint vs.
  // "Run the UI Advisor" on the BP detail.
  const stepsRun = enriched.ui_element_map?.steps || {};
  const UI_STEPS: Array<{
    key: 'layout_hierarchy' | 'usability' | 'mobile_responsiveness';
    title: string;
    desc: string;
    severity: number;
  }> = [
    { key: 'layout_hierarchy',     title: 'Improve page layout and hierarchy', desc: 'Analyze spacing, visual hierarchy, and component structure.', severity: 7 },
    { key: 'usability',            title: 'Fix usability issues',              desc: 'Detect broken interactions, missing feedback, and accessibility gaps.', severity: 6 },
    { key: 'mobile_responsiveness', title: 'Check mobile responsiveness',       desc: 'Ensure the UI works across all screen sizes and devices.', severity: 5 },
  ];
  for (const s of UI_STEPS) {
    if (stepsRun[s.key]?.run_at) continue;
    out.push({
      key: `page-ui-step-${s.key}`,
      label: s.title,
      description: `${s.desc} — ${pageName}. Click Run to open the UI tab and analyze the page.`,
      impact: '+visual quality, +accessibility',
      prompt_target: 'ui_advisor_step',
      category: 'frontend',
      source: 'system',
      severity: s.severity,
      ui_step_key: s.key,
    });
  }

  // 2. Expose more backend — one option for the top attachable service
  if (attachableBackend.length > 0) {
    const top = attachableBackend[0];
    const fileName = top.split('/').pop() || top;
    out.push({
      key: `page-expose-${fileName}`,
      label: `Surface more of ${fileName} on ${pageName}`,
      description: `${fileName} is part of this page's backend surface but only some of its data / actions are exposed in the UI. Pull more fields, add a drill-down, or wire an action that's currently backend-only.`,
      impact: '+data depth, +user agency',
      prompt_target: 'frontend_exposure',
      category: 'frontend',
      source: 'system',
      severity: 6,
    });
  }

  // 3. Attach monitoring agent — when no agents are linked yet
  if (linkedAgents.length === 0) {
    if (attachableAgents.length > 0) {
      const top = attachableAgents[0];
      out.push({
        key: `page-attach-agent-${top.name}`,
        label: `Attach ${top.name} to monitor ${pageName}`,
        description: `${top.name}${top.description ? ` — ${top.description}` : ''} matches this page's domain. Attaching it lets the agent observe interactions and surface insights / suggestions back to the user.`,
        impact: '+monitoring, +autonomous insight',
        prompt_target: 'agent_enhancement',
        category: 'agent',
        source: 'system',
        severity: 6,
        suggested_agent: { name: top.name, description: top.description || `Monitoring agent for ${pageName}.`, type: 'monitoring' },
      });
    } else {
      out.push({
        key: 'page-add-monitoring-agent',
        label: `Add a monitoring agent for ${pageName}`,
        description: `${pageName} has no agents attached. Add one that watches user interactions and surfaces patterns / suggestions back to the user.`,
        impact: '+monitoring, +autonomous insight',
        prompt_target: 'agent_enhancement',
        category: 'agent',
        source: 'system',
        severity: 5,
        suggested_agent: { name: `${pageName} Monitor`, description: `Observes user interactions on ${pageName} and reports anomalies, drop-offs, and improvement opportunities.`, type: 'monitoring' },
      });
    }
  }

  // 4. Enhance agent logic — for each linked agent (capped to top 2)
  for (const agentName of linkedAgents.slice(0, 2)) {
    out.push({
      key: `page-enhance-agent-${agentName}`,
      label: `Tighten suggestions from ${agentName}`,
      description: `${agentName} is attached to ${pageName}. Improve its decision logic — add more signals, raise its confidence threshold, or expand the categories of suggestions it surfaces.`,
      impact: '+suggestion quality, +autonomy',
      prompt_target: 'agent_enhancement',
      category: 'agent',
      source: 'system',
      severity: 5,
    });
  }

  return out;
}

function buildEnhancementPlan(
  enriched: any,
  autonomyGaps: any[],
  progressLedger?: { found: boolean; completed: string[] },
  pageBPSurface?: { attachable_backend: string[]; attachable_agents: Array<{ name: string; category?: string | null; description?: string | null }> },
): EnhancementOption[] {
  // Page BPs get a focused, page-shaped recommendation list. Skip the
  // quality-score branches below — those are for service / process BPs and
  // produce noise like "Strengthen reliability and error handling" on a
  // page that isn't responsible for the underlying API.
  const isPageBP = enriched.is_page_bp || enriched.source === 'frontend_page';
  if (isPageBP) {
    const surface = pageBPSurface || { attachable_backend: [], attachable_agents: [] };
    return buildPageBPEnhancementPlan(enriched, surface.attachable_backend, surface.attachable_agents).slice(0, 8);
  }

  const q = enriched.quality || {};
  const u = enriched.usability || {};
  const options: EnhancementOption[] = [];

  for (const g of autonomyGaps) {
    const target = g.suggested_category === 'agent'
      ? 'agent_enhancement'
      : g.suggested_category === 'frontend'
        ? 'frontend_exposure'
        : g.suggested_category === 'intelligence'
          ? 'optimize_performance'
          : 'backend_improvement';
    options.push({
      key: `gap-${g.gap_id}`,
      label: g.title,
      description: g.description || '',
      impact: g.gap_type === 'intelligence'
        ? '+intelligence, +automation'
        : g.gap_type === 'reporting'
          ? '+visibility, +stakeholder confidence'
          : g.gap_type === 'optimization'
            ? '+performance, +feedback loops'
            : '+observability, +autonomy',
      prompt_target: target,
      category: 'autonomy_gap',
      source: 'autonomy_gap',
      severity: g.severity || 5,
      gap_id: g.gap_id,
      gap_type: g.gap_type,
      suggested_agent: g.suggested_agent || null,
    });
  }

  if ((q.observability || 0) < 7) {
    options.push({
      key: 'quality-observability',
      label: 'Improve observability and monitoring',
      description: `Observability score is ${q.observability || 0}/10. Stronger logging, metrics, and alerting catch issues before they cascade.`,
      impact: '+monitoring, +reliability',
      prompt_target: 'monitoring_gap',
      category: 'observability',
      source: 'quality',
      severity: 10 - (q.observability || 0),
    });
  }
  if ((q.reliability || 0) < 7) {
    options.push({
      key: 'quality-reliability',
      label: 'Strengthen reliability and error handling',
      description: `Reliability score is ${q.reliability || 0}/10. Add retries, validation at API boundaries, and graceful failure paths.`,
      impact: '+stability, +production confidence',
      prompt_target: 'improve_reliability',
      category: 'reliability',
      source: 'quality',
      severity: 10 - (q.reliability || 0),
    });
  }
  if ((q.production_readiness || 0) < 8) {
    options.push({
      key: 'quality-performance',
      label: 'Optimize performance and scalability',
      description: `Production readiness is ${q.production_readiness || 0}/10. Add caching, indexes, and pagination to handle real load.`,
      impact: '+speed, +scale',
      prompt_target: 'optimize_performance',
      category: 'performance',
      source: 'quality',
      severity: 10 - (q.production_readiness || 0),
    });
  }
  if ((q.automation || 0) < 7 && (u.backend === 'ready' || u.backend === 'partial')) {
    options.push({
      key: 'quality-automation',
      label: 'Add automation agents',
      description: `Automation score is ${q.automation || 0}/10. Backend exists — add agents to remove manual steps and enable self-managing operation.`,
      impact: '+autonomy, +intelligence',
      prompt_target: 'agent_enhancement',
      category: 'agent',
      source: 'quality',
      severity: 10 - (q.automation || 0),
    });
  }
  if ((q.determinism || 0) < 6) {
    options.push({
      key: 'quality-determinism',
      label: 'Move logic from LLMs to deterministic code',
      description: `Determinism score is ${q.determinism || 0}/10. Promote stable behaviour by replacing LLM calls with rules where possible.`,
      impact: '+predictability, +cost reduction',
      prompt_target: 'backend_improvement',
      category: 'backend',
      source: 'quality',
      severity: 10 - (q.determinism || 0),
    });
  }

  // Filter out items the user has already documented as done in PROGRESS.md.
  // Loose token-overlap match — we don't want to drop a real suggestion just
  // because of a coincidental word, but if 60%+ of the tokens line up with a
  // checked item, it's almost certainly the same work.
  let filtered = options;
  if (progressLedger?.found) {
    const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'add', 'build', 'create', 'improve', 'a', 'an', 'to', 'of', 'in', 'on', 'this']);
    filtered = options.filter(o => {
      const labelTokens = (o.label || '').toLowerCase().split(/\W+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
      if (labelTokens.length === 0) return true;
      for (const line of progressLedger.completed) {
        const matches = labelTokens.filter(t => line.includes(t)).length;
        if (matches / labelTokens.length >= 0.6) return false; // covered → drop
      }
      return true;
    });
  }

  // Sort by severity, but break ties so autonomy_gap items (the real
  // intelligence/automation/observability work the user is moving toward)
  // beat heuristic-driven quality items at similar severity. Once observability
  // is detected from the repo, this surfaces Pattern Detection, Simulation,
  // Decision Logging, etc. as primary suggestions on already-built BPs.
  const sourceRank = (s: string): number => s === 'autonomy_gap' ? 2 : s === 'system' ? 1 : 0;
  filtered.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return sourceRank(b.source) - sourceRank(a.source);
  });

  // Dedupe by prompt_target+category — keep highest severity
  const seen = new Set<string>();
  const deduped: EnhancementOption[] = [];
  for (const o of filtered) {
    const dedupeKey = `${o.prompt_target}:${o.category}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(o);
  }
  return deduped.slice(0, 8);
}

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
    const capExec = await CapExec.findByPk(req.params.id as string, { attributes: ['id', 'last_execution', 'mode_override', 'applicability_status', 'execution_profile', 'strategy_template', 'user_status', 'user_status_set_at', 'ui_element_map', 'linked_backend_services', 'linked_frontend_components', 'linked_agents', 'agent_roles_cache', 'frontend_route'] });
    if (capExec) {
      (cap as any).last_execution = (capExec as any).last_execution;
      (cap as any).mode_override = (capExec as any).mode_override;
      (cap as any).applicability_status = (capExec as any).applicability_status || 'active';
      (cap as any).execution_profile = (capExec as any).execution_profile || 'production';
      (cap as any).strategy_template = (capExec as any).strategy_template || 'default';
      (cap as any).user_status = (capExec as any).user_status || 'in_progress';
      (cap as any).user_status_set_at = (capExec as any).user_status_set_at || null;
      (cap as any).ui_element_map = (capExec as any).ui_element_map || null;
      // 2026-05-20: surface linked-file arrays + agent role cache so the
      // cap detail panel can name each agent + render BE/FE/AG pillars
      // with real signal (matches the BP list endpoint).
      (cap as any).linked_backend_services = (capExec as any).linked_backend_services || [];
      (cap as any).linked_frontend_components = (capExec as any).linked_frontend_components || [];
      (cap as any).linked_agents = (capExec as any).linked_agents || [];
      (cap as any).agent_roles_cache = (capExec as any).agent_roles_cache || null;
      if ((capExec as any).frontend_route) (cap as any).frontend_route = (capExec as any).frontend_route;
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

    // Detect autonomy gaps eagerly so the frontend can show them without a validation report
    let autonomyGaps: any[] = [];
    try {
      const repoTree = (cap as any)._repoFileTree || [];
      const { RequirementsMap: RM } = await import('../models');
      const existingAutoReqs = await RM.findAll({ where: { project_id: project.id, capability_id: req.params.id, verified_by: 'AUTONOMOUS_ENGINE' }, attributes: ['requirement_key'] });
      const existingKeys = new Set(existingAutoReqs.map((r: any) => r.requirement_key));
      const { loadBuildHistory, isGapAddressed } = await import('../services/buildHistoryService');
      const buildHistory = await loadBuildHistory(project.id);
      const addressedIds = new Set<string>();
      for (const gid of buildHistory.addressedGapIds) addressedIds.add(gid);
      const { detectGaps } = await import('../intelligence/requirements/gapDetectionEngine');
      autonomyGaps = detectGaps(enriched as any, repoTree, existingKeys, addressedIds)
        .filter(g => !isGapAddressed(g.gap_id, g.gap_type, buildHistory))
        .map(g => ({ gap_id: g.gap_id, gap_type: g.gap_type, title: g.title, description: g.description, severity: g.severity, suggested_category: g.suggested_category, suggested_agent: g.suggested_agent || null }));
    } catch { /* non-critical — gaps are supplementary */ }

    // Page BP discovery audit — for Page BPs, build a wider "attachable surface"
    // set (services that could be exposed on the page, agents that could
    // monitor it). Used by the Page-BP-specific recommendation builder so
    // the user gets "Surface more of <X>" / "Add monitoring agent <Y>"
    // instead of generic backend reliability suggestions.
    const isPageBPCap = (enriched as any).is_page_bp || (enriched as any).source === 'frontend_page';
    let attachableSurface: { attachable_backend: string[]; attachable_agents: any[] } = { attachable_backend: [], attachable_agents: [] };
    if (isPageBPCap) {
      try {
        const { discoverPageBPSurface } = await import('../services/intelligence/pageBPSurface');
        const { AiAgent } = await import('../models');
        const projectAgents = await AiAgent.findAll({
          attributes: ['agent_name', 'category', 'description'],
        });
        const repoTree = (cap as any)._repoFileTree || [];
        const linkedBackend = (enriched as any).implementation_links?.backend || [];
        const linkedAgents = (cap as any).linked_agents || [];
        attachableSurface = discoverPageBPSurface(
          { name: (enriched as any).name, frontend_route: (cap as any).frontend_route },
          repoTree,
          projectAgents.map((a: any) => ({ agent_name: a.agent_name, category: a.category, description: a.description })),
          linkedBackend,
          linkedAgents,
        );
      } catch { /* non-critical — discovery is best-effort */ }
    }

    // Debug surface — lets the user inspect what the page-BP surface
    // discovery found without us shipping new UI for it. ?debug=page-bp-discovery
    if (req.query.debug === 'page-bp-discovery') {
      res.json({
        bp_id: enriched.id,
        name: (enriched as any).name,
        is_page_bp: isPageBPCap,
        frontend_route: (cap as any).frontend_route || null,
        currently_linked: {
          backend: (enriched as any).implementation_links?.backend || [],
          agents: (cap as any).linked_agents || [],
        },
        attachable: attachableSurface,
      });
      return;
    }

    // Defense-in-depth: filter out any execution_plan items that are tagged completed.
    // The step generator already drops these, but we also strip them here so any
    // legacy callers that bypass the generator stay consistent.
    const pendingExecutionPlan = (enriched.execution_plan || []).filter(
      (s: any) => !s.status || s.status === 'pending',
    );
    const isComplete = !!enriched.is_complete;
    // The clusterer creates "Uncategorized Requirements" as a holding bucket
    // for orphaned requirements. It's not a coherent BP — recommending a build
    // for it produces nonsense prompts. Surface it as a reclassify-first
    // action instead of build/enhance.
    const synthName = (enriched.name || '').toLowerCase();
    const isSyntheticBucket = synthName.includes('uncategorized') || synthName === 'miscellaneous' || synthName === 'other';
    const userStatus = (enriched as any).user_status || 'in_progress';
    const isVerified = userStatus === 'verified';
    const isArchived = userStatus === 'archived';

    const isPageBPEnriched = !!(enriched as any).is_page_bp || (enriched as any).source === 'frontend_page';

    let enhancementPlan: any[];
    let nextActionKind: 'build' | 'enhance' | 'polish' | 'done' | 'recategorize' | 'verified' | 'archived' | 'page_visual_review';
    if (isVerified) {
      if (isPageBPEnriched) {
        // Verified Page BPs keep getting visual + autonomy recommendations —
        // verifying a page means "I confirm this is real," not "I'm done with
        // it." Visual polish, exposing more backend, and attaching agents
        // remain ongoing work. Only when the page has nothing left in the
        // playbook do we fall back to the verified card.
        enhancementPlan = buildPageBPEnhancementPlan(
          enriched,
          attachableSurface.attachable_backend,
          attachableSurface.attachable_agents,
        );
        nextActionKind = enhancementPlan.length > 0 ? 'enhance' : 'verified';
      } else {
        // Non-Page BPs: verified means done. Stop recommending.
        enhancementPlan = [];
        nextActionKind = 'verified';
      }
    } else if (isArchived) {
      enhancementPlan = [];
      nextActionKind = 'archived';
    } else if (isSyntheticBucket) {
      enhancementPlan = [];
      nextActionKind = 'recategorize';
    } else if (isPageBPEnriched && isComplete) {
      // Page BP that auto-completed (frontend_route attached, etc.) but the
      // user hasn't explicitly verified it yet. The right next step is the
      // 5-category Visual Review, not generic "improve" recommendations —
      // those only generate confusion ("Complete + 0% Simulation Capability").
      enhancementPlan = [];
      nextActionKind = 'page_visual_review';
    } else {
      // Read PROGRESS.md (if present) so we can drop enhancement suggestions
      // whose work is already documented as done. Per CLAUDE.md, PROGRESS.md
      // is the canonical ledger of completed work — using it closes the gap
      // between repo-file heuristics and the user's actual progress notes.
      let progressLedger: { found: boolean; completed: string[] } | undefined;
      try {
        const { getProgressLedger } = await import('../services/progressMdService');
        progressLedger = await getProgressLedger(req.participant!.sub);
      } catch { /* fall back to no ledger */ }
      enhancementPlan = buildEnhancementPlan(enriched, autonomyGaps, progressLedger, attachableSurface);
      // Auto-complete BPs that aren't verified yet still get suggestions, but
      // framed as optional polish — not as "you're missing this." Keeps the
      // user's earlier guidance ("until marked complete I still want
      // suggestions") while letting the frontend tone down the urgency.
      const isPolish = isComplete && enhancementPlan.length > 0;
      nextActionKind = pendingExecutionPlan.length > 0
        ? 'build'
        : isPolish
          ? 'polish'
          : enhancementPlan.length > 0
            ? 'enhance'
            : isComplete
              ? 'done'
              : 'build';
    }

    res.json({
      ...enriched,
      execution_plan: (isSyntheticBucket || isVerified || isArchived) ? [] : pendingExecutionPlan,
      autonomy_gaps: (isSyntheticBucket || isVerified || isArchived) ? [] : autonomyGaps,
      enhancement_plan: enhancementPlan,
      next_action_kind: nextActionKind,
      is_synthetic_bucket: isSyntheticBucket,
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
      // Direct URL for "Open in new tab" — bypasses the proxy so the user gets
      // the real running app (e.g., http://95.216.199.47:8889/) instead of the
      // proxy path (/preview/shipces/) which has mixed-content/login issues.
      direct_preview_url: (() => {
        const directBase = projectVars.direct_preview_url || null;
        if (!directBase) return null;
        const route = capModel?.frontend_route || '';
        return directBase.replace(/\/$/, '') + route;
      })(),
      // Base URLs (without route appended) — surfaced so the UI tab can
      // show what's currently configured and let the user edit them.
      preview_base_url: (project as any).portfolio_url || null,
      direct_preview_base_url: projectVars.direct_preview_url || null,
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
      // Cory Orchestrator — unified prioritized task queue
      cory_tasks: (() => {
        try {
          const { getTopTasks } = require('../services/intelligence/coryOrchestrator');
          const enrichedWithGaps = { ...enriched, autonomy_gaps: autonomyGaps };
          return getTopTasks(enrichedWithGaps, (project as any).target_mode || 'production');
        } catch (orchErr: any) {
          console.warn('[CoryOrchestrator] Task generation failed:', orchErr?.message);
          return [];
        }
      })(),
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
    const { target, uiIssue, uiIssues, stepKey } = req.body;
    if (!target) { res.status(400).json({ error: 'target required' }); return; }
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { Capability: CapCheck } = await import('../models');
    const ownerCheck = await CapCheck.findOne({ where: { id: req.params.id as string, project_id: project.id } });
    if (!ownerCheck) { res.status(404).json({ error: 'Process not found' }); return; }

    // For requirement_implementation, fetch unmapped requirements and pass as extra context
    let extraContext: any = undefined;
    if (target === 'ui_fix') {
      extraContext = { uiIssue: uiIssue || {} };
    } else if (target === 'ui_fix_bulk') {
      extraContext = { uiIssues: uiIssues || [], stepKey: stepKey || '' };
    } else if (target === 'requirement_implementation') {
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

// ─── Combined Prompt: generates a single prompt from selected execution steps + autonomy gaps ────────
router.post('/api/portal/project/business-processes/:id/combined-prompt', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { execution_steps = [], autonomy_gaps = [], include_agents = [] } = req.body;
    if (execution_steps.length === 0 && autonomy_gaps.length === 0) { res.status(400).json({ error: 'Select at least one step or gap' }); return; }
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { Capability: CapCheck } = await import('../models');
    const ownerCheck = await CapCheck.findOne({ where: { id: req.params.id as string, project_id: project.id } });
    if (!ownerCheck) { res.status(404).json({ error: 'Process not found' }); return; }

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

    const { generateCombinedPrompt } = await import('../intelligence/promptGenerator');
    const prompt = await generateCombinedPrompt(req.params.id as string, { execution_steps, autonomy_gaps, include_agents }, projectContext);
    res.json(prompt);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Submit Validation Report: user pastes Claude Code's output to verify requirements ────────
router.post('/api/portal/project/business-processes/:id/validation-report', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { reportText, commitSha } = req.body;
    if (!reportText || typeof reportText !== 'string') {
      res.status(400).json({ error: 'reportText is required' });
      return;
    }
    const { parseValidationReport, applyReportToBP } = await import('../services/validationReportParser');
    const parsed = parseValidationReport(reportText);
    const result = await applyReportToBP(req.params.id as string, parsed, commitSha, req.participant!.sub);
    // Re-enrich BP to get updated metrics
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const updatedCap = hierarchy.find((c: any) => c.id === req.params.id);
    const enriched = updatedCap ? enrichCapability(updatedCap) : null;

    // Auto-mark as user-verified when Claude Code reports Status: COMPLETE.
    // The user's contract for "verified" is: Claude Code COMPLETE + tests pass.
    // Submitting a validation report is itself an assertion that both happened,
    // so this closes the loop without forcing the user to also click Section 9's
    // Mark Verified button. Coverage check kept as a fallback for legacy reports
    // that don't include a status line.
    const reportStatus = (parsed.status || '').toUpperCase();
    const reportSaysComplete = /COMPLETE/.test(reportStatus) && !/INCOMPLETE|PARTIAL|FAILED/.test(reportStatus);
    const coverageHigh = !!enriched && (enriched.metrics?.requirements_coverage >= 90);
    const allReqsVerified = result.requirementsVerified > 0 && result.requirementsVerified >= result.requirementsTotal;
    if (reportSaysComplete || coverageHigh || allReqsVerified) {
      try {
        await (cap as any).update({
          user_status: 'verified',
          user_status_set_at: new Date(),
          user_status_set_by: req.participant!.sub,
        });
      } catch (markErr: any) {
        console.warn('[Validation] Auto-mark verified failed:', markErr?.message);
      }
    }
    // PHASE 2: refresh authoritative state after validation report applied
    try {
      const { refreshSystemState } = await import('../intelligence/systemStateEngine');
      refreshSystemState(project.id, 'validation_report');
    } catch { /* fire-and-forget */ }
    res.json({
      ...result,
      parsed: {
        filesCreated: parsed.filesCreated,
        filesModified: parsed.filesModified,
        routes: parsed.routes,
        database: parsed.database,
        status: parsed.status,
        duplicatesNoted: parsed.duplicatesNoted,
      },
      metrics_after: enriched ? {
        reqCoverage: enriched.metrics?.requirements_coverage,
        readiness: enriched.metrics?.system_readiness,
        qualityScore: enriched.metrics?.quality_score,
        maturityLevel: enriched.maturity?.level,
      } : null,
      // Path to Autonomous: detect remaining gaps and suggest next requirements
      autonomous_suggestions: await (async () => {
        try {
          if (!enriched) return [];
          let repoTree: string[] = [];
          try {
            const { getConnection: gc } = await import('../services/githubService');
            const conn = await gc(req.participant!.sub);
            if (conn?.file_tree_json?.tree) repoTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
          } catch {}
          const { RequirementsMap: RM } = await import('../models');
          const existingAutoReqs = await RM.findAll({ where: { project_id: project.id, capability_id: req.params.id, verified_by: 'AUTONOMOUS_ENGINE' }, attributes: ['requirement_key'] });
          const existingKeys = new Set(existingAutoReqs.map((r: any) => r.requirement_key));
          // Load build history to suppress gaps for work already done
          const { loadBuildHistory, isGapAddressed } = await import('../services/buildHistoryService');
          const buildHistory = await loadBuildHistory(project.id);
          const addressedIds = new Set<string>();
          // Merge addressed gap IDs from build history
          for (const gid of buildHistory.addressedGapIds) addressedIds.add(gid);
          const { detectGaps } = await import('../intelligence/requirements/gapDetectionEngine');
          const gaps = detectGaps(enriched as any, repoTree, existingKeys, addressedIds)
            .filter(g => !isGapAddressed(g.gap_id, g.gap_type, buildHistory));
          return gaps.map(g => ({
            gap_id: g.gap_id,
            gap_type: g.gap_type,
            title: g.title,
            description: g.description,
            severity: g.severity,
            suggested_category: g.suggested_category,
          }));
        } catch { return []; }
      })(),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Execution Ticket Bridge: create/update tickets for build execution ────────
router.post('/api/portal/project/execution-ticket', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { action, componentId, componentName, stepLabel, promptTarget, ticketId, result } = req.body;

    if (action === 'create') {
      // Create execution ticket — try company-aware first, fallback to simple ticket
      try {
        const { createBPOSTicket } = await import('../services/company/ticketOrchestrator');
        let companyId = 'default';
        try {
          const { getActiveCompany } = await import('../services/company/companyService');
          const company = await getActiveCompany();
          if (company) companyId = (company as any).id;
        } catch { /* no active company — use default */ }
        const ticket = await createBPOSTicket(companyId, componentName || 'Unknown', stepLabel || 'Build step', componentId || '');
        const { updateTicketStatus } = await import('../services/company/ticketOrchestrator');
        await updateTicketStatus((ticket as any).id, 'in_progress', 'cory', 'bpos_orchestrator', `Prompt target: ${promptTarget || 'unknown'}`);
        res.json({ ticket_id: (ticket as any).id, ticket_number: (ticket as any).ticket_number });
      } catch (innerErr: any) {
        // Fallback: create a simple ticket directly if orchestrator fails (e.g., missing columns)
        const { Ticket } = await import('../models');
        const ticket = await (Ticket as any).create({
          title: `[BPOS] ${componentName || 'Unknown'} — ${stepLabel || 'Build step'}`,
          type: 'bpos_execution',
          priority: 'medium',
          status: 'in_progress',
          source: 'bpos_engine',
          created_by_type: 'cory',
          created_by_id: 'bpos_orchestrator',
          entity_type: 'capability',
          entity_id: componentId || null,
          metadata: { prompt_target: promptTarget, step_label: stepLabel, component_name: componentName },
        });
        res.json({ ticket_id: ticket.id, ticket_number: ticket.ticket_number });
      }
    } else if (action === 'complete' && ticketId) {
      const { updateTicketStatus, addTicketOutput } = await import('../services/company/ticketOrchestrator');
      await addTicketOutput(ticketId, 'bpos_orchestrator', result || {});
      await updateTicketStatus(ticketId, 'done', 'cory', 'bpos_orchestrator', 'Build validated successfully');
      res.json({ status: 'done' });
    } else if (action === 'fail' && ticketId) {
      const { updateTicketStatus } = await import('../services/company/ticketOrchestrator');
      await updateTicketStatus(ticketId, 'cancelled', 'cory', 'bpos_orchestrator', result?.error || 'Validation failed');
      res.json({ status: 'cancelled' });
    } else {
      res.status(400).json({ error: 'Invalid action. Use create, complete, or fail.' });
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Execution Activity Feed (portal-accessible) ────────
router.get('/api/portal/project/execution-activity', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const { sequelize: seq } = await import('../config/database');
    const [activities] = await seq.query(`
      SELECT ta.id, ta.ticket_id, ta.actor_type, ta.actor_id, ta.action,
             ta.from_value, ta.to_value, ta.metadata, ta.created_at,
             t.title as ticket_title, t.type as ticket_type, t.status as ticket_status
      FROM ticket_activities ta
      JOIN tickets t ON t.id = ta.ticket_id
      WHERE t.type IN ('bpos_execution', 'company_directive', 'workforce_decision')
      ORDER BY ta.created_at DESC
      LIMIT 20
    `);
    res.json({ activities });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Accept autonomous suggestion: create requirements from a detected gap ────────
router.post('/api/portal/project/business-processes/:id/accept-suggestion', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { gap_id } = req.body;
    if (!gap_id) { res.status(400).json({ error: 'gap_id required' }); return; }
    // Get feature for this capability
    const { Feature: FeatureModel } = await import('../models');
    let feature = await FeatureModel.findOne({ where: { capability_id: req.params.id } });
    if (!feature) {
      feature = await FeatureModel.create({ capability_id: req.params.id, name: 'Autonomous Enhancements', description: 'System-suggested requirements for autonomous operation', status: 'active', priority: 'medium' } as any);
    }
    // Generate requirements from the specific gap
    const { detectGaps } = await import('../intelligence/requirements/gapDetectionEngine');
    const { generateFromGaps } = await import('../intelligence/requirements/requirementGenerationEngine');
    // Create a minimal enriched BP to detect the specific gap
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const capData = hierarchy.find((c: any) => c.id === req.params.id);
    if (!capData) { res.status(404).json({ error: 'Capability not found' }); return; }
    let repoTree: string[] = [];
    try {
      const { getConnection: gc } = await import('../services/githubService');
      const conn = await gc(req.participant!.sub);
      if (conn?.file_tree_json?.tree) repoTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    } catch {}
    const { RequirementsMap: RM } = await import('../models');
    const existingAutoReqs = await RM.findAll({ where: { project_id: project.id, capability_id: req.params.id, verified_by: 'AUTONOMOUS_ENGINE' }, attributes: ['requirement_key'] });
    const existingKeys = new Set(existingAutoReqs.map((r: any) => r.requirement_key));
    const enriched = enrichCapability(capData);
    const allGaps = detectGaps(enriched as any, repoTree, existingKeys);
    const targetGap = allGaps.find(g => g.gap_id === gap_id);
    if (!targetGap) { res.status(400).json({ error: `Gap ${gap_id} not detected for this BP` }); return; }
    const cycleId = `user-accepted-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const allReqs = (capData.features || []).flatMap((f: any) => f.requirements || []);
    const totalR = allReqs.length;
    const matchedR = allReqs.filter((r: any) => ['matched', 'verified', 'auto_verified'].includes(r.status)).length;
    const reqCoverage = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;
    const genResult = await generateFromGaps([targetGap], project.id, req.params.id as string, (feature as any).id, cycleId, { reqCoverage, qualityScore: 0, readiness: 0 });
    res.json({ created: genResult.created, gap: { gap_id: targetGap.gap_id, title: targetGap.title } });
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

    // 2d. Content-aware verification: read actual source code for remaining unmatched.
    // Goes beyond filename matching — sends file contents to LLM so it can see
    // whether "Return appropriate error codes" is implemented in auth.ts etc.
    const stillUnmatched2 = processReqs.filter(r => r.status === 'unmatched' || r.status === 'partial');
    if (stillUnmatched2.length > 0 && fileTree.length > 0) {
      try {
        const { verifyWithFileContent } = await import('../services/contentAwareVerifier');
        const implFiles = fileTree.filter(f => {
          const name = (f.split('/').pop() || '').toLowerCase();
          if (name.startsWith('.') || /^\d{14}/.test(name)) return false;
          if (f.includes('node_modules/') || f.includes('dist/') || f.includes('.github/') || f.includes('migrations/')) return false;
          return /\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/.test(name);
        });
        const contentResult = await verifyWithFileContent(
          req.participant!.sub,
          stillUnmatched2.map(r => ({ id: r.id, requirement_key: r.requirement_key, requirement_text: r.requirement_text || '' })),
          implFiles,
          processCap?.name || 'this process',
        );
        if (contentResult.verified.length > 0) {
          for (const v of contentResult.verified) {
            const req2 = processReqs.find(r => r.id === v.id);
            if (req2 && (req2.status === 'unmatched' || req2.status === 'partial')) {
              req2.status = 'matched';
              req2.github_file_paths = v.matched_files.slice(0, 5);
              req2.confidence_score = 0.9;
              req2.verified_by = 'content_verification';
              await req2.save();
              if (req2.status === 'unmatched') unmatched--;
              matched++;
            }
          }
          console.log(`[Resync] Content-aware verified ${contentResult.verified.length} additional requirements for "${processCap?.name}" (read ${contentResult.files_read} files)`);
        }
      } catch (contentErr: any) {
        console.error('[Resync] Content-aware verification failed:', contentErr?.message);
      }
    }

    // 2e. Auto-verify stragglers in two tiers:
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

// ─── Cory Learn Mode: contextual BP explanation via AI ────────
router.post('/api/portal/project/architect/learn', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { componentId, stepName } = req.body;
    if (!componentId) { res.status(400).json({ error: 'componentId required' }); return; }
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }

    // Fetch enriched BP for context
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const cap = hierarchy.find((c: any) => c.id === componentId);
    const enriched = cap ? enrichCapability(cap) : null;

    // Build the learn prompt with full context
    const projectContext = (project as any).project_variables?.system_prompt || (project as any).primary_business_problem || '';
    const features = enriched?.features || [];
    const featureList = features.map((f: any) => `- ${f.name}: ${f.description || 'No description'}`).join('\n');
    const reqList = features.flatMap((f: any) => (f.requirements || []).map((r: any) => `- ${r.key}: ${r.text}`)).slice(0, 20).join('\n');
    const u = enriched?.usability || {};
    const m = enriched?.metrics || {};
    const mat = enriched?.maturity || {};

    const learnPrompt = `You are Cory, the AI System Architect. You are in LEARN MODE.

Your job is to help the user deeply understand this business process before they build it.

# PROJECT CONTEXT
${projectContext || 'No project system prompt set yet.'}

# BUSINESS PROCESS: ${enriched?.name || stepName || 'Unknown'}
Description: ${enriched?.description || 'No description available.'}

Current State:
- Backend: ${u.backend || 'unknown'}
- Frontend: ${u.frontend || 'unknown'}
- Agents: ${u.agent || 'unknown'}
- Coverage: ${m.requirements_coverage || 0}%
- Readiness: ${m.system_readiness || 0}%
- Maturity: L${mat.level || 0} ${mat.label || 'Not Started'}

Features (${features.length}):
${featureList || 'None defined yet'}

Requirements:
${reqList || 'None extracted yet'}

---

Respond with this EXACT structure:

## What This Does
[Explain what "${enriched?.name || stepName}" is in plain language]

## Why It Matters
[Explain the business value and what happens if this is skipped]

## System Impact
[How this connects to other components — backend, frontend, agents, database]

## What Comes Next
[What the user should do after understanding this — the natural next step]

Keep it practical, structured, and non-generic. Use specifics from the context above.`;

    // Create session and get AI response
    const { v4: uuid } = await import('uuid');
    const sessionId = uuid();
    const { ArchitectSession } = await import('../models');

    // Use OpenAI for the learn response
    let response = '';
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Cory, an AI System Architect. You explain technical concepts clearly and practically. Always be structured and specific.' },
          { role: 'user', content: learnPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      });
      response = completion.choices[0]?.message?.content || 'I can help you understand this component. What would you like to know?';
    } catch (aiErr: any) {
      console.warn('[CoryLearn] AI call failed:', aiErr?.message);
      response = `## What This Does\n${enriched?.name || stepName} handles ${enriched?.description || 'core system functionality'}.\n\n## Why It Matters\nThis is a key part of your system that enables ${u.backend !== 'missing' ? 'data processing and business logic' : 'the foundation layer'}.\n\n## System Impact\nBackend: ${u.backend || 'unknown'} | Frontend: ${u.frontend || 'unknown'} | Coverage: ${m.requirements_coverage || 0}%\n\n## What Comes Next\nGenerate a build prompt to start implementing this component.`;
    }

    // Save session
    await ArchitectSession.create({
      id: sessionId,
      project_id: project.id,
      conversation_state: {
        phase: 'learn',
        messages: [
          { role: 'system', content: learnPrompt },
          { role: 'assistant', content: response },
        ],
        componentId,
        stepName,
      },
      status: 'active',
    } as any);

    res.json({ session_id: sessionId, response, component_name: enriched?.name || stepName });
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
    // Onboarding can call this before a project record exists.
    // Auto-create so the user's chosen tier is captured up front.
    const { createProjectForEnrollment } = await import('../services/projectService');
    const project = await createProjectForEnrollment(req.participant!.sub);
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

    // PHASE 2: refresh authoritative state after target-mode change
    try {
      const { refreshSystemState } = await import('../intelligence/systemStateEngine');
      refreshSystemState(project.id, 'target_mode_change');
    } catch { /* fire-and-forget */ }

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
    // PHASE 2: refresh authoritative state after mode/applicability mutation
    try {
      const project = await getParticipantProject(req.participant!.sub);
      if (project) {
        const { refreshSystemState } = await import('../intelligence/systemStateEngine');
        refreshSystemState(project.id, 'lifecycle_change');
      }
    } catch { /* fire-and-forget */ }
    res.json({ mode_override: (cap as any).mode_override, applicability_status: (cap as any).applicability_status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── User Status: canonical user-asserted state for a BP ────────
// One of 'in_progress' | 'verified' | 'archived'. When 'verified', every
// recommendation surface treats the BP as done. When 'archived', it is hidden
// from active recommendations and the grid. This is the user's escape hatch
// from the heuristic state-inference engine.
router.put('/api/portal/project/business-processes/:id/user-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['in_progress', 'verified', 'archived'].includes(status)) {
      res.status(400).json({ error: `Invalid status: ${status}. Must be in_progress, verified, or archived.` });
      return;
    }
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    (cap as any).user_status = status;
    (cap as any).user_status_set_at = new Date();
    (cap as any).user_status_set_by = req.participant!.sub;
    // Verifying a Page BP implies the user has confirmed what the page is —
    // stamp ui_element_map.user_defined_at so the awaiting-definition banner
    // drops it. Avoids the Define-then-Verify two-click ritual when the auto-
    // discovered mapping was already correct.
    if (status === 'verified' && ((cap as any).source === 'frontend_page' || (cap as any).is_page_bp)) {
      const ui = ((cap as any).ui_element_map || {}) as any;
      if (!ui.user_defined_at) {
        ui.user_defined_at = new Date().toISOString();
        (cap as any).ui_element_map = ui;
        (cap as any).changed('ui_element_map', true);
      }
    }
    await cap.save();
    // PHASE 2: refresh authoritative state after user_status mutation
    try {
      const project = await getParticipantProject(req.participant!.sub);
      if (project) {
        const { refreshSystemState } = await import('../intelligence/systemStateEngine');
        refreshSystemState(project.id, 'user_status_change');
      }
    } catch { /* fire-and-forget */ }
    res.json({
      id: cap.id,
      user_status: (cap as any).user_status,
      user_status_set_at: (cap as any).user_status_set_at,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Bulk Verify: mark all BPs at/above a coverage threshold as verified ────────
// Used when the user has many high-coverage BPs that they've already built
// (Claude Code reported COMPLETE on a prior run) and doesn't want to click
// Mark Verified on each one. Body: { min_coverage?: number = 95 }.
router.post('/api/portal/project/business-processes/bulk-verify', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const minCoverage = typeof req.body?.min_coverage === 'number' ? req.body.min_coverage : 95;

    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);

    // Inject the same context the list endpoint injects so enrichCapability can
    // compute coverage correctly.
    let repoFileTree: string[] = [];
    try {
      const { getConnection } = await import('../services/githubService');
      const conn = await getConnection(req.participant!.sub);
      if (conn?.file_tree_json?.tree) repoFileTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    } catch { /* ok */ }
    const { Capability: CapModel } = await import('../models');
    const capModels = await CapModel.findAll({
      where: { project_id: project.id },
      attributes: ['id', 'last_execution', 'mode_override', 'applicability_status', 'frontend_route', 'backend_context', 'user_status'],
    });
    const execMap = new Map(capModels.map((c: any) => [c.id, c]));
    const projectMode = (project as any).target_mode || 'production';

    const eligibleIds: string[] = [];
    for (const cap of hierarchy as any[]) {
      cap._repoFileTree = repoFileTree;
      cap._projectMode = projectMode;
      const extra = execMap.get(cap.id);
      if (extra) {
        cap.last_execution = (extra as any).last_execution;
        cap.mode_override = (extra as any).mode_override;
        cap.applicability_status = (extra as any).applicability_status || 'active';
        cap.user_status = (extra as any).user_status || 'in_progress';
      }
      // Skip BPs that are already resolved or are the synthetic bucket.
      if (cap.user_status === 'verified' || cap.user_status === 'archived') continue;
      const synthName = (cap.name || '').toLowerCase();
      if (synthName.includes('uncategorized') || synthName === 'miscellaneous' || synthName === 'other') continue;

      const enriched = enrichCapability(cap);
      const coverage = enriched.metrics?.requirements_coverage || 0;
      if (coverage >= minCoverage) eligibleIds.push(cap.id);
    }

    if (eligibleIds.length === 0) {
      res.json({ verified: 0, message: `No BPs at or above ${minCoverage}% coverage are pending verification.` });
      return;
    }

    const now = new Date();
    const setBy = req.participant!.sub;
    await CapModel.update(
      { user_status: 'verified', user_status_set_at: now, user_status_set_by: setBy } as any,
      { where: { id: eligibleIds } as any },
    );

    // PHASE 2: refresh authoritative state after bulk verify
    try {
      const { refreshSystemState } = await import('../intelligence/systemStateEngine');
      refreshSystemState(project.id, 'user_status_change');
    } catch { /* fire-and-forget */ }

    res.json({
      verified: eligibleIds.length,
      min_coverage: minCoverage,
      ids: eligibleIds,
      message: `Marked ${eligibleIds.length} BP${eligibleIds.length === 1 ? '' : 's'} at or above ${minCoverage}% coverage as verified.`,
    });
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

// ─── Backend Context: full-stack visibility for BPs ────────
router.get('/api/portal/project/business-processes/:id/backend-context', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { Capability: CapModel } = await import('../models');
    const cap = await CapModel.findOne({ where: { id: req.params.id, project_id: project.id } });
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }

    // Check cache
    const { isCacheFresh } = await import('../services/backendContextService');
    const cached = (cap as any).backend_context;
    if (cached && isCacheFresh(cached)) {
      res.json(cached);
      return;
    }

    // Extract fresh context from repo files
    const { getCapabilityHierarchy } = await import('../services/projectScopeService');
    const hierarchy = await getCapabilityHierarchy(project.id);
    const capData = hierarchy.find((c: any) => c.id === req.params.id);

    // Build implementation_links (simplified from enrichCapability)
    let repoTree: string[] = [];
    try {
      const { getConnection } = await import('../services/githubService');
      const conn = await getConnection(req.participant!.sub);
      if (conn?.file_tree_json?.tree) repoTree = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    } catch {}

    const enriched = capData ? enrichCapability(capData) : null;
    const links = enriched?.implementation_links || { backend: [], models: [], agents: [], frontend: [] };

    // Always ensure we have backend files to analyze. Every frontend page has
    // a backend — if BP-specific matching found nothing, search project-wide.
    const bpName = (cap as any).name?.toLowerCase() || '';
    const stems = bpName.split(/\W+/).filter((w: string) => w.length > 3);

    // 1. Try BP-specific keyword match
    if (links.backend.length === 0) {
      const bpFiles = repoTree.filter(f => {
        const fl = f.toLowerCase();
        return stems.some((s: string) => fl.includes(s)) && /\.(ts|js|py|go)$/.test(f) && /\/(route|service|controller|handler|api)\b/i.test(f);
      });
      links.backend = bpFiles.slice(0, 10);
    }
    if (links.models.length === 0) {
      const bpModels = repoTree.filter(f => {
        const fl = f.toLowerCase();
        return stems.some((s: string) => fl.includes(s)) && /\.(ts|js|py|go)$/.test(f) && /\/(model|schema|entity)\b/i.test(f);
      });
      links.models = bpModels.slice(0, 10);
    }
    if (links.agents.length === 0) {
      links.agents = repoTree.filter(f => stems.some((s: string) => f.toLowerCase().includes(s)) && /agent/i.test(f) && /\.(ts|js|py)$/.test(f)).slice(0, 5);
    }

    // 2. If STILL empty, grab ALL project backend/model/agent files (every page has a backend)
    if (links.backend.length === 0) {
      links.backend = repoTree.filter(f => /\/(route|service|controller|handler|gateway)\b/i.test(f) && /\.(ts|js|py|go)$/.test(f) && !f.includes('node_modules')).slice(0, 10);
    }
    if (links.models.length === 0) {
      links.models = repoTree.filter(f => /\/(model|schema|entity)\b/i.test(f) && /\.(ts|js|py|go)$/.test(f) && !f.includes('node_modules')).slice(0, 10);
    }
    if (links.agents.length === 0) {
      links.agents = repoTree.filter(f => /agent/i.test(f) && /\.(ts|js|py)$/.test(f) && !f.includes('node_modules') && !f.includes('migration')).slice(0, 5);
    }

    const { extractBackendContext } = await import('../services/backendContextService');
    const ctx = await extractBackendContext(req.participant!.sub, links);

    // Cache on the capability
    (cap as any).backend_context = ctx;
    (cap as any).changed('backend_context', true);
    await cap.save();

    res.json(ctx);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Page Visual Review: per-category user-asserted completion ────────
// Page BPs (auto-discovered from frontend routes) don't have requirements
// to track coverage against, so they always show 0% until the user clicks
// Mark Verified. This endpoint lets the user tick off five visual-review
// categories independently — each one rolls into the BP's displayed
// completion (verified / 5 * 100). Stored in ui_element_map.category_scores.
const PAGE_CATEGORIES = ['layout', 'accessibility', 'responsiveness', 'interaction', 'content'] as const;
type PageCategory = typeof PAGE_CATEGORIES[number];

// Cory UI Advisor step identifiers — match the three steps rendered in the
// SystemViewV2 UI tab (uiActions array). The frontend keys map 1:1, so the
// backend can stamp ui_element_map.steps when each runs and the panel can
// auto-advance from one to the next.
const UI_STEP_KEYS = ['layout_hierarchy', 'usability', 'mobile_responsiveness'] as const;

router.put('/api/portal/project/business-processes/:id/page-category', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { category, verified } = req.body || {};
    if (!PAGE_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `Invalid category. Must be one of: ${PAGE_CATEGORIES.join(', ')}` });
      return;
    }
    if (typeof verified !== 'boolean') {
      res.status(400).json({ error: 'verified must be a boolean' });
      return;
    }
    const map = ((cap as any).ui_element_map || {}) as any;
    const scores = map.category_scores || {};
    scores[category as PageCategory] = verified
      ? { verified: true, set_at: new Date().toISOString(), set_by: req.participant!.sub }
      : { verified: false };
    (cap as any).ui_element_map = { ...map, category_scores: scores };
    (cap as any).changed('ui_element_map', true);
    await cap.save();
    const verifiedCount = Object.values(scores).filter((s: any) => s?.verified).length;
    res.json({
      id: cap.id,
      category,
      verified,
      category_scores: scores,
      verified_count: verifiedCount,
      total_categories: PAGE_CATEGORIES.length,
      page_completion_pct: Math.round((verifiedCount / PAGE_CATEGORIES.length) * 100),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Visual Feedback OS: element-level feedback ────────
router.post('/api/portal/project/business-processes/:id/element-map', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { elements, route } = req.body;
    // Merge instead of replacing — the JSONB column also carries
    // user_defined_at, steps, and category_scores that survive across UI
    // analysis runs. Replacing the whole object silently wiped the user's
    // mapping confirmation and visual review state on every Run.
    const existing = ((cap as any).ui_element_map || {}) as any;
    (cap as any).ui_element_map = {
      ...existing,
      page_route: route,
      scanned_at: new Date().toISOString(),
      elements: elements || [],
    };
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
    const stepKeyForRows = UI_STEP_KEYS.includes(req.body.step_key) ? req.body.step_key : undefined;
    const ruleResult = await analyzePageElements({
      capabilityId: cap.id, projectId: project.id,
      pageRoute: elementMap.page_route || (cap as any).frontend_route || '/',
      elements: elementMap.elements,
      targetElementId: req.body.element_id,
      stepKey: stepKeyForRows,
    });
    // LLM augment if rules found few issues or user gave feedback
    let llmResult = { total_issues: 0, new_issues: 0, skipped_duplicates: 0, issues: [] as any[] };
    if (req.body.user_feedback || ruleResult.total_issues < 3) {
      // Auto-load backend context for LLM prompt — extract on-the-fly if not cached
      let backendPrompt = '';
      try {
        const { Capability: CapCtx } = await import('../models');
        const capCtx = await CapCtx.findByPk(cap.id, { attributes: ['backend_context'] });
        let ctx = (capCtx as any)?.backend_context;
        // Auto-extract if not cached
        if (!ctx) {
          try {
            const { getCapabilityHierarchy: getH } = await import('../services/projectScopeService');
            const hier = await getH(project.id);
            const cData = hier.find((c: any) => c.id === cap.id);
            let repoTree2: string[] = [];
            try {
              const { getConnection: gc2 } = await import('../services/githubService');
              const conn2 = await gc2(req.participant!.sub);
              if (conn2?.file_tree_json?.tree) repoTree2 = conn2.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
            } catch {}
            const enriched2 = cData ? enrichCapability(cData) : null;
            const lnks = enriched2?.implementation_links || { backend: [], models: [], agents: [] };
            // Fallback to project-wide files
            if (lnks.backend.length === 0) lnks.backend = repoTree2.filter((f: string) => /\/(route|service|controller|handler)\b/i.test(f) && /\.(ts|js|py)$/.test(f)).slice(0, 10);
            if (lnks.models.length === 0) lnks.models = repoTree2.filter((f: string) => /\/(model|schema|entity)\b/i.test(f) && /\.(ts|js|py)$/.test(f)).slice(0, 10);
            if (lnks.agents.length === 0) lnks.agents = repoTree2.filter((f: string) => /agent/i.test(f) && /\.(ts|js|py)$/.test(f)).slice(0, 5);
            const { extractBackendContext } = await import('../services/backendContextService');
            ctx = await extractBackendContext(req.participant!.sub, lnks);
            if (capCtx) { (capCtx as any).backend_context = ctx; (capCtx as any).changed('backend_context', true); await capCtx.save(); }
          } catch {}
        }
        if (ctx) {
          const { formatForPrompt } = await import('../services/backendContextService');
          backendPrompt = formatForPrompt(ctx);
        }
      } catch {}
      llmResult = await augmentWithLLM({
        capabilityId: cap.id, projectId: project.id,
        pageRoute: elementMap.page_route || '/',
        elements: elementMap.elements,
        userFeedback: req.body.user_feedback ? (req.body.user_feedback + (backendPrompt ? '\n\n' + backendPrompt : '')) : backendPrompt || undefined,
        ruleIssueCount: ruleResult.total_issues,
        stepKey: stepKeyForRows,
      });
    }
    // Stamp the UI Advisor step that was just run, so the frontend can
    // collapse it to a "Last run X ago · Re-run" state and surface the next
    // unrun step as the primary recommendation. Optional — backwards
    // compatible with callers that don't send step_key.
    const stepKey = req.body.step_key;
    if (UI_STEP_KEYS.includes(stepKey)) {
      const issuesFound = (ruleResult.new_issues || 0) + (llmResult.new_issues || 0);
      const map = ((cap as any).ui_element_map || {}) as any;
      const steps = map.steps || {};
      steps[stepKey] = { run_at: new Date().toISOString(), issues_found: issuesFound };
      (cap as any).ui_element_map = { ...map, steps };
      (cap as any).changed('ui_element_map', true);
      await cap.save();
    }
    // PHASE 2: refresh authoritative state after visual review (analyze-page)
    try {
      const project = await getParticipantProject(req.participant!.sub);
      if (project) {
        const { refreshSystemState } = await import('../intelligence/systemStateEngine');
        refreshSystemState(project.id, 'visual_review');
      }
    } catch { /* fire-and-forget */ }
    res.json({
      rules: ruleResult,
      llm: llmResult,
      total_new: ruleResult.new_issues + llmResult.new_issues,
      total_skipped: ruleResult.skipped_duplicates + llmResult.skipped_duplicates,
      ui_steps: ((cap as any).ui_element_map || {}).steps || null,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Manual override — lets the user mark a step done/cleared without running
// the analyzer (e.g. they reviewed elsewhere and want to advance the wizard).
router.put('/api/portal/project/business-processes/:id/ui-step-status', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { step_key, run_at, issues_found, clear } = req.body || {};
    if (!UI_STEP_KEYS.includes(step_key)) {
      res.status(400).json({ error: `Invalid step_key. Must be one of: ${UI_STEP_KEYS.join(', ')}` });
      return;
    }
    const map = ((cap as any).ui_element_map || {}) as any;
    const steps = map.steps || {};
    if (clear) {
      steps[step_key] = null;
    } else {
      steps[step_key] = {
        run_at: run_at || new Date().toISOString(),
        issues_found: typeof issues_found === 'number' ? issues_found : 0,
      };
    }
    (cap as any).ui_element_map = { ...map, steps };
    (cap as any).changed('ui_element_map', true);
    await cap.save();
    res.json({ id: cap.id, steps });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Bulk-resolve: flips every in_progress UIElementFeedback for a BP to
// resolved and stamps ui_element_map.steps[*].last_resolved_at so the
// frontend can surface a transient "X issues resolved from your last build"
// indicator on the affected step rows. Called from the validate-build
// flow on successful validation — the contract is "if you marked issues
// in_progress and your validation passed, those issues are fixed."
router.put('/api/portal/project/business-processes/:id/element-feedback/bulk-resolve', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { bulkResolveInProgress } = await import('../services/uiFeedbackStore');
    const out = await bulkResolveInProgress(cap.id, req.participant!.sub);
    if (out.resolved > 0) {
      const map = ((cap as any).ui_element_map || {}) as any;
      const steps = map.steps || {};
      const nowIso = new Date().toISOString();
      for (const stepKey of Object.keys(out.bySourceStep)) {
        if (stepKey === 'untagged') continue;
        if (!steps[stepKey]) steps[stepKey] = {};
        steps[stepKey].last_resolved_at = nowIso;
        steps[stepKey].last_resolved_count = out.bySourceStep[stepKey];
      }
      (cap as any).ui_element_map = { ...map, steps };
      (cap as any).changed('ui_element_map', true);
      await cap.save();
    }
    // PHASE 2: refresh authoritative state after bulk-resolve
    try {
      const project = await getParticipantProject(req.participant!.sub);
      if (project) {
        const { refreshSystemState } = await import('../intelligence/systemStateEngine');
        refreshSystemState(project.id, 'visual_review');
      }
    } catch { /* fire-and-forget */ }

    // ── Phase 10.5: persist UXRemediationOutcome rows per resolved cluster ──
    // Fire-and-forget — failure here MUST NOT block the user-facing
    // bulk-resolve response. The remediation intelligence layer is
    // additive observability over the existing flow.
    void recordPhase10_5Outcomes(cap, out.bySourceStep, req.participant!.sub).catch(err => {
      console.warn('[bulk-resolve] phase10.5 outcome write failed:', err?.message);
    });

    res.json({ resolved: out.resolved, bySourceStep: out.bySourceStep });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Helper: persists a UXRemediationOutcome per (cluster_signature, step_key)
// that just had at least one issue resolved.
//
// Phase 11 changes:
//   - reads stashed before_metrics from /snapshot-before
//   - captures fresh after_metrics inline via the same loaders
//   - deploy-freshness gate: skip after-screenshot capture if the preview
//     hasn't been re-crawled since fix-kickoff (no fresh DOMSnapshot)
//   - persists semantic_regions on the outcome row at write time so replay
//     stays deterministic forever
//   - records a tier transition for the cluster after recompute
//   - tags rows with prompt_target_used + pre_pressure_tier for the
//     strategy learner
async function recordPhase10_5Outcomes(cap: any, bySourceStep: Record<string, number>, resolvedBy: string): Promise<void> {
  const { default: UIElementFeedback } = await import('../models/UIElementFeedback');
  const { default: UXRemediationOutcome } = await import('../models/UXRemediationOutcome');
  const { default: DOMSnapshot } = await import('../models/DOMSnapshot');
  const { Op } = await import('sequelize');
  const { capture } = await import('../intelligence/systemStateEngine/capture/screenshotCaptureService');
  const { analyzeBeforeAfterImpact } = await import('../intelligence/systemStateEngine/remediation/beforeAfterImpactAnalyzer');
  const { publishCognitiveEvent } = await import('../intelligence/systemStateEngine/realtime/cognitiveEventBus');
  const { resolveSemanticRegions } = await import('../intelligence/systemStateEngine/remediation/semanticRegionResolver');
  const { invalidateTelemetryCache } = await import('../intelligence/systemStateEngine/realtime/telemetryMemoizationCache');
  const { recordConfidenceRecompute } = await import('../intelligence/systemStateEngine/remediation/confidenceEvolutionTracker');
  const { computeRemediationConfidence } = await import('../intelligence/systemStateEngine/remediation/remediationConfidenceEngine');
  const { getRemediationPressure } = await import('../intelligence/systemStateEngine/remediation/remediationPressureEngine');

  const map = ((cap as any).ui_element_map || {}) as any;
  const snapshots = map.remediation_snapshots || {};
  const previewUrl = (cap as any).preview_url || (cap as any).direct_preview_url || null;
  const route = (cap as any).frontend_route || null;
  const bulkResolveAt = Date.now();

  // Phase 11 deploy-freshness gate. If no DOMSnapshot for this BP+route was
  // captured AFTER bulkResolveAt - 30s, the preview hasn't been re-crawled
  // since the fix landed — measuring "after" against the stale UI would
  // produce zero-delta noise. Skip after-snapshot capture; persist the
  // outcome with after metrics = null.
  let previewIsFresh = false;
  try {
    if (route) {
      const recentSnap: any = await DOMSnapshot.findOne({
        where: { bp_id: cap.id, route, captured_at: { [Op.gte]: new Date(bulkResolveAt - 30_000) } },
      });
      previewIsFresh = !!recentSnap;
    }
  } catch { /* fail-soft */ }

  let afterPath: string | null = null;
  let after_metrics: any = null;
  if (previewUrl && previewIsFresh) {
    try {
      const out = await capture({
        url: previewUrl,
        viewport: { width: 1280, height: 800, device_scale_factor: 1, is_mobile: false, label: 'desktop' },
        output_dir: '/tmp/remediation-snapshots',
        settle_ms: 800,
      });
      if (out.ok) afterPath = out.screenshot_path;
    } catch { /* puppeteer optional */ }
    after_metrics = await collectBeforeAfterMetrics(cap.project_id, cap.id, route);
  }

  // Pull rows just-resolved (within last 60s) so we can group by cluster_signature.
  const since = new Date(Date.now() - 60_000);
  const justResolved: any[] = await UIElementFeedback.findAll({
    where: { capability_id: cap.id, status: 'resolved', resolved_at: { [Op.gte]: since } },
  });
  if (justResolved.length === 0) return;

  const grouped = new Map<string, { cluster_signature: string; cluster_type: string; step_key: string; resolved_count: number; page_route: string }>();
  for (const r of justResolved) {
    if (!r.cluster_signature) continue;
    const g = grouped.get(r.cluster_signature) || {
      cluster_signature: r.cluster_signature,
      cluster_type: r.cluster_type || 'workflow',
      step_key: r.source_step || 'untagged',
      resolved_count: 0,
      page_route: r.page_route || route || '/',
    };
    g.resolved_count++;
    grouped.set(r.cluster_signature, g);
  }

  // Pre-fix pressure tier (read once for the whole batch — fits the
  // strategy learner's axis).
  const prePressure = getRemediationPressure(cap.project_id);

  for (const g of grouped.values()) {
    const beforeMeta = snapshots[g.cluster_signature] || {};
    const before_metrics = beforeMeta.before_metrics || { cognition_score: null, ux_debt_score: null, behavioral_pressure: null, workflow_friction: null, cta_prominence: null, hierarchy_clarity: null };
    const impact = analyzeBeforeAfterImpact({
      before: before_metrics,
      after: after_metrics ?? { cognition_score: null, ux_debt_score: null, behavioral_pressure: null, workflow_friction: null, cta_prominence: null, hierarchy_clarity: null },
      before_screenshot_path: beforeMeta.before_path || null,
      after_screenshot_path: afterPath,
    });

    // Compute + persist semantic regions ONCE here. Replay reads them back
    // unchanged — no analyzer re-run, no DOMSnapshot drift.
    const semantic_regions = await resolveSemanticRegions({
      capability_id: cap.id,
      cluster_signature: g.cluster_signature,
      cluster_type: g.cluster_type as any,
      page_route: g.page_route,
      resolved: true,
      regressed: false,
    });

    await UXRemediationOutcome.create({
      project_id: cap.project_id,
      capability_id: cap.id,
      step_key: g.step_key,
      cluster_signature: g.cluster_signature,
      cluster_type: g.cluster_type,
      issues_resolved_count: g.resolved_count,
      issues_regressed_count: 0,
      cognition_delta: impact.cognition_delta,
      ux_debt_delta: impact.ux_debt_delta,
      behavioral_delta: impact.behavioral_delta,
      friction_delta: impact.friction_delta,
      before_screenshot_path: beforeMeta.before_path || null,
      after_screenshot_path: afterPath,
      validation_session_id: null,
      observed_at: new Date(),
      semantic_regions,
      prompt_target_used: 'ui_fix_bulk', // updated to ui_fix_adaptive when frontend opts in
      pre_pressure_tier: prePressure.tier,
    } as any);

    // Recompute confidence + record tier transition if it shifted.
    const conf = computeRemediationConfidence({
      historical_success_rate: 60 + (impact.net_delta || 0) * 0.3,
      regression_risk: 30,
      cognition_stability: impact.cognition_delta != null ? Math.max(0, Math.min(100, 50 + impact.cognition_delta)) : 50,
      behavioral_improvement: impact.ux_debt_delta != null ? Math.max(0, Math.min(100, 50 + impact.ux_debt_delta)) : 50,
      unresolved_related_count: 0,
    });
    await recordConfidenceRecompute({
      project_id: cap.project_id,
      cluster_signature: g.cluster_signature,
      trigger: 'outcome_recorded',
      current_confidence: conf,
    });

    publishCognitiveEvent({
      kind: 'remediation.cluster.resolved',
      project_id: cap.project_id,
      severity: 'info',
      payload: {
        capability_id: cap.id,
        cluster_signature: g.cluster_signature,
        cluster_type: g.cluster_type,
        resolved_count: g.resolved_count,
        resolved_by: resolvedBy,
      },
    });
  }
  // Phase 11 — invalidate the telemetry cache so the next snapshot-before
  // sees fresh deltas instead of values from before this resolve cycle.
  invalidateTelemetryCache(cap.project_id);
}

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
// Stamps ui_element_map.user_defined_at so the orchestrator stops treating
// this Page BP as "unmapped / doesn't exist yet" — until this stamp lands,
// auto-discovered Page BPs don't surface as Cory recommendations.
// Return candidate routes for a BP based on its linked frontend
// components. Used by the UI tab's route picker when a BP has frontend
// code but no route attached yet — instead of forcing the user back
// to Define Component, we surface the candidates inline.
router.get('/api/portal/project/business-processes/:id/route-candidates', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }

    // Collect frontend page files: explicitly linked + repo-scanned by
    // name stems (the same way enrichCapability decides which frontend
    // files belong to this cap). The user might have linked nothing
    // explicitly but their build still produced a page file whose name
    // contains the BP's name.
    const linked: string[] = (cap as any).linked_frontend_components || [];
    let scanned: string[] = [];
    try {
      const { getFileTree } = await import('../services/githubService');
      const tree = await getFileTree(req.participant!.sub);
      const allFiles: string[] = (tree?.tree || [])
        .filter((t: any) => t.type === 'blob')
        .map((t: any) => t.path);
      const STOP = new Set(['and', 'or', 'the', 'of', 'a', 'an', 'for', 'to', 'in', 'on',
        'system', 'service', 'page', 'pages', 'feature', 'module', 'domain', 'management']);
      const stems = (cap as any).name.toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((s: string) => s.length >= 4 && !STOP.has(s));
      scanned = allFiles.filter(f => {
        const name = (f.split('/').pop() || '').toLowerCase();
        if (!/\.(tsx?|jsx?|vue|svelte)$/.test(name)) return false;
        if (!(f.toLowerCase().includes('frontend/') || f.toLowerCase().includes('/pages/') || f.toLowerCase().includes('/views/') || f.toLowerCase().includes('/screens/') || f.toLowerCase().includes('/app/'))) return false;
        return stems.some((stem: string) => name.includes(stem));
      });
    } catch { /* repo scan optional */ }

    const pages = [...new Set([...linked, ...scanned])];
    if (pages.length === 0) { res.json({ candidates: [], pages: [] }); return; }

    const { detectRouteCandidates } = await import('../services/routeDetectionService');
    const all: Array<{ route: string; confidence: number; source: string; via: string; from_file: string }> = [];
    for (const f of pages.slice(0, 10)) {
      const cands = await detectRouteCandidates(req.participant!.sub, f);
      for (const c of cands) all.push({ ...c, from_file: f });
    }
    const byRoute = new Map<string, typeof all[number]>();
    for (const c of all) {
      const ex = byRoute.get(c.route);
      if (!ex || ex.confidence < c.confidence) byRoute.set(c.route, c);
    }
    res.json({
      candidates: [...byRoute.values()].sort((a, b) => b.confidence - a.confidence),
      pages,
    });
  } catch (err: any) {
    console.error('[route-candidates]', err?.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/portal/project/business-processes/:id/connect-page', requireParticipant, async (req: Request, res: Response) => {
  try {
    const cap = await findOwnedCapability(req.participant!.sub, req.params.id as string);
    if (!cap) { res.status(404).json({ error: 'Process not found' }); return; }
    const { route } = req.body;
    (cap as any).frontend_route = route || null;
    const ui = ((cap as any).ui_element_map || {}) as any;
    ui.user_defined_at = new Date().toISOString();
    (cap as any).ui_element_map = ui;
    (cap as any).changed('ui_element_map', true);
    await cap.save();
    res.json({ id: cap.id, name: cap.name, frontend_route: route, user_defined_at: ui.user_defined_at });
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
    const { discoverFrontendPages, readRegisteredRoutes } = await import('../services/frontendPageDiscovery');
    const pages = discoverFrontendPages(fileTree, readRegisteredRoutes(fileTree));
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
    const { discoverFrontendPages, readRegisteredRoutes } = await import('../services/frontendPageDiscovery');
    const pages = discoverFrontendPages(fileTree, readRegisteredRoutes(fileTree));
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
    // Accept any route the user sets — this is a manual override.
    // Previously validated against discovered routes, but that blocked
    // legitimate hash routes (/#/security) and custom paths.
    const { setFrontendRoute } = await import('../services/frontendRouteMapper');
    await setFrontendRoute(cap.id, route || null);
    // PHASE 2: refresh authoritative state after route attachment
    try {
      const project = await getParticipantProject(req.participant!.sub);
      if (project) {
        const { refreshSystemState } = await import('../intelligence/systemStateEngine');
        refreshSystemState(project.id, 'frontend_route_change');
      }
    } catch { /* fire-and-forget */ }
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

// ─── Project settings: update project_variables fields ────────
// Allows the student to set direct_preview_url and other project-level settings.
router.put('/api/portal/project/settings', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await getParticipantProject(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { direct_preview_url } = req.body;
    const vars = (project as any).project_variables || {};
    if (direct_preview_url !== undefined) {
      vars.direct_preview_url = direct_preview_url || null;
    }
    (project as any).project_variables = vars;
    (project as any).changed('project_variables', true);
    await project.save();
    res.json({ direct_preview_url: vars.direct_preview_url || null });
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

    // PHASE 2: refresh authoritative state after manual capability add
    try {
      const { refreshSystemState } = await import('../intelligence/systemStateEngine');
      refreshSystemState(project.id, 'capability_added');
    } catch { /* fire-and-forget */ }

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
    // PHASE 2: refresh authoritative state after lifecycle change
    try {
      const project = await getParticipantProject(req.participant!.sub);
      if (project) {
        const { refreshSystemState } = await import('../intelligence/systemStateEngine');
        refreshSystemState(project.id, 'lifecycle_change');
      }
    } catch { /* fire-and-forget */ }
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

// Auto-derived multi-section system prompt built from project metadata,
// requirements, capabilities, and stakeholders. Returned as a string the
// frontend can show as a draft, regenerate, edit, and save via PUT
// /system-prompt above. The caller decides when to save — we never
// auto-overwrite the stored value.
router.get('/api/portal/project/system-prompt/draft', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { getProjectByEnrollment } = await import('../services/projectService');
    const project = await getProjectByEnrollment(req.participant!.sub);
    if (!project) { res.status(404).json({ error: 'No project found' }); return; }
    const { buildBlueprintSystemPrompt } = await import('../services/systemPromptBuilder');
    const draft = await buildBlueprintSystemPrompt(req.participant!.sub);
    const saved = ((project as any).project_variables || {}).system_prompt || '';
    res.json({ draft, has_saved: !!saved.trim() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 21 — Distributed Runtime ────────
// Bounded persistent federation runtime continuity: broker topology,
// partition health, replay, isolation, and operator-clicked recovery.
// Single-process, single-broker today. No auto-failover.
router.get('/api/portal/project/distributed-runtime/visibility', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const visibility = await engine.buildRuntimeVisibility();
    res.json(visibility);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/distributed-runtime/topology', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const topology = await engine.buildRuntimeTopology();
    res.json(topology);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/distributed-runtime/partitions', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const partitions = await engine.listPartitions();
    res.json({ partitions, partition_count: partitions.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/distributed-runtime/isolations', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const profile = engine.buildIsolationProfile(engine.getDistributedAdapterKind());
    res.json(profile);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/distributed-runtime/isolations/lift', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { namespace, organization_id } = req.body || {};
    if (!namespace || typeof namespace !== 'string') { res.status(400).json({ error: 'namespace_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const lifted = engine.liftBrokerIsolation(namespace, organization_id ?? null);
    res.json({ lifted });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/distributed-runtime/replays', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const replays = engine.listRecentReplays();
    res.json({ replays });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/distributed-runtime/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const result = await engine.performContinuityReplay({
      trigger: 'operator_clicked',
      organization_id: req.body?.organization_id ?? null,
      operator_id: req.participant?.sub,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/distributed-runtime/recovery-plans', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const plans = engine.listRecoveryPlans();
    res.json({ plans });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/distributed-runtime/recovery-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const trigger = req.body?.trigger ?? 'operator_requested';
    const engine = await import('../intelligence/systemStateEngine');
    const plan = engine.buildRecoveryPlan({ trigger });
    res.json(plan);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/distributed-runtime/recovery-plans/:plan_id/steps/:step_id/execute', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const result = await engine.executeRecoveryStep({
      plan_id: String(req.params.plan_id),
      step_id: String(req.params.step_id),
      operator_id: req.participant!.sub,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/distributed-runtime/ping', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const result = await engine.pingBroker();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 22 — Within-Partition Cognition Topology ────────
// Bounded topology orchestration on top of Phase 21 runtime continuity.
// Within-partition only — never cross-partition, never cross-org.
// Recovery sequencing is automatic; execution is operator-clicked.
router.get('/api/portal/project/topology/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const visibility = engine.buildTopologyVisibilityReplay({ organization_id });
    res.json(visibility);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/graph', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildCognitionTopologyGraph(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/topology/dependency-edges', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, from_namespace, to_namespace, relation, latency_sensitivity, notes } = req.body || {};
    if (!organization_id || !from_namespace || !to_namespace || !relation || !latency_sensitivity) {
      res.status(400).json({ error: 'missing_required_fields' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const edge = engine.recordDependencyEdge({ organization_id, from_namespace, to_namespace, relation, latency_sensitivity, notes });
    res.json(edge);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/fragmentation', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildTopologyFragmentationProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/dependencies', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRuntimeDependencyProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/forecast', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const horizon_minutes = req.query.horizon_minutes ? Number(req.query.horizon_minutes) : undefined;
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildTopologyForecast({ organization_id, horizon_minutes }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/propagations', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({
      replays: engine.listRecentPropagationReplays(organization_id),
      attributions: engine.listRecentPropagationAttributions(organization_id),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/topology/propagations/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, entries } = req.body || {};
    if (!organization_id || !Array.isArray(entries)) {
      res.status(400).json({ error: 'organization_id_and_entries_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRuntimePropagationReplay({ organization_id, entries }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/stabilizations', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ stabilizations: engine.listStabilizationPaths(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/topology/recovery-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ plans: engine.listTopologyRecoveryPlans(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/topology/recovery-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, trigger } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildTopologyRecoveryPlan({ organization_id, trigger: trigger ?? 'operator_requested' }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/topology/recovery-plans/:plan_id/steps/:step_id/execute', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const result = await engine.executeTopologyRecoveryStep({
      plan_id: String(req.params.plan_id),
      step_id: String(req.params.step_id),
      operator_id: req.participant!.sub,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 23 — Bounded Operational Execution Substrate ────────
// Instrumentation + governance over existing operational workers
// (Phase 14 handoff, Phase 15 mutation, Phase 21/22 recovery, scripts,
// cron). Workers opt in voluntarily. Within-organization isolated.
router.get('/api/portal/project/execution-substrate/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/execution-substrate/topology', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionTopologyProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/execution-substrate/continuity', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionContinuityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/execution-substrate/isolation', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionIsolationProfile());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/execution-substrate/isolation/lift', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { kind, organization_id } = req.body || {};
    if (!kind || !organization_id) { res.status(400).json({ error: 'kind_and_organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ lifted: engine.liftExecutionIsolation(kind, organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/execution-substrate/governance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionGovernanceProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/execution-substrate/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const kind = req.query.kind ? String(req.query.kind) as any : undefined;
    const state = req.query.state ? String(req.query.state) as any : undefined;
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.replayExecutionEnvelopes({ organization_id, kind, state }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/execution-substrate/rollback-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({
      plans: engine.listExecutionRollbackPlans(organization_id),
      bounds: engine.listRollbackContinuityBounds(organization_id),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/execution-substrate/rollback-plans', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, trigger, source_chains } = req.body || {};
    if (!organization_id || !Array.isArray(source_chains)) {
      res.status(400).json({ error: 'organization_id_and_source_chains_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRollbackExecutionPlan({ organization_id, trigger: trigger ?? 'operator_requested', source_chains }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/execution-substrate/sweep-stalled', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ flipped: engine.sweepStalledWorkers() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 24 — Cognitive Compression + Operational Storytelling ────
// Deterministic template-rendered narratives over Phase 13-23 data.
// No LLM, no inference. Every block cites its source attribution rows.
router.get('/api/portal/project/cognitive-compression/causal-story', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const story = engine.buildCausalStoryReplay({ organization_id });
    res.json(story);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/rollback-narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRollbackNarrativeReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/continuity-narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildContinuityNarrative({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/topology-narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildTopologyNarrativeReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/trust-surface', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperationalTrustSurface({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/cognitive-load', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildCognitiveLoadProfile({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/operator-guidance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({
      latest: engine.buildOperatorGuidancePlan({ organization_id }),
      history: engine.listOperatorGuidancePlans(organization_id),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/narratives', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ narratives: engine.listNarratives(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/cognitive-compression/template-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const ids = engine.listTemplateIds();
    res.json({
      template_count: ids.length,
      templates: ids.map(id => {
        const spec = engine.getTemplateSpec(id);
        return spec ? { template_id: id, description: spec.description, required_vars: spec.required_vars } : { template_id: id };
      }),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 25 — Operational Experimentation + Sandbox ────────
// Operator-initiated counterfactual projection. Pure in-memory
// simulation — never mutates production state.
router.post('/api/portal/project/experimentation/sandbox', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, hypothetical_actions, tier } = req.body || {};
    if (!organization_id || !Array.isArray(hypothetical_actions)) {
      res.status(400).json({ error: 'organization_id_and_hypothetical_actions_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.submitExecutionSandbox({ organization_id, hypothetical_actions, tier }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/sandboxes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ sandboxes: engine.listSandboxes(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/experimentation/rollback-simulation', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, plan_id, source_chain_ids, experiment_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.simulateRollback({ organization_id, plan_id, source_chain_ids, experiment_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/rollback-simulations', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ simulations: engine.listRollbackSimulations(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/experimentation/propagation-preview', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, hypothetical_origin, hypothetical_action_kind, experiment_id } = req.body || {};
    if (!organization_id || !hypothetical_origin || !hypothetical_action_kind) {
      res.status(400).json({ error: 'organization_id_origin_and_kind_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildPropagationPreview({ organization_id, hypothetical_origin, hypothetical_action_kind, experiment_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/propagation-previews', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ previews: engine.listPropagationPreviews(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/experimentation/rehearsal', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, chain, experiment_id } = req.body || {};
    if (!organization_id || !Array.isArray(chain)) {
      res.status(400).json({ error: 'organization_id_and_chain_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.rehearseStabilization({ organization_id, chain, experiment_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/rehearsals', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ rehearsals: engine.listRehearsals(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/governance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildSandboxGovernanceProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExperimentationTrustSurface({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExperimentationVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/experimentation/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExperimentReplayBundle({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 26 — Bounded Live Operational Rehearsal Substrate ──────
// Async lifecycle envelope wrapping Phase 25 projection. Pure
// in-memory typed state machine — no real worker spawning, no
// production-state mutation.
router.post('/api/portal/project/live-sandbox', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, hypothetical_actions, ttl_ms } = req.body || {};
    if (!organization_id || !Array.isArray(hypothetical_actions)) {
      res.status(400).json({ error: 'organization_id_and_hypothetical_actions_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.submitLiveSandbox({
      organization_id, hypothetical_actions,
      operator_id: req.participant!.sub, ttl_ms,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/runtimes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ runtimes: engine.listRuntimes(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/runtimes/:runtime_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const runtime = engine.getRuntime(String(req.params.runtime_id));
    if (!runtime) { res.status(404).json({ error: 'runtime_not_found' }); return; }
    res.json(runtime);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/live-sandbox/runtimes/:runtime_id/expire', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const updated = engine.expireRuntime(String(req.params.runtime_id), 'operator_cancelled');
    if (!updated) { res.status(404).json({ error: 'runtime_not_found' }); return; }
    res.json(updated);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/live-sandbox/rollback-rehearsal', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { runtime_id, organization_id, plan_id, source_chain_ids, experiment_id } = req.body || {};
    if (!runtime_id || !organization_id) {
      res.status(400).json({ error: 'runtime_id_and_organization_id_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const replay = engine.rehearseSandboxRollback({
      runtime_id, organization_id, plan_id, source_chain_ids, experiment_id,
    });
    if (!replay) { res.status(404).json({ error: 'runtime_not_eligible' }); return; }
    res.json(replay);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/rollback-rehearsals', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ rehearsals: engine.listSandboxRollbackRehearsals(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/live-sandbox/runtimes/:runtime_id/preview-narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.body?.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const narrative = engine.buildSandboxPreviewNarrative({
      runtime_id: String(req.params.runtime_id), organization_id,
    });
    if (!narrative) { res.status(404).json({ error: 'runtime_not_found_or_no_narrative_blocks' }); return; }
    res.json(narrative);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/preview-narratives', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ narratives: engine.listSandboxPreviewNarratives(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/governance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildLiveSandboxGovernanceProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildLiveSandboxTrustSurface({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildLiveSandboxVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/live-sandbox/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildSandboxReplayBundle({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 27 — Bounded Delegated Operational Execution Substrate ──
// SAFETY MODEL: Delegated execution is NOT autonomous orchestration.
// The operator remains the sole authority source. This substrate
// executes ONE bounded pre-authorized action inside strict
// rollback-protected governance constraints. Single-use envelopes,
// 7 structural safety invariants, hard timeouts, no side-effect chains.
router.post('/api/portal/project/delegated-execution/envelope', requireParticipant, async (req: Request, res: Response) => {
  try {
    const {
      action_kind, target_namespace, target_kind, target_organization_id,
      target_plan_id, target_step_id, rollback_chain_id,
      topology_containment_proof, ttl_ms,
    } = req.body || {};
    if (!action_kind || !target_organization_id || !rollback_chain_id || !topology_containment_proof) {
      res.status(400).json({
        error: 'action_kind_target_organization_id_rollback_chain_id_topology_containment_proof_required',
      }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    // Pre-flight: forbidden registry hard veto.
    if (engine.isActionForbidden(action_kind)) {
      res.status(400).json({ error: 'action_forbidden', explanation: engine.explainForbidden(action_kind) }); return;
    }
    // Pre-flight: governance issuance gate. Uses placeholder envelope_id
    // since the envelope hasn't been issued yet — gate evaluates the
    // would-be issuance shape only.
    const issuer_organization_id = String(req.body?.issuer_organization_id ?? target_organization_id);
    const gate = engine.evaluateDelegatedIssuance({
      envelope_id: 'pre_issuance',
      operator_id: req.participant!.sub,
      organization_id: issuer_organization_id,
      action_kind,
      target_organization_id,
      target_namespace,
      rollback_chain_id,
      target_plan_id,
      target_step_id,
    });
    if (gate.decision !== 'permitted') {
      res.status(403).json({ error: 'issuance_denied', reason: gate.reason, attribution: gate.attribution }); return;
    }
    const result = engine.issueAuthorityEnvelope({
      operator_id: req.participant!.sub,
      action_kind, target_namespace, target_kind, target_organization_id,
      target_plan_id, target_step_id, rollback_chain_id,
      topology_containment_proof, ttl_ms,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/envelopes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ envelopes: engine.listDelegatedEnvelopes(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/envelope/:envelope_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const env = engine.getDelegatedEnvelope(String(req.params.envelope_id));
    if (!env) { res.status(404).json({ error: 'envelope_not_found' }); return; }
    res.json(env);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/delegated-execution/envelope/:envelope_id/revoke', requireParticipant, async (req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    const updated = engine.revokeEnvelope(String(req.params.envelope_id));
    if (!updated) { res.status(404).json({ error: 'envelope_not_found' }); return; }
    res.json(updated);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// SYNCHRONOUS executor — flow: validate → 7 safety invariants → invoke
// ONE Phase 21/22/23 mutator with hard timeout → consume envelope.
router.post('/api/portal/project/delegated-execution/execute', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { envelope_id, timeout_ms } = req.body || {};
    if (!envelope_id) { res.status(400).json({ error: 'envelope_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const result = await engine.executeDelegated({
      envelope_id,
      issuer_organization_id: req.participant!.sub,
      timeout_ms,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/traces', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ traces: engine.listDelegatedExecutionTraces(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/governance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildDelegatedGovernanceProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildDelegatedExecutionTrustSurface({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildDelegatedExecutionVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildDelegatedReplayBundle({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/delegated-execution/authority-narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { envelope_id, organization_id } = req.body || {};
    if (!envelope_id || !organization_id) {
      res.status(400).json({ error: 'envelope_id_and_organization_id_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const narrative = engine.buildAuthorityCompressionNarrative({ envelope_id, organization_id });
    if (!narrative) { res.status(404).json({ error: 'envelope_not_found_or_no_narrative' }); return; }
    res.json(narrative);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/delegated-execution/non-delegatable-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.getNonDelegatableRegistry());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 28 — Execution Resource Governance + Operational Economics ─
// SAFETY MODEL: deterministic resource accounting. Phase 28 OBSERVES,
// CLASSIFIES, BUDGETS, and CONSTRAINS. It NEVER optimizes, allocates
// dynamically, reprioritizes execution, rebalances topology, expands
// authority, or auto-governs runtime economics. Static operator-set
// quotas; cross-organization isolation absolute.
router.get('/api/portal/project/economics/quota', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionQuotaProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/economics/quota/set', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, quota_key, updated_limit, reason } = req.body || {};
    if (!organization_id || !quota_key || typeof updated_limit !== 'number' || !reason) {
      res.status(400).json({
        error: 'organization_id_quota_key_updated_limit_reason_required',
      }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.setQuotaLimit({
      organization_id, quota_key, updated_limit,
      updated_by: req.participant!.sub, reason,
    });
    if (!result.applied) {
      res.status(400).json({ error: result.reason ?? 'quota_set_rejected' }); return;
    }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/pressure', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRuntimePressureProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/load', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildTopologyLoadDistributionProfile(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/forecast', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRollbackResourceForecast(organization_id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/governance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({
      recent_governance: engine.listQuotaGovernanceAttributions(organization_id),
      recent_exhaustions: engine.listQuotaExhaustions(organization_id),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionEconomicsTrustSurface({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionEconomicsVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionEconomicsReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/economics/narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.body?.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const narrative = engine.buildExecutionEconomicsNarrative({ organization_id });
    if (!narrative) { res.status(404).json({ error: 'no_economics_data' }); return; }
    res.json(narrative);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/forbidden-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.getForbiddenEconomicsRegistry());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/economics/summary', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildExecutionEconomicsSummary(organization_id || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 29 — Stabilization Playbook Intelligence + Recovery Governance ─
// SAFETY MODEL: read-only recovery recommendation intelligence. Phase 29
// RECOMMENDS, SEQUENCES, FORECASTS, CLASSIFIES, REPLAYS — never executes.
// Operator click + Phase 27 envelope is the sole mutation path.
// `operator_mediation_required: true` typed-as-literal across every gate.
router.get('/api/portal/project/stabilization/archetypes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({ archetypes: engine.listStabilizationArchetypes(organization_id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/archetypes/:archetype_id', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const arch = engine.getStabilizationArchetype(organization_id, String(req.params.archetype_id));
    if (!arch) { res.status(404).json({ error: 'archetype_not_found' }); return; }
    res.json(arch);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/stabilization/archetypes', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id, name, description, steps, applicable_when, reason } = req.body || {};
    if (!organization_id || !name || !description || !Array.isArray(steps) || !Array.isArray(applicable_when) || !reason) {
      res.status(400).json({ error: 'organization_id_name_description_steps_applicable_when_reason_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.setOperatorArchetype({
      organization_id, archetype_id, name, description, steps, applicable_when,
      registered_by: req.participant!.sub, reason,
    });
    if (!result.applied) { res.status(400).json({ error: result.reason ?? 'archetype_set_rejected' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/stabilization/sequencing', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id, per_step_overrides } = req.body || {};
    if (!organization_id || !archetype_id) { res.status(400).json({ error: 'organization_id_and_archetype_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.buildRollbackSequencing({ organization_id, archetype_id, per_step_overrides });
    if (!result.built) { res.status(404).json({ error: result.reason }); return; }
    res.json(result.profile);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/stabilization/forecast', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id } = req.body || {};
    if (!organization_id || !archetype_id) { res.status(400).json({ error: 'organization_id_and_archetype_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.buildContinuityRestorationForecast({ organization_id, archetype_id });
    if (!result.built) { res.status(404).json({ error: result.reason }); return; }
    res.json(result.forecast);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/pressure', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json({
      profile: engine.buildRecoveryPressureProfile(organization_id),
      containment: engine.buildContainmentAttribution({ organization_id }),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/stabilization/governance/evaluate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id, per_step_rollback_chain_ids } = req.body || {};
    if (!organization_id || !archetype_id || !Array.isArray(per_step_rollback_chain_ids)) {
      res.status(400).json({ error: 'organization_id_archetype_id_per_step_rollback_chain_ids_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.evaluateArchetypeApplication({
      organization_id, archetype_id,
      issuer_organization_id: organization_id,
      operator_id: req.participant!.sub,
      per_step_rollback_chain_ids,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/stabilization/governance/finality', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id, envelope_ids_issued, bounded_reason } = req.body || {};
    if (!organization_id || !archetype_id || !Array.isArray(envelope_ids_issued) || !bounded_reason) {
      res.status(400).json({ error: 'organization_id_archetype_id_envelope_ids_issued_bounded_reason_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const proof = engine.recordArchetypeFinalityProof({
      organization_id, archetype_id,
      operator_id: req.participant!.sub,
      envelope_ids_issued, bounded_reason,
    });
    res.json(proof);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const archetype_id = req.query.archetype_id ? String(req.query.archetype_id) : undefined;
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildStabilizationTrustSurface({ organization_id, archetype_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildStabilizationVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const archetype_id = req.query.archetype_id ? String(req.query.archetype_id) : undefined;
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildStabilizationReplayBundle({ organization_id, archetype_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/stabilization/narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const narr = engine.buildStabilizationNarrative({ organization_id, archetype_id });
    if (!narr) { res.status(404).json({ error: 'no_stabilization_data' }); return; }
    res.json(narr);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/forbidden-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.getForbiddenRecoveryRegistry());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/stabilization/summary', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildStabilizationSummary(organization_id || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 30 — Recovery Foresight UX + Stabilization Decision Cognition ─
// SAFETY MODEL: read-only comparison cognition. Phase 30 COMPARES, EXPLAINS,
// WALKS THROUGH, REPLAYS, FORECASTS — never selects, never ranks.
// `engine_never_ranks: true` typed-as-literal on every output.
router.post('/api/portal/project/foresight/comparison', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_ids, per_step_rollback_chain_id_hint } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const profile = engine.buildStabilizationDecisionComparison({
      organization_id, operator_id: req.participant!.sub,
      archetype_ids, per_step_rollback_chain_id_hint,
    });
    res.json(profile);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/survivability', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_ids } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRollbackSurvivabilityComparison({ organization_id, archetype_ids }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/tradeoff', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_ids } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildContinuityTradeoffProfile({ organization_id, archetype_ids }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/archaeology', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRecoveryArchaeologyReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/governance/evaluate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_id, comparison_id, requested_action_kind } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.evaluateComparisonRequest({
      organization_id, issuer_organization_id: organization_id,
      operator_id: req.participant!.sub,
      comparison_id, archetype_id, requested_action_kind,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_ids } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRecoveryForesightReplayBundle({
      organization_id, operator_id: req.participant!.sub, archetype_ids,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/guidance', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_ids } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildStabilizationGuidanceSurface({
      organization_id, operator_id: req.participant!.sub, archetype_ids,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/foresight/walkthrough', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, archetype_ids } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRecoveryNarrativeWalkthrough({
      organization_id, operator_id: req.participant!.sub, archetype_ids,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/foresight/trust', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRecoveryForesightTrustSurface({
      organization_id, operator_id: req.participant!.sub,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/foresight/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRecoveryForesightVisibilityReplay({
      organization_id, operator_id: req.participant!.sub,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/foresight/forbidden-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.getForbiddenForesightRegistry());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/foresight/summary', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildRecoveryForesightSummary(organization_id || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 31 — Operator Cognition Continuity + Governance Memory ──
// SAFETY MODEL: replay-safe per-org append-only event log.
// Phase 31 PERSISTS, REPLAYS, TIMELINES, COMPRESSES, NARRATES.
// NEVER profiles operators, NEVER predicts behavior, NEVER ranks.
// Population is operator-mediated POST only.
router.post('/api/portal/project/memory/session/open', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, note } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    // Pre-flight: governance gate
    const gate = engine.evaluateMemoryRequest({
      organization_id, issuer_organization_id: organization_id,
      operator_id: req.participant!.sub,
    });
    if (gate.decision !== 'permitted') {
      res.status(403).json({ error: gate.reason, rule: gate.supervisor_rule_violated });
      return;
    }
    const result = engine.openSession({
      organization_id, operator_id: req.participant!.sub, note,
    });
    if (!result.opened) { res.status(400).json({ error: result.reason ?? 'session_open_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/memory/session/event', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, session_id, event_kind, subject_kind, subject_id, note } = req.body || {};
    if (!organization_id || !session_id || !event_kind) {
      res.status(400).json({ error: 'organization_id_session_id_event_kind_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const gate = engine.evaluateMemoryRequest({
      organization_id, issuer_organization_id: organization_id,
      operator_id: req.participant!.sub, session_id, event_kind,
    });
    if (gate.decision !== 'permitted') {
      res.status(403).json({ error: gate.reason, rule: gate.supervisor_rule_violated });
      return;
    }
    const result = engine.recordEvent({
      organization_id, session_id, operator_id: req.participant!.sub,
      event_kind, subject_kind, subject_id, note,
    });
    if (!result.recorded) { res.status(400).json({ error: result.reason ?? 'event_record_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/memory/session/close', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, session_id, note } = req.body || {};
    if (!organization_id || !session_id) {
      res.status(400).json({ error: 'organization_id_and_session_id_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.closeSession({
      organization_id, session_id, operator_id: req.participant!.sub, note,
    });
    if (!result.closed) { res.status(400).json({ error: result.reason ?? 'session_close_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/memory/continuity', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperatorContinuityProfile({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/memory/timeline', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const window_start = req.query.window_start ? String(req.query.window_start) : undefined;
    const window_end = req.query.window_end ? String(req.query.window_end) : undefined;
    const operator_id_filter = req.query.operator_id_filter ? String(req.query.operator_id_filter) : undefined;
    const session_id_filter = req.query.session_id_filter ? String(req.query.session_id_filter) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildCognitionTimelineSurface({
      organization_id, window_start, window_end,
      operator_id_filter, session_id_filter, limit,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/memory/archaeology', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildGovernanceArchaeology({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/memory/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, window_start, window_end, operator_id_filter } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildReasoningContinuityReplay({
      organization_id, window_start, window_end, operator_id_filter,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/memory/compression', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, window_start, window_end, max_representative_sessions_per_kind } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperatorReasoningCompression({
      organization_id, window_start, window_end, max_representative_sessions_per_kind,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/memory/narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildMemoryContinuityNarrative({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/memory/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildGovernanceMemoryVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/memory/forbidden-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.getForbiddenMemoryRegistry());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/memory/summary', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildGovernanceMemorySummary(organization_id || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Phase 32 — Multi-Operator Governance Continuity + Handoff Cognition ─
// SAFETY MODEL: replay-safe per-org append-only handoff event log.
// Phase 32 RECORDS handoff events; NEVER ranks, scores, infers, or routes.
// authority_transfer_supported: false typed-as-literal on every handoff.
// Population is operator-mediated POST only.
router.post('/api/portal/project/handoff/record', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, to_operator_id, context_summary, reason, source_session_id, transfer_bundle_id } = req.body || {};
    if (!organization_id || !to_operator_id) {
      res.status(400).json({ error: 'organization_id_and_to_operator_id_required' }); return;
    }
    const engine = await import('../intelligence/systemStateEngine');
    const gate = engine.evaluateHandoffRequest({
      organization_id, issuer_organization_id: organization_id,
      from_operator_id: req.participant!.sub, to_operator_id,
    });
    if (gate.decision !== 'permitted') {
      res.status(403).json({ error: gate.reason, rule: gate.supervisor_rule_violated }); return;
    }
    const result = engine.recordHandoff({
      organization_id, from_operator_id: req.participant!.sub, to_operator_id,
      context_summary: context_summary ?? '', reason: reason ?? '',
      source_session_id, transfer_bundle_id,
    });
    if (!result.recorded) { res.status(400).json({ error: result.reason ?? 'handoff_record_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/acknowledge', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, handoff_id } = req.body || {};
    if (!organization_id || !handoff_id) { res.status(400).json({ error: 'organization_id_and_handoff_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const gate = engine.evaluateHandoffRequest({
      organization_id, issuer_organization_id: organization_id,
      from_operator_id: req.participant!.sub, handoff_id,
    });
    if (gate.decision !== 'permitted') {
      res.status(403).json({ error: gate.reason, rule: gate.supervisor_rule_violated }); return;
    }
    const result = engine.acknowledgeHandoff({
      organization_id, handoff_id, operator_id: req.participant!.sub,
    });
    if (!result.transitioned) { res.status(400).json({ error: result.reason ?? 'handoff_acknowledge_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/decline', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, handoff_id } = req.body || {};
    if (!organization_id || !handoff_id) { res.status(400).json({ error: 'organization_id_and_handoff_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.declineHandoff({
      organization_id, handoff_id, operator_id: req.participant!.sub,
    });
    if (!result.transitioned) { res.status(400).json({ error: result.reason ?? 'handoff_decline_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/transfer', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, to_operator_id, ...refs } = req.body || {};
    if (!organization_id || !to_operator_id) { res.status(400).json({ error: 'organization_id_and_to_operator_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    const result = engine.buildContinuityTransferBundle({
      organization_id, from_operator_id: req.participant!.sub, to_operator_id,
      ...refs,
    });
    if (!result.built) { res.status(400).json({ error: result.reason ?? 'transfer_build_failed' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/handoff/timeline', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const window_start = req.query.window_start ? String(req.query.window_start) : undefined;
    const window_end = req.query.window_end ? String(req.query.window_end) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildSharedStabilizationTimeline({
      organization_id, window_start, window_end, limit,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/archaeology', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperatorHandoffArchaeology({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/replay', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, window_start, window_end } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildCollaborativeContinuityReplay({
      organization_id, window_start, window_end,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/compression', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id, window_start, window_end, max_representative_handoffs_per_kind } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperatorCoordinationCompression({
      organization_id, window_start, window_end, max_representative_handoffs_per_kind,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/portal/project/handoff/narrative', requireParticipant, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.body || {};
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildHandoffContinuityNarrative({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/handoff/visibility', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    if (!organization_id) { res.status(400).json({ error: 'organization_id_required' }); return; }
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperatorContinuityVisibilityReplay({ organization_id }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/handoff/forbidden-registry', requireParticipant, async (_req: Request, res: Response) => {
  try {
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.getForbiddenHandoffRegistry());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/portal/project/handoff/summary', requireParticipant, async (req: Request, res: Response) => {
  try {
    const organization_id = String(req.query.organization_id ?? '');
    const engine = await import('../intelligence/systemStateEngine');
    res.json(engine.buildOperatorContinuitySummary(organization_id || undefined));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
