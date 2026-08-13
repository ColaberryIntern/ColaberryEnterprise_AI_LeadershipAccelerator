/**
 * projectSync — the I/O seam between the localStorage `projectsStore` and the
 * persisted Project Backend. Two directions, run once per page session in order:
 *
 *   1. PULL  (reconcileFromBackend): the server is authoritative for completion,
 *      so first overlay any done-elsewhere task and hydrate any build this device
 *      has never seen. This makes a build follow the student across devices.
 *   2. PUSH  (mirror import): then snapshot the reconciled local project up, so
 *      new local edits reach the server (and Today's Project→Today blend).
 *
 * Plus a per-task write-through (pushTaskStatusByStory) fired by the store on
 * mark-done / skip. Everything is best-effort + flag-gated: if the API is off
 * (404) or errors, it is a silent no-op and localStorage stays the working
 * source. The demo/sample build is never persisted (only real student builds).
 */
import portalApi from '../../../utils/portalApi';
import type { StudentProject, ProjectTask, TaskState } from './projectsStore';
import { loadProjects, hydrateProjects } from './projectsStore';
import { reconcileProjects, type BackendProjectTree } from './projectHydrate';

function toBackendStatus(state: TaskState): string {
  if (state === 'done') return 'complete';
  return 'not_started'; // 'todo' and 'skipped' → not started (skip = "not doing this now")
}

function toImportPayload(p: StudentProject) {
  return {
    name: p.name,
    lists: p.lists.map((l, li) => ({
      cluster: String(l.id).slice(0, 50),
      title: l.name,
      position: typeof l.step === 'number' ? l.step : li,
      tasks: l.tasks.map((t: ProjectTask, ti) => ({
        story_id: t.storyId || t.id,
        requirement_key: t.req ?? null,
        title: t.title,
        description: t.what ?? null,
        status: toBackendStatus(t.state),
        position: ti,
        owner_agent: t.owner ?? null,
        release_key: t.release ?? null,
        acceptance: t.acceptance ?? null,
        build: t.prompt ?? null,
        blocked_by: Array.isArray(t.blockedBy) ? t.blockedBy : undefined,
      })),
    })),
  };
}

/** Map the client TaskState to the backend status the write-through endpoints accept. */
function statusForBackend(state: TaskState): string { return state === 'done' ? 'complete' : 'not_started'; }

// ── failure reporting (SBP-REQ-v1 FR-015) ────────────────────────────────────
// These paths used to swallow everything with a bare `catch {}`, which made a
// 404 (feature flag off) indistinguishable from a 500 (import genuinely broken).
// That is how finding F-1 stayed invisible in production while every student
// build silently failed to persist past its 3rd task. A 404 is still expected
// and quiet; anything else is reported.

/** True when the error is just "the projects API is flag-gated off". */
function isApiDisabled(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 404;
}

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export type SyncFailure = { op: 'pull' | 'push' | 'task-status'; status?: number; message: string };

type SyncFailureListener = (failure: SyncFailure) => void;
const failureListeners = new Set<SyncFailureListener>();

/**
 * Subscribe to sync failures so the UI can surface a non-blocking "we couldn't
 * save your build" state with a retry. Returns an unsubscribe function.
 */
export function onSyncFailure(fn: SyncFailureListener): () => void {
  failureListeners.add(fn);
  return () => { failureListeners.delete(fn); };
}

/** Report a real (non-404) sync failure: structured console error + listeners. */
function reportFailure(op: SyncFailure['op'], err: unknown): void {
  if (isApiDisabled(err)) return;   // expected when PROJECT_API_ENABLED is off
  const failure: SyncFailure = {
    op,
    status: statusOf(err),
    message: (err as Error)?.message || 'Unknown sync error',
  };
  // Structured so it is greppable in browser logs and any forwarded telemetry.
  console.error(JSON.stringify({
    level: 'error',
    service: 'frontend',
    event: `project_sync_${op.replace('-', '_')}_failed`,
    outcome: 'failure',
    error_class: (err as Error)?.name || 'Error',
    context: { status: failure.status, message: failure.message },
  }));
  failureListeners.forEach((fn) => {
    try { fn(failure); } catch { /* a listener must never break sync */ }
  });
}

/**
 * Write a single task's status through to the backend by its story key (the same
 * `storyId || id` used on import). Best-effort: the store has already updated
 * localStorage, so a failure here just means the change syncs on the next mirror.
 */
export async function pushTaskStatusByStory(storyKey: string, state: TaskState): Promise<void> {
  if (!storyKey) return;
  try {
    await portalApi.patch(
      `/api/portal/projects/tasks/by-story/${encodeURIComponent(storyKey)}`,
      { status: statusForBackend(state) },
    );
  } catch (err) {
    // API off (404) / task not yet imported — expected, stays quiet. Anything
    // else is a real failure: the mirror will retry it, but it must be visible.
    reportFailure('task-status', err);
  }
}

/** PULL: overlay backend completions onto local, or hydrate a build this device lacks. */
async function reconcileFromBackend(): Promise<void> {
  try {
    const res = await portalApi.get('/api/portal/projects/active');
    const tree = (res.data && Array.isArray(res.data.lists)) ? (res.data as BackendProjectTree) : null;
    const { next, changed } = reconcileProjects(loadProjects(), tree);
    if (changed) hydrateProjects(next);
  } catch (err) {
    reportFailure('pull', err);
  }
}

/** PUSH: mirror the student's active (non-demo) local project to the backend. */
async function mirrorToBackend(): Promise<void> {
  const project = loadProjects().find((p) => !p.sample);
  if (!project) return; // only the seeded demo (or nothing) — nothing real to persist
  try {
    await portalApi.post('/api/portal/projects/import', toImportPayload(project));
  } catch (err) {
    // localStorage remains the working source either way, but a failure here
    // means the build exists ONLY in this browser — the student must be told.
    reportFailure('push', err);
  }
}

let synced = false;

/**
 * One-shot per page session: PULL then PUSH. Pull first so a completion made on
 * another device wins before we mirror this device's (possibly stale) snapshot up
 * — the server's monotonic-complete guard is a second line of defence.
 */
export async function syncProjectsWithBackend(): Promise<void> {
  if (synced) return;
  synced = true;
  await reconcileFromBackend();
  await mirrorToBackend();
}
