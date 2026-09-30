import { whereThisSits } from '../buildStoryPrompt';
import type { PlanStory } from '../planContract';

/**
 * "Where this sits in the build" used to be the two stories either side of this
 * one in id order, while the portal showed the story's real `waits on`. A
 * learner testing Add-a-Story on a large plan got a prompt telling him to reuse
 * two numerically adjacent stories that his story did not depend on, reported
 * both readings side by side, and correctly guessed the cause (2026-09-27).
 */
const story = (id: string, blocked_by: string[] = []): PlanStory =>
  ({ id, title: `${id} title`, blocked_by } as unknown as PlanStory);

const PLAN = [story('STORY-001'), story('STORY-002'), story('STORY-003'), story('STORY-004'),
  story('STORY-018'), story('STORY-019'), story('STORY-020', ['STORY-003', 'STORY-004']), story('STORY-021', ['STORY-020'])];

describe('whereThisSits', () => {
  it('uses the declared dependencies, not the numerically adjacent stories', () => {
    const r = whereThisSits(PLAN, PLAN.find((s) => s.id === 'STORY-020')!);
    expect(r.byDependency).toBe(true);
    expect(r.before.map((s) => s.id)).toEqual(['STORY-003', 'STORY-004']);
    expect(r.before.map((s) => s.id)).not.toContain('STORY-019');
    expect(r.after.map((s) => s.id)).toEqual(['STORY-021']);
  });

  it('lists the stories waiting on this one as what comes after', () => {
    const r = whereThisSits(PLAN, PLAN.find((s) => s.id === 'STORY-003')!);
    expect(r.byDependency).toBe(true);
    expect(r.before).toEqual([]);
    expect(r.after.map((s) => s.id)).toEqual(['STORY-020']);
  });

  it('falls back to plan order when the plan declares no dependencies at all, and says so', () => {
    const plain = [story('STORY-001'), story('STORY-002'), story('STORY-003'), story('STORY-004'), story('STORY-005')];
    const r = whereThisSits(plain, plain[2]);
    expect(r.byDependency).toBe(false);
    expect(r.before.map((s) => s.id)).toEqual(['STORY-001', 'STORY-002']);
    expect(r.after.map((s) => s.id)).toEqual(['STORY-004', 'STORY-005']);
  });

  it('ignores a dependency id the plan does not contain, and a story depending on itself', () => {
    const odd = [story('STORY-001'), story('STORY-002', ['STORY-404', 'STORY-002', 'STORY-001'])];
    const r = whereThisSits(odd, odd[1]);
    expect(r.before.map((s) => s.id)).toEqual(['STORY-001']);
  });

  it('is empty for a story that is not in the plan', () => {
    expect(whereThisSits(PLAN, story('STORY-999'))).toEqual({ before: [], after: [], byDependency: false });
  });

  it('handles the first and last story in a dependency-free plan', () => {
    const plain = [story('STORY-001'), story('STORY-002')];
    expect(whereThisSits(plain, plain[0]).before).toEqual([]);
    expect(whereThisSits(plain, plain[1]).after).toEqual([]);
  });
});
