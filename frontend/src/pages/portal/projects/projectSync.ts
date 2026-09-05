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
import { loadProjects, hydrateProjects, claimBackendProject } from './projectsStore';
import {
  reconcileProjects, UNKNOWN_INVENTORY,
  type BackendProjectTree, type ServerInventory,
} from './projectHydrate';
import { isUuid } from './projectIdentity';

function toBackendStatus(state: TaskState): string {
  if (state === 'done') return 'complete';
  return 'not_started'; // 'todo' and 'skipped' → not started (skip = "not doing this now")
}

function toImportPayload(p: StudentProject) {
  return {
    // Name the project this snapshot IS. Without it the server wrote the
    // snapshot into whatever project happened to be active, which is a
    // different build as soon as the student has two. Undefined for a build
    // that has never reached the server — there is no row to target yet, and
    // the server's fallback is correct for exactly that case.
    project_id: p.pipelineProjectId || (isUuid(p.id) ? p.id : undefined),
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

export type SyncFailure = { op: 'pull' | 'push' | 'task-status' | 'inventory' | 'active-project'; status?: number; message: string };

type SyncFailureListener = (failure: SyncFailure) => void;
const failureListeners = new Set<SyncFailureListener>();

/**
 * Subscribe to sync failures so the UI can surface a non-blocking "we couldn't
 * save your build" state with a retry. Returns an unsubscribe function.
 */
/**
 * The backend noticed the student is looking at the wrong project.
 *
 * Farhat Beig built STORY-001 in her SECOND project on 2026-09-05. It verified
 * at 3 of 3 three minutes after she pushed, while her portal still rendered her
 * FIRST project and showed 0 of 3. The switcher that fixes it already existed;
 * nothing told her she needed it, so the only route left was emailing a human.
 *
 * Shaped like SyncFailure on purpose: a non-blocking notice the page can render
 * without owning the query that produced it.
 */
export type ProjectDrift = {
  code: 'work_elsewhere' | 'no_active_project' | 'active_archived';
  /** The project currently on screen. */
  showing: string | null;
  /** Where their recent verified work actually is. */
  working_in: string | null;
  /** The id to switch to, so the banner can act and not merely inform. */
  working_in_id: string | null;
  detail: string;
};

type DriftListener = (drift: ProjectDrift | null) => void;
const driftListeners = new Set<DriftListener>();

/** Subscribe to drift notices. Returns an unsubscribe function. */
export function onProjectDrift(fn: DriftListener): () => void {
  driftListeners.add(fn);
  return () => { driftListeners.delete(fn); };
}

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

/**
 * Tell the server which build the student is now looking at.
 *
 * The selection used to live only in React state (`view.id` in ProjectsPage),
 * so it did not survive a reload and — worse — never moved
 * `enrollments.active_project_id`. Everything that scopes itself to "the
 * student's build" reads that pointer: `GET /api/portal/projects/active`
 * returns its tree, `orderProjects` ranks it first, and `projects[0]` is what
 * the "Your next step" hero renders. A student who opened their second build
 * therefore kept being shown the FIRST build's next step, and the next
 * reconcile pulled them back to it. That is the half of the reported symptom
 * that was not data corruption.
 *
 * Best-effort and silent on a disabled API: this is a preference write, and
 * failing it must never block opening a build. The UI has already switched.
 */
export async function pushActiveProject(projectId: string): Promise<void> {
  if (!isUuid(projectId)) return;   // local-only build; the server has no such row
  try {
    await portalApi.put('/api/portal/projects/active', { project_id: projectId });
  } catch (err) {
    if (!isApiDisabled(err)) reportFailure('active-project', err);
  }
}

/**
 * Ask the server which projects this enrollment actually owns.
 *
 * Separate from the active-tree fetch because it answers a different question:
 * /active says "here is your current build", this says "here is everything you
 * have". Only the second can tell the browser that a project it is still
 * showing was DELETED — /active is silent about projects that no longer exist,
 * which is why dead cards survived every refresh forever.
 *
 * Fails CLOSED to `known: false`: a 404 (API flag off), a network error, or a
 * body that is not an array all mean "we did not learn anything", and
 * pruneDeadProjects removes nothing on a false. Never throws — a failure here
 * must not cost the student the merge that the active tree still provides.
 */
async function fetchInventory(): Promise<ServerInventory> {
  try {
    const res = await portalApi.get('/api/portal/projects');
    const rows = res.data?.projects;
    if (!Array.isArray(rows)) return UNKNOWN_INVENTORY;
    const ids = rows.map((r: { id?: unknown }) => String(r?.id ?? '')).filter(Boolean);
    // Protected rows stay in `ids` (pruning must see everything that exists) but
    // are withheld from hydration, so the platform's own project record never
    // becomes a build card. An older server that does not send the flag yields
    // `undefined !== true`, i.e. hydratable — the pre-existing behaviour for
    // every ordinary project, and the platform record was already invisible
    // there because nothing but the active tree could hydrate anything.
    const hydratableIds = rows
      .filter((r: { is_protected?: unknown }) => r?.is_protected !== true)
      .map((r: { id?: unknown }) => String(r?.id ?? ''))
      .filter(Boolean);
    const active = rows.find((r: { is_active?: unknown }) => r?.is_active === true);
    return { known: true, ids, hydratableIds, activeId: active ? String(active.id) : null };
  } catch (err) {
    if (!isApiDisabled(err)) reportFailure('inventory', err);
    return UNKNOWN_INVENTORY;
  }
}

/**
 * Pull ONE specific project's tree onto this device and add it to the list.
 *
 * Needed by restore, and it exists because of a real hole. `/active` returns only
 * the ACTIVE project, and nothing else hydrates a card — so a project that is
 * live on the server but not active has no path onto the page at all (the same
 * fact that kept the platform record invisible in Ali's portal). After a restore
 * the student would have seen the row vanish from "Removed builds" and no card
 * appear anywhere: the action would look broken while having worked perfectly.
 *
 * Deliberately NOT routed through `reconcileProjects`: that function derives the
 * active project from the tree it is handed, so passing a non-active tree through
 * it would rank the restored project first and label it as the current build.
 * This inserts it and leaves ordering alone.
 *
 * Returns true when a card was added. A project already present is left exactly
 * as it is — restore must not overwrite local state the student still has.
 */
export async function hydrateProjectById(projectId: string): Promise<boolean> {
  try {
    const res = await portalApi.get(`/api/portal/projects/${encodeURIComponent(projectId)}`);
    const tree = (res.data && Array.isArray(res.data.lists)) ? (res.data as BackendProjectTree) : null;
    if (!tree) return false;

    const local = loadProjects();
    const already = local.some((p) => p.id === tree.id || p.pipelineProjectId === tree.id);
    if (already) return false;

    const { backendTreeToProject } = await import('./projectHydrate');
    hydrateProjects([...local, backendTreeToProject(tree)]);
    return true;
  } catch (err) {
    reportFailure('pull', err);
    return false;
  }
}

/**
 * Give a card to every server project this device is missing — not just the
 * active one.
 *
 * THE HOLE THIS CLOSES. `reconcileFromBackend` hydrates from `/active`, which
 * returns exactly one tree, so a project that is live on the server but is not
 * the active one had no path onto the page at all. It was reported by
 * `/api/portal/projects` on every single load and then dropped on the floor:
 * the inventory was consulted only to prune dead cards and to name the active
 * id. A student whose second build was created anywhere other than this
 * browser (the wizard on another device, or the pipeline server-side) simply
 * never saw it, and no amount of reloading helped, because reloading re-ran the
 * same one-tree pull.
 *
 * That is the qninying/Ambit case: two live projects, `Ambit` never active on
 * the device he was looking at, and a Projects page that showed his current
 * build and the training example forever.
 *
 * Runs AFTER reconcile so it only ever sees what reconcile left behind — the
 * active project has already been hydrated, overlaid or superseded by then, and
 * asking for it again here would race that decision.
 *
 * Sequential rather than `Promise.all`: this is a background repair on a page
 * that has already painted, and a student with several missing builds should
 * not open with a burst of parallel tree fetches. Each hydrate is independently
 * best-effort — `hydrateProjectById` reports its own failures and returns false
 * — so one unreachable project cannot cost the others their card.
 */
async function hydrateMissingProjects(inventory: ServerInventory): Promise<void> {
  if (!inventory.known || inventory.hydratableIds.length === 0) return;

  // Both identities count as "already here": a hydrated project carries the
  // backend id as its own `id`, while a locally-built one that was mirrored up
  // carries it as `pipelineProjectId`. Matching on only one of them would give
  // a mirrored build a second, duplicate card on the next load.
  const held = new Set<string>();
  for (const p of loadProjects()) {
    held.add(String(p.id));
    if (p.pipelineProjectId) held.add(String(p.pipelineProjectId));
  }

  const missing = inventory.hydratableIds.filter((id) => !held.has(String(id)));
  if (missing.length === 0) return;

  let added = 0;
  for (const id of missing) {
    if (await hydrateProjectById(id)) added += 1;
  }

  if (added > 0) {
    console.info(JSON.stringify({
      level: 'info', service: 'frontend', event: 'project_sync_hydrated_missing_projects',
      outcome: 'success',
      context: { requested: missing.length, added, server_project_count: inventory.ids.length },
    }));
  }
}

/** PULL: overlay backend completions onto local, or hydrate a build this device lacks. */
async function reconcileFromBackend(): Promise<void> {
  try {
    // Both reads in flight together: they are independent, and the pull already
    // sits in front of the student's first paint of the Projects page.
    const [treeRes, inventory] = await Promise.all([
      portalApi.get('/api/portal/projects/active'),
      fetchInventory(),
    ]);
    // Published before the reconcile below: the notice is about which project
    // the student is about to read, so it must not wait on unrelated work.
    const drift = (treeRes.data && (treeRes.data as any).drift) || null;
    driftListeners.forEach((fn) => { try { fn(drift); } catch { /* a listener must never break the pull */ } });

    const tree = (treeRes.data && Array.isArray(treeRes.data.lists))
      ? (treeRes.data as BackendProjectTree)
      : null;
    const { next, changed, mode, removed } = reconcileProjects(loadProjects(), tree, inventory);

    // Removing a card from a student's own machine is the one thing here that
    // destroys local state, so it is never silent — it leaves a record naming
    // exactly what went and why.
    if (removed && removed.length > 0) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'frontend', event: 'project_sync_pruned_deleted_projects',
        outcome: 'success',
        context: {
          mode,
          removed: removed.map((p) => ({ id: p.id, name: p.name, origin: p.origin ?? null })),
          server_project_count: inventory.ids.length,
        },
      }));
    }
    if (changed) hydrateProjects(next);

    // Inside the try, but deliberately last: every projects-page load ends by
    // giving a card to any live server project this device still lacks.
    await hydrateMissingProjects(inventory);
  } catch (err) {
    reportFailure('pull', err);
  }
}

/** PUSH: mirror the student's active (non-demo) local project to the backend. */
async function mirrorToBackend(): Promise<void> {
  const project = loadProjects().find((p) => !p.sample);
  if (!project) return; // only the seeded demo (or nothing) — nothing real to persist
  try {
    const res = await portalApi.post('/api/portal/projects/import', toImportPayload(project));

    // RECORD THE BACKEND ID. The import response is the only moment this local
    // project learns which server row it became, and the response used to be
    // thrown away — so a mirrored project never had a backend identity, and the
    // reconciler had to guess at it from story ids. That guess is what let a
    // stale project impersonate a freshly published one. With the claim written
    // here, every subsequent pull matches on id and never has to guess.
    const backendId = res?.data?.id;
    if (backendId && project.pipelineProjectId !== String(backendId)) {
      claimBackendProject(project.id, String(backendId));
    }
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

/**
 * PULL only, and NOT subject to the once-per-session latch above.
 *
 * Called when we know the server has something new: the wizard has just watched
 * a build reach `published`. Re-calling `syncProjectsWithBackend` there did
 * nothing at all — the latch was already tripped by the page-mount sync — so a
 * plan that had genuinely been published still did not appear until the student
 * reloaded. That is the second half of why tonight's builds looked missing even
 * on the accounts where the server side worked.
 *
 * Deliberately pull-only. The push half would mirror this device's snapshot
 * back over rows the server just wrote, which is the wrong direction to run
 * immediately after the server became authoritative.
 */
export async function refreshProjectsFromBackend(): Promise<void> {
  await reconcileFromBackend();
}
