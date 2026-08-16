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
import { setTaskStatus, setTaskStatusByStory, importProject, type ImportProjectInput } from '../services/projects/projectWriteService';
import { attachmentsSchema } from '../services/agents/tools/attachmentSchema';
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

// `complete` stays in the enum on purpose. Zod's job here is shape — "is this a
// status this system knows about" — and the service decides who may set which.
// Dropping it would answer a client's completion attempt with a generic 400
// "invalid enum value", which reads like a client bug; keeping it lets the
// service answer 409 and explain that completion is granted, not claimed.
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

// Mirrors the classroom runtime's mentor contract exactly, so the two
// workspaces speak the same language and a client can share code.
const mentorSchema = z.object({
  mode: z.enum(['ask', 'hint', 'explain', 'review']).default('ask'),
  message: z.string().max(4000).default(''),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).max(40).optional(),
  // Files the student attached to this turn (read_attachments tool). Ids only —
  // the bytes were uploaded separately and are owner-checked on read.
  attachments: attachmentsSchema,
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

// Set a task's status. A student may move a task freely between not_started,
// in_progress and blocked — that is their own planning. `complete` is refused
// with 409: it is granted by the platform when the work is verified, never
// claimed by the client. `fail()` carries the service's status and message out.
router.patch('/api/portal/projects/tasks/:taskId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const { status } = statusSchema.parse(req.body || {});
    const r = await setTaskStatus(eid(req), String(req.params.taskId), status);
    if (!r) return res.status(404).json({ error: 'Task not found' });
    res.json(r);
  } catch (e) { fail(res, e, next); }
});

// Write-through by story_id, scoped to the active project. The localStorage store
// holds story_ids, not backend UUIDs, so this is its per-task status write path.
// Under the same completion rule as the by-id route above — it reaches the same
// guard, so this is not a second way in.
router.patch('/api/portal/projects/tasks/by-story/:storyId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const { status } = statusSchema.parse(req.body || {});
    const r = await setTaskStatusByStory(eid(req), String(req.params.storyId), status);
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

/**
 * The AI mentor for one project task — the SAME coach the classroom runtime
 * uses, handed the task instead of a Timeline card. A student inside a build
 * should not get a weaker mentor than a student inside a lesson.
 *
 * 404 covers both "no such task" and "not yours", so probing for other
 * students' project ids tells you nothing.
 */
router.post(
  '/api/portal/projects/:projectId/tasks/:taskId/mentor',
  requireParticipant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!gate(res)) return;
      const body = mentorSchema.parse(req.body || {});
      const { loadOwnedTask, coachOnTask } = await import('../services/projects/projectMentorService');
      const task = await loadOwnedTask(eid(req), String(req.params.projectId), String(req.params.taskId));
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(await coachOnTask(eid(req), task, body.mode, body.message, body.history || [], body.attachments || []));
    } catch (e) { fail(res, e, next); }
  },
);

/**
 * Point a project at its Command Center. Set once STORY-000 is built and
 * deployed; every workspace on that build then shows a link to it.
 *
 * https only, and the URL is validated here rather than at render time — the
 * portal opens it in a new tab, so a `javascript:` URL would be a stored XSS
 * with a student as the author.
 */
const commandCenterSchema = z.object({
  url: z.string().trim().url().refine((u) => u.startsWith('https://'), 'must be https'),
});

router.patch(
  '/api/portal/projects/:projectId/command-center',
  requireParticipant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!gate(res)) return;
      const { url } = commandCenterSchema.parse(req.body || {});
      const { setCommandCenterUrl } = await import('../services/projects/projectWriteService');
      const tree = await setCommandCenterUrl(eid(req), String(req.params.projectId), url);
      if (!tree) return res.status(404).json({ error: 'Project not found' });
      res.json(tree);
    } catch (e) { fail(res, e, next); }
  },
);

export default router;
