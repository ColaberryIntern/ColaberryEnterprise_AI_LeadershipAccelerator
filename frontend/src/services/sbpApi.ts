/**
 * sbpApi — the client for the Student Build Pipeline.
 *
 * Replaces the browser-side `createProjectFromAnswers`, which generated a fixed
 * ten-task template behind a 7-second timer and never contacted the server. The
 * student's answers now reach a real generator, and what comes back is a real
 * plan the traceability gate has passed.
 *
 * Every call is best-effort at the transport layer but NEVER silently: a failure
 * returns a typed result the caller must handle. The old sync layer swallowed
 * everything in a bare `catch {}`, which is how a 100%-failing import went
 * unnoticed for months.
 */
import portalApi from '../utils/portalApi';

export type BuildStatus =
  | 'captured' | 'researching' | 'generating' | 'gate_failed' | 'drafted'
  | 'published' | 'awaiting_repo' | 'failed';

export interface GateViolation { rule: string; message: string; subject?: string }

export interface BuildPlanSummary {
  version: number;
  sha256: string;
  status: string;
  requirements: number;
  releases: Array<{ key: string; name: string; week_start: number; week_end: number; stories: number }>;
  stories: Array<{ id: string; title: string; release: string; fulfills: string[] }>;
}

export interface BuildState {
  project_id: string;
  status: BuildStatus;
  correlation_id: string | null;
  gate: { ok: boolean; violations: GateViolation[] } | null;
  plan: BuildPlanSummary | null;
}

export interface StartBuildAnswers {
  project_id: string;
  idea: string;
  name?: string;
  size?: 'workflow' | 'project' | 'autonomous';
  users?: string;
  data_sources?: string;
  done_definition?: string;
  target_weeks?: number;
  /** Answers to the ten sharpening questions, keyed by slot id. */
  answers?: Record<string, string>;
}

/** One of the ten sharpening questions, as the wizard renders it. */
export interface SharpeningQuestion {
  id: string;
  index: number;
  label: string;
  text: string;
  help: string;
  examples: string[];
  required: boolean;
}

/**
 * Fetch the ten sharpening questions, reworded for this idea.
 *
 * Never fails the caller: on any error it resolves with `tailored: false` and an
 * empty list, and the wizard falls back to its built-in copy. Tailoring is
 * phrasing, and phrasing must never be the reason a student cannot start.
 */
export async function fetchQuestions(idea: string): Promise<{
  questions: SharpeningQuestion[]; tailored: boolean;
}> {
  try {
    const res = await portalApi.post('/api/portal/sbp/questions', { idea });
    const questions = Array.isArray(res.data?.questions) ? res.data.questions : [];
    return { questions, tailored: Boolean(res.data?.tailored) };
  } catch {
    return { questions: [], tailored: false };
  }
}

/** A failure the UI must show rather than swallow. */
export interface SbpError { status: number | null; message: string }

function toError(err: any): SbpError {
  const status = err?.response?.status ?? null;
  const message = err?.response?.data?.error
    || (status === 404 ? 'The build pipeline is not enabled for your account yet.'
      : status === 503 ? 'We are at capacity right now — try again in a few minutes.'
        : err?.message || 'Something went wrong starting your build.');
  return { status, message };
}

/** Start a build. Resolves as soon as the intake is durable; generation continues. */
export async function startBuild(answers: StartBuildAnswers): Promise<
  { ok: true; correlationId: string } | { ok: false; error: SbpError }
> {
  try {
    const res = await portalApi.post('/api/portal/sbp/builds', answers);
    return { ok: true, correlationId: res.data?.correlationId };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/** Current state of a build. Null when there is no build for this project. */
export async function getBuildState(projectId: string): Promise<
  { ok: true; state: BuildState | null } | { ok: false; error: SbpError }
> {
  try {
    const res = await portalApi.get(`/api/portal/sbp/builds/${encodeURIComponent(projectId)}`);
    return { ok: true, state: res.data as BuildState };
  } catch (err: any) {
    if (err?.response?.status === 404) return { ok: true, state: null };
    return { ok: false, error: toError(err) };
  }
}

/** Promote the reviewed draft and write its documents into the workspace repo. */
export async function publishBuild(projectId: string, expectedSha256?: string): Promise<
  { ok: true; commitSha: string | null; filesWritten: number; status: BuildStatus }
  | { ok: false; error: SbpError }
> {
  try {
    const res = await portalApi.post(
      `/api/portal/sbp/builds/${encodeURIComponent(projectId)}/publish`,
      expectedSha256 ? { expected_sha256: expectedSha256 } : {},
    );
    return { ok: true, commitSha: res.data?.commitSha ?? null, filesWritten: res.data?.filesWritten ?? 0, status: res.data?.status };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/** The assembled Claude Code prompt for one story. */
export async function getStoryPrompt(projectId: string, storyId: string, notes?: string): Promise<
  { ok: true; prompt: string; hasRepo: boolean; pathsVerified: boolean } | { ok: false; error: SbpError }
> {
  try {
    const res = await portalApi.get(
      `/api/portal/sbp/builds/${encodeURIComponent(projectId)}/stories/${encodeURIComponent(storyId)}/prompt`,
      { params: notes ? { notes } : undefined },
    );
    return {
      ok: true,
      prompt: res.data?.prompt ?? '',
      hasRepo: Boolean(res.data?.has_repo),
      pathsVerified: Boolean(res.data?.paths_verified),
    };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

/** Statuses where nothing further will change without another action. */
export const TERMINAL_STATUSES: BuildStatus[] = ['drafted', 'gate_failed', 'published', 'awaiting_repo', 'failed'];
export const isTerminal = (s: BuildStatus): boolean => TERMINAL_STATUSES.includes(s);

/**
 * Poll until the build reaches a terminal state.
 *
 * Bounded on both axes: a fixed interval and a hard deadline, because a poll
 * that never gives up is how a student ends up watching a spinner forever — the
 * exact failure the old 7-second timer disguised. On timeout the caller is told
 * it timed out, not that it failed: the build may still be running server-side
 * and the state endpoint remains readable.
 */
export async function pollBuild(
  projectId: string,
  opts: {
    onUpdate?: (state: BuildState) => void;
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{ ok: true; state: BuildState } | { ok: false; error: SbpError; timedOut?: boolean }> {
  const interval = opts.intervalMs ?? 5_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 25 * 60_000);

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) {
      return { ok: false, error: { status: null, message: 'Cancelled.' } };
    }
    const result = await getBuildState(projectId);
    if (!result.ok) return { ok: false, error: result.error };
    if (result.state) {
      opts.onUpdate?.(result.state);
      if (isTerminal(result.state.status)) return { ok: true, state: result.state };
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  return {
    ok: false,
    timedOut: true,
    error: {
      status: null,
      message: 'Your build is taking longer than expected. It may still be running — reopen this page to check.',
    },
  };
}

/**
 * Resolve the backend project UUID to build against.
 *
 * The localStorage store keys projects by a client id (`p1786…`), but every SBP
 * endpoint is scoped to a real `projects.id`. This bridges the two: use the
 * student's active project if they have one, otherwise create one.
 *
 * `POST /api/portal/projects` calls `createNewProjectForEnrollment`, which
 * ALWAYS creates — so it is only called when there is genuinely no active
 * project, or a student would accumulate an empty project per build attempt.
 */
export async function resolveBackendProjectId(): Promise<
  { ok: true; projectId: string; created: boolean } | { ok: false; error: SbpError }
> {
  try {
    const active = await portalApi.get('/api/portal/projects/active');
    const id = active?.data?.id;
    if (typeof id === 'string' && id) return { ok: true, projectId: id, created: false };
  } catch (err: any) {
    // 404 = the API is flag-gated off; anything else is a real failure worth
    // surfacing rather than papering over with a fresh project.
    if (err?.response?.status !== 404) return { ok: false, error: toError(err) };
    return { ok: false, error: toError(err) };
  }

  try {
    const created = await portalApi.post('/api/portal/projects', {});
    const id = created?.data?.id;
    if (typeof id !== 'string' || !id) {
      return { ok: false, error: { status: null, message: 'Could not create a project for this build.' } };
    }
    return { ok: true, projectId: id, created: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
