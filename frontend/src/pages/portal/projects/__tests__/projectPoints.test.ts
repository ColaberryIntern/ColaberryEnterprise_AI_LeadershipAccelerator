import { projectPoints, type StudentProject, type ProjectTask } from '../projectsStore';

/**
 * What a build card says it is worth.
 *
 * The rule that matters: points are EARNED by server verification, never by a
 * student marking a task done. The tile says "Build · +N pts" precisely because
 * clicking collects nothing — so a card that counted `state: 'done'` would show
 * a number the points ledger cannot back.
 */
const task = (over: Partial<ProjectTask>): ProjectTask => ({
  id: Math.random().toString(36).slice(2), title: 't', state: 'todo', due: 'up', ...over,
} as ProjectTask);

const project = (tasks: ProjectTask[]): StudentProject =>
  ({ lists: [{ id: 'l1', step: 1, name: 'Release 0', sub: '', tasks }] } as unknown as StudentProject);

describe('projectPoints', () => {
  it('counts only stories the server verified, not ones the student marked done', () => {
    const p = project([
      task({ storyId: 'STORY-000', points: 50, state: 'done', verifiedAt: '2026-09-01T00:00:00Z' }),
      // Student says done; the server has not verified it. Pays nothing.
      task({ storyId: 'STORY-001', points: 50, state: 'done', verifiedAt: null }),
      task({ storyId: 'STORY-002', points: 50, state: 'todo' }),
    ]);
    expect(projectPoints(p)).toEqual({ earned: 50, available: 150, priced: 3 });
  });

  it('ignores unpriced tasks entirely, so PREP steps never dilute the total', () => {
    const p = project([
      task({ storyId: 'STORY-000', points: 67, verifiedAt: '2026-09-01T00:00:00Z' }),
      task({ storyId: 'PREP-1' }),
      task({ storyId: 'PREP-2', points: 0 }),
      task({ storyId: 'PREP-3', points: undefined }),
    ]);
    expect(projectPoints(p)).toEqual({ earned: 67, available: 67, priced: 1 });
  });

  it('reports nothing priced for a build with no plan or no budget, so the card can hide the chip', () => {
    // `priced: 0` is what the card keys on: "not priced yet" must not render as
    // "0 pts", which reads as "this work is worth nothing".
    expect(projectPoints(project([task({ storyId: 'STORY-000' }), task({ storyId: 'STORY-001' })])))
      .toEqual({ earned: 0, available: 0, priced: 0 });
    expect(projectPoints(project([]))).toEqual({ earned: 0, available: 0, priced: 0 });
  });

  it('totals across every release in the build', () => {
    const p = {
      lists: [
        { id: 'r0', step: 1, name: 'Release 0', sub: '', tasks: [task({ points: 25, verifiedAt: 'x' })] },
        { id: 'r1', step: 2, name: 'Release 1', sub: '', tasks: [task({ points: 25, verifiedAt: 'x' }), task({ points: 25 })] },
      ],
    } as unknown as StudentProject;
    expect(projectPoints(p)).toEqual({ earned: 50, available: 75, priced: 3 });
  });

  it('a fully verified build reports earned equal to available, which is how the chip turns done', () => {
    const p = project([
      task({ points: 40, verifiedAt: 'x' }),
      task({ points: 40, verifiedAt: 'x' }),
    ]);
    const q = projectPoints(p);
    expect(q.earned).toBe(q.available);
    expect(q.earned).toBe(80);
  });
});
