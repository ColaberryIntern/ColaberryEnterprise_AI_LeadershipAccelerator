/**
 * The optimistic placeholder, and what happens when the real plan turns up.
 *
 * The wizard writes a local build the instant the student submits, so the page
 * has something to show while the server takes minutes. That placeholder is a
 * ten-task template: no dates, no STORY-000, generic prompts. When the server's
 * plan lands it must REPLACE the placeholder, not appear beside it — a student
 * with two near-identical cards has no way to tell which one is their real
 * build, and on 2026-08-12/13 that ambiguity is what hid the outage.
 *
 * The claim (`pipelineProjectId`) is what links the two. It is written to
 * localStorage rather than held in React state so a reload mid-generation still
 * resolves correctly.
 */
import {
  reconcileProjects, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
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

const bTask = (story_id: string, status = 'not_started'): BackendTaskNode =>
  ({ id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
     status, position: 0, owner_agent: null, release_key: null, acceptance: null, build: null, blocked_by: [] });

/** A real published plan: STORY-000 first, then the student's own stories. */
const publishedTree = (): BackendProjectTree => ({
  id: 'proj-uuid', name: 'Sponsor Dashboard', organization_name: null,
  lists: [{
    id: 'l1', title: 'Release 0 · Skeleton', position: 0,
    tasks: [bTask('STORY-000'), bTask('STORY-001')],
  }],
});

/** The browser's fallback: `p<epoch>` id, template task ids, no story ids. */
const placeholder = (over: Partial<StudentProject> = {}) => localProject(
  'p1786000000000',
  [localTask('p1786000000000-t1', undefined), localTask('p1786000000000-t2', undefined)],
  { origin: 'local', pipelineProjectId: 'proj-uuid', ...over },
);

// ── the claim is honoured ───────────────────────────────────────────────────
describe('a placeholder that claimed this backend project', () => {
  it('is REPLACED by the real plan rather than joined by it', () => {
    const r = reconcileProjects([placeholder()], publishedTree());
    expect(r.mode).toBe('supersede');
    expect(r.changed).toBe(true);
    // One build, not two. This is the whole point.
    expect(r.next).toHaveLength(1);
    expect(r.next[0].id).toBe('proj-uuid');
    expect(r.next[0].origin).toBe('pipeline');
  });

  it('keeps its position in the list, so the student\'s build does not jump', () => {
    const other = localProject('other', [localTask('other-t1', undefined)]);
    const r = reconcileProjects([other, placeholder()], publishedTree());
    expect(r.next.map((p) => p.id)).toEqual(['other', 'proj-uuid']);
  });

  it('brings the real plan\'s tasks with it, including STORY-000', () => {
    const r = reconcileProjects([placeholder()], publishedTree());
    const storyIds = r.next[0].lists.flatMap((l) => l.tasks.map((t) => t.storyId));
    expect(storyIds).toContain('STORY-000');
    expect(storyIds).toContain('STORY-001');
  });

  it('is idempotent — a second pass matches on id and reports no change', () => {
    const first = reconcileProjects([placeholder()], publishedTree());
    const second = reconcileProjects(first.next, publishedTree());
    expect(second.changed).toBe(false);
    expect(second.next).toHaveLength(1);
  });

  it('does not mutate the input list', () => {
    const local = [placeholder()];
    reconcileProjects(local, publishedTree());
    expect(local[0].id).toBe('p1786000000000');
    expect(local).toHaveLength(1);
  });
});

// ── the guard: never throw away work ────────────────────────────────────────
describe('a placeholder the student has already worked on', () => {
  it('is kept, and the real plan is added alongside it', () => {
    const worked = placeholder({});
    worked.lists[0].tasks[0].state = 'done';

    const r = reconcileProjects([worked], publishedTree());

    expect(r.mode).toBe('hydrate');
    expect(r.next).toHaveLength(2);
    // Both are present and both are labelled, so the student can tell them apart.
    expect(r.next.find((p) => p.id === 'proj-uuid')?.origin).toBe('pipeline');
    expect(r.next.find((p) => p.id === 'p1786000000000')?.origin).toBe('local');
  });
});

// ── an unclaimed placeholder is not touched ─────────────────────────────────
describe('a local build that claimed nothing', () => {
  it('is left alone and the real plan is hydrated separately', () => {
    const unclaimed = placeholder({ pipelineProjectId: null });
    const r = reconcileProjects([unclaimed], publishedTree());
    expect(r.mode).toBe('hydrate');
    expect(r.next).toHaveLength(2);
  });

  it('does not supersede a placeholder that claimed a DIFFERENT project', () => {
    const other = placeholder({ pipelineProjectId: 'some-other-uuid' });
    const r = reconcileProjects([other], publishedTree());
    expect(r.mode).toBe('hydrate');
    expect(r.next).toHaveLength(2);
  });
});

// ── provenance is recorded on everything the server produced ────────────────
describe('backendTreeToProject', () => {
  it('stamps origin=pipeline and carries the backend project id', () => {
    const p = backendTreeToProject(publishedTree());
    expect(p.origin).toBe('pipeline');
    expect(p.pipelineProjectId).toBe('proj-uuid');
    expect(p.id).toBe('proj-uuid');
  });
});
