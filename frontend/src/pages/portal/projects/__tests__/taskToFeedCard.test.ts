import { taskToFeedCard } from '../ProjectInterior';
import type { StudentProject, ProjectTask } from '../projectsStore';

/**
 * The mapper both project screens use.
 *
 * The landing page used to build its own thinner card — title, list name, one
 * line of description, "Open build" — so the first screen a student saw
 * described a story differently from the screen behind it: no points, no
 * release chip, and a story LOCKED behind its release gate shown as an
 * ordinary openable row (Ali, 2026-09-13). Exporting this and rendering both
 * screens through it is what makes them agree; these tests pin what it says.
 */
const task = (over: Partial<ProjectTask>): ProjectTask => ({
  id: 't1', title: 'STORY-003 · Create AI workspace', state: 'todo', due: 'up', ...over,
} as ProjectTask);

const projectWith = (tasks: ProjectTask[]): StudentProject =>
  ({ id: 'p1', lists: [{ id: 'r0', step: 1, name: 'Release 0', sub: '', tasks }] } as unknown as StudentProject);

describe('taskToFeedCard', () => {
  it('marks a story LOCKED and names the gate when a prerequisite is not done', () => {
    const blocker = task({ id: 'b', storyId: 'STORY-002', state: 'todo' });
    const gated = task({ id: 'g', storyId: 'STORY-003', blockedBy: ['STORY-002'], points: 50 });
    const card = taskToFeedCard(projectWith([blocker, gated]), gated, 'Release 0');
    expect(card.status).toBe('locked');
    expect(card.lock_reason).toBe('STORY-002');
    // Still priced while locked: the student can see what it will pay.
    expect(card.points).toEqual({ builder: 50 });
  });

  it('is available once the prerequisite is done', () => {
    const blocker = task({ id: 'b', storyId: 'STORY-002', state: 'done' });
    const gated = task({ id: 'g', storyId: 'STORY-003', blockedBy: ['STORY-002'] });
    const card = taskToFeedCard(projectWith([blocker, gated]), gated, 'Release 0');
    expect(card.status).toBe('available');
    expect(card.lock_reason).toBeNull();
  });

  it('carries the release chip, the points badge and the project ids the CTA needs', () => {
    const t = task({ release: 'Release 0 · Initial Property Analysis', what: 'As an investor…', points: 67 });
    const card = taskToFeedCard(projectWith([t]), t, 'PropertyPulse AI · Release 0');
    expect(card).toMatchObject({
      type: 'project_task',
      subtitle: 'Release 0 · Initial Property Analysis',
      student_label: 'PropertyPulse AI · Release 0',
      description: 'As an investor…',
      points: { builder: 67 },
      project_id: 'p1',
      project_task_id: 't1',
    });
  });

  it('shows no points badge when the story has no price, rather than inventing one', () => {
    const t = task({ points: undefined });
    expect(taskToFeedCard(projectWith([t]), t, 'Release 0').points).toEqual({});
    const zero = task({ id: 'z', points: 0 });
    expect(taskToFeedCard(projectWith([zero]), zero, 'Release 0').points).toEqual({});
  });

  it('says "Submit" on a demo-prep task and "Demo Day" on the presentation, never "Build"', () => {
    // Ali, 2026-09-14: demos provide points too. A recording is handed in,
    // not built; Demo Day is marked by staff. The verb must match the path.
    const prep = task({ id: 'p2', storyId: 'PREP-2', points: 40 });
    expect(taskToFeedCard(projectWith([prep]), prep, 'Demo prep')).toMatchObject({ cta_verb: 'Submit', points: { builder: 40 } });
    const day = task({ id: 'p6', storyId: 'PREP-6', points: 60 });
    expect(taskToFeedCard(projectWith([day]), day, 'Demo prep')).toMatchObject({ cta_verb: 'Demo Day', points: { builder: 60 } });
    const story = task({ id: 's1', storyId: 'STORY-001', points: 50 });
    expect(taskToFeedCard(projectWith([story]), story, 'Release 0').cta_verb).toBeNull();
  });

  it('reports a finished story as completed, dated by the SERVER verification', () => {
    const t = task({ state: 'done', points: 50, verifiedAt: '2026-09-01T00:00:00Z' });
    const card = taskToFeedCard(projectWith([t]), t, 'Release 0');
    expect(card.status).toBe('completed');
    expect(card.completed_at).toBe('2026-09-01T00:00:00Z');
  });
});
