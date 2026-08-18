/**
 * sbpRoutes — the Student Build Pipeline HTTP surface.
 *
 * Four endpoints, all participant-scoped. The enrollment comes from the verified
 * JWT and never from the request body; the project is verified to belong to that
 * enrollment before anything happens, and a foreign project returns 404 rather
 * than 403 so it cannot be probed for existence.
 *
 * Flag-gated on `env.sbpPipelineEnabled` (SBP_PIPELINE_ENABLED), which defaults
 * OFF. Deploying this changes nothing until the flag is set, and unsetting it is
 * an instant rollback: the frontend falls back to the local path on a 404.
 *
 *   POST  /api/portal/sbp/intake/questions        interview questions for an idea
 *   POST  /api/portal/sbp/builds                  start a build from the wizard
 *   GET   /api/portal/sbp/builds/:projectId       poll status + the draft plan
 *   POST  /api/portal/sbp/builds/:projectId/publish   promote + write the repo
 *   GET   /api/portal/sbp/builds/:projectId/stories/:storyId/prompt
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
// planGate is pure (no I/O, no model client), so it is safe to import eagerly.
// The orchestrator is NOT — it pulls in the model client and the database — so
// it stays behind the dynamic imports the handlers already use, and only its
// TYPES are named here.
import { GateViolation, blockingViolations, advisoryViolations } from '../services/sbp/planGate';
import type { BuildStatus } from '../services/sbp/sbpOrchestrator';

const router = Router();

/**
 * The poll response, declared rather than implied (CLAUDE.md contract layer).
 * The client mirrors this in frontend/src/services/sbpApi.ts; changing either
 * side without the other is a breaking contract change.
 */
interface BuildStateResponse {
  project_id: string;
  status: BuildStatus;
  correlation_id: string | null;
  gate: {
    ok: boolean;
    violations: GateViolation[];
    /** Why the plan cannot be published. Non-empty ⇒ the student must act. */
    blocking: GateViolation[];
    /** Quality warnings that ride along with a plan that shipped anyway. */
    advisory: GateViolation[];
  } | null;
  /** True once the plan is materialized into the portal's tasks. */
  delivered: boolean;
  plan: {
    version: number;
    sha256: string;
    status: string;
    requirements: number;
    releases: Array<{ key: string; name: string; week_start: number; week_end: number; stories: number }>;
    stories: Array<{ id: string; title: string; release: string; fulfills: string[] }>;
  } | null;
}
const eid = (req: Request) => req.participant!.sub;

function gate(res: Response): boolean {
  if (!env.sbpPipelineEnabled) {
    // 404 rather than 403: the frontend treats this as "pipeline unavailable"
    // and falls back to the local path, so a student never hits a dead end.
    res.status(404).json({ error: 'Build pipeline not enabled' });
    return false;
  }
  res.set('Cache-Control', 'no-store');
  return true;
}

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) {
    // Log it. This branch returns without calling next(), so the global error
    // middleware never sees a rejected build and NOTHING recorded which field
    // failed — the response body was the only copy, and the browser threw it
    // away. Two students were handed a ten-task template on 2026-08-14 and the
    // server kept no evidence of why.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'sbp_request_rejected',
      outcome: 'failure',
      error_class: 'ValidationError',
      context: {
        path: res.req?.path,
        // Field paths and size limits only. Never the student's own text.
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
          ...(typeof (i as any).maximum === 'number' ? { maximum: (i as any).maximum } : {}),
          ...(typeof (i as any).minimum === 'number' ? { minimum: (i as any).minimum } : {}),
        })),
      },
    }));
    return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  }
  if (typeof err?.status === 'number') return res.status(err.status).json({ error: err.message });
  if (err?.error_class === 'QueueFull') return res.status(503).json({ error: err.message });
  if (err?.error_class === 'PromptPathNotWritten') return res.status(409).json({ error: err.message });
  return next(err);
}

/**
 * Confirm the caller owns this project. Returns the project so callers do not
 * re-fetch it. 404 for both "not yours" and "does not exist" — deliberately
 * indistinguishable.
 */
async function requireOwnedProject(req: Request, projectId: string): Promise<any> {
  const Project = (await import('../models/Project')).default;
  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(eid(req))) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }
  return project;
}

/**
 * The student's workspace repo for this project, or null when there is not one
 * the platform can write to yet.
 *
 * Shared with the orchestrator's auto-publish so the two publish paths cannot
 * disagree about whether a project has a repo — see services/sbp/workspaceRepo,
 * which is also where "writable" is decided. Both mid-connect states resolve to
 * null there, so publish takes the already-built `awaiting_repo` path instead of
 * failing at the GitHub boundary on a missing ref.
 */
async function repoFor(projectId: string): Promise<{ owner: string; repo: string; url: string } | null> {
  const { repoForProject } = await import('../services/sbp/workspaceRepo');
  return repoForProject(projectId);
}

// ── interview ───────────────────────────────────────────────────────────────
// Generates the "sharpen it" questions from the student's own idea. Deliberately
// NOT tied to a project row: it runs while they are still typing, before a build
// exists, so it takes the idea directly and creates nothing. Never fails to the
// student — the service degrades to a generic set and reports `generated:false`.
const questionsSchema = z.object({
  idea: z.string().min(20, 'Tell us a bit more about what you want to build').max(20_000),
  size: z.enum(['workflow', 'project', 'autonomous']).optional(),
  name: z.string().max(200).optional(),
});

router.post('/api/portal/sbp/intake/questions', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const body = questionsSchema.parse(req.body ?? {});
    const { generateIntakeQuestions } = await import('../services/sbp/intakeQuestionsService');
    const result = await generateIntakeQuestions({
      idea: body.idea,
      size: body.size ?? 'project',
      name: body.name,
    });
    res.json(result);
  } catch (e) { fail(res, e, next); }
});

// ── start ───────────────────────────────────────────────────────────────────
/**
 * The most a student may write in one interview reply.
 *
 * Named once because four fields have to agree on it: the reply itself, and the
 * three legacy scope fields the browser fills BY COPYING a reply. They did not
 * agree, and the mismatch was invisible from either side on its own. The wizard
 * now enforces the same number in the textarea, so the boundary is something a
 * student meets while typing rather than after pressing Confirm.
 */
export const ANSWER_MAX = 4_000;

/**
 * Exported so the contract is testable. A cap that only exists inside a closure
 * cannot be asserted against the payload the wizard actually builds, and that is
 * precisely how the `users` ceiling below drifted below its own source field.
 */
export const startSchema = z.object({
  project_id: z.string().uuid(),
  // Generous: the wizard explicitly asks students to pour everything out, and
  // the pilot's failure was throwing that away. 20k is the documented cap.
  idea: z.string().min(20, 'Tell us a bit more about what you want to build').max(20_000),
  name: z.string().max(200).optional(),
  size: z.enum(['workflow', 'project', 'autonomous']).optional(),
  // These three are NOT independently typed by the student. The browser copies
  // one whole interview answer into each (frontend deriveLegacyScope), so their
  // ceiling must be the answer ceiling. At 2,000 against a 4,000 answer they
  // were the binding constraint on the entire wizard: a student who wrote more
  // than 2,000 characters in a single reply was rejected on a field they had
  // never seen, and told the requirements service was unreachable.
  users: z.string().max(ANSWER_MAX).optional(),
  data_sources: z.string().max(ANSWER_MAX).optional(),
  done_definition: z.string().max(ANSWER_MAX).optional(),
  target_weeks: z.number().int().min(1).max(52).optional(),
  document: z.string().max(400_000).optional(),
  // The adaptive interview's answers: [{id, question, answer}]. The three
  // legacy fields above are kept so an older client (or a cached bundle mid
  // deploy) still starts a build rather than 400-ing.
  answers: z.array(z.object({
    id: z.string().max(80),
    question: z.string().max(500),
    answer: z.string().max(ANSWER_MAX),
  })).max(20).optional(),
});

router.post('/api/portal/sbp/builds', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const body = startSchema.parse(req.body ?? {});
    await requireOwnedProject(req, body.project_id);

    const { startBuild } = await import('../services/sbp/sbpOrchestrator');
    const result = await startBuild({
      projectId: body.project_id,
      enrollmentId: eid(req),
      idea: body.idea,
      name: body.name,
      size: body.size,
      users: body.users,
      dataSources: body.data_sources,
      doneDefinition: body.done_definition,
      targetWeeks: body.target_weeks,
      document: body.document,
      answers: body.answers,
    });
    res.status(202).json(result);   // 202: accepted, generation continues
  } catch (e) { fail(res, e, next); }
});

// ── poll ────────────────────────────────────────────────────────────────────
router.get('/api/portal/sbp/builds/:projectId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const projectId = z.string().uuid().parse(req.params.projectId);
    await requireOwnedProject(req, projectId);

    const { getBuildState, DELIVERED_STATUSES } = await import('../services/sbp/sbpOrchestrator');
    const state = await getBuildState(projectId);
    if (!state) return res.status(404).json({ error: 'No build for this project' });

    // The plan can be large; the poller wants status and a summary, not 200KB
    // on every tick. The full plan comes from the documents once published.
    const plan = state.plan;
    const violations = state.gate?.violations ?? [];
    const body: BuildStateResponse = {
      project_id: state.projectId,
      status: state.status,
      correlation_id: state.correlationId,
      // Split at the boundary rather than in the browser. The client used to
      // take the first three of `violations` and present them as the reason a
      // build was refused — but that array is mostly ADVISORY warnings, so a
      // student blocked on an uncovered must-have was told about a stylistically
      // redundant story instead. Only `blocking` is a reason; `advisory` rides
      // along with a plan that shipped.
      gate: state.gate ? {
        ok: state.gate.ok,
        violations,
        blocking: blockingViolations(violations),
        advisory: advisoryViolations(violations),
      } : null,
      // Whether the plan actually reached the portal. `drafted` looks like
      // success on the wire and is not: it means generated-but-not-promoted.
      delivered: DELIVERED_STATUSES.has(state.status),
      plan: plan ? {
        version: plan.version,
        sha256: plan.plan_sha256,
        status: plan.status,
        requirements: plan.plan.requirements.length,
        releases: plan.plan.releases.map((r) => ({
          key: r.key, name: r.name, week_start: r.week_start, week_end: r.week_end,
          stories: plan.plan.stories.filter((s) => s.release === r.key).length,
        })),
        stories: plan.plan.stories.map((s) => ({
          id: s.id, title: s.title, release: s.release, fulfills: s.fulfills,
        })),
      } : null,
    };
    res.json(body);
  } catch (e) { fail(res, e, next); }
});

// ── publish ─────────────────────────────────────────────────────────────────
const publishSchema = z.object({
  // The hash the reviewer was shown. Optional, but supplying it is what makes
  // "the plan I approved is the plan that shipped" enforceable.
  expected_sha256: z.string().length(64).optional(),
});

router.post('/api/portal/sbp/builds/:projectId/publish', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const projectId = z.string().uuid().parse(req.params.projectId);
    const body = publishSchema.parse(req.body ?? {});
    await requireOwnedProject(req, projectId);

    const { publishBuild } = await import('../services/sbp/sbpOrchestrator');
    const result = await publishBuild(projectId, {
      enrollmentId: eid(req),
      expectedSha: body.expected_sha256,
      repo: await repoFor(projectId),
    });
    res.json(result);
  } catch (e) { fail(res, e, next); }
});

// ── the prompt ──────────────────────────────────────────────────────────────
router.get('/api/portal/sbp/builds/:projectId/stories/:storyId/prompt', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const projectId = z.string().uuid().parse(req.params.projectId);
    const storyId = z.string().regex(/^STORY-\d+$/i, 'storyId must look like STORY-001').parse(req.params.storyId);
    await requireOwnedProject(req, projectId);

    const { getPlan } = await import('../services/sbp/planStore');
    const stored = await getPlan(projectId);
    if (!stored) return res.status(404).json({ error: 'No plan for this project' });

    const story = stored.plan.stories.find((s) => s.id.toUpperCase() === storyId.toUpperCase());

    // The manifest is the list of paths actually committed. Passing it is what
    // lets prompt assembly REFUSE to cite a file that was never written — the
    // defect this whole pipeline exists to close. No repo ⇒ no manifest ⇒ the
    // prompt inlines its context and names no paths.
    const repo = await repoFor(projectId);
    const manifest = repo ? await readManifestPaths(repo) : [];

    // ── STORY-000 IS NOT IN `plan.stories`, AND THAT IS ON PURPOSE ───────────
    //
    // The Command Center fulfils no requirement of the student's system, so it
    // is kept out of the plan — otherwise it distorts the traceability gate and
    // the release sizing. The cost is that EVERY path which iterates or looks
    // up `plan.stories` silently omits it, and this route was one of them:
    // the validator regex `^STORY-\d+$` happily accepts `STORY-000`, the lookup
    // below then finds nothing, and the caller got
    // `404 {"error":"Story STORY-000 is not in this plan"}` for the one story
    // every student builds first.
    //
    // Not student-visible today only because the workspace UI copies
    // `task.build` off the project tree rather than calling this — which makes
    // it a trap for the next caller, not a fixed bug. The same omission has
    // already cost this workstream a verification miss, a missing
    // `docs/stories/STORY-000.md`, and a missing `progress.json` entry.
    //
    // Resolved the way the other paths resolve it (`buildVerificationService`,
    // `renderDocs`): if the plan does not carry it, supply it. The prompt comes
    // from `commandCenterPrompt` rather than `buildStoryPrompt`, because that
    // is the same function `materializeTasks` stored on `student_tasks.build` —
    // a second assembly path for STORY-000 would be a second thing to drift.
    const { COMMAND_CENTER_STORY_ID, commandCenterPrompt } =
      await import('../services/sbp/commandCenterStory');
    if (!story && storyId.toUpperCase() === COMMAND_CENTER_STORY_ID) {
      const { scheduleForEnrollment } = await import('../services/sbp/scheduleForEnrollment');
      // Null is a normal answer here (cohort with no start date) and the prompt
      // renders without dates rather than throwing, so a schedule lookup that
      // comes back empty must not cost the student their prompt.
      const schedule = await scheduleForEnrollment(eid(req), stored.plan, null, stored.published_at);
      return res.json({
        story_id: COMMAND_CENTER_STORY_ID,
        prompt: commandCenterPrompt(stored.plan, schedule),
        has_repo: Boolean(repo),
        paths_verified: manifest.length > 0,
      });
    }

    if (!story) return res.status(404).json({ error: `Story ${storyId} is not in this plan` });

    const { buildStoryPrompt } = await import('../services/sbp/buildStoryPrompt');
    const prompt = buildStoryPrompt(stored.plan, story, {
      repoUrl: repo?.url ?? null,
      manifestPaths: manifest,
      notes: typeof req.query.notes === 'string' ? req.query.notes : undefined,
    });
    res.json({ story_id: story.id, prompt, has_repo: Boolean(repo), paths_verified: manifest.length > 0 });
  } catch (e) { fail(res, e, next); }
});

/** Read `.colaberry/manifest.json` from the repo. Absent ⇒ no verified paths. */
async function readManifestPaths(repo: { owner: string; repo: string }): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return [];
  const base = process.env.GITHUB_API_URL || 'https://api.github.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${base}/repos/${repo.owner}/${repo.repo}/contents/.colaberry/manifest.json`, {
      headers: { Accept: 'application/vnd.github.raw', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const parsed = JSON.parse(await res.text()) as { files?: Array<{ path: string }> };
    return (parsed.files ?? []).map((f) => f.path);
  } catch {
    // A manifest we cannot read is treated as absent: the prompt then inlines
    // its context rather than citing paths we have not confirmed. Degrading to
    // "no paths" is always safe; degrading to "assume they exist" is the bug.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export default router;
