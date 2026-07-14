import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { UpdateBuildArtifactSchema } from '../schemas/buildArtifactSchema';

const router = Router();

// Per-student data isolation: every route resolves the project THEN checks
// enrollment_id matches the caller, so a participant can never read or update
// another student's build-artifact slots even by guessing a project id.
async function findOwnedProject(enrollmentId: string, projectId: string) {
  const { default: Project } = await import('../models/Project');
  const project = await Project.findByPk(projectId);
  if (!project || project.enrollment_id !== enrollmentId) return null;
  return project;
}

function statusFor(errorClass: string | undefined): number {
  if (errorClass === 'NotFoundError') return 404;
  if (errorClass === 'ValidationError') return 400;
  return 500;
}

router.post('/api/portal/projects/:projectId/build-artifacts/scaffold', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { scaffoldBuildArtifactSlots } = await import('../services/buildArtifactService');
    const slots = await scaffoldBuildArtifactSlots(project.id);
    res.json({ slots });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

router.get('/api/portal/projects/:projectId/build-artifacts', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { listBuildArtifacts } = await import('../services/buildArtifactService');
    const slots = await listBuildArtifacts(project.id);
    res.json({ slots });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

router.patch('/api/portal/projects/:projectId/build-artifacts/:week', requireParticipant, async (req: Request, res: Response) => {
  try {
    const project = await findOwnedProject(req.participant!.sub, req.params.projectId as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const parsed = UpdateBuildArtifactSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const week = Number(req.params.week);
    const { updateBuildArtifact } = await import('../services/buildArtifactService');
    const slot = await updateBuildArtifact(project.id, week, parsed.data);
    res.json({ slot });
  } catch (err: any) {
    res.status(statusFor(err?.error_class)).json({ error: err.message });
  }
});

export default router;
