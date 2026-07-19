/**
 * projectsPortalRoutes — read API for persisted student projects (Project Backend
 * P1). Serves the StudentTask hierarchy the localStorage `projectsStore` will
 * migrate onto. Flag-gated on env.projectApiEnabled (404 when off) so it ships
 * dark until the frontend is switched. Scoped to req.participant.sub (a student
 * only reads their own projects). Read-only; no-store.
 *
 *   GET /api/portal/projects            — the student's projects (summaries)
 *   GET /api/portal/projects/active     — active project as a full task tree
 *   GET /api/portal/projects/:projectId — a specific owned project tree
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
import {
  getActiveProjectTree,
  getOwnedProjectTree,
  listEnrollmentProjectsSummary,
} from '../services/projects/projectReadService';

const router = Router();
const eid = (req: Request) => req.participant!.sub;

function gate(res: Response): boolean {
  if (!env.projectApiEnabled) {
    res.status(404).json({ error: 'Projects API not enabled' });
    return false;
  }
  res.set('Cache-Control', 'no-store');
  return true;
}
function fail(res: Response, err: any, next: NextFunction) {
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

router.get('/api/portal/projects', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    res.json({ projects: await listEnrollmentProjectsSummary(eid(req)) });
  } catch (e) { fail(res, e, next); }
});

router.get('/api/portal/projects/active', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    res.json(await getActiveProjectTree(eid(req)) ?? { project: null });
  } catch (e) { fail(res, e, next); }
});

router.get('/api/portal/projects/:projectId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const tree = await getOwnedProjectTree(eid(req), String(req.params.projectId));
    if (!tree) return res.status(404).json({ error: 'Project not found' });
    res.json(tree);
  } catch (e) { fail(res, e, next); }
});

export default router;
