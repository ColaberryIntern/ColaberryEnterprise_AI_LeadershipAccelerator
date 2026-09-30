import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';

const router = Router();

// Per-student data isolation: every route resolves the project THEN checks
// enrollment_id matches the caller, so a participant can never read or draft
// another student's showcase artifacts even by guessing a project id.
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

router.post('/api/portal/projects/:projectId/showcase-artifacts/scaffold', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { scaffoldShowcaseSlots } = await import('../services/showcaseArtifactService');
    const slots = await scaffoldShowcaseSlots(project.id);
    res.json({ slots });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

router.get('/api/portal/projects/:projectId/showcase-artifacts', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { listShowcaseArtifacts } = await import('../services/showcaseArtifactService');
    const slots = await listShowcaseArtifacts(project.id);
    res.json({ slots });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

router.post('/api/portal/projects/:projectId/showcase-artifacts/:type/draft', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { draftShowcaseArtifact } = await import('../services/showcaseArtifactService');
    const slot = await draftShowcaseArtifact(project.id, req.params.type as any);
    res.json({ slot });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

export default router;
