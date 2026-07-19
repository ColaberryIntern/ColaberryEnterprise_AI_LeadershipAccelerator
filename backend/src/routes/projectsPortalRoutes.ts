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
import { setTaskStatus, importProject, type ImportProjectInput } from '../services/projects/projectWriteService';
import { z } from 'zod';

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
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

const statusSchema = z.object({ status: z.enum(['not_started', 'in_progress', 'complete', 'blocked']) });
const importTaskSchema = z.object({
  story_id: z.string().nullish(),
  requirement_key: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  position: z.number().optional(),
  owner_agent: z.string().nullish(),
  execution_mode: z.string().nullish(),
  release_key: z.string().nullish(),
  acceptance: z.any().optional(),
  build: z.string().nullish(),
  blocked_by: z.array(z.string()).optional(),
});
const importSchema = z.object({
  name: z.string().optional(),
  lists: z.array(z.object({
    cluster: z.string(),
    title: z.string().optional(),
    position: z.number().optional(),
    tasks: z.array(importTaskSchema),
  })),
});

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

// Set a task's status (not_started | in_progress | complete | blocked).
router.patch('/api/portal/projects/tasks/:taskId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const { status } = statusSchema.parse(req.body || {});
    const r = await setTaskStatus(eid(req), String(req.params.taskId), status);
    if (!r) return res.status(404).json({ error: 'Task not found' });
    res.json(r);
  } catch (e) { fail(res, e, next); }
});

// One-time migration: import the client (localStorage) project into the backend.
router.post('/api/portal/projects/import', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const payload = importSchema.parse(req.body || {}) as ImportProjectInput;
    res.json(await importProject(eid(req), payload));
  } catch (e) { fail(res, e, next); }
});

export default router;
