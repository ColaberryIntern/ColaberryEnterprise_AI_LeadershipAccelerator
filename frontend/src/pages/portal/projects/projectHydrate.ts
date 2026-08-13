/**
 * projectHydrate — PURE reconcilers (no I/O, no React) that merge the persisted
 * Project Backend tree into the localStorage `projectsStore` shape. This is the
 * read half of the backend-source flip: the server is authoritative for task
 * COMPLETION (the durable, cross-device fact), localStorage keeps presentation.
 *
 *  - overlayCompletions: a project already on this device — mark done anything the
 *    backend has as `complete` (a completion on another device shows up here).
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
}

// The client's link key for a task — the same value it imported as `story_id`.
export const taskKey = (t: Pick<ProjectTask, 'storyId' | 'id'>): string => t.storyId || t.id;

const totalTaskCount = (tree: BackendProjectTree): number =>
  tree.lists.reduce((n, l) => n + (Array.isArray(l.tasks) ? l.tasks.length : 0), 0);

/** All story_ids present in the backend tree (the client keys it can match on). */
function backendStoryIds(tree: BackendProjectTree): Set<string> {
  const s = new Set<string>();
  for (const l of tree.lists) for (const t of l.tasks) if (t.story_id) s.add(t.story_id);
  return s;
}

/**
 * Return a project with backend completions overlaid: any local task whose key
 * matches a backend task marked `complete` becomes `done`. Returns the SAME
 * reference when nothing changed, so callers can skip a write/re-render.
 */
export function overlayCompletions(p: StudentProject, tree: BackendProjectTree): StudentProject {
  const done = new Set<string>();
  for (const l of tree.lists) for (const t of l.tasks) {
    if (t.status === 'complete' && t.story_id) done.add(t.story_id);
  }
  let changed = false;
  const lists = p.lists.map((l) => {
    const tasks = l.tasks.map((t) => {
      if (t.state !== 'done' && done.has(taskKey(t))) {
        changed = true;
        return { ...t, state: 'done' as TaskState, due: 'done' as TaskDue };
      }
      return t;
    });
    return changed ? { ...l, tasks } : l;
  });
  if (!changed) return p;
  return { ...p, lists };
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
const stateFromStatus = (status: string): TaskState => (status === 'complete' ? 'done' : 'todo');
const asAcceptance = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(String) : undefined;

/**
 * Reconstruct a StudentProject from a backend tree for a device that has never
 * seen this build. Task identity/state is faithful; presentation is regenerated
 * deterministically from the name. The first still-open task is flagged `today`.
 */
export function backendTreeToProject(tree: BackendProjectTree): StudentProject {
  const name = (tree.name || 'Your build').trim();
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
          const state = stateFromStatus(t.status);
          let due: TaskDue = 'up';
          if (state === 'done') due = 'done';
          else if (firstOpen) { due = 'today'; firstOpen = false; }
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
            state,
            due,
          };
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
  const descriptor = (tree.organization_name || lists[0]?.tasks[0]?.what || name).slice(0, 140);

  return {
    id: tree.id,
    name,
    slug: slugify(name),
    descriptor,
    accent: preset.accent,
    cover: preset.cover,
    icon: preset.icon,
    status: 'ready',
    createdAt: 1,               // stable, non-zero (0 is reserved for the demo)
    stage: lists[0] ? `${lists[0].name}` : 'Build',
    curStep: 2,
    size: 'project',
    idea: descriptor,
    reqs,
    lists,
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

// ── the merge ─────────────────────────────────────────────────────────────────
export interface ReconcileResult { next: StudentProject[]; changed: boolean; mode: 'overlay' | 'hydrate' | 'noop'; }

/**
 * Merge the backend `tree` into the local project list. If a local project shares
 * any task key with the tree, overlay its completions; otherwise the tree is a
 * build from another device — reconstruct it and prepend it (ahead of the demo).
 * An empty or absent tree is a no-op. Never mutates its input.
 */
export function reconcileProjects(local: StudentProject[], tree: BackendProjectTree | null): ReconcileResult {
  if (!tree || !Array.isArray(tree.lists) || totalTaskCount(tree) === 0) {
    return { next: local, changed: false, mode: 'noop' };
  }
  const keys = backendStoryIds(tree);
  const matchIdx = local.findIndex(
    (p) => !p.sample && p.lists.some((l) => l.tasks.some((t) => keys.has(taskKey(t)))),
  );
  if (matchIdx >= 0) {
    const overlaid = overlayCompletions(local[matchIdx], tree);
    if (overlaid === local[matchIdx]) return { next: local, changed: false, mode: 'noop' };
    const next = local.slice();
    next[matchIdx] = overlaid;
    return { next, changed: true, mode: 'overlay' };
  }
  const hydrated = backendTreeToProject(tree);
  return { next: [hydrated, ...local], changed: true, mode: 'hydrate' };
}
