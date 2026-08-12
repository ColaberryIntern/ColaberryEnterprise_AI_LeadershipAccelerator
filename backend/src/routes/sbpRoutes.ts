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
 *   POST  /api/portal/sbp/builds                  start a build from the wizard
 *   GET   /api/portal/sbp/builds/:projectId       poll status + the draft plan
 *   POST  /api/portal/sbp/builds/:projectId/publish   promote + write the repo
 *   GET   /api/portal/sbp/builds/:projectId/stories/:storyId/prompt
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';

const router = Router();
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
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
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

/** The student's workspace repo for this project, or null when unprovisioned. */
async function repoFor(projectId: string): Promise<{ owner: string; repo: string; url: string } | null> {
  const { GitHubConnection } = await import('../models');
  const conn: any = await GitHubConnection.findOne({ where: { project_id: projectId } });
  if (!conn?.repo_owner || !conn?.repo_name) return null;
  return { owner: conn.repo_owner, repo: conn.repo_name, url: conn.repo_url || `https://github.com/${conn.repo_owner}/${conn.repo_name}` };
}

// ── start ───────────────────────────────────────────────────────────────────
const startSchema = z.object({
  project_id: z.string().uuid(),
  // Generous: the wizard explicitly asks students to pour everything out, and
  // the pilot's failure was throwing that away. 20k is the documented cap.
  idea: z.string().min(20, 'Tell us a bit more about what you want to build').max(20_000),
  name: z.string().max(200).optional(),
  size: z.enum(['workflow', 'project', 'autonomous']).optional(),
  users: z.string().max(2_000).optional(),
  data_sources: z.string().max(2_000).optional(),
  done_definition: z.string().max(2_000).optional(),
  target_weeks: z.number().int().min(1).max(52).optional(),
  document: z.string().max(400_000).optional(),
  /**
   * Answers to the ten sharpening questions, keyed by slot id. Bounded on both
   * key count and value length: this reaches an LLM prompt and a third-party
   * API, so an unbounded map here is an injection-surface and a cost bug.
   */
  answers: z.record(z.string().max(40), z.string().max(4_000)).refine(
    (a) => Object.keys(a).length <= 20, { message: 'too many answers' },
  ).optional(),
  use_architect: z.boolean().optional(),
});

// ── the ten questions, tailored to this idea ────────────────────────────────
const tailorSchema = z.object({ idea: z.string().max(20_000).default('') });

/**
 * Returns the ten sharpening questions, reworded for the student's idea.
 *
 * POST rather than GET because the idea is a body, not a query string — a
 * 20,000-character idea does not belong in a URL. Nothing is persisted here;
 * it is a pure read that happens to need input.
 */
router.post('/api/portal/sbp/questions', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const { idea } = tailorSchema.parse(req.body ?? {});

    const { tailorQuestions } = await import('../services/sbp/tailorQuestions');
    const { getBoundedClient } = await import('../services/sbp/decomposeService');

    const out = await tailorQuestions(idea, { client: getBoundedClient() });
    res.json({
      tailored: out.tailored,
      reason: out.reason,
      // Only what the form renders. `guards` is internal design rationale and
      // `feeds` is decomposer vocabulary; neither belongs on a student's screen.
      questions: out.questions.map((q) => ({
        id: q.id, index: q.index, label: q.label,
        text: q.text, help: q.help, examples: q.examples, required: q.required,
      })),
    });
  } catch (e) { fail(res, e, next); }
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
      useArchitect: body.use_architect,
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

    const { getBuildState } = await import('../services/sbp/sbpOrchestrator');
    const state = await getBuildState(projectId);
    if (!state) return res.status(404).json({ error: 'No build for this project' });

    // The plan can be large; the poller wants status and a summary, not 200KB
    // on every tick. The full plan comes from the documents once published.
    const plan = state.plan;
    res.json({
      project_id: state.projectId,
      status: state.status,
      correlation_id: state.correlationId,
      gate: state.gate,
      plan: plan && {
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
      },
    });
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
    if (!story) return res.status(404).json({ error: `Story ${storyId} is not in this plan` });

    // The manifest is the list of paths actually committed. Passing it is what
    // lets prompt assembly REFUSE to cite a file that was never written — the
    // defect this whole pipeline exists to close. No repo ⇒ no manifest ⇒ the
    // prompt inlines its context and names no paths.
    const repo = await repoFor(projectId);
    const manifest = repo ? await readManifestPaths(repo) : [];

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
