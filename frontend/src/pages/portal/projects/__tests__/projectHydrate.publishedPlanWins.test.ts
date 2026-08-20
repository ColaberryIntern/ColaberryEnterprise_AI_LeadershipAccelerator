/**
 * A PUBLISHED SERVER PLAN MUST NEVER RENDER AS THE STARTER TEMPLATE.
 *
 * This is the display half of the incident where students were generated a
 * correct, gate-clean plan and shown the browser's generic template instead.
 *
 * WHY THE EXISTING supersede TEST DID NOT CATCH IT. Its fixture models a
 * placeholder that has recorded a claim but has NOT yet adopted the server id
 * (`id: 'p1786000000000'`, `pipelineProjectId: 'proj-uuid'`). That state no
 * longer occurs. `claimBackendProject` calls `adoptServerIds`, which re-keys
 * `id` TO the server UUID at claim time — minutes before the plan exists. So by
 * the time the tree arrives the placeholder's `id` already equals `tree.id`,
 * `matchIdx` matches, and the supersede branch — guarded by
 * `matchIdx < 0 && mirrorIdx < 0` — is unreachable in exactly the case it was
 * written for. Reconcile falls through to `overlay`.
 *
 * WHAT OVERLAY THEN DOES, AND IT IS NOT A NO-OP. `adoptServerTasks` adds every
 * story the browser lacks. The template's tasks carry no `storyId` at all —
 * `generateSkeleton` mints `id: '<localId>-t<n>'` and nothing else — so the two
 * key sets are wholly disjoint and the plan is ADDED rather than substituted.
 * The card becomes the UNION: ten generic template tasks plus the student's real
 * stories, still chipped "⚠ starter template" because `origin` stays `'local'`.
 *
 * That arithmetic is the fingerprint seen in the browser pass: plans of 17 and
 * 19 stories rendering as 27 and 29 tasks. 10 + 17 and 10 + 19.
 *
 * The fixtures below therefore model the POST-CLAIM state with a REAL template
 * shape, which is the only state production actually reaches.
 */
import {
  reconcileProjects,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import { adoptServerIds } from '../projectIdentity';
import type { StudentProject, ProjectTask } from '../projectsStore';

const localTask = (id: string, storyId: string | undefined, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id, title: id, storyId, state, due: state === 'done' ? 'done' : 'up' });

const localProject = (
  id: string, tasks: ProjectTask[], over: Partial<StudentProject> = {},
): StudentProject => ({
  id, name: id, slug: id, descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '', sample: false,
  reqs: [], lists: [{ id: `${id}-L1`, step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: id, summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

const bTask = (story_id: string, position: number, status = 'not_started'): BackendTaskNode =>
  ({ id: `uuid-${story_id}`, story_id, requirement_key: null, title: `Server ${story_id}`, description: null,
     status, position, owner_agent: null, release_key: null, acceptance: null, build: null, blocked_by: [] });

const SERVER_UUID = '3f2b9c14-0a7e-4c51-9d33-7b6e1f28a4c0';
const LOCAL_ID = 'p1786000000000';

/** A real published plan: 17 stories across 2 releases — the smallest of the four. */
const publishedTree = (): BackendProjectTree => ({
  id: SERVER_UUID, name: 'Sponsor Dashboard', organization_name: null,
  lists: [
    { id: 'l1', title: 'Release 0 · Skeleton', position: 0,
      tasks: Array.from({ length: 9 }, (_, i) => bTask(`STORY-${String(i).padStart(3, '0')}`, i)) },
    { id: 'l2', title: 'Release 1 · Build', position: 1,
      tasks: Array.from({ length: 8 }, (_, i) => bTask(`STORY-${String(i + 9).padStart(3, '0')}`, i)) },
  ],
});

const PLAN_STORIES = 17;
const TEMPLATE_TASKS = 10;

/**
 * The browser's starter template AFTER `claimBackendProject` has run.
 *
 * Ten tasks keyed `<localId>-t<n>` with NO `storyId`, exactly as
 * `generateSkeleton` mints them; `origin: 'local'`; and an `id` already re-keyed
 * to the server UUID by `adoptServerIds`.
 */
const claimedTemplate = (over: Partial<StudentProject> = {}): StudentProject => {
  const raw = localProject(
    LOCAL_ID,
    Array.from({ length: TEMPLATE_TASKS }, (_, i) => localTask(`${LOCAL_ID}-t${i + 1}`, undefined)),
    { origin: 'local', pipelineProjectId: SERVER_UUID, ...over },
  );
  // Exactly what the store does at claim time. Not hand-written, so the fixture
  // cannot drift away from the production code path.
  return adoptServerIds([raw]).list[0];
};

describe('the post-claim placeholder is the state production actually reaches', () => {
  it('has already adopted the server id, so it matches the tree by id', () => {
    const p = claimedTemplate();
    expect(p.id).toBe(SERVER_UUID);
    expect(p.legacyIds).toContain(LOCAL_ID);
  });

  it('shares no task identity with the plan — the template has no story ids', () => {
    const localKeys = claimedTemplate().lists.flatMap((l) => l.tasks.map((t) => t.storyId || t.id));
    const planKeys = publishedTree().lists.flatMap((l) => l.tasks.map((t) => t.story_id));
    expect(localKeys.some((k) => planKeys.includes(k))).toBe(false);
  });
});

describe('a project with a published server plan', () => {
  it('MUST NOT render as the starter template', () => {
    const r = reconcileProjects([claimedTemplate()], publishedTree());
    // `origin` is what OriginChip renders. 'local' prints the amber
    // "⚠ starter template" chip whose own tooltip says it has no schedule and
    // no Command Center — on a build whose plan the server published.
    expect(r.next[0].origin).toBe('pipeline');
  });

  it('shows the SERVER plan, not the template with the plan bolted onto it', () => {
    const r = reconcileProjects([claimedTemplate()], publishedTree());
    const total = r.next[0].lists.reduce((n, l) => n + l.tasks.length, 0);

    // The union is the defect: 10 + 17 = 27 is what production rendered.
    expect(total).not.toBe(TEMPLATE_TASKS + PLAN_STORIES);
    expect(total).toBe(PLAN_STORIES);

    expect(r.next[0].lists.map((l) => l.name)).toEqual(['Release 0 · Skeleton', 'Release 1 · Build']);
    expect(r.next[0].name).toBe('Sponsor Dashboard');
  });

  it('keeps none of the generic template tasks', () => {
    const r = reconcileProjects([claimedTemplate()], publishedTree());
    const keys = r.next[0].lists.flatMap((l) => l.tasks.map((t) => t.storyId || t.id));
    expect(keys.some((k) => k.startsWith(LOCAL_ID))).toBe(false);
  });

  it('is still one build, not two', () => {
    const r = reconcileProjects([claimedTemplate()], publishedTree());
    expect(r.next).toHaveLength(1);
    expect(r.next[0].id).toBe(SERVER_UUID);
  });

  /**
   * D4. The archive dialog reads its figures live from `GET .../archive-preview`
   * — the SERVER. The card reads localStorage. While the card carried the union,
   * the two surfaces described the same build differently on one screen: "17
   * tasks across 6 lists, your published plan" in the dialog, and "starter
   * template, 0/27 tasks" on the card behind it.
   *
   * That is not an independent defect and it gets no separate fix. It is the
   * same divergence seen from the other side, and it closes when the card
   * renders the server's plan. This pins the agreement so it cannot reopen.
   */
  it('agrees with the server about how many tasks it has (what the archive dialog counts)', () => {
    const tree = publishedTree();
    const serverTaskCount = tree.lists.reduce((n, l) => n + l.tasks.length, 0);

    const r = reconcileProjects([claimedTemplate()], tree);
    const card = r.next[0];

    expect(card.lists.reduce((n, l) => n + l.tasks.length, 0)).toBe(serverTaskCount);
    expect(card.lists).toHaveLength(tree.lists.length);
  });

  it('keeps the aliases the card has answered to, so bookmarked URLs still resolve', () => {
    const r = reconcileProjects([claimedTemplate()], publishedTree());
    expect(r.next[0].legacyIds).toContain(LOCAL_ID);
  });
});

/**
 * THE STUDENT WHO IS MID-BUILD WHEN THIS LANDS.
 *
 * The repair is lossless by construction: the only rows it replaces are rows
 * that share no task with the plan AND have nothing ticked on them. A student
 * who ticked something off the template while waiting keeps today's behaviour
 * exactly — their card and their ticks stay put.
 *
 * That is deliberate. The two task sets are disjoint, so there is no honest way
 * to carry a completion across: nothing on the plan corresponds to the generic
 * template task they ticked. Marking a plan story done that the student never
 * did would be a worse defect than the one being fixed here.
 */
describe('a placeholder the student has already worked on', () => {
  const withWork = () => {
    const p = claimedTemplate();
    const lists = p.lists.map((l) => ({
      ...l,
      tasks: l.tasks.map((t, i) => (i === 3 ? { ...t, state: 'done' as const, due: 'done' as const } : t)),
    }));
    return { ...p, lists };
  };

  it('is NOT superseded — the student keeps their card and their ticks', () => {
    const r = reconcileProjects([withWork()], publishedTree());
    expect(r.mode).not.toBe('supersede');
    expect(r.next[0].lists.flatMap((l) => l.tasks).filter((t) => t.state === 'done')).toHaveLength(1);
  });
});

/**
 * The paths this repair must NOT disturb. Each was a deliberate decision
 * recorded in projectHydrate, and each would be silently undone by a supersede
 * rule keyed on id alone.
 */
describe('rows the tree must still ADOPT or OVERLAY rather than supersede', () => {
  it('a cached copy of the plan that is missing a story — the qninying case', () => {
    // He held STORY-001..004 of a five-story plan. Adopting the missing
    // STORY-000 while keeping what he had is the whole point of adoptServerTasks.
    const cached = localProject(SERVER_UUID,
      Array.from({ length: 16 }, (_, i) => localTask(`uuid-t${i}`, `STORY-${String(i + 1).padStart(3, '0')}`)),
      { pipelineProjectId: SERVER_UUID });   // no `origin`: localStorage predates the field
    const r = reconcileProjects([cached], publishedTree());
    expect(r.mode).not.toBe('supersede');
    const keys = r.next[0].lists.flatMap((l) => l.tasks.map((t) => t.storyId || t.id));
    expect(keys).toContain('STORY-000');
  });

  it('a build this device already hydrated from the server (origin: pipeline)', () => {
    const hydrated = localProject(SERVER_UUID,
      Array.from({ length: PLAN_STORIES }, (_, i) => localTask(`t${i}`, `STORY-${String(i).padStart(3, '0')}`,
        i === 0 ? 'done' : 'todo')),
      { origin: 'pipeline', pipelineProjectId: SERVER_UUID });
    const r = reconcileProjects([hydrated], publishedTree());
    expect(r.mode).not.toBe('supersede');
    // The local completion the server has not granted must survive.
    expect(r.next[0].lists.flatMap((l) => l.tasks).filter((t) => t.state === 'done')).toHaveLength(1);
  });

  it('a client-built project round-tripped through the server (same task keys)', () => {
    const keys = publishedTree().lists.flatMap((l) => l.tasks.map((t) => t.story_id!));
    const mirrored = localProject('p1786000000001',
      keys.map((k, i) => localTask(`t${i}`, k)),
      { origin: 'local', pipelineProjectId: SERVER_UUID });
    const r = reconcileProjects([mirrored], publishedTree());
    // Superseding would relabel the student's own build as pipeline-generated.
    expect(r.mode).not.toBe('supersede');
    expect(r.next[0].origin).toBe('local');
  });
});
