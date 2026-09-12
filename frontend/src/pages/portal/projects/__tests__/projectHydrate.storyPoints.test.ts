/**
 * The story price tag on the client. Ali, 2026-09-11: "the projects should
 * have points instead of the open button, just like the Classroom."
 *
 * The backend prices each story (`points` on the task node). Two paths carry
 * it onto the localStorage model: `taskFromServer` for tasks this device has
 * never seen, and `overlayCompletions` for tasks it stored before stories had
 * a price — every device already holding a build gets its badges on the next
 * sync, with no reinstall. Pure functions; no I/O.
 */
import { overlayCompletions, backendTreeToProject, type BackendProjectTree, type BackendTaskNode } from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

const PROJECT_ID = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

const bTask = (story_id: string, position: number, over: Partial<BackendTaskNode> = {}): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: `${story_id} title`,
  description: null, status: 'not_started', position, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [], ...over,
});

const tree = (tasks: BackendTaskNode[]): BackendProjectTree => ({
  id: PROJECT_ID, name: 'PropertyPulse AI', organization_name: null,
  lists: [{ id: 'l-r0', title: 'Release 0', position: 0, tasks }],
});

const localTask = (storyId: string, over: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id: `uuid-${storyId}`, title: `${storyId} title`, storyId, state: 'todo', due: 'up', ...over });

const local = (tasks: ProjectTask[]): StudentProject => ({
  id: PROJECT_ID, name: 'PropertyPulse AI', slug: 'propertypulse-ai', descriptor: '',
  accent: '#000', cover: '', icon: '', status: 'ready', createdAt: 1, stage: '',
  curStep: 2, size: 'project', idea: '', sample: false, reqs: [], activity: [],
  preview: { toolName: 'PropertyPulse AI', summary: '', tools: [], dataSources: [], guardrails: [] },
  lists: [{ id: 'l-r0', step: 2, name: 'Release 0', sub: '', tasks }],
});

const pointsOf = (p: StudentProject) => p.lists[0].tasks.map((t) => t.points);

describe('a device that has never seen the build (backendTreeToProject)', () => {
  it('carries the price onto each story, and nothing onto an unpriced task', () => {
    const p = backendTreeToProject(tree([bTask('STORY-000', 0, { points: 57 }), bTask('STORY-001', 1, { points: 57 }), bTask('PREP-1', 2, { points: null })]));
    expect(pointsOf(p)).toEqual([57, 57, undefined]);
  });

  it('never turns 0 or a missing field into a "+0 pts" badge', () => {
    const p = backendTreeToProject(tree([bTask('STORY-000', 0, { points: 0 }), bTask('STORY-001', 1)]));
    expect(pointsOf(p)).toEqual([undefined, undefined]);
  });
});

describe('a device that stored the build before stories had a price (overlayCompletions)', () => {
  it('stamps the price onto tasks it already holds', () => {
    const before = local([localTask('STORY-000'), localTask('STORY-001')]);
    const after = overlayCompletions(before, tree([bTask('STORY-000', 0, { points: 57 }), bTask('STORY-001', 1, { points: 57 })]));
    expect(after).not.toBe(before);
    expect(pointsOf(after)).toEqual([57, 57]);
  });

  it('follows a repriced plan — a republish at a different story count moves the badge', () => {
    const before = local([localTask('STORY-000', { points: 57 })]);
    const after = overlayCompletions(before, tree([bTask('STORY-000', 0, { points: 40 })]));
    expect(pointsOf(after)).toEqual([40]);
  });

  it('returns the SAME reference when every price already matches — no phantom write', () => {
    const before = local([localTask('STORY-000', { points: 57 }), localTask('STORY-001', { points: 57 })]);
    const after = overlayCompletions(before, tree([bTask('STORY-000', 0, { points: 57 }), bTask('STORY-001', 1, { points: 57 })]));
    expect(after).toBe(before);
  });

  it('leaves a local price alone when an older server sends none', () => {
    const before = local([localTask('STORY-000', { points: 57 })]);
    const after = overlayCompletions(before, tree([bTask('STORY-000', 0)]));
    expect(after).toBe(before);
    expect(pointsOf(after)).toEqual([57]);
  });

  it('lands a price and a completion arriving in the same pull', () => {
    const before = local([localTask('STORY-000')]);
    const after = overlayCompletions(before, tree([bTask('STORY-000', 0, { points: 57, status: 'complete' })]));
    expect(after.lists[0].tasks[0]).toMatchObject({ points: 57, state: 'done', due: 'done' });
  });
});
