/**
 * projectHydrate — PURE reconcilers (no I/O, no React) that merge the persisted
 * Project Backend tree into the localStorage `projectsStore` shape. This is the
 * read half of the backend-source flip: the server is authoritative for what
 * EXISTS and for task COMPLETION (the durable, cross-device facts), while
 * localStorage keeps presentation.
 *
 *  - adoptServerTasks: a story the tree has and this device does not — add it.
 *    Adds and never removes; see the function for why that asymmetry is the
 *    safe one.
 *  - overlayCompletions: a project already on this device — adopt any missing
 *    stories, then mark done anything the backend has as `complete` (a
 *    completion on another device shows up here).
 *  - backendTreeToProject: a project NOT on this device (a fresh browser) —
 *    reconstruct the StudentProject from the tree so the build appears at all.
 *  - reconcileProjects: pick which of the two applies and return the merged list.
 *
 * Completion is one-way (there is no "un-complete" action), so overlay never
 * regresses a done task, and the merge is idempotent — running it twice with the
 * same tree yields the same list and reports `changed: false` the second time.
 *
 * The link key between a client task and a backend row is `story_id`, which the
 * client sends as `storyId || id` on import (see projectSync.toImportPayload).
 * The I/O shell that fetches the tree and writes back is projectSync.ts.
 */
import type {
  StudentProject, ProjectList, ProjectTask, ProjectReq, TaskDue, TaskState,
} from './projectsStore';

// ── the slice of the backend ProjectTreeDto this module consumes ──────────────
export interface BackendTaskNode {
  id: string;
  story_id: string | null;
  requirement_key: string | null;
  title: string;
  description: string | null;
  status: string;                 // not_started | in_progress | complete | blocked
  position: number;
  owner_agent: string | null;
  release_key: string | null;
  acceptance: unknown;            // string[] when present
  build: string | null;           // the Claude Code prompt
  blocked_by: string[];           // story_ids this task waits on
  /**
   * Optional because not every deployed backend emits it yet. Reading it as
   * optional means an older server simply yields `null` here instead of the
   * client tripping over a shape it cannot see — the field can start being
   * sent without a coordinated release.
   */
  verified_at?: string | null;
}
export interface BackendListNode {
  id: string;
  title: string;
  position: number;
  tasks: BackendTaskNode[];
}
export interface BackendProjectTree {
  id: string;
  name: string | null;
  organization_name: string | null;
  lists: BackendListNode[];
  /**
   * https-validated server-side (projectTreeDto.commandCenterUrl) — the client
   * does not re-validate, it just renders or omits. Optional for the same
   * reason as `verified_at`: an older server omits the key entirely.
   */
  command_center_url?: string | null;
}

// The client's link key for a task — the same value it imported as `story_id`.
export const taskKey = (t: Pick<ProjectTask, 'storyId' | 'id'>): string => t.storyId || t.id;

const totalTaskCount = (tree: BackendProjectTree): number =>
  tree.lists.reduce((n, l) => n + (Array.isArray(l.tasks) ? l.tasks.length : 0), 0);

/**
 * True when this local project's task keys are EXACTLY the backend tree's story
 * ids — the fingerprint of a client-built project that was mirrored up, whose
 * backend rows were created one-per-local-task by projectSync.toImportPayload.
 *
 * EQUALITY, not containment. MEASURED 2026-08-15, ali@colaberry.com.
 *
 * This check was containment ("every backend key is present locally"), on the
 * reasoning that a genuinely new plan brings keys the old one never had. That
 * reasoning holds only while the new plan is the LONGER of the two. Story ids
 * are per-plan sequential — planContract numbers them STORY-001 upward and
 * commandCenterStory prepends STORY-000 — so a newly published 19-task plan
 * (STORY-000…STORY-018) is a strict SUBSET of any older local plan with 19 or
 * more stories. Containment then matched the stale project, the new tree was
 * overlaid onto it, and the real published build never appeared at all. The
 * server was correct the whole time; only the browser was wrong.
 *
 * Equality is the honest form of the question "did the backend rows come from
 * THIS project's tasks?": if they did, the two key sets are the same set, not
 * merely one inside the other. A subset is evidence of collision, not identity.
 *
 * This path is a legacy bridge only. Since 2026-08-15 projectSync records the
 * backend id returned by the import (`claimBackendProject`), so a mirrored
 * project is matched by id on every subsequent load and never reaches here.
 */
function sameTaskKeySet(p: StudentProject, tree: BackendProjectTree): boolean {
  const localKeys = new Set(p.lists.flatMap((l) => l.tasks.map((t) => taskKey(t))));
  const backendKeys = new Set<string>();
  for (const l of tree.lists) for (const t of l.tasks) if (t.story_id) backendKeys.add(t.story_id);
  if (backendKeys.size === 0 || backendKeys.size !== localKeys.size) return false;
  for (const k of Array.from(backendKeys)) if (!localKeys.has(k)) return false;
  return true;
}

/**
 * THE SERVER OWNS THE NAME. Adopt `tree.name` onto a project this device already
 * holds, whenever the server has a name to give.
 *
 * MEASURED 2026-08-17, production, ali@colaberry.com. `cce94c20` is named
 * `Student Early Warning` in the database, and his browser rendered it as
 * "Your build". Both facts were correct for the code as written: the project was
 * hydrated on 2026-08-16 while `projects.name` was still NULL, so the card cached
 * `FALLBACK_NAME`; the name was set afterwards by the backfill; and
 * `overlayCompletions` — the ONLY path a device that already holds a project ever
 * takes — updated task state and the Command Center URL and nothing else. There
 * was no code anywhere that could move a server-side rename onto an existing
 * card. `backendTreeToProject` reads the name, but that path runs only on a
 * device that has never seen the build, so the fix looked present and was not.
 *
 * ONLY when the server has something meaningful, and this is the load-bearing
 * half. `importProject` deliberately never writes the client's `name` to the
 * project row, so a browser-built project that was mirrored up has `name: NULL`
 * on the server while carrying a perfectly good student-chosen name locally.
 * Adopting unconditionally would overwrite that with the fallback and rename the
 * student's build to "Your build" — turning one stale-name bug into a worse one
 * that destroys information instead of merely failing to refresh it.
 *
 * The descriptor follows the same rule and keeps the guard from
 * `backendTreeToProject`: a subtitle equal to the heading carries nothing.
 */
export function adoptServerIdentity(p: StudentProject, tree: BackendProjectTree): StudentProject {
  const serverName = firstMeaningful(tree.name);
  if (!serverName) return p;

  const nameChanged = serverName !== p.name;

  // Re-derive the descriptor only against the name we are actually landing on,
  // so the "subtitle must not repeat the heading" rule holds after a rename too.
  const candidate = firstMeaningful(tree.organization_name);
  const nextDescriptor = candidate && candidate !== serverName
    ? candidate.slice(0, 140)
    : p.descriptor;
  const descriptorChanged = nextDescriptor !== p.descriptor && nextDescriptor !== serverName;

  if (!nameChanged && !descriptorChanged) return p;
  return {
    ...p,
    ...(nameChanged ? { name: serverName, slug: slugify(serverName) } : {}),
    ...(descriptorChanged ? { descriptor: nextDescriptor } : {}),
  };
}

/**
 * THE SERVER OWNS WHAT EXISTS. Add tasks (and whole lists) the tree has and this
 * device does not.
 *
 * MEASURED 2026-08-17, production, qninying@gmail.com. His card showed
 * STORY-001 and not STORY-000, from the same list, at adjacent positions, while
 * the read API returned both. The card was cached without STORY-000 — the
 * Command Center story is deliberately absent from `plan.stories`, so anything
 * built from a plan is short by exactly that one story — and after that no code
 * path could ever put it there. `overlayCompletions` updated task STATE, the
 * name and the Command Center URL; a task the server had and the browser did
 * not was simply never noticed. `reconcileProjects` called it `noop`.
 *
 * ADDS AND NEVER REMOVES, and that asymmetry is deliberate:
 *
 *  - a task the SERVER has and the browser lacks is added. The server is
 *    authoritative for what exists, and this is the whole repair.
 *  - a task the BROWSER has and the server lacks is KEPT. He had ten hand-ticked
 *    completions on a legacy generation that the published plan knows nothing
 *    about. Failing to show a story is the bug being fixed here; deleting ten
 *    completions would just be a worse one. Removal, if it is ever wanted, is a
 *    separate decision with a different risk profile — see pruneDeadProjects for
 *    how carefully the project-level version of that question is handled.
 *
 * Idempotent by construction: the second pass finds nothing missing and returns
 * the SAME reference, which is what keeps a quiet sync quiet.
 */
export function adoptServerTasks(p: StudentProject, tree: BackendProjectTree): StudentProject {
  const localKeys = new Set(p.lists.flatMap((l) => l.tasks.map((t) => taskKey(t))));

  // Server order, so the earliest missing story is the one that may claim `today`.
  const serverLists = [...tree.lists].sort((a, b) => a.position - b.position);
  const missingByList = new Map<string, BackendTaskNode[]>();
  let missingCount = 0;
  for (const l of serverLists) {
    const missing = (Array.isArray(l.tasks) ? l.tasks : [])
      .filter((t) => !localKeys.has(serverTaskKey(t)))
      .sort((a, b) => a.position - b.position);
    if (missing.length) { missingByList.set(l.id, missing); missingCount += missing.length; }
  }
  if (missingCount === 0) return p;

  // `today` is claimed only if nothing on the card already holds it. Promoting
  // without demoting keeps this additive: two tasks labelled "Due today" would
  // be a new inconsistency, and silently restyling work the student is already
  // looking at is not this function's job.
  let needToday = !p.lists.some((l) => l.tasks.some((t) => t.due === 'today'));
  const dueFor = (t: BackendTaskNode): TaskDue => {
    if (stateFromStatus(t.status) === 'done') return 'done';
    if (needToday) { needToday = false; return 'today'; }
    return 'up';
  };

  // Only the count-style subtitle that `backendTreeToProject` writes is
  // refreshed. Every other `sub` on a card is prose a human wrote ("Build the
  // MCP server", "Prove it at the Architect Expo") and rewriting that as a
  // count would destroy information to fix a number.
  const COUNT_SUB = /^\d+ stor(y|ies)$/;
  const countSub = (n: number): string => `${n} stor${n === 1 ? 'y' : 'ies'}`;

  const lists: ProjectList[] = p.lists.map((l) => {
    const missing = missingByList.get(l.id);
    if (!missing) return l;
    const tasks = l.tasks.slice();
    for (const t of missing) {
      // Slotted at the server's index rather than appended: STORY-000 is the
      // first thing a student builds, and a Command Center story sorted to the
      // bottom of the release is a different bug wearing the same clothes.
      tasks.splice(Math.min(Math.max(t.position, 0), tasks.length), 0, taskFromServer(t, dueFor(t)));
    }
    return { ...l, tasks, sub: COUNT_SUB.test(l.sub) ? countSub(tasks.length) : l.sub };
  });

  // Whole lists this device has never seen. Placed at the server's position
  // where that index still exists, appended otherwise — his project carries two
  // generations sharing one position space (two lists at 2, two at 5), so an
  // exact placement is not always available and guessing past the end would
  // just throw. `step` is presentation only and nothing renders off it.
  const known = new Set(p.lists.map((l) => l.id));
  for (const l of serverLists) {
    if (known.has(l.id)) continue;
    const at = Math.min(Math.max(l.position, 0), lists.length);
    lists.splice(at, 0, {
      id: l.id,
      step: 2 + at,
      name: l.title || `Release ${at + 1}`,
      sub: countSub(Array.isArray(l.tasks) ? l.tasks.length : 0),
      tasks: (Array.isArray(l.tasks) ? [...l.tasks] : [])
        .sort((a, b) => a.position - b.position)
        .map((t) => taskFromServer(t, dueFor(t))),
    });
  }

  return { ...p, lists };
}

/**
 * Return a project reconciled with the backend tree: stories the server has and
 * this device lacks are added (see adoptServerTasks), any local task whose key
 * matches a backend task marked `complete` becomes `done`, and the server's name
 * is adopted (see adoptServerIdentity). Returns the SAME reference when nothing
 * changed, so callers can skip a write/re-render.
 */
export function overlayCompletions(p: StudentProject, tree: BackendProjectTree): StudentProject {
  // Adoption runs FIRST so the rest of this function sees the full card. An
  // adopted task already carries the server's status, so the completion overlay
  // below is a no-op on it rather than a second source of truth.
  const withServerTasks = adoptServerTasks(p, tree);
  const adopted = withServerTasks !== p;

  const done = new Set<string>();
  for (const l of tree.lists) for (const t of l.tasks) {
    if (t.status === 'complete' && t.story_id) done.add(t.story_id);
  }
  let changed = false;
  const lists = withServerTasks.lists.map((l) => {
    const tasks = l.tasks.map((t) => {
      if (t.state !== 'done' && done.has(taskKey(t))) {
        changed = true;
        return { ...t, state: 'done' as TaskState, due: 'done' as TaskDue };
      }
      return t;
    });
    return changed ? { ...l, tasks } : l;
  });

  // The Command Center URL is recorded AFTER the student has built and deployed
  // one — which is to say, on exactly the devices that already hold this project
  // and therefore take the overlay path, never the hydrate path. Carrying it
  // only in backendTreeToProject would mean the button appeared on every device
  // EXCEPT the one that did the work. Compared normalised so "absent on both
  // sides" is not mistaken for a change and does not defeat the same-reference
  // fast path callers rely on to skip a write.
  const nextUrl = tree.command_center_url ?? null;
  const urlChanged = nextUrl !== (p.commandCenterUrl ?? null);

  const base: StudentProject = (!changed && !urlChanged && !adopted) ? p : {
    ...withServerTasks,
    ...(changed ? { lists } : {}),
    ...(urlChanged ? { commandCenterUrl: nextUrl } : {}),
  };
  // Applied last and on the merged object, so a rename and a completion arriving
  // in the same pull both land, and the same-reference fast path survives when
  // neither did.
  return adoptServerIdentity(base, tree);
}

// ── reconstruction of a project not present on this device ────────────────────
// A tiny deterministic palette so a restored build looks intentional. Colours can
// differ from the origin device (presentation is not persisted) — the tasks and
// their completion state, which are, always match.
const PALETTE: { accent: string; cover: string; icon: string }[] = [
  { accent: '#367895', cover: 'linear-gradient(120deg,#367895 0%,#2E6A86 55%,#5BA63C 130%)', icon: 'M5 4h11l4 4v12H5zM8 11h8M8 15h6' },
  { accent: '#5BA63C', cover: 'linear-gradient(120deg,#5BA63C 0%,#3C7A26 55%,#367895 130%)', icon: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' },
  { accent: '#E8920C', cover: 'linear-gradient(120deg,#E8920C 0%,#B5710A 55%,#FB2832 130%)', icon: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4' },
  { accent: '#FB2832', cover: 'linear-gradient(120deg,#FB2832 0%,#C20E1E 60%,#367895 130%)', icon: 'M4 7h16v12H4zM4 7l3-3h6l3 3' },
];
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'restored-build';
}
/**
 * Shown only when the server has no name for this build. Every project is meant
 * to have a real, student-chosen name (carried from intake by the backend's
 * sbp/projectNaming), so reaching this is a defect worth noticing rather than
 * the normal case it used to be — as of 2026-08-16 all 20 live builds hit it.
 */
export const FALLBACK_NAME = 'Your build';
/** Shown only when nothing describes the build. Never equal to FALLBACK_NAME. */
export const FALLBACK_DESCRIPTOR = 'Capstone build';

/**
 * First argument that still says something once trimmed, else null.
 *
 * `' '` IS TRUTHY IN JAVASCRIPT, which is the whole reason this exists. The
 * previous form was `(tree.name || 'Your build').trim()`: a whitespace-only
 * name sailed through the `||`, trimmed to `''`, and rendered a card with no
 * heading at all — strictly worse than the fallback it had just defeated.
 * Trimming BEFORE the test, rather than after it, is the fix.
 */
function firstMeaningful(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return null;
}

const stateFromStatus = (status: string): TaskState => (status === 'complete' ? 'done' : 'todo');
const asAcceptance = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(String) : undefined;

/**
 * One backend task node as a client task.
 *
 * Shared by the two paths that can bring a server task onto this device:
 * `backendTreeToProject` (never seen this build) and `adoptServerTasks` (has the
 * build, is missing a story). They MUST agree — a story adopted onto an
 * existing card has to carry the same prompt, acceptance criteria and blockers
 * as the same story on a fresh device, or the workspace shows different work
 * depending on which browser opened it.
 *
 * `due` is presentation and is decided by the caller, which is the only thing
 * the two paths legitimately disagree about: a fresh device ranks the whole
 * plan at once, while adoption is slotting one story into a card that already
 * has an order.
 */
function taskFromServer(t: BackendTaskNode, due: TaskDue): ProjectTask {
  return {
    id: t.id,
    title: t.title || 'Task',
    what: t.description || undefined,
    prompt: t.build || undefined,
    req: t.requirement_key || undefined,
    acceptance: asAcceptance(t.acceptance),
    owner: t.owner_agent || undefined,
    release: t.release_key || undefined,
    storyId: t.story_id || undefined,
    blockedBy: Array.isArray(t.blocked_by) && t.blocked_by.length ? t.blocked_by : undefined,
    // Normalised to null rather than left undefined: "the server has not
    // verified this" and "this server does not report verification" are
    // the same fact to every reader, and one shape is easier to assert on.
    verifiedAt: t.verified_at ?? null,
    state: stateFromStatus(t.status),
    due,
  };
}

/** The server's key for a task node — the mirror of `taskKey` on the client side. */
const serverTaskKey = (t: BackendTaskNode): string => t.story_id || t.id;

/**
 * Reconstruct a StudentProject from a backend tree for a device that has never
 * seen this build. Task identity/state is faithful; presentation is regenerated
 * deterministically from the name. The first still-open task is flagged `today`.
 */
export function backendTreeToProject(tree: BackendProjectTree): StudentProject {
  const name = firstMeaningful(tree.name) ?? FALLBACK_NAME;
  const preset = PALETTE[Math.abs(hash(name)) % PALETTE.length];

  let firstOpen = true;
  const lists: ProjectList[] = [...tree.lists]
    .sort((a, b) => a.position - b.position)
    .map((l, li) => ({
      id: l.id,
      step: 2 + li,
      name: l.title || `Release ${li + 1}`,
      sub: `${l.tasks.length} stor${l.tasks.length === 1 ? 'y' : 'ies'}`,
      tasks: [...l.tasks]
        .sort((a, b) => a.position - b.position)
        .map((t): ProjectTask => {
          let due: TaskDue = 'up';
          if (stateFromStatus(t.status) === 'done') due = 'done';
          else if (firstOpen) { due = 'today'; firstOpen = false; }
          return taskFromServer(t, due);
        }),
    }));

  // Requirements: derive a light catalog from the distinct requirement keys the
  // tasks cite (rich requirement names are not persisted on this path).
  const reqIds: string[] = [];
  for (const l of lists) for (const t of l.tasks) {
    if (t.req && !reqIds.includes(t.req)) reqIds.push(t.req);
  }
  const reqs: ProjectReq[] = reqIds.map((id): ProjectReq => ({ id, name: id, kind: 'FUNC', state: 'planned' }));

  const owners = Array.from(new Set(
    lists.flatMap((l) => l.tasks.map((t) => t.owner).filter((o): o is string => !!o)),
  ));
  // The descriptor is the card's SUBTITLE, rendered directly beneath `name`.
  // It used to fall back to `name` itself, so an unnamed build rendered
  // "Your build" as both heading and subtitle — the generic fallback stated
  // twice, which reads like a rendering bug rather than a missing title.
  // A subtitle that merely repeats the heading carries no information at any
  // time, so the guard is on equality, not just on the fallback case.
  const candidate = firstMeaningful(tree.organization_name, lists[0]?.tasks[0]?.what);
  const descriptor = (candidate && candidate !== name ? candidate : FALLBACK_DESCRIPTOR).slice(0, 140);

  return {
    id: tree.id,
    name,
    slug: slugify(name),
    descriptor,
    accent: preset.accent,
    cover: preset.cover,
    icon: preset.icon,
    status: 'ready',
    // This one came off the server pipeline: a gated plan materialized into
    // student_tasks, with dates and real prompts. Recorded so the UI can say so
    // — the local fallback and this looked identical, which is how a degraded
    // build went unnoticed for a whole evening.
    origin: 'pipeline',
    pipelineProjectId: tree.id,
    createdAt: 1,               // stable, non-zero (0 is reserved for the demo)
    stage: lists[0] ? `${lists[0].name}` : 'Build',
    curStep: 2,
    size: 'project',
    idea: descriptor,
    reqs,
    lists,
    commandCenterUrl: tree.command_center_url ?? null,
    activity: [
      { id: 'a-restored', kind: 'note', who: 'Cory', time: 'just now',
        title: 'Restored from your account',
        body: 'Loaded your build and its progress from the server so it follows you across devices.' },
    ],
    preview: {
      toolName: name,
      summary: descriptor,
      tools: owners.length ? owners : ['Claude Code'],
      dataSources: [],
      guardrails: [],
    },
  };
}

// ── who owns a local project's identity ───────────────────────────────────────
/**
 * The server's answer to "which projects does this enrollment actually have?"
 *
 * `known` is the safety interlock. It is true ONLY when GET /api/portal/projects
 * genuinely answered. A 404 (API flag off), a network error, a timeout or a
 * malformed body all leave it false, and nothing may be removed on a false.
 * Absence of evidence is not evidence of absence — and the cost of getting that
 * backwards is deleting a student's work.
 */
export interface ServerInventory {
  known: boolean;
  /** Every project id the server says this enrollment owns. */
  ids: string[];
  /** The project the server considers active, if any. */
  activeId: string | null;
}

export const UNKNOWN_INVENTORY: ServerInventory = { known: false, ids: [], activeId: null };

/**
 * Backend ids are UUIDs; the browser mints its own as `p<epoch>` and the seeded
 * demo is the literal `sample-salon`. That difference is what lets us tell a
 * project the SERVER produced from one the BROWSER produced, on a device whose
 * localStorage predates the `origin` field.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The backend project id this local project is bound to, or null if it is not
 * bound to one at all.
 *
 *  - an explicit claim (`pipelineProjectId`) — written by the wizard when it
 *    starts a server build, and by projectSync after a successful mirror;
 *  - failing that, its own id when that id is a UUID, which means it came out
 *    of `backendTreeToProject` and IS a server project.
 *
 * The demo never has one: it is deliberately local and is not the server's to
 * account for.
 */
export function backendIdOf(p: StudentProject): string | null {
  if (p.sample) return null;
  if (p.pipelineProjectId) return String(p.pipelineProjectId);
  if (UUID_RE.test(String(p.id))) return String(p.id);
  return null;
}

/**
 * Remove local projects the server says no longer exist. THE SERVER IS
 * AUTHORITATIVE FOR WHAT EXISTS — but only for the projects it ever knew about.
 *
 * The enumerated cases, in the order they are decided:
 *
 *  1. inventory not known (fetch failed / API off)  → remove NOTHING.
 *  2. inventory known but empty AND no active tree  → remove NOTHING. "You have
 *     no projects at all" is indistinguishable from a half-broken response or a
 *     token that resolved to the wrong enrollment, and it is the one shape that
 *     would wipe every build at once. We decline to act on it.
 *  3. the seeded demo/training example (`sample`)   → KEPT, always. It is
 *     deliberately local and the server was never meant to hold it.
 *  4. a purely-local project with no backend id     → KEPT. The browser fallback
 *     (`origin: 'local'`, `p<epoch>` id) never reached the server, so the server
 *     cannot testify about it. A student may have real notes on it.
 *  5. a project bound to a backend id that IS in the inventory → KEPT (live).
 *  6. a project bound to a backend id that is NOT in the inventory → REMOVED.
 *     It was pushed to the server and the server row is gone: deleted, or moved
 *     to another enrollment. This is the only branch that deletes anything.
 */
export function pruneDeadProjects(
  local: StudentProject[],
  inventory: ServerInventory,
  hasActiveTree: boolean,
): { next: StudentProject[]; removed: StudentProject[] } {
  if (!inventory.known) return { next: local, removed: [] };                    // case 1
  if (inventory.ids.length === 0 && !hasActiveTree) return { next: local, removed: [] }; // case 2

  const live = new Set(inventory.ids.map(String));
  const next: StudentProject[] = [];
  const removed: StudentProject[] = [];
  for (const p of local) {
    const backendId = backendIdOf(p);                                            // cases 3 + 4 → null
    if (backendId === null || live.has(backendId)) next.push(p);                 // cases 3, 4, 5
    else removed.push(p);                                                        // case 6
  }
  // Same reference when nothing died, so callers keep their no-write fast path
  // and a quiet sync stays genuinely quiet.
  if (removed.length === 0) return { next: local, removed };
  return { next, removed };
}

/**
 * Order the list so the page leads with the truth.
 *
 * ProjectsPage renders `projects[0]` as the primary build, so this ordering is
 * the difference between a student seeing their real published plan and seeing
 * a browser template. Ranked, stable within each rank:
 *
 *   0 — the enrollment's ACTIVE server project (rule: it always leads)
 *   1 — other server-born projects (real builds that exist on the server)
 *   2 — purely-local projects (the browser fallback: kept, but never outranking
 *       a real published build)
 *   3 — the seeded demo/training example (kept, always last)
 *
 * Stability matters: within a rank the student's existing order is preserved, so
 * nothing shuffles under them on a reload.
 */
export function orderProjects(local: StudentProject[], activeId: string | null): StudentProject[] {
  const rank = (p: StudentProject): number => {
    if (p.sample) return 3;
    const backendId = backendIdOf(p);
    if (backendId === null) return 2;
    return activeId !== null && backendId === String(activeId) ? 0 : 1;
  };
  return local
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.p);
}

const sameOrder = (a: StudentProject[], b: StudentProject[]): boolean =>
  a.length === b.length && a.every((p, i) => p === b[i]);

// ── the merge ─────────────────────────────────────────────────────────────────
export interface ReconcileResult {
  next: StudentProject[];
  changed: boolean;
  /** `prune` = nothing merged, but dead projects were dropped and/or the list was re-ordered. */
  mode: 'overlay' | 'hydrate' | 'supersede' | 'noop' | 'prune';
  /** Projects dropped because the server no longer has them (for logging). */
  removed?: StudentProject[];
}

/** Has the student actually done work on this build? */
const hasCompletedWork = (p: StudentProject): boolean =>
  p.lists.some((l) => l.tasks.some((t) => t.state === 'done'));

/**
 * Merge the backend `tree` into the local project list, then make the list agree
 * with the server about what exists and what leads.
 *
 * THE SERVER IS AUTHORITATIVE FOR WHAT EXISTS. Three things follow, in order:
 *
 *   1. MERGE — match the tree to a local project by BACKEND ID (never by story
 *      id), and overlay, supersede, or hydrate accordingly.
 *   2. PRUNE — drop local projects whose server project is gone. Only projects
 *      that demonstrably reached the server are eligible; see pruneDeadProjects
 *      for the enumerated cases and the two interlocks that stop it deleting a
 *      student's work on a bad response.
 *   3. ORDER — rank the active server project first, the demo last; see
 *      orderProjects.
 *
 * `inventory` is optional and defaults to UNKNOWN, which disables pruning
 * entirely — a caller that cannot fetch the server's project list still gets a
 * correct merge and a correct order, just no removals.
 *
 * Never mutates its input. Idempotent: a second pass with the same tree and
 * inventory returns the same list and reports `changed: false`.
 */
export function reconcileProjects(
  local: StudentProject[],
  tree: BackendProjectTree | null,
  inventory: ServerInventory = UNKNOWN_INVENTORY,
): ReconcileResult {
  const usableTree = !!tree && Array.isArray(tree.lists) && totalTaskCount(tree) > 0;

  // The active project is whichever one the server just handed us as active; the
  // inventory is only a fallback for it. Deriving it from the tree means rule
  // (a) — the active build always leads — holds even when the inventory fetch
  // failed, which is exactly when we most need the page to still be right.
  const activeId = (usableTree ? String(tree!.id) : null) ?? inventory.activeId;

  // Prune and re-order run whether or not there is a tree: a student whose
  // server projects were all deleted still needs the dead cards to go, and a
  // student with no active build still needs the demo to sit last.
  const settle = (list: StudentProject[], merged: boolean, mode: ReconcileResult['mode']): ReconcileResult => {
    const { next: pruned, removed } = pruneDeadProjects(list, inventory, usableTree);
    const ordered = orderProjects(pruned, activeId);
    const changed = merged || removed.length > 0 || !sameOrder(ordered, local);
    return {
      next: changed ? ordered : local,
      changed,
      mode: changed && mode === 'noop' ? 'prune' : mode,
      removed,
    };
  };

  if (!usableTree) return settle(local, false, 'noop');

  // IDENTITY IS THE BACKEND PROJECT ID. Nothing else is reliable.
  //
  // Two things can legitimately be "the same project":
  //   1. one this device hydrated before — it carries the backend id
  //      (backendTreeToProject sets `id: tree.id`), so compare ids;
  //   2. a client-built project that was mirrored TO the backend — its local id
  //      differs from the backend's, so it is matched by the claim written after
  //      the import (`pipelineProjectId`), and only failing that by an exact
  //      task-key-set match as a legacy bridge (see sameTaskKeySet).
  //
  // Story ids cannot stand in for identity: they are per-plan sequential, so
  // every plan on the platform has a STORY-000 and a STORY-001. Matching on
  // them — by any-key OR by containment — makes distinct projects look like
  // each other, which is what hid a published build behind a stale one.
  const matchIdx = local.findIndex((p) => !p.sample && p.id === tree!.id);

  // A local placeholder that CLAIMED this backend project is superseded by it.
  //
  // The wizard creates an optimistic local build the instant the student
  // submits, so the page has something to show while the server takes minutes.
  // When the server's plan arrives, that placeholder has done its job. Without
  // this branch the student ends up with two builds — a ten-task template and
  // their real plan, sitting side by side looking equally legitimate.
  //
  // Guarded on completed work: if the student ticked something off the
  // placeholder while waiting, both are kept (and both are labelled by
  // `origin`) rather than silently discarding what they did. Losing a real plan
  // is the bug being fixed here; losing a student's clicks would just be a
  // different one.
  // The local project the backend rows came FROM: same task keys exactly, and
  // not already bound to some OTHER server project. This is an overlay, not a
  // supersede — the tree is this project, read back, not a different plan
  // replacing it. Resolved BEFORE the supersede branch for exactly that reason:
  // a claim plus matching keys means "mine, round-tripped", and superseding it
  // would relabel a client-built project as a pipeline-generated one.
  const mirrorIdx = matchIdx >= 0 ? -1 : local.findIndex((p) => {
    if (p.sample) return false;
    const bound = backendIdOf(p);
    if (bound !== null && bound !== tree!.id) return false;
    return sameTaskKeySet(p, tree!);
  });

  // A local placeholder that CLAIMED this backend project — and whose tasks are
  // NOT the tree's — is a stand-in for a different, server-authored plan, so the
  // real plan supersedes it.
  if (matchIdx < 0 && mirrorIdx < 0) {
    const claimIdx = local.findIndex((p) => !p.sample && p.pipelineProjectId === tree!.id);
    if (claimIdx >= 0 && !hasCompletedWork(local[claimIdx])) {
      const next = local.slice();
      next[claimIdx] = backendTreeToProject(tree!);   // in place: keeps its rank position
      return settle(next, true, 'supersede');
    }
  }

  const targetIdx = matchIdx >= 0 ? matchIdx : mirrorIdx;

  if (targetIdx >= 0) {
    const overlaid = overlayCompletions(local[targetIdx], tree!);
    if (overlaid === local[targetIdx]) return settle(local, false, 'noop');
    const next = local.slice();
    next[targetIdx] = overlaid;
    return settle(next, true, 'overlay');
  }

  // Nothing local is this project: the server has a build this device has never
  // seen. Reconstruct it. `settle` then ranks it first, because it is active.
  return settle([backendTreeToProject(tree!), ...local], true, 'hydrate');
}
