import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';

const router = Router();

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

export default router;
