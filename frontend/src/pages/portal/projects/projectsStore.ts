import { useEffect, useState } from 'react';
import salonData from './salonData.json';

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
  state: TaskState;
  due: TaskDue;
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
  reqs: ProjectReq[];
  lists: ProjectList[];
  activity: ProjectActivity[];
  preview: ToolPreview;
};

export type NewBuildAnswers = {
  name?: string;
  idea: string;
  size: BuildSize;
  users?: string;
  dataSources?: string;
  done?: string;
  weeks: number;
};

// ── persistence ────────────────────────────────────────────────────────────
const KEY = 'te_projects_v1';

function read(): StudentProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as StudentProject[];
      // migrate: ensure the current training seed exists (drops any retired
      // sample seed like the old Recipe Concierge) while keeping user builds.
      if (!list.some((p) => p.id === 'sample-salon')) {
        const migrated = [buildSalonProject(), ...list.filter((p) => !p.sample)];
        write(migrated);
        return migrated;
      }
      return list;
    }
  } catch { /* ignore */ }
  const seeded = [buildSalonProject()];
  write(seeded);
  return seeded;
}

function write(list: StudentProject[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
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
export function getProject(id: string): StudentProject | undefined {
  return read().find((p) => p.id === id);
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
export function nextTask(p: StudentProject): { task: ProjectTask; list: ProjectList } | null {
  const open: { task: ProjectTask; list: ProjectList }[] = [];
  p.lists.forEach((l) => l.tasks.forEach((t) => { if (t.state === 'todo') open.push({ task: t, list: l }); }));
  if (!open.length) return null;
  open.sort((a, b) => DUE_RANK[a.task.due] - DUE_RANK[b.task.due]);
  return open[0];
}

// ── mutations ────────────────────────────────────────────────────────────────
export function markTaskDone(projectId: string, taskId: string): void {
  const list = read();
  const p = list.find((x) => x.id === projectId);
  if (!p) return;
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
      break;
    }
  }
  write(list); notify();
}

export function skipTask(projectId: string, taskId: string): void {
  const list = read();
  const p = list.find((x) => x.id === projectId);
  if (!p) return;
  for (const l of p.lists) {
    const t = l.tasks.find((x) => x.id === taskId);
    if (t && t.state === 'todo') { t.state = 'skipped'; break; }
  }
  write(list); notify();
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
    const p = current.find((x) => x.id === id);
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
function buildSalonProject(): StudentProject {
  const id = 'sample-salon';
  const stories = (salonData.stories as unknown as SalonStory[]).filter((s) => s.storyId);
  const releases: string[] = [];
  stories.forEach((s) => { if (!releases.includes(s.release)) releases.push(s.release); });
  releases.sort();
  let first = true;
  const lists: ProjectList[] = releases.map((rel, ri) => {
    const rs = stories.filter((s) => s.release === rel);
    const weeks = rs[0]?.releaseLabel.match(/\(([^)]+)\)/)?.[1] || '';
    return {
      id: `${id}-${rel}`, step: 2 + ri,
      name: `Release ${rel.slice(1)} · ${PHASE[rel] || 'Stories'}`,
      sub: `${weeks ? weeks + ' · ' : ''}${rs.length} vertical-slice stor${rs.length === 1 ? 'y' : 'ies'}`,
      tasks: rs.map((s) => {
        const due: TaskDue = first ? 'today' : 'up'; first = false;
        return {
          id: `${id}-${s.storyId}`, title: `${s.storyId} · ${s.title}`,
          what: s.story, prompt: s.prompt, req: s.reqs[0],
          acceptance: s.acceptance, owner: s.owner.replace(/\s*·.*$/, ''), release: s.releaseLabel, storyId: s.storyId,
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
    icon: 'M3 5h18v16H3zM3 9h18M8 3v4M16 3v4',
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
