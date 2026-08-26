/**
 * THE SERVER IS AUTHORITATIVE FOR WHAT EXISTS.
 *
 * MEASURED 2026-08-15, ali@colaberry.com, enrollment aced5b39. The server held
 * exactly two projects — one active published build with 19 tasks (STORY-000 at
 * position 0) and the platform record. The browser showed FIVE: a starter
 * template, a second local idea, two builds that had been deleted server-side
 * hours earlier, and the seeded training example. The real published build did
 * not appear at all, and a hard refresh did not fix it.
 *
 * Two independent defects produced that:
 *
 *   1. IDENTITY. reconcileProjects matched the tree to a local project by task
 *      keys, which are story ids, which every plan numbers STORY-000 upward.
 *      The containment test ("every backend key is present locally") is true
 *      whenever the NEW plan is shorter than an OLD local one — so the 19-task
 *      published plan was swallowed by a longer stale project and never
 *      surfaced. Fixed by matching on the backend project id.
 *
 *   2. EXISTENCE. Nothing ever removed a local project. /active describes the
 *      current build and says nothing about projects that no longer exist, so a
 *      deleted build stayed in localStorage forever. Fixed by reconciling
 *      against GET /api/portal/projects.
 *
 * These tests are the contract for the fix. The deletion rules in particular are
 * written to fail LOUDLY if anyone loosens them: getting them wrong deletes a
 * student's work, which is strictly worse than the bug being fixed.
 */
import {
  reconcileProjects, pruneDeadProjects, orderProjects, backendIdOf,
  UNKNOWN_INVENTORY,
  type BackendProjectTree, type BackendTaskNode, type ServerInventory,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

// ── fixtures ─────────────────────────────────────────────────────────────────
const ACTIVE_UUID = '40a5cea6-1111-4222-8333-444455556666';   // the live build
const DEAD_UUID = 'c1e0d0aa-2222-4333-8444-555566667777';     // deleted server-side
const OTHER_DEAD_UUID = '5m0c3ry0-3333-4444-8555-666677778888'.replace(/m|c|r|y/g, '1');

const localTask = (id: string, storyId?: string, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id, title: id, storyId, state, due: state === 'done' ? 'done' : 'up' });

const project = (
  id: string, tasks: ProjectTask[], over: Partial<StudentProject> = {},
): StudentProject => ({
  id, name: id, slug: id, descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '', sample: false,
  reqs: [], lists: [{ id: `${id}-L1`, step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: id, summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

const bTask = (story_id: string, status = 'not_started'): BackendTaskNode =>
  ({ id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
     status, position: 0, owner_agent: null, release_key: null, acceptance: null, build: null,
     blocked_by: [] });

/** Story ids the way the pipeline really numbers them: STORY-000 then upward. */
const stories = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `STORY-${String(i).padStart(3, '0')}`);

/** The live published build: 19 tasks, STORY-000 first. */
const publishedTree = (id = ACTIVE_UUID): BackendProjectTree => ({
  id, name: 'The Live Build', organization_name: null,
  lists: [{ id: 'l1', title: 'Release 0', position: 0, tasks: stories(19).map((s) => bTask(s)) }],
});

const inventory = (ids: string[], activeId: string | null = ACTIVE_UUID): ServerInventory =>
  ({ known: true, ids, hydratableIds: ids, activeId });

// The seeded training example. Deliberately local; the server never holds it.
const demo = () => project('sample-salon', [localTask('s1', 'STORY-001')], { sample: true });

// The browser's fallback: `p<epoch>` id, origin local, never reached the server.
const starterTemplate = () => project(
  'p1786000000000', [localTask('p1786000000000-t1'), localTask('p1786000000000-t2')],
  { name: 'The AI That', origin: 'local', pipelineProjectId: null },
);

// ── the reported bug, end to end ─────────────────────────────────────────────
describe('the browser showing dead projects and hiding the live one', () => {
  /**
   * The exact production shape: a stale project that is LONGER than the new
   * published plan, so every one of the new plan's story ids is already present
   * locally. This is the case the old containment test got wrong.
   */
  const staleLongerPlan = () => project(
    DEAD_UUID, stories(24).map((s) => localTask(`t-${s}`, s)),
    { name: 'Client Onboarding Concierge', origin: 'pipeline', pipelineProjectId: DEAD_UUID },
  );

  const localList = () => [starterTemplate(), staleLongerPlan(), demo()];

  it('hydrates the live build even though the stale plan contains every one of its story ids', () => {
    const r = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));

    expect(r.mode).toBe('hydrate');
    expect(r.next.some((p) => p.id === ACTIVE_UUID)).toBe(true);
  });

  it('leads with the live build, because that is what the page renders as primary', () => {
    const r = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));
    expect(r.next[0].id).toBe(ACTIVE_UUID);
  });

  it('removes the project the server no longer has', () => {
    const r = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));

    expect(r.next.some((p) => p.id === DEAD_UUID)).toBe(false);
    expect(r.removed!.map((p) => p.name)).toEqual(['Client Onboarding Concierge']);
  });

  it('keeps the purely-local starter template — a student may have notes on it', () => {
    const r = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));
    expect(r.next.some((p) => p.name === 'The AI That')).toBe(true);
  });

  it('keeps the seeded training example', () => {
    const r = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));
    expect(r.next.some((p) => p.sample)).toBe(true);
  });

  it('never lets a local-only build outrank the real published one', () => {
    const r = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));
    const ids = r.next.map((p) => p.id);
    expect(ids.indexOf(ACTIVE_UUID)).toBeLessThan(ids.indexOf('p1786000000000'));
  });

  it('settles: a second identical pass changes nothing', () => {
    const once = reconcileProjects(localList(), publishedTree(), inventory([ACTIVE_UUID]));
    const twice = reconcileProjects(once.next, publishedTree(), inventory([ACTIVE_UUID]));

    expect(twice.changed).toBe(false);
    expect(twice.next).toBe(once.next);
  });

  it('does not mutate the caller\'s list', () => {
    const list = localList();
    reconcileProjects(list, publishedTree(), inventory([ACTIVE_UUID]));
    expect(list).toHaveLength(3);
    expect(list[1].id).toBe(DEAD_UUID);
  });
});

// ── identity: story ids are not identity, in EITHER direction ────────────────
describe('story-id collision does not make two projects the same project', () => {
  it('a SHORTER new plan is not swallowed by a longer local one (the production bug)', () => {
    const longerLocal = project(DEAD_UUID, stories(24).map((s) => localTask(`t-${s}`, s)),
      { origin: 'pipeline', pipelineProjectId: DEAD_UUID });

    const r = reconcileProjects([longerLocal], publishedTree(), inventory([ACTIVE_UUID, DEAD_UUID]));

    expect(r.mode).toBe('hydrate');
    expect(r.next.some((p) => p.id === ACTIVE_UUID)).toBe(true);
    // and the older one is untouched, not rewritten
    expect(r.next.find((p) => p.id === DEAD_UUID)!.lists[0].tasks).toHaveLength(24);
  });

  it('a LONGER new plan is not swallowed by a shorter local one (the earlier bug, still fixed)', () => {
    const shorterLocal = project('p1700000000000', stories(3).map((s) => localTask(`t-${s}`, s)),
      { origin: 'local' });

    const r = reconcileProjects([shorterLocal], publishedTree(), inventory([ACTIVE_UUID]));

    expect(r.mode).toBe('hydrate');
    expect(r.next[0].id).toBe(ACTIVE_UUID);
  });

  it('still overlays onto a mirrored project whose keys match EXACTLY (legacy bridge)', () => {
    // Same 19 keys, no backend id recorded — a project mirrored up before the
    // client started recording the id the import returned.
    const mirrored = project('p1700000000001', stories(19).map((s) => localTask(`t-${s}`, s)),
      { origin: 'local' });
    const treeWithDone: BackendProjectTree = {
      ...publishedTree(),
      lists: [{ id: 'l1', title: 'Release 0', position: 0,
        tasks: stories(19).map((s, i) => bTask(s, i === 0 ? 'complete' : 'not_started')) }],
    };

    const r = reconcileProjects([mirrored], treeWithDone, inventory([ACTIVE_UUID]));

    expect(r.mode).toBe('overlay');
    expect(r.next).toHaveLength(1);   // NOT duplicated into two cards
    expect(r.next[0].lists[0].tasks.find((t) => t.storyId === 'STORY-000')!.state).toBe('done');
  });

  it('does not use the key-set bridge on a project that already has a backend id', () => {
    // Identical keys, but it is a DIFFERENT server project. Ids win.
    const other = project(DEAD_UUID, stories(19).map((s) => localTask(`t-${s}`, s)),
      { origin: 'pipeline', pipelineProjectId: DEAD_UUID });

    const r = reconcileProjects([other], publishedTree(), inventory([ACTIVE_UUID, DEAD_UUID]));

    expect(r.mode).toBe('hydrate');
    expect(r.next).toHaveLength(2);
  });
});

// ── pruneDeadProjects: the enumerated cases ──────────────────────────────────
describe('pruneDeadProjects', () => {
  const dead = () => project(DEAD_UUID, [localTask('t1', 'STORY-001')],
    { origin: 'pipeline', pipelineProjectId: DEAD_UUID });
  const live = () => project(ACTIVE_UUID, [localTask('t1', 'STORY-001')],
    { origin: 'pipeline', pipelineProjectId: ACTIVE_UUID });

  it('case 1 — removes NOTHING when the inventory is not known', () => {
    const list = [dead(), starterTemplate(), demo()];
    const r = pruneDeadProjects(list, UNKNOWN_INVENTORY, true);

    expect(r.next).toBe(list);
    expect(r.removed).toEqual([]);
  });

  it('case 2 — removes NOTHING when the server reports no projects and no active tree', () => {
    // "You have nothing at all" is what a wrong enrollment or a half-broken
    // response looks like, and it is the one shape that would wipe everything.
    const list = [dead(), live(), starterTemplate()];
    const r = pruneDeadProjects(list, inventory([], null), false);

    expect(r.next).toBe(list);
    expect(r.removed).toEqual([]);
  });

  it('case 2 — but DOES prune on an empty inventory when an active tree proves the server answered', () => {
    const r = pruneDeadProjects([dead()], inventory([], null), true);
    expect(r.removed).toHaveLength(1);
  });

  it('case 3 — never removes the seeded demo, even though the server has no such project', () => {
    const r = pruneDeadProjects([demo()], inventory([ACTIVE_UUID]), true);

    expect(r.next).toHaveLength(1);
    expect(r.removed).toEqual([]);
  });

  it('case 4 — never removes a purely-local project that never reached the server', () => {
    const r = pruneDeadProjects([starterTemplate()], inventory([ACTIVE_UUID]), true);

    expect(r.next).toHaveLength(1);
    expect(r.removed).toEqual([]);
  });

  it('case 4 — a legacy project with no origin field is treated as unknown, not as dead', () => {
    const legacy = project('p1600000000000', [localTask('t1')]);   // no origin, no claim
    const r = pruneDeadProjects([legacy], inventory([ACTIVE_UUID]), true);

    expect(r.removed).toEqual([]);
  });

  it('case 5 — keeps a project the server still has', () => {
    const r = pruneDeadProjects([live()], inventory([ACTIVE_UUID]), true);
    expect(r.removed).toEqual([]);
  });

  it('case 6 — removes a project whose server row is gone', () => {
    const r = pruneDeadProjects([live(), dead()], inventory([ACTIVE_UUID]), true);

    expect(r.next.map((p) => p.id)).toEqual([ACTIVE_UUID]);
    expect(r.removed.map((p) => p.id)).toEqual([DEAD_UUID]);
  });

  it('case 6 — removes a hydrated project identified only by its UUID id', () => {
    // No origin, no claim: it predates both fields. Its id is a UUID, which the
    // browser never mints, so it can only have come from the server.
    const hydratedLegacy = project(OTHER_DEAD_UUID, [localTask('t1', 'STORY-001')]);
    const r = pruneDeadProjects([hydratedLegacy], inventory([ACTIVE_UUID]), true);

    expect(r.removed.map((p) => p.id)).toEqual([OTHER_DEAD_UUID]);
  });

  it('is idempotent', () => {
    const once = pruneDeadProjects([live(), dead()], inventory([ACTIVE_UUID]), true);
    const twice = pruneDeadProjects(once.next, inventory([ACTIVE_UUID]), true);

    expect(twice.removed).toEqual([]);
    expect(twice.next).toBe(once.next);
  });
});

// ── backendIdOf ──────────────────────────────────────────────────────────────
describe('backendIdOf', () => {
  it('prefers an explicit claim', () => {
    expect(backendIdOf(project('p123', [], { pipelineProjectId: ACTIVE_UUID }))).toBe(ACTIVE_UUID);
  });
  it('falls back to a UUID id, which only the server mints', () => {
    expect(backendIdOf(project(ACTIVE_UUID, []))).toBe(ACTIVE_UUID);
  });
  it('is null for a browser-minted `p<epoch>` id', () => {
    expect(backendIdOf(project('p1786000000000', []))).toBeNull();
  });
  it('is null for the demo, whatever its id', () => {
    expect(backendIdOf(project(ACTIVE_UUID, [], { sample: true }))).toBeNull();
  });
});

// ── orderProjects ────────────────────────────────────────────────────────────
describe('orderProjects', () => {
  const activeP = () => project(ACTIVE_UUID, [], { origin: 'pipeline', pipelineProjectId: ACTIVE_UUID });
  const otherServer = () => project(DEAD_UUID, [], { origin: 'pipeline', pipelineProjectId: DEAD_UUID });

  it('puts the active server project first and the demo last', () => {
    const ordered = orderProjects([demo(), starterTemplate(), otherServer(), activeP()], ACTIVE_UUID);
    expect(ordered.map((p) => p.id)).toEqual([ACTIVE_UUID, DEAD_UUID, 'p1786000000000', 'sample-salon']);
  });

  it('ranks a real server build above a purely-local one', () => {
    const ordered = orderProjects([starterTemplate(), otherServer()], null);
    expect(ordered.map((p) => p.id)).toEqual([DEAD_UUID, 'p1786000000000']);
  });

  it('is stable within a rank, so nothing shuffles under the student', () => {
    const a = project('p1', [], { origin: 'local' });
    const b = project('p2', [], { origin: 'local' });
    expect(orderProjects([a, b], null).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(orderProjects([b, a], null).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('is idempotent', () => {
    const list = [demo(), starterTemplate(), activeP()];
    const once = orderProjects(list, ACTIVE_UUID);
    expect(orderProjects(once, ACTIVE_UUID).map((p) => p.id)).toEqual(once.map((p) => p.id));
  });
});

// ── the no-tree paths still behave ───────────────────────────────────────────
describe('with no active tree', () => {
  it('still prunes a project the server has deleted', () => {
    const deadOnly = project(DEAD_UUID, [localTask('t1', 'STORY-001')],
      { origin: 'pipeline', pipelineProjectId: DEAD_UUID });

    const r = reconcileProjects([deadOnly, demo()], null, inventory([ACTIVE_UUID], null));

    expect(r.mode).toBe('prune');
    expect(r.changed).toBe(true);
    expect(r.next.map((p) => p.id)).toEqual(['sample-salon']);
  });

  it('is a no-op when there is nothing to learn', () => {
    const list = [starterTemplate(), demo()];
    const r = reconcileProjects(list, null, UNKNOWN_INVENTORY);

    expect(r.mode).toBe('noop');
    expect(r.changed).toBe(false);
    expect(r.next).toBe(list);
  });
});
