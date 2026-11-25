/**
 * Progress totals: points belong to one project, and an unchecked story is not a story with no criteria.
 */
import { pointsForTasks } from '../buildProgressSnapshot';
import { renderProgressFile } from '../verification/progressContract';

const ev = (source_ref: string, builder_xp = 53) => ({ source_ref, builder_xp });
const task = (story_id: string, verified_at: string | null, verified_ref: string | null = null) => ({ story_id, verified_at, verified_ref });

describe('pointsForTasks', () => {
  it('pays nothing to an unverified story, even when another project earned the same story id', () => {
    expect(pointsForTasks([task('STORY-000', null)], [ev('STORY-000@aaa')])).toEqual({});
  });

  it('pays only the award recorded for this task\'s own commit', () => {
    const evidence = [ev('STORY-001@other', 99), ev('STORY-001@mine', 40)];
    expect(pointsForTasks([task('STORY-001', '2026-11-01', 'mine')], evidence)).toEqual({ 'STORY-001': 40 });
    expect(pointsForTasks([task('STORY-001', '2026-11-01', 'missing')], evidence)).toEqual({});
  });

  it('falls back to the story prefix for a story verified before the sha was kept', () => {
    expect(pointsForTasks([task('STORY-1', '2026-11-01')], [ev('STORY-10@x', 9), ev('STORY-1@y', 5)])).toEqual({ 'STORY-1': 5 });
  });

  it('is empty with no tasks or no evidence', () => {
    expect(pointsForTasks([], [ev('STORY-001@a')])).toEqual({});
    expect(pointsForTasks([task('STORY-001', '2026-11-01', 'a')], [])).toEqual({});
  });
});

describe('criteria totals', () => {
  const seed = [{ id: 'STORY-001', acceptance: ['a', 'b', 'c'] }];
  const progress = (criteria_total: number | null) => ([{ story_id: 'STORY-001', state: 'not_started' as const, criteria_passed: 0, criteria_total }]);

  it('uses the plan\'s count for a story no run has checked', () => {
    const f = renderProgressFile(seed, 'P', { progress: progress(null) });
    expect(f.totals!.criteria_total).toBe(3);
    expect(f.stories[0].verification!.criteria_total).toBe(3);
  });

  it('keeps the count a verification run recorded', () => {
    expect(renderProgressFile(seed, 'P', { progress: progress(2) }).totals!.criteria_total).toBe(2);
  });
});
