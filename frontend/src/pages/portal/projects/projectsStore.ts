import { useEffect, useState } from 'react';
import salonData from './salonData.json';
import { adoptServerIds, isUuid } from './projectIdentity';

// ============================================================================
// Portal-native project store — the student's "builds" live HERE (not Basecamp),
// mirroring the Basecamp structure (project -> lists -> tasks) but rendered in the
// FB-feed language of the Design E portal. This is a frontend-first implementation
// backed by localStorage with a clean API seam: every read/write goes through the
// functions below, so a later pass can swap them for `/api/portal/projects`
// endpoints without touching the pages. Real persisted, multi-tenant project
// storage is a backend/schema change (a governance step) tracked as a follow-up.
//
// Background creation: createProjectFromAnswers() returns immediately with a
// project in the `creating` state and schedules generation on a module-level
// timer, so the student can navigate anywhere while their build is assembled.
// When it flips to `ready`, subscribers re-render and a global toast fires.
// See project memory: project_portal_fb_feed_system.
// ============================================================================

export type TaskState = 'todo' | 'done' | 'skipped';
export type TaskDue = 'overdue' | 'today' | 'up' | 'done';
export type ReqState = 'unmapped' | 'planned' | 'built' | 'verified';
export type ProjectStatus = 'creating' | 'ready';
export type BuildSize = 'workflow' | 'project' | 'autonomous';

export type ProjectTask = {
  id: string;
  title: string;
  what?: string;          // one-line "what to do" (the user story)
  prompt?: string;        // the Claude Code prompt for this task
  req?: string;           // linked requirement id
  acceptance?: string[];  // Gherkin acceptance = demo script + build-loop stop
  owner?: string;         // owning AI agent(s)
  release?: string;       // release label, e.g. "r0 (wk3)"
  storyId?: string;       // e.g. "STORY-001"
  blockedBy?: string[];   // storyIds of prerequisite tasks that must be DONE first
  state: TaskState;
  due: TaskDue;
  /**
   * Points this task is worth, when the backend has said. Optional and never
   * defaulted: the hero shows the badge only when a real number exists, because
   * an invented one would be the dashboard lying on the first screen a student
   * sees. Wired to points_config once story verification lands.
   */
  points?: number;
  /**
   * When the backend recorded this story as VERIFIED, if it ever did. Distinct
   * from `state: 'done'`, which is the student saying so — this is the server
   * saying so. Carried now so the verification signal survives a hydrate;
   * nothing renders it yet.
   */
  verifiedAt?: string | null;
};

export type ProjectList = {
  id: string;
  step: number;         // build step this list belongs to (1..9)
  name: string;
  sub: string;
  tasks: ProjectTask[];
};

export type ProjectReq = { id: string; name: string; kind: string; state: ReqState };

export type ProjectActivity = {
  id: string;
  kind: 'commit' | 'req' | 'done' | 'note';
  who: string;
  time: string;
  title: string;
  body: string;
};

export type ToolPreview = {
  toolName: string;
  summary: string;
  tools: string[];
  dataSources: string[];
  guardrails: string[];
};

export type StudentProject = {
  id: string;
  name: string;
  slug: string;
  descriptor: string;
  accent: string;       // brand accent color
  cover: string;        // CSS gradient for the cover
  icon: string;         // single SVG path `d`
  status: ProjectStatus;
  createdAt: number;
  stage: string;        // e.g. "Step 2 of 9 · Requirements"
  curStep: number;
  size: BuildSize;
  idea: string;
  sample?: boolean;     // seeded demo build
  /**
   * WHICH PIPELINE PRODUCED THIS BUILD. The single most important field on this
   * type for anyone debugging what a student is looking at.
   *
   *  - `'pipeline'` — the real thing: a server-generated, gate-checked plan
   *    materialized into `student_tasks`, with dates, STORY-000 and full prompts.
   *  - `'local'`    — the browser's fallback: a fixed ten-task template from
   *    `generateSkeleton` below, no dates, no Command Center, prompts written
   *    from three form fields rather than the student's requirements.
   *
   * The two used to be indistinguishable on screen. On 2026-08-12/13 five
   * students were served the fallback and had no way to know — which is also
   * why nobody reported it as a bug for the whole evening. Absent on projects
   * stored before this field existed; treat absent as unknown, not as real.
   */
  origin?: 'local' | 'pipeline';
  /**
   * The backend `projects.id` this local build is standing in for, once the
   * wizard has resolved one. Set on the optimistic placeholder so that when the
   * server's plan arrives it REPLACES the placeholder instead of sitting next
   * to it as a second, near-identical build. See projectHydrate.reconcileProjects.
   */
  pipelineProjectId?: string | null;
  /**
   * Pseudo ids (`p<epoch>`) this project used to be keyed by, before it adopted
   * its server UUID. Kept so a workspace URL a student bookmarked — or has open
   * in another tab — still resolves to the project after the heal.
   * See projectIdentity.adoptServerIds.
   */
  legacyIds?: string[];
  reqs: ProjectReq[];
  lists: ProjectList[];
  activity: ProjectActivity[];
  preview: ToolPreview;
  /**
   * Where this build's Command Center is running, once STORY-000 ships it.
   * Absent until the student has deployed one, so every consumer must treat
   * "no URL" as the normal first-week state and render nothing rather than a
   * dead link.
   */
  commandCenterUrl?: string | null;
};

export type NewBuildAnswers = {
  name?: string;
  idea: string;
  size: BuildSize;
  /**
   * Legacy scoping fields. The wizard no longer asks these as three fixed
   * questions — they are derived best-effort from `answers` so the local
   * fallback below and the server's requirements document (which must
   * reference all three) keep working.
   */
  users?: string;
  dataSources?: string;
  done?: string;
  /** The interview: questions generated from this student's idea, and their replies. */
  answers?: Array<{ id: string; question: string; answer: string }>;
  weeks: number;
};

// ── persistence ────────────────────────────────────────────────────────────
const KEY = 'te_projects_v1';

/**
 * Move any storage keyed on a project id that just changed.
 *
 * Only the per-story acceptance ticks are keyed this way
 * (`te_ws_acc_<projectId>_<taskId>`, written by ProjectWorkspacePage). Without
 * this, healing a stale id would silently un-tick every box a student had
 * checked — the heal would read to them as data loss.
 */
function migrateIdKeyedStorage(remapped: Array<{ from: string; to: string }>): void {
  for (const { from, to } of remapped) {
    const prefix = `te_ws_acc_${from}_`;
    let keys: string[];
    try { keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix)); }
    catch { return; /* private mode */ }
    for (const key of keys) {
      try {
        const value = localStorage.getItem(key);
        if (value !== null) localStorage.setItem(`te_ws_acc_${to}_${key.slice(prefix.length)}`, value);
        localStorage.removeItem(key);
      } catch { /* quota / private mode — the tick is a note-to-self, not evidence */ }
    }
  }
}

/**
 * Adopt server ids on the way out of storage, so a pseudo id already sitting in
 * a student's browser heals on their next load rather than persisting forever.
 * Writes back only when something actually moved, so this stays a no-op on the
 * overwhelming majority of reads.
 */
function healProjectIds(list: StudentProject[]): StudentProject[] {
  const { list: healed, remapped } = adoptServerIds(list);
  if (!remapped.length) return list;
  migrateIdKeyedStorage(remapped);
  write(healed);
  return healed;
}

function read(): StudentProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as StudentProject[];
      // migrate: (re)seed the training sample when it is MISSING or STALE. A
      // pre-dependency sample carries no `blockedBy` on any task, so refresh it
      // so the blocking demo (and the themed icon) reach returning users. The
      // student's own builds are always kept.
      const sample = list.find((p) => p.id === 'sample-salon');
      const stale = !sample
        || !sample.lists.some((l) => l.tasks.some((t) => (t.blockedBy?.length ?? 0) > 0));
      if (stale) {
        const migrated = [buildSalonProject(), ...list.filter((p) => !p.sample)];
        write(migrated);
        return healProjectIds(migrated);
      }
      return healProjectIds(list);
    }
  } catch (err) {
    // Falling back to a re-seed is right (an unreadable cache is not a reason to
    // show the student nothing), but doing it SILENTLY is not: this branch
    // discards whatever was in localStorage, and it used to do that without
    // leaving a trace. The server refetch on the next sync restores any build
    // that ever reached it; a browser-only build is genuinely lost here, which
    // is exactly the kind of thing that must be greppable in a bug report.
    logStoreFailure('projects_cache_unreadable', err);
  }
  const seeded = [buildSalonProject()];
  write(seeded);
  return seeded;
}

/**
 * Stable, structured, and never secret-bearing. Matches the observability
 * contract in CLAUDE.md: an `error_class` a human can grep for beats a stack
 * trace nobody sees.
 */
function logStoreFailure(event: string, err: unknown): void {
  const errorClass = err instanceof Error ? err.name : typeof err;
  console.error(JSON.stringify({
    level: 'error', service: 'portal-projects', event,
    error_class: errorClass || 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
  }));
}

/**
 * Persist the project list. Returns whether it actually landed.
 *
 * WHY THIS REPORTS FAILURE. It used to be a bare try/setItem with an empty
 * catch, which is the one shape this store could not afford. A `QuotaExceededError`
 * left the OLD value in localStorage while every caller carried on as though the
 * new one had been written, so the next load quietly served a stale card and
 * nothing anywhere said so. Published plans are not small — one live build
 * carries a 30,027-character STORY-000 prompt inside a 114 KB tree — so this is
 * a real budget, not a theoretical one.
 *
 * The honest behaviour on a failed write is to say so and let the next sync
 * refetch from the server, which is authoritative anyway. What we must never do
 * is drop the largest item to make the rest fit: a cache that silently discards
 * a student's most important task is worse than one that refuses.
 */
function write(list: StudentProject[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    logStoreFailure('projects_cache_write_failed', err);
    return false;
  }
}

// ── pub/sub ─────────────────────────────────────────────────────────────────
type ReadyEvent = { type: 'ready'; project: StudentProject };
type Listener = (ev?: ReadyEvent) => void;
const listeners = new Set<Listener>();
function notify(ev?: ReadyEvent) { listeners.forEach((fn) => fn(ev)); }

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── reads ────────────────────────────────────────────────────────────────────
export function loadProjects(): StudentProject[] { return read(); }
/**
 * Look a project up by its current id, falling back to any pseudo id it used to
 * carry. The fallback is what keeps a workspace URL a student bookmarked (or
 * still has open) working after the project adopts its server UUID.
 */
export function getProject(id: string): StudentProject | undefined {
  const list = read();
  return list.find((p) => p.id === id)
    ?? list.find((p) => p.legacyIds?.includes(id));
}

/**
 * The id this project is REALLY keyed by now — its server UUID once adopted.
 *
 * A route param can still carry a pseudo id long after the heal: a bookmark, a
 * tab left open, a link shared before the adoption. Resolving a route param
 * through here is what stops that id reaching `/api/portal/workspace/*`, where
 * a Zod `.uuid()` rejects it with a 400 that surfaces under whatever field the
 * student was touching. Unknown ids pass through unchanged.
 */
export function canonicalProjectId(routeId: string): string {
  if (!routeId) return routeId;
  return getProject(routeId)?.id ?? routeId;
}

/**
 * Replace the whole project list and re-render subscribers. Used by projectSync
 * after reconciling with the backend (completions overlaid / a build hydrated on
 * a fresh device). This is the store's only backend-authoritative write entry.
 */
export function hydrateProjects(list: StudentProject[]): void { write(list); notify(); }

/**
 * Record that a local placeholder is standing in for a specific backend project.
 *
 * Written to localStorage rather than held in React state on purpose: the
 * server build takes minutes, and a student who reloads or navigates away in
 * the meantime must still get their real plan folded into the placeholder
 * rather than added alongside it. A claim is a promise that survives a refresh.
 */
/**
 * Drop one project from THIS BROWSER's list.
 *
 * Two callers, one behaviour:
 *  - after a successful server archive, so the card goes at once instead of
 *    waiting for the next pull's prune (and so it cannot linger as a ghost);
 *  - for a browser-only build that never reached the server, where there is no
 *    server row to archive and localStorage is the only place it exists.
 *
 * The seeded training example is REFUSED. `read()` re-seeds it whenever it is
 * missing, so "removing" it would silently come back on the next load — a
 * control that appears to work and does not is worse than no control.
 */
export function removeProjectLocally(id: string): boolean {
  const list = read();
  const target = list.find((p) => p.id === id);
  if (!target || target.sample) return false;
  write(list.filter((p) => p.id !== id));
  notify();
  return true;
}

export function claimBackendProject(localId: string, backendProjectId: string): void {
  // A claim that is not a UUID cannot be adopted and must not be recorded: it
  // would only travel into a /workspace/:projectId route and 400 there.
  if (!isUuid(backendProjectId)) return;
  const list = read();
  const p = list.find((x) => x.id === localId) ?? list.find((x) => x.legacyIds?.includes(localId));
  if (!p) return;
  if (p.pipelineProjectId === backendProjectId && p.id === backendProjectId) return;
  p.pipelineProjectId = backendProjectId;
  // ADOPT THE SERVER ID, don't just remember it. Recording the claim in the
  // side-car field alone was the whole defect: the placeholder id stayed the
  // project's identity, went into the workspace route, and was rejected 400.
  const { list: adopted, remapped } = adoptServerIds(list);
  migrateIdKeyedStorage(remapped);
  write(adopted);
  notify();
}

// Fire-and-forget the task's status through to the backend (best-effort, flag-
// gated inside projectSync). Dynamic import keeps the store free of any static
// dependency on the network layer, so its pure helpers stay trivially testable.
// The demo/sample build is never persisted.
function emitTaskStatus(project: StudentProject, task: ProjectTask): void {
  if (project.sample) return;
  const key = task.storyId || task.id;
  void import('./projectSync').then((m) => m.pushTaskStatusByStory(key, task.state)).catch(() => { /* best-effort */ });
}

// ── React hook: re-render on any store change ────────────────────────────────
export function useProjectsList(): StudentProject[] {
  const [list, setList] = useState<StudentProject[]>(() => read());
  useEffect(() => subscribe(() => setList(read())), []);
  return list;
}

// ── progress helpers ─────────────────────────────────────────────────────────
export function projectProgress(p: StudentProject): { done: number; total: number; pct: number } {
  const total = p.lists.reduce((a, l) => a + l.tasks.length, 0);
  const done = p.lists.reduce((a, l) => a + l.tasks.filter((t) => t.state === 'done').length, 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
export function reqVerified(p: StudentProject): { v: number; total: number } {
  return { v: p.reqs.filter((r) => r.state === 'verified').length, total: p.reqs.length };
}
const DUE_RANK: Record<TaskDue, number> = { overdue: 0, today: 1, up: 2, done: 9 };

// ── dependency blocking (see-but-not-open) ────────────────────────────────────
// A task is BLOCKED while any storyId it lists in `blockedBy` maps to a task that
// is not yet DONE. A skipped prerequisite does NOT satisfy the dependency (only a
// `done` state clears it), so a story gated on a skipped predecessor stays locked.
// `waitingOn` = the prerequisite storyIds that are not yet done.
export function isTaskBlocked(
  p: StudentProject,
  task: ProjectTask,
): { blocked: boolean; waitingOn: string[] } {
  if (!task.blockedBy || task.blockedBy.length === 0) return { blocked: false, waitingOn: [] };
  // Index tasks by their storyId once for the lookup.
  const byStory = new Map<string, ProjectTask>();
  p.lists.forEach((l) => l.tasks.forEach((t) => { if (t.storyId) byStory.set(t.storyId, t); }));
  const waitingOn = task.blockedBy.filter((sid) => {
    const dep = byStory.get(sid);
    // Unknown prerequisite (defensive) or a prerequisite not yet done → still waiting.
    return !dep || dep.state !== 'done';
  });
  return { blocked: waitingOn.length > 0, waitingOn };
}

// The hero "your next action" — first NON-blocked, non-done, non-skipped task.
export function nextTask(p: StudentProject): { task: ProjectTask; list: ProjectList } | null {
  const open: { task: ProjectTask; list: ProjectList }[] = [];
  p.lists.forEach((l) => l.tasks.forEach((t) => {
    if (t.state === 'todo' && !isTaskBlocked(p, t).blocked) open.push({ task: t, list: l });
  }));
  if (!open.length) return null;
  open.sort((a, b) => DUE_RANK[a.task.due] - DUE_RANK[b.task.due]);
  return open[0];
}

// ── mutations ────────────────────────────────────────────────────────────────
export function markTaskDone(projectId: string, taskId: string): void {
  const list = read();
  const p = list.find((x) => x.id === projectId);
  if (!p) return;
  let changed: ProjectTask | undefined;
  for (const l of p.lists) {
    const t = l.tasks.find((x) => x.id === taskId);
    if (t && t.state !== 'done') {
      t.state = 'done'; t.due = 'done';
      // advance a linked requirement one step toward verified
      if (t.req) {
        const req = p.reqs.find((r) => r.id === t.req);
        if (req) {
          const order: ReqState[] = ['unmapped', 'planned', 'built', 'verified'];
          const i = order.indexOf(req.state);
          if (i > -1 && i < 3) req.state = order[i + 1];
        }
      }
      p.activity.unshift({ id: 'a' + Date.now(), kind: 'done', who: 'You', time: 'just now',
        title: `Completed: ${t.title}`, body: 'Marked done in your build workspace.' });
      changed = t;
      break;
    }
  }
  write(list); notify();
  if (changed) emitTaskStatus(p, changed);
}

/**
 * Mirror a completion the PLATFORM already granted into the local board.
 *
 * Identical bookkeeping to `markTaskDone` with one deliberate omission: it does
 * NOT emit a status push. The completion originated on the server — the
 * verification loop set `status = 'complete'` and stamped `verified_at` after
 * reading the repo — so pushing `complete` back would be telling the server
 * something it just told us, and `CLIENT_SETTABLE_STATUSES` answers that with a
 * 409 by design. Before this existed the workspace's only "done" path fired
 * exactly that rejected request and logged a sync failure on every verified
 * story.
 *
 * Safe to call twice: a task already `done` is left alone.
 */
export function mirrorVerifiedCompletion(projectId: string, taskId: string): void {
  const list = read();
  const p = list.find((x) => x.id === projectId);
  if (!p) return;
  for (const l of p.lists) {
    const t = l.tasks.find((x) => x.id === taskId);
    if (t && t.state !== 'done') {
      t.state = 'done'; t.due = 'done';
      if (t.req) {
        const req = p.reqs.find((r) => r.id === t.req);
        if (req) {
          const order: ReqState[] = ['unmapped', 'planned', 'built', 'verified'];
          const i = order.indexOf(req.state);
          if (i > -1 && i < 3) req.state = order[i + 1];
        }
      }
      p.activity.unshift({ id: 'a' + Date.now(), kind: 'done', who: 'You', time: 'just now',
        title: `Verified: ${t.title}`, body: 'Confirmed from your repo by the build pipeline.' });
      break;
    }
  }
  write(list); notify();
}

export function skipTask(projectId: string, taskId: string): void {
  const list = read();
  const p = list.find((x) => x.id === projectId);
  if (!p) return;
  let changed: ProjectTask | undefined;
  for (const l of p.lists) {
    const t = l.tasks.find((x) => x.id === taskId);
    if (t && t.state === 'todo') { t.state = 'skipped'; changed = t; break; }
  }
  write(list); notify();
  if (changed) emitTaskStatus(p, changed);
}

// ── background creation ──────────────────────────────────────────────────────
const PRESETS: { accent: string; cover: string; icon: string }[] = [
  { accent: '#FB2832', cover: 'linear-gradient(120deg,#FB2832 0%,#C20E1E 60%,#367895 130%)', icon: 'M4 7h16v12H4zM4 7l3-3h6l3 3' },
  { accent: '#367895', cover: 'linear-gradient(120deg,#367895 0%,#2E6A86 55%,#5BA63C 130%)', icon: 'M5 4h11l4 4v12H5zM8 11h8M8 15h6' },
  { accent: '#5BA63C', cover: 'linear-gradient(120deg,#5BA63C 0%,#3C7A26 55%,#367895 130%)', icon: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' },
  { accent: '#E8920C', cover: 'linear-gradient(120deg,#E8920C 0%,#B5710A 55%,#FB2832 130%)', icon: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4' },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'new-build';
}
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function deriveName(answers: NewBuildAnswers): string {
  if (answers.name && answers.name.trim()) return answers.name.trim();
  const words = answers.idea.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3);
  return words.length ? titleCase(words.join(' ')) : 'Your AI Build';
}

// Deterministic skeleton generator — turns questionnaire answers into a
// Basecamp-shaped project (reqs + lists + tasks) plus an AI-tool preview.
function generateSkeleton(id: string, answers: NewBuildAnswers): Omit<StudentProject, 'id' | 'status' | 'createdAt'> {
  const name = deriveName(answers);
  const preset = PRESETS[Math.abs(hash(answers.idea)) % PRESETS.length];
  const sources = (answers.dataSources || 'your data source')
    .split(/[,;/]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const primary = sources[0] || 'data';
  const sizeLabel = answers.size === 'workflow' ? 'a focused workflow' : answers.size === 'autonomous' ? 'a fully autonomous system' : 'a full project';

  const reqs: ProjectReq[] = [
    { id: 'R1', name: `Core action via Claude ${answers.size === 'workflow' ? 'workflow' : 'agent'}`, kind: 'FUNC', state: 'planned' },
    { id: 'R2', name: `${titleCase(primary)} data source (read-only)`, kind: 'FUNC', state: 'planned' },
    { id: 'R3', name: 'Result shaping + substitutions', kind: 'FUNC', state: 'unmapped' },
    { id: 'R4', name: answers.done ? `Guardrail: ${answers.done}` : 'Human approval before any side effect', kind: 'SAFE', state: 'unmapped' },
    { id: 'R5', name: 'Retry + timeout on the upstream call', kind: 'REL', state: 'unmapped' },
  ];

  const t = (n: number, o: Partial<ProjectTask> & { title: string }): ProjectTask =>
    ({ id: `${id}-t${n}`, state: 'todo', due: 'up', ...o });

  const lists: ProjectList[] = [
    { id: `${id}-L1`, step: 2, name: 'Project DNA & Requirements', sub: 'Your generated requirements, tracked as tasks', tasks: [
      t(1, { title: 'Lock the core requirements with acceptance criteria', req: 'R1', due: 'today',
        what: 'Confirm each requirement has a check a reviewer can verify from the repo.',
        prompt: `Review the requirements for "${name}". For each, write a one-line acceptance check verifiable from the repo (not narration). Output as a markdown checklist.` }),
      t(2, { title: 'Map the safety guardrail (currently UNMAPPED)', req: 'R4', due: 'overdue',
        what: 'This safety requirement has no producing task yet. Define what "safe" means and which check enforces it.',
        prompt: `Design a guardrail for "${name}" so it never produces an unsafe result. Write the validation function, its tests, and the acceptance criterion that moves R4 from UNMAPPED to PLANNED.` }),
    ] },
    { id: `${id}-L2`, step: 4, name: 'Core build', sub: `Build the ${sizeLabel}`, tasks: [
      t(3, { title: `Scaffold the ${answers.size === 'workflow' ? 'workflow' : 'MCP server'} over stdio`, req: 'R2', due: 'today',
        prompt: `Scaffold "${name}" using the official SDK. One read-only resource from ${primary} and one tool stub. Run it and show the Claude Code config block to register it locally.` }),
      t(4, { title: `Implement the ${primary} read tool`, req: 'R2',
        what: `Read from ${primary} and return structured results to Claude. Flips R2 toward VERIFIED.`,
        prompt: `Implement the tool that reads ${primary} and returns matching results as structured JSON. Add the schema, a happy-path test, and a malformed-input test.` }),
      t(5, { title: 'Implement the core action against a real source', req: 'R3',
        prompt: `Implement the main action for "${name}" backed by a real ${primary} source. Return up to 3 results with graceful fallback. Include tests.` }),
      t(6, { title: 'Connect the live preview at the build URL', req: 'R2',
        what: 'Push so the preview deploys.',
        prompt: `Add a thin HTTP wrapper so "${name}" renders at ${slugify(name)}.preview.colaberry.ai. Confirm input and output render.` }),
    ] },
    { id: `${id}-L3`, step: 6, name: 'Reliability & polish', sub: 'Make it survive failure', tasks: [
      t(7, { title: 'Add retry + timeout to the upstream call', req: 'R5',
        what: 'External calls need a bounded timeout and capped retries before grading.',
        prompt: `Wrap the upstream call in "${name}" with a 10s timeout and 3 capped retries with backoff. Add a circuit breaker after 5 errors in a window. Write the failure-path test.` }),
      t(8, { title: 'Handle the empty and no-match cases gracefully', req: 'R3',
        prompt: `Handle empty-input and zero-result cases in "${name}" with a friendly fallback and a logged warn event. Add boundary tests.` }),
    ] },
    { id: `${id}-L4`, step: 8, name: 'Showcase & portfolio', sub: 'Prove it at the Architect Expo', tasks: [
      t(9, { title: 'Record a 2-minute demo screencast',
        prompt: `Write a 90-second demo script for "${name}": open with the problem, show the tool being called, end on the guardrail blocking an unsafe result.` }),
      t(10, { title: 'Write the one-pager for reviewers',
        prompt: `Draft a one-page architecture summary for "${name}": problem, the tools, the guardrail, and the reliability measures.` }),
    ] },
  ];

  const preview: ToolPreview = {
    toolName: name,
    summary: `A Claude-powered ${sizeLabel} that turns ${answers.users ? answers.users + "'s" : 'your'} request into a real result, grounded in ${primary}.`,
    tools: [`get_${slugify(primary).replace(/-/g, '_')}`, 'run_action', 'validate_result'],
    dataSources: sources,
    guardrails: [answers.done ? answers.done : 'Human approval before any side effect', 'Input validation on every call', 'Timeout + capped retries upstream'],
  };

  return {
    name, slug: slugify(name),
    descriptor: `${answers.idea.trim().slice(0, 140)}${answers.idea.length > 140 ? '…' : ''}`,
    accent: preset.accent, cover: preset.cover, icon: preset.icon,
    stage: 'Step 2 of 9 · Requirements', curStep: 2, size: answers.size, idea: answers.idea,
    reqs, lists, preview,
    activity: [
      { id: 'a0', kind: 'note', who: 'Cory', time: 'just now', title: `Requirements generated for ${name}`,
        body: `Shaped ${sizeLabel} from your idea and answers into ${reqs.length} requirements and ${lists.reduce((a, l) => a + l.tasks.length, 0)} tasks.` },
    ],
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}

export function createProjectFromAnswers(answers: NewBuildAnswers): string {
  const id = 'p' + Date.now();
  const skeleton = generateSkeleton(id, answers);
  // In `creating` state, expose the name + preview immediately but hold the lists
  // empty so the workspace shows an assembling state.
  const creating: StudentProject = {
    id, status: 'creating', createdAt: Date.now(),
    // Honest from the moment it exists. This is the browser's template, and it
    // stays labelled as such until the server's plan supersedes it.
    origin: 'local',
    pipelineProjectId: null,
    ...skeleton,
    lists: [],
    activity: [{ id: 'a-init', kind: 'note', who: 'Cory', time: 'now', title: `Building ${skeleton.name}…`, body: 'Generating your requirements, lists, and tasks in the background.' }],
  };
  const list = read();
  list.unshift(creating);
  write(list);
  notify();

  // Assemble in the background so the student can keep moving.
  window.setTimeout(() => {
    const current = read();
    // Resolved by pseudo id OR by `legacyIds`, because `claimBackendProject`
    // re-keys this very project to its server UUID the moment GET /active
    // answers — normally in well under 7s, so adoption usually wins the race.
    // A raw `x.id === id` lookup therefore found NOTHING in the common case and
    // returned early, stranding the card at `creating` with empty lists
    // forever. Measured 2026-08-18 in production; see creatingCardState.test.ts.
    const p = current.find((x) => x.id === id)
      ?? current.find((x) => x.legacyIds?.includes(id));
    if (!p) return;
    p.status = 'ready';
    p.lists = skeleton.lists;
    p.reqs = skeleton.reqs;
    p.activity = skeleton.activity;
    write(current);
    notify({ type: 'ready', project: p });
  }, 7000);

  return id;
}

// ── seeded training example, mapped from a real Basecamp story-driven build ──
// One-time seed from Basecamp todolist 10039836054 ("[STORY-DRIVEN] Hair Salon
// Booking & Payments"): releases -> lists, stories -> tasks, "Vibe-code it" ->
// the Claude Code prompt, the Story -> the task's "what", Fulfills -> the linked
// requirement, Gherkin acceptance -> the task detail. Basecamp is ONLY the source
// for this example — nothing in the app calls Basecamp at runtime.
type SalonStory = {
  release: string; releaseLabel: string; storyId: string; title: string;
  story: string; reqs: string[]; owner: string; prompt: string;
  completed: boolean; acceptance: string[];
};
const PHASE: Record<string, string> = {
  r0: 'Walking skeleton', r1: 'Payments', r2: 'Scheduling & UX',
  r3: 'Reminders & resilience', r4: 'Personalization', r5: 'Trust & governance',
};

// A scissors path (open shears) — matches the Hair Salon training example so its
// themed header watermark reads as a salon at a glance. Single SVG path `d`.
const SALON_SCISSORS_ICON =
  'M6 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 13a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 10l12 8M8 14l12-8M11 10.8l3.5 2.3';

// The "key story" of each release — the last story in that release (walking-skeleton
// order). Every story in release R(n) is blockedBy this key story of R(n-1), so later
// releases are gated on earlier ones. Computed from the release ordering below.
function keyStoryIdByRelease(
  releases: string[],
  stories: SalonStory[],
): Record<string, string> {
  const key: Record<string, string> = {};
  releases.forEach((rel) => {
    const rs = stories.filter((s) => s.release === rel);
    if (rs.length) key[rel] = rs[rs.length - 1].storyId; // last story = the release's key gate
  });
  return key;
}
function buildSalonProject(): StudentProject {
  const id = 'sample-salon';
  const stories = (salonData.stories as unknown as SalonStory[]).filter((s) => s.storyId);
  const releases: string[] = [];
  stories.forEach((s) => { if (!releases.includes(s.release)) releases.push(s.release); });
  releases.sort();
  // Walking-skeleton-first dependency gating: each story in release R(n) is blocked
  // by the key (last) story of release R(n-1), so opening the build shows early tasks
  // actionable and every later release visibly LOCKED until its predecessor lands.
  const keyByRelease = keyStoryIdByRelease(releases, stories);
  let first = true;
  const lists: ProjectList[] = releases.map((rel, ri) => {
    const rs = stories.filter((s) => s.release === rel);
    const weeks = rs[0]?.releaseLabel.match(/\(([^)]+)\)/)?.[1] || '';
    const prevRel = ri > 0 ? releases[ri - 1] : null;
    const gateStoryId = prevRel ? keyByRelease[prevRel] : undefined; // the key story of the prior release
    return {
      id: `${id}-${rel}`, step: 2 + ri,
      name: `Release ${rel.slice(1)} · ${PHASE[rel] || 'Stories'}`,
      sub: `${weeks ? weeks + ' · ' : ''}${rs.length} vertical-slice stor${rs.length === 1 ? 'y' : 'ies'}`,
      tasks: rs.map((s) => {
        const due: TaskDue = first ? 'today' : 'up'; first = false;
        // Gate on the previous release's key story (r0 stories are ungated).
        const blockedBy = gateStoryId ? [gateStoryId] : undefined;
        return {
          id: `${id}-${s.storyId}`, title: `${s.storyId} · ${s.title}`,
          what: s.story, prompt: s.prompt, req: s.reqs[0],
          acceptance: s.acceptance, owner: s.owner.replace(/\s*·.*$/, ''), release: s.releaseLabel, storyId: s.storyId,
          blockedBy,
          state: (s.completed ? 'done' : 'todo') as TaskState, due,
        };
      }),
    };
  });
  const reqs: ProjectReq[] = (salonData.reqs as string[]).map((rid) => {
    const citing = stories.find((s) => s.reqs.includes(rid));
    const gov = citing ? /govern|audit|approval|trust/i.test(citing.owner + citing.title) : false;
    return { id: rid, name: citing ? citing.title : rid, kind: gov ? 'SAFE' : 'FUNC', state: 'planned' as ReqState };
  });
  return {
    id, name: salonData.name, slug: 'hair-salon-booking-payments', sample: true,
    descriptor: salonData.descriptor, accent: '#367895',
    cover: 'linear-gradient(120deg,#367895 0%,#2E6A86 55%,#5BA63C 130%)',
    // Scissors icon so the themed watermark literally matches a hair salon.
    icon: SALON_SCISSORS_ICON,
    status: 'ready', createdAt: 0, stage: 'Release r0 · Walking skeleton (wk3)', curStep: 3, size: 'autonomous',
    idea: salonData.descriptor, reqs, lists,
    preview: {
      toolName: salonData.name,
      summary: 'A story-driven multi-agent build: books appointments, takes deposits, sends reminders, and holds risky actions for human approval — on an audit-logged trust spine.',
      tools: ['Booking Agent', 'Payment Agent', 'Reminder Agent', 'Front-Desk Coordinator', 'Personalization Agent', 'Trust/Governance Agent'],
      dataSources: ['Cal.com', 'Supabase', 'Stripe', 'Twilio', 'SendGrid', 'Make.com', 'Retool'],
      guardrails: ['Approval gate: overbookings, refunds, auto-cancels', 'Append-only audit log (trust spine)', 'Governance score with threshold alerts'],
    },
    activity: [
      { id: 'A1', kind: 'note', who: 'Cory', time: 'at kickoff', title: 'Decomposed into 18 vertical-slice stories across 6 releases', body: 'Walking-skeleton-first: r0 proves the trust spine (audit + approval) before features stack on top.' },
      { id: 'A2', kind: 'req', who: 'Build system', time: 'gate', title: 'Requirements gate: 8/8 must-haves covered → PASS', body: 'Every requirement traces to at least one story (see the traceability matrix in Docs & Files).' },
    ],
  };
}
