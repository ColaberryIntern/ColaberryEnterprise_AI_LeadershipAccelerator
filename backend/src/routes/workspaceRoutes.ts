/**
 * Student workspace repo routes — provision + sync the per-student GitHub repo
 * that backs the project workspace. Mounted under participantRoutes (full
 * `/api/portal/...` paths, requireParticipant). Enrollment = req.participant.sub.
 */
import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';

const router = Router();

// Current workspace-repo state for the student (connected? provisioned? repo url).
router.get('/api/portal/workspace/repo', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { getWorkspaceRepo } = await import('../services/studentWorkspaceService');
    res.json(await getWorkspaceRepo(enrollmentId));
  } catch (err: any) {
    console.error('[WorkspaceRoutes] GET /workspace/repo error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Provision (idempotently) the student's private repo under the org + add them
// as a push collaborator. Body: { github_login }.
router.post('/api/portal/workspace/repo/provision', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const login = (req.body?.github_login || '').trim();
    if (!login) { res.status(400).json({ error: 'github_login is required' }); return; }
    const { provisionWorkspaceRepo } = await import('../services/studentWorkspaceService');
    res.json(await provisionWorkspaceRepo(enrollmentId, login));
  } catch (err: any) {
    console.error('[WorkspaceRoutes] POST /workspace/repo/provision error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Sync (pull) the student's repo — refresh file tree + recent commits.
router.post('/api/portal/workspace/repo/sync', requireParticipant, async (req: Request, res: Response) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { syncWorkspaceRepo } = await import('../services/studentWorkspaceService');
    res.json(await syncWorkspaceRepo(enrollmentId));
  } catch (err: any) {
    console.error('[WorkspaceRoutes] POST /workspace/repo/sync error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
