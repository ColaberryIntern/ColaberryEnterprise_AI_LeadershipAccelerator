import {
  overlayCompletions, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

/**
 * A TASK RENAMED ON THE SERVER MUST REACH A DEVICE THAT ALREADY HAS IT.
 *
 * On 2026-10-25 the six demo-prep tasks were renamed after the video each one
 * asks for. 250 rows changed and the database was verified — and the Projects
 * page went on showing "Write the Demo Narrative: the Problem, the One Moment,
 * the Guardrail", because:
 *
 *   - `adoptServerTasks` only ADDS stories a device LACKS, and
 *   - `overlayCompletions` copied status, points and verification, but not the
 *     name.
 *
 * So the rename was invisible to every existing student, and a reload could not
 * fix it: the stale copy lives in localStorage, which outlives a refresh.
 *
 * This is the THIRD field this overlay has forgotten — the function's own
 * comments record `verifiedAt` and `points` arriving late for the same reason.
 * These tests exist so the fourth one is caught by a test instead of a
 * screenshot.
 */

const localTask = (id: string, storyId: string, title: string, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id, title, storyId, state, due: state === 'done' ? 'done' : 'up' });

// Named to MATCH the tree below. The overlay also adopts the server's project
// name, so a fixture that disagrees about it can never return the same
// reference — which would make the fast-path test below fail for a reason that
// has nothing to do with task titles.
const localProject = (tasks: ProjectTask[]): StudentProject => ({
  id: 'p1', name: 'My Build', slug: 'my-build', descriptor: '', accent: '#000', cover: '', icon: '', status: 'ready',
  createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '',
  reqs: [], lists: [{ id: 'p1-L1', step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: 'My Build', summary: '', tools: [], dataSources: [], guardrails: [] },
});

const bTask = (story_id: string, extra: Partial<BackendTaskNode> = {}): BackendTaskNode =>
  ({ id: `uuid-${story_id}`, story_id, requirement_key: null, title: story_id, description: null,
     status: 'not_started', position: 0, owner_agent: null, release_key: null, acceptance: null,
     build: null, blocked_by: [], ...extra });

const bTree = (tasks: BackendTaskNode[]): BackendProjectTree =>
  ({ id: 'proj-uuid', name: 'My Build', organization_name: null,
     lists: [{ id: 'l1', title: 'Demo prep', position: 0, tasks }] });

const titleOf = (p: StudentProject, storyId: string) =>
  p.lists[0].tasks.find((t) => t.storyId === storyId)?.title;

describe('the overlay path — a device that already holds the project', () => {
  it('adopts a title the server has changed', () => {
    const local = localProject([
      localTask('t1', 'PREP-1', 'Write the Demo Narrative: the Problem, the One Moment, the Guardrail'),
    ]);
    const tree = bTree([bTask('PREP-1', { title: 'Record Your Project Introduction' })]);

    const next = overlayCompletions(local, tree);
    expect(titleOf(next, 'PREP-1')).toBe('Record Your Project Introduction');
  });

  it('renames every task the server renamed, not just the first', () => {
    const local = localProject([
      localTask('t1', 'PREP-1', 'old one'),
      localTask('t2', 'PREP-2', 'old two'),
      localTask('t3', 'PREP-3', 'old three'),
    ]);
    const tree = bTree([
      bTask('PREP-1', { title: 'Record Your Project Introduction' }),
      bTask('PREP-2', { title: 'Record Your Working-System Demo' }),
      bTask('PREP-3', { title: 'Record Your AI Visual Presentation' }),
    ]);

    const next = overlayCompletions(local, tree);
    expect(titleOf(next, 'PREP-1')).toBe('Record Your Project Introduction');
    expect(titleOf(next, 'PREP-2')).toBe('Record Your Working-System Demo');
    expect(titleOf(next, 'PREP-3')).toBe('Record Your AI Visual Presentation');
  });

  it('keeps the completion it already adopted while renaming', () => {
    // The rename must not cost the overlay its original job.
    const local = localProject([localTask('t1', 'PREP-1', 'old', 'todo')]);
    const tree = bTree([bTask('PREP-1', { title: 'Record Your Project Introduction', status: 'complete' })]);

    const next = overlayCompletions(local, tree);
    expect(titleOf(next, 'PREP-1')).toBe('Record Your Project Introduction');
    expect(next.lists[0].tasks[0].state).toBe('done');
  });

  it('does NOT blank a local name when the server sends none', () => {
    // Set from the server, never cleared by it — the same rule the verification
    // stamp follows. A server silent about a title says nothing about the name
    // this device is showing, and blanking the card would be worse than stale.
    const local = localProject([localTask('t1', 'PREP-1', 'A name worth keeping')]);
    const tree = bTree([bTask('PREP-1', { title: '' })]);

    const next = overlayCompletions(local, tree);
    expect(titleOf(next, 'PREP-1')).toBe('A name worth keeping');
  });

  it('leaves a story the server does not mention alone', () => {
    const local = localProject([
      localTask('t1', 'PREP-1', 'old'),
      localTask('t9', 'STORY-009', 'Something local'),
    ]);
    const tree = bTree([bTask('PREP-1', { title: 'Record Your Project Introduction' })]);

    const next = overlayCompletions(local, tree);
    expect(titleOf(next, 'STORY-009')).toBe('Something local');
  });

  it('returns the SAME reference when the names already match', () => {
    // The sync loop skips a write on reference equality; renaming must not
    // defeat that and cause a re-render on every poll.
    const local = localProject([localTask('t1', 'PREP-1', 'Record Your Project Introduction')]);
    const tree = bTree([bTask('PREP-1', { title: 'Record Your Project Introduction' })]);

    expect(overlayCompletions(local, tree)).toBe(local);
  });
});

describe('the hydrate path — a device seeing the build for the first time', () => {
  it('already showed the server name, and still does', () => {
    // This path was never broken; it is asserted so a future change cannot fix
    // one path by breaking the other.
    const tree = bTree([bTask('PREP-1', { title: 'Record Your Project Introduction' })]);
    const p = backendTreeToProject(tree);
    expect(titleOf(p, 'PREP-1')).toBe('Record Your Project Introduction');
  });
});
