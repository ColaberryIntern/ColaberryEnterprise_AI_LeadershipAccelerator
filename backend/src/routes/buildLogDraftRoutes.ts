import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';

const router = Router();

// Per-student data isolation: every route resolves the project THEN checks
// enrollment_id matches the caller, so a participant can never read, draft,
// or mark posted another student's build-log drafts even by guessing a
// project id (same pattern as showcaseArtifactRoutes.ts).
async function findOwnedProject(enrollmentId: string, projectId: string) {
  const { default: Project } = await import('../models/Project');
  const project = await Project.findByPk(projectId);
  if (!project || project.enrollment_id !== enrollmentId) return null;
  return project;
}

function statusFor(errorClass: string | undefined): number {
  if (errorClass === 'NotFoundError') return 404;
  if (errorClass === 'ValidationError') return 400;
  if (errorClass === 'UpstreamUnavailable') return 502;
  return 500;
}

router.get('/api/portal/projects/:projectId/build-log-drafts', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { listBuildLogDrafts } = await import('../services/buildLogDraftService');
    const drafts = await listBuildLogDrafts(project.id);
    res.json({ drafts });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

router.post('/api/portal/projects/:projectId/build-log-drafts/:weekNumber/generate', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const weekNumber = parseInt(req.params.weekNumber as string, 10);
    const { draftBuildLogPost } = await import('../services/buildLogDraftService');
    const draft = await draftBuildLogPost(project.id, weekNumber);
    res.json({ draft });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

router.patch('/api/portal/projects/:projectId/build-log-drafts/:draftId', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { section, status } = req.body ?? {};
    if (status !== 'posted' && status !== 'skipped') {
      res.status(400).json({ error: 'status must be "posted" or "skipped"' });
      return;
    }

    const { markBuildLogSectionStatus, BUILD_LOG_SECTION_TYPES } = await import('../services/buildLogDraftService');
    if (!BUILD_LOG_SECTION_TYPES.includes(section)) {
      res.status(400).json({ error: `section must be one of: ${BUILD_LOG_SECTION_TYPES.join(', ')}` });
      return;
    }

    const draft = await markBuildLogSectionStatus(project.id, req.params.draftId as string, section, status);
    res.json({ draft });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

export default router;
