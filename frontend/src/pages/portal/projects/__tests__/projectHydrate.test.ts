import {
  reconcileProjects, overlayCompletions, backendTreeToProject, taskKey,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

// ── fixtures ──────────────────────────────────────────────────────────────────
const localTask = (id: string, storyId: string | undefined, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id, title: id, storyId, state, due: state === 'done' ? 'done' : 'up' });

const localProject = (id: string, tasks: ProjectTask[], sample = false): StudentProject => ({
  id, name: id, slug: id, descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '', sample,
  reqs: [], lists: [{ id: `${id}-L1`, step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: id, summary: '', tools: [], dataSources: [], guardrails: [] },
});

const bTask = (story_id: string, status = 'not_started', extra: Partial<BackendTaskNode> = {}): BackendTaskNode =>
  ({ id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
     status, position: 0, owner_agent: null, release_key: null, acceptance: null, build: null, blocked_by: [], ...extra });

const bTree = (tasks: BackendTaskNode[], name = 'My Build'): BackendProjectTree =>
  ({ id: 'proj-uuid', name, organization_name: null, lists: [{ id: 'l1', title: 'Release 0', position: 0, tasks }] });

// ── no-op guards ────────────────────────────────────────────────────────────────
test('null or empty tree is a no-op', () => {
  const local = [localProject('p1', [localTask('p1-t1', undefined)])];
  expect(reconcileProjects(local, null)).toMatchObject({ changed: false, mode: 'noop', next: local });
  expect(reconcileProjects(local, bTree([])).changed).toBe(false);
});

// ── overlay (a build already on this device) ──────────────────────────────────
test('overlays a backend completion onto the matching local task', () => {
  const local = [localProject('p1', [localTask('p1-t1', undefined), localTask('p1-t2', undefined)])];
  const tree = bTree([bTask('p1-t1', 'complete'), bTask('p1-t2', 'not_started')]);
  const r = reconcileProjects(local, tree);
  expect(r.mode).toBe('overlay');
  expect(r.changed).toBe(true);
  expect(r.next[0].lists[0].tasks[0].state).toBe('done');
  expect(r.next[0].lists[0].tasks[1].state).toBe('todo'); // not complete on the server → untouched
  expect(local[0].lists[0].tasks[0].state).toBe('todo');   // input not mutated
});

test('overlay is idempotent — second pass reports no change', () => {
  const local = [localProject('p1', [localTask('p1-t1', undefined)])];
  const tree = bTree([bTask('p1-t1', 'complete')]);
  const once = reconcileProjects(local, tree);
  const twice = reconcileProjects(once.next, tree);
  expect(twice.changed).toBe(false);
  expect(twice.mode).toBe('noop');
});

test('overlay never regresses a locally-done task', () => {
  const local = [localProject('p1', [localTask('p1-t1', undefined, 'done')])];
  const tree = bTree([bTask('p1-t1', 'not_started')]);
  const r = reconcileProjects(local, tree);
  expect(r.changed).toBe(false);
  expect(r.next[0].lists[0].tasks[0].state).toBe('done');
});

test('matches on storyId when present (key = storyId || id)', () => {
  const local = [localProject('p1', [localTask('local-id', 'STORY-7')])];
  expect(taskKey({ storyId: 'STORY-7', id: 'local-id' })).toBe('STORY-7');
  const r = reconcileProjects(local, bTree([bTask('STORY-7', 'complete')]));
  expect(r.mode).toBe('overlay');
  expect(r.next[0].lists[0].tasks[0].state).toBe('done');
});

// ── hydrate (a build this device has never seen) ──────────────────────────────
test('hydrates a build absent locally, ahead of the demo, without touching the demo', () => {
  const demo = localProject('sample-salon', [localTask('sample-salon-STORY-1', 'STORY-1')], true);
  const tree = bTree([bTask('p9-t1', 'complete'), bTask('p9-t2', 'not_started'), bTask('p9-t3', 'not_started')]);
  const r = reconcileProjects([demo], tree);
  expect(r.mode).toBe('hydrate');
  expect(r.next).toHaveLength(2);
  expect(r.next[0].id).toBe('proj-uuid');
  expect(r.next[0].sample).toBeFalsy();
  expect(r.next[1]).toBe(demo); // demo preserved, still last
});

test('backendTreeToProject maps status→state and flags the first open task as today', () => {
  const p = backendTreeToProject(bTree([
    bTask('a', 'complete'),
    bTask('b', 'not_started', { requirement_key: 'R1' }),
    bTask('c', 'not_started'),
  ]));
  const tasks = p.lists[0].tasks;
  expect(tasks.map((t) => t.state)).toEqual(['done', 'todo', 'todo']);
  expect(tasks.map((t) => t.due)).toEqual(['done', 'today', 'up']); // first OPEN task is "today"
  expect(p.reqs.map((r) => r.id)).toEqual(['R1']); // requirement catalog derived from keys
  expect(p.status).toBe('ready');
});
