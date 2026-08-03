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
  } catch {
    // API off (404) / task not yet imported / transient — the mirror reconciles it.
  }
}

/** PULL: overlay backend completions onto local, or hydrate a build this device lacks. */
async function reconcileFromBackend(): Promise<void> {
  try {
    const res = await portalApi.get('/api/portal/projects/active');
    const tree = (res.data && Array.isArray(res.data.lists)) ? (res.data as BackendProjectTree) : null;
    const { next, changed } = reconcileProjects(loadProjects(), tree);
    if (changed) hydrateProjects(next);
  } catch {
    // API off (404) or transient — nothing to reconcile.
  }
}

/** PUSH: mirror the student's active (non-demo) local project to the backend. */
async function mirrorToBackend(): Promise<void> {
  const project = loadProjects().find((p) => !p.sample);
  if (!project) return; // only the seeded demo (or nothing) — nothing real to persist
  try {
    await portalApi.post('/api/portal/projects/import', toImportPayload(project));
  } catch {
    // API off (404) or transient — localStorage remains the working source.
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
