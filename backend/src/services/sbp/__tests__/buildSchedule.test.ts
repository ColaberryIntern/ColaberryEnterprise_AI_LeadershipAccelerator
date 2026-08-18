/**
 * The capstone schedule.
 *
 * Anchored on the real July 2026 cohort, which starts Thursday 23 July and
 * presents on Thursday of week 12. Those dates are the first live use of this
 * code, so they are the fixture rather than a synthetic one.
 *
 * The load-bearing behaviour is NOT the date arithmetic — it is the demo-release
 * cut. When a plan is bigger than the window, the answer is "here is where you
 * will be on stage, and here is your roadmap", never "your plan is too big".
 */
import {
  buildSchedule, prepTasks, weekStart, TASKS_PER_WEEK_LOW, TASKS_PER_WEEK_HIGH,
} from '../buildSchedule';

/** July 2026 cohort, week 1 day 1. */
const JULY = new Date('2026-07-23T00:00:00.000Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

const releases = (n: number) => Array.from({ length: n }, (_, i) => ({
  key: `r${i}`, name: `Release ${i}`, week_start: i * 2 + 1, week_end: i * 2 + 2,
}));

/** `counts` = stories per release, in order. */
function scheduleFor(counts: number[], window: { cohortStart: Date; asOf?: Date } = { cohortStart: JULY }) {
  const rels = releases(counts.length);
  const storiesByRelease = new Map<string, string[]>();
  let n = 1;
  rels.forEach((r, i) => {
    storiesByRelease.set(r.key, Array.from({ length: counts[i] }, () => `STORY-${String(n++).padStart(3, '0')}`));
  });
  return buildSchedule({ window, releases: rels, storiesByRelease });
}

describe('the July 2026 window', () => {
  const s = scheduleFor([3, 3, 3]);

  it('starts the build in week 4 and ends it when prep begins in week 11', () => {
    expect(iso(s.buildStart)).toBe('2026-08-13');   // Thu, week 4
    expect(iso(s.buildEnd)).toBe('2026-10-01');     // Thu, week 11 — prep starts
    expect(iso(s.demoDay)).toBe('2026-10-08');      // Thu, week 12
  });

  it('gives 7 build weeks, so 7-14 tasks', () => {
    expect(s.buildWeeks).toBe(7);
    expect(s.capacity).toEqual({ low: 7 * TASKS_PER_WEEK_LOW, high: 7 * TASKS_PER_WEEK_HIGH });
  });

  it('never schedules a build task into the prep week', () => {
    s.tasks.forEach((t) => expect(t.dueOn.getTime()).toBeLessThanOrEqual(s.buildEnd.getTime()));
  });

  it('gives every task a date on or after the build start', () => {
    s.tasks.forEach((t) => expect(t.dueOn.getTime()).toBeGreaterThanOrEqual(s.buildStart.getTime()));
  });
});

describe('the demo release — scope bends, the date does not', () => {
  it('marks no cut line when the whole plan fits', () => {
    const s = scheduleFor([3, 3, 3]);        // 9 tasks, capacity 7-14
    expect(s.totalTasks).toBe(9);
    expect(s.demoReleaseKey).toBeNull();
    expect(s.roadmapReleaseKeys).toEqual([]);
    expect(s.verdict).toMatch(/the whole thing fits/i);
  });

  it('picks the release they will reach when the plan is too big', () => {
    const s = scheduleFor([4, 4, 4, 4, 4]);  // 20 tasks, capacity 7-14
    expect(s.totalTasks).toBe(20);
    expect(s.demoReleaseKey).not.toBeNull();
    expect(s.roadmapReleaseKeys.length).toBeGreaterThan(0);
  });

  it('never tells a student to cut their ambition', () => {
    // The message is where you will be on stage, plus a roadmap. "Too big",
    // "cut" and "reduce" are the wrong lesson: real projects continue.
    const v = scheduleFor([5, 5, 5, 5]).verdict;
    expect(v).toMatch(/roadmap for after class/i);
    expect(v).not.toMatch(/too big|cut |reduce |trim/i);
  });

  it('keeps demo + roadmap releases disjoint and complete', () => {
    const s = scheduleFor([4, 4, 4, 4, 4]);
    expect(s.roadmapReleaseKeys).not.toContain(s.demoReleaseKey);
    const after = ['r0', 'r1', 'r2', 'r3', 'r4'].slice(
      ['r0', 'r1', 'r2', 'r3', 'r4'].indexOf(s.demoReleaseKey!) + 1,
    );
    expect(s.roadmapReleaseKeys).toEqual(after);
  });

  it('calls a plan between the low and high estimates tight, but does not cut it', () => {
    // 7 build weeks → 7-14. A plan of 8 will probably finish; telling that
    // student they only reach r0 would be pessimistic and wrong. They should
    // still be told it is tight.
    const s = scheduleFor([4, 4]);
    expect(s.totalTasks).toBe(8);
    expect(s.demoReleaseKey).toBeNull();
    expect(s.verdict).toMatch(/tight/i);
  });

  it('cuts at the LOW estimate once a plan is genuinely over', () => {
    // 20 tasks against 7-14. The demo target must be one they are safe to
    // promise on stage, so the cut uses the conservative capacity (7), not 14.
    const s = scheduleFor([4, 4, 4, 4, 4]);
    expect(s.demoReleaseKey).toBe('r1');      // 4 + 4 = 8, first to reach 7
    expect(s.roadmapReleaseKeys).toEqual(['r2', 'r3', 'r4']);
  });
});

describe('demo prep is scheduled work', () => {
  const s = scheduleFor([3, 3]);

  it('fills the dedicated week with real, dated tasks', () => {
    expect(s.prep.length).toBeGreaterThanOrEqual(5);
    s.prep.forEach((p) => {
      expect(p.dueOn.getTime()).toBeGreaterThanOrEqual(s.buildEnd.getTime());
      expect(p.dueOn.getTime()).toBeLessThanOrEqual(s.demoDay.getTime());
    });
  });

  it('covers rehearsal and re-recording, not just "record a demo"', () => {
    const titles = s.prep.map((p) => p.title.toLowerCase()).join(' | ');
    expect(titles).toMatch(/watch it back/);
    expect(titles).toMatch(/rehearse/);
    expect(titles).toMatch(/slides/);
  });

  it('ends on demo day itself', () => {
    expect(iso(s.prep[s.prep.length - 1].dueOn)).toBe(iso(s.demoDay));
    expect(s.prep[s.prep.length - 1].title).toMatch(/Demo Day/i);
  });

  it('orders prep tasks by date', () => {
    const times = s.prep.map((p) => p.dueOn.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('date arithmetic', () => {
  it('counts cohort week 1 as the start date itself', () => {
    expect(iso(weekStart(JULY, 1))).toBe('2026-07-23');
    expect(iso(weekStart(JULY, 4))).toBe('2026-08-13');
    expect(iso(weekStart(JULY, 12))).toBe('2026-10-08');
  });

  it('spreads tasks inside a release rather than stacking them on one day', () => {
    const s = scheduleFor([4]);
    expect(new Set(s.tasks.map((t) => iso(t.dueOn))).size).toBeGreaterThan(1);
  });

  it('keeps task dates non-decreasing across releases', () => {
    const s = scheduleFor([2, 2, 2]);
    const times = s.tasks.map((t) => t.dueOn.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('survives a plan with an empty release', () => {
    const s = scheduleFor([3, 0, 2]);
    expect(s.totalTasks).toBe(5);
    expect(s.tasks).toHaveLength(5);
  });

  it('accepts a different cohort window without code changes', () => {
    // November will have its dates extended by hand before sessions are made.
    const nov = scheduleFor([3, 3], { cohortStart: new Date('2026-11-12T00:00:00.000Z') });
    expect(iso(nov.buildStart)).toBe('2026-12-03');
    expect(iso(nov.demoDay)).toBe('2027-01-28');
  });
});

/**
 * REGRESSION — builds born overdue (July 2026 cohort, 2026-08-18).
 *
 * All 21 July builds published 2026-08-14..2026-08-17, but the schedule is a
 * pure function of the cohort start, so every one of them was dated against a
 * build window that opened on Thursday 2026-08-13 — one to four days BEFORE
 * the plan existed. 44 of 416 dated tasks were overdue the moment a student
 * first opened their Projects page. Taiwo Oludimimu asked about it on the 13th.
 *
 * Two distinct defects, both proved here:
 *  1. no floor at "today" — the window can open before the plan is published
 *  2. no lower clamp on task dates — a release with week_start <= 0 pushes
 *     its first task BEFORE buildStart (Marcus Zeno's STORY-001: 2026-08-08)
 */
describe('a build is never born overdue', () => {
  const PUBLISHED_LATE = new Date('2026-08-18T14:32:07.000Z'); // Tue, cohort week 4

  it('floors the build start at the day the schedule is computed', () => {
    const s = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: PUBLISHED_LATE });
    // Not 2026-08-13 — that Thursday is gone.
    expect(iso(s.buildStart)).toBe('2026-08-20');
  });

  it('keeps the cohort grid: the floored start lands on the cohort weekday', () => {
    // Every anchor in this cohort is a Thursday. A build window that opens on
    // a Tuesday because that is when someone hit publish teaches the student
    // a cadence the class does not run on.
    const s = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: PUBLISHED_LATE });
    expect(s.buildStart.getUTCDay()).toBe(JULY.getUTCDay());
  });

  it('does not skip a week when the schedule is computed on the cohort weekday', () => {
    const onThursday = new Date('2026-08-20T09:00:00.000Z');
    const s = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: onThursday });
    expect(iso(s.buildStart)).toBe('2026-08-20');
  });

  it('gives no task a date in the past', () => {
    const s = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: PUBLISHED_LATE });
    s.tasks.forEach((t) => {
      expect(t.dueOn.getTime()).toBeGreaterThanOrEqual(s.buildStart.getTime());
    });
  });

  it('leaves demo prep and demo day exactly where the cohort put them', () => {
    // The fix compresses the build window. It must NOT move the two dates the
    // cohort actually committed to — prep week and the stage.
    const s = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: PUBLISHED_LATE });
    expect(iso(s.buildEnd)).toBe('2026-10-01');
    expect(iso(s.demoDay)).toBe('2026-10-08');
  });

  it('tells the truth about the shortened window', () => {
    // 6 weeks, not 7. A verdict that still promises 7 build weeks after the
    // window was compressed is the same lie in a different column.
    const s = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: PUBLISHED_LATE });
    expect(s.buildWeeks).toBe(6);
    expect(s.capacity).toEqual({ low: 6 * TASKS_PER_WEEK_LOW, high: 6 * TASKS_PER_WEEK_HIGH });
  });

  it('leaves an on-time publish completely unchanged', () => {
    // asOf before the window opens must be a no-op, or every existing plan
    // silently re-dates itself.
    const early = new Date('2026-07-30T00:00:00.000Z');
    const withAsOf = scheduleFor([3, 3, 3], { cohortStart: JULY, asOf: early });
    const without = scheduleFor([3, 3, 3]);
    expect(iso(withAsOf.buildStart)).toBe(iso(without.buildStart));
    expect(withAsOf.tasks.map((t) => iso(t.dueOn))).toEqual(without.tasks.map((t) => iso(t.dueOn)));
  });

  it('degrades safely when the plan is published after the build window closed', () => {
    const tooLate = new Date('2026-10-05T00:00:00.000Z'); // inside prep week
    const s = scheduleFor([3, 3], { cohortStart: JULY, asOf: tooLate });
    expect(s.buildWeeks).toBeGreaterThanOrEqual(1);
    expect(s.buildStart.getTime()).toBeLessThanOrEqual(s.buildEnd.getTime());
    s.tasks.forEach((t) => expect(t.dueOn.getTime()).toBeLessThanOrEqual(s.buildEnd.getTime()));
  });
});

describe('a release that starts at week 0 does not reach into the past', () => {
  // 5 of the 21 live July plans emitted r0 with week_start: 0. The offset
  // formula ((week_start - 1) / planLastWeek) * span then goes NEGATIVE, and
  // the only clamp in buildSchedule was the upper one. Marcus Zeno's first
  // story landed on 2026-08-08 — five days before his build window opened.
  const zeroStart = [
    { key: 'r0', name: 'Foundation', week_start: 0, week_end: 1 },
    { key: 'r1', name: 'Core', week_start: 1, week_end: 2 },
    { key: 'r2', name: 'Polish', week_start: 2, week_end: 3 },
  ];
  const stories = new Map<string, string[]>([
    ['r0', ['STORY-001', 'STORY-002', 'STORY-003', 'STORY-004']],
    ['r1', ['STORY-005', 'STORY-006']],
    ['r2', ['STORY-007', 'STORY-008']],
  ]);

  it('never dates a task before the build start', () => {
    const s = buildSchedule({ window: { cohortStart: JULY }, releases: zeroStart, storiesByRelease: stories });
    s.tasks.forEach((t) => {
      expect(iso(t.dueOn) >= iso(s.buildStart)).toBe(true);
    });
  });

  it('still spreads the rest of the release instead of stacking it on day one', () => {
    const s = buildSchedule({ window: { cohortStart: JULY }, releases: zeroStart, storiesByRelease: stories });
    expect(new Set(s.tasks.map((t) => iso(t.dueOn))).size).toBeGreaterThan(1);
  });
});
