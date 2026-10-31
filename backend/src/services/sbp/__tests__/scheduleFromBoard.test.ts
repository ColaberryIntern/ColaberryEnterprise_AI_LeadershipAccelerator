/**
 * scheduleFromBoardTasks — a gov build's plan.json must take its dates from the board (where
 * govSyntheticSchedule already dated the tasks to the deadline), not from the cohort scheduler. These
 * tests pin that the pure core reads STORY due dates back faithfully, derives the window from them, and
 * falls back to null (so the caller uses the cohort scheduler) when the board has no dated story task.
 */
import { scheduleFromBoardTasks } from '../scheduleFromBoard';

const day = (d: Date) => d.toISOString().slice(0, 10);

describe('scheduleFromBoardTasks', () => {
  it('builds tasks from STORY due dates, the window from min/max, and prep sets demo day', () => {
    const sched = scheduleFromBoardTasks([
      { story_id: 'STORY-001', release_key: 'r0', due_on: '2026-10-27' },
      { story_id: 'STORY-002', release_key: 'r1', due_on: '2026-11-10' },
      { story_id: 'PREP-1', release_key: 'prep', due_on: '2026-11-12', title: 'Record intro' },
      { story_id: 'PREP-6', release_key: 'prep', due_on: '2026-11-18', title: 'Demo Day' },
      { story_id: null, release_key: null, due_on: '2026-10-01' }, // non-story row ignored
    ])!;
    expect(sched).not.toBeNull();
    expect(sched.tasks.map((t) => [t.storyId, t.releaseKey, day(t.dueOn)])).toEqual([
      ['STORY-001', 'r0', '2026-10-27'],
      ['STORY-002', 'r1', '2026-11-10'],
    ]);
    expect(day(sched.buildStart)).toBe('2026-10-27');
    expect(day(sched.buildEnd)).toBe('2026-11-10');
    expect(day(sched.demoDay)).toBe('2026-11-18'); // the last prep task
    expect(sched.prep.map((p) => p.key)).toEqual(['PREP-1', 'PREP-6']);
    expect(sched.totalTasks).toBe(2);
    expect(sched.demoReleaseKey).toBeNull();
  });

  it('falls back demo day to buildEnd when there are no prep tasks (Date inputs work too)', () => {
    const sched = scheduleFromBoardTasks([
      { story_id: 'STORY-001', release_key: 'r0', due_on: new Date('2026-10-27T00:00:00.000Z') },
    ])!;
    expect(day(sched.demoDay)).toBe('2026-10-27');
    expect(sched.prep).toEqual([]);
    expect(sched.buildWeeks).toBe(1);
  });

  it('returns null when no STORY task carries a due date (caller falls back to the cohort scheduler)', () => {
    expect(scheduleFromBoardTasks([{ story_id: 'STORY-001', release_key: 'r0', due_on: null }])).toBeNull();
    expect(scheduleFromBoardTasks([{ story_id: 'PREP-1', release_key: 'prep', due_on: '2026-11-01' }])).toBeNull();
    expect(scheduleFromBoardTasks([])).toBeNull();
  });

  it('ignores an unparseable due date', () => {
    expect(scheduleFromBoardTasks([{ story_id: 'STORY-001', release_key: 'r0', due_on: 'not-a-date' }])).toBeNull();
  });
});
