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

/**
 * The student's archived projects, so the portal can offer a restore.
 *
 * MUST be declared above `GET /api/portal/projects/:projectId` — Express matches
 * in declaration order, so registered after it the literal `archived` would be
 * captured as a project id and answer 404 forever. Same reason `/active` sits
 * where it does.
 */
router.get('/api/portal/projects/archived', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const { listArchivedProjectsForEnrollment } = await import('../services/projectService');
    const rows = await listArchivedProjectsForEnrollment(eid(req));
    res.json({
      projects: rows.map((p) => ({
        id: String(p.id),
        name: (p as any).name ?? null,
        archived_at: (p as any).archived_at,
      })),
    });
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

// ── archive / restore a project the student owns ──────────────────────────────
/**
 * A student removes their own project. Soft-delete: `projects.archived_at` is
 * stamped, nothing is deleted, and `POST .../restore` puts it back.
 *
 * The platform's own project record is refused by the service on all three
 * routes (see services/projects/protectedProjects.ts). That refusal is
 * independent of the archivable-listing filter, so a request typed straight at
 * this endpoint is rejected even though no client ever offered it.
 *
 * `confirm_name` is required on the archive call and must match the project's
 * own name. The point is not security — the student is authorised — it is that
 * removing a build should take a deliberate act rather than one mis-aimed click
 * next to the normal controls.
 */
const archiveSchema = z.object({
  confirm_name: z.string().max(300).optional(),
});

router.get(
  '/api/portal/projects/:projectId/archive-preview',
  requireParticipant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!gate(res)) return;
      const { getArchivePreview } = await import('../services/projects/projectArchiveService');
      res.json(await getArchivePreview(eid(req), String(req.params.projectId)));
    } catch (e) { fail(res, e, next); }
  },
);

router.post(
  '/api/portal/projects/:projectId/archive',
  requireParticipant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!gate(res)) return;
      const { confirm_name } = archiveSchema.parse(req.body || {});
      const { archiveProject, getArchivePreview, ArchiveError } =
        await import('../services/projects/projectArchiveService');

      // The typed name is verified against the project the SERVER holds, not
      // against a name the client sent alongside it — otherwise the client is
      // grading its own homework and the confirmation proves nothing.
      const preview = await getArchivePreview(eid(req), String(req.params.projectId));
      const expected = (preview.name ?? '').trim();
      if (expected) {
        if ((confirm_name ?? '').trim().toLowerCase() !== expected.toLowerCase()) {
          throw new ArchiveError(
            400,
            'Type the project name exactly to confirm.',
            'ConfirmNameMismatch',
          );
        }
      }
      // An unnamed project cannot be confirmed by name. Rather than block the
      // student out of removing it, the deliberate act falls back to the UI's
      // hold-to-confirm; the server still requires the POST to name the project
      // in its path, which no stray click produces.
      res.json(await archiveProject(eid(req), String(req.params.projectId)));
    } catch (e) { fail(res, e, next); }
  },
);

router.post(
  '/api/portal/projects/:projectId/restore',
  requireParticipant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!gate(res)) return;
      const { restoreProject } = await import('../services/projects/projectArchiveService');
      res.json(await restoreProject(eid(req), String(req.params.projectId)));
    } catch (e) { fail(res, e, next); }
  },
);

export default router;
