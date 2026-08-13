/**
 * buildSchedule — turn a plan's release week numbers into real calendar dates.
 *
 * PURE. No I/O, no clock reads except the one the caller passes in, so every
 * date in here is reproducible in a test.
 *
 * THE SHAPE OF A COHORT (July 2026, the first one to use this):
 *
 *   week 1        cohort starts (Thu)
 *   week 3/4      the capstone starts — projects are separate deliverables,
 *                 not tied to the class content
 *   ...           build
 *   week 11 Thu   demo prep begins — one dedicated week
 *   week 12 Thu   presentations
 *
 * Two things follow from that and they are the whole design:
 *
 *  1. **The timeline is a constant, not a choice.** Asking a student to pick
 *     6/8/12 weeks was asking them to decide something the cohort already
 *     decided. What actually varies is how much they take on.
 *
 *  2. **So scope bends, not the deadline.** At a realistic 1-2 tasks a week,
 *     the build window holds a fixed number of tasks. When a plan is bigger
 *     than that we do NOT cut it — we mark the release that fits as the DEMO
 *     RELEASE and everything after becomes the post-class roadmap. Real
 *     projects continue after a demo; pretending otherwise teaches the wrong
 *     lesson, and "your ambition is too big" is a worse message than "here is
 *     where you'll be on stage, and here is what comes next".
 */

/** What a student can realistically finish in a week alongside coursework. */
export const TASKS_PER_WEEK_LOW = 1;
export const TASKS_PER_WEEK_HIGH = 2;

/** Cohort week the capstone starts, and the two week-12 anchors. */
export const DEFAULT_START_WEEK = 4;
export const DEFAULT_PREP_WEEK = 11;
export const DEFAULT_DEMO_WEEK = 12;

export interface CohortWindow {
  /** Cohort week 1, day 1. */
  cohortStart: Date;
  startWeek?: number;
  prepWeek?: number;
  demoWeek?: number;
}

export interface ScheduleInput {
  window: CohortWindow;
  /** Releases in order, with the plan's week numbers (relative, 1-based). */
  releases: Array<{ key: string; name: string; week_start: number; week_end: number }>;
  /** Story ids per release key, in plan order. */
  storiesByRelease: Map<string, string[]>;
}

export interface ScheduledTask {
  storyId: string;
  releaseKey: string;
  dueOn: Date;
}

export interface Schedule {
  /** First build day. */
  buildStart: Date;
  /** Last day of build — demo prep begins here. */
  buildEnd: Date;
  demoDay: Date;
  buildWeeks: number;
  /** What the window can hold at 1-2 tasks/week. */
  capacity: { low: number; high: number };
  totalTasks: number;
  /** The release a student will realistically reach. Null when everything fits. */
  demoReleaseKey: string | null;
  /** Releases beyond the demo release — the post-class roadmap. */
  roadmapReleaseKeys: string[];
  /** Honest one-liner for the student, built from the numbers above. */
  verdict: string;
  tasks: ScheduledTask[];
  prep: Array<{ key: string; title: string; dueOn: Date }>;
}

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addWeeks = (d: Date, n: number) => addDays(d, n * 7);

/** Start of cohort week N (week 1 === cohortStart). */
export function weekStart(cohortStart: Date, week: number): Date {
  return addWeeks(cohortStart, Math.max(0, week - 1));
}

/**
 * The demo-prep tasks. Fixed, not generated — preparing to present is real work
 * with its own deadlines, and a plan that ends at "record a demo" underestimates
 * it. Spread across the dedicated prep week.
 */
export function prepTasks(prepStart: Date, demoDay: Date): Array<{ key: string; title: string; dueOn: Date }> {
  const span = Math.max(1, Math.round((demoDay.getTime() - prepStart.getTime()) / DAY));
  const at = (fraction: number) => addDays(prepStart, Math.round(span * fraction));
  return [
    { key: 'PREP-1', title: 'Write the demo narrative: the problem, the one moment, the guardrail', dueOn: at(0.15) },
    { key: 'PREP-2', title: 'Record a first run-through and watch it back', dueOn: at(0.35) },
    { key: 'PREP-3', title: 'Build the slides — what it does, who for, the number it moves', dueOn: at(0.55) },
    { key: 'PREP-4', title: 'Rehearse with one other person and take their notes', dueOn: at(0.75) },
    { key: 'PREP-5', title: 'Record the final demo video', dueOn: at(0.9) },
    { key: 'PREP-6', title: 'Present at Demo Day', dueOn: demoDay },
  ];
}

/**
 * Build the schedule.
 *
 * Task due dates land at the END of their release's slice of the build window,
 * spread so tasks inside one release do not all land the same day. The plan's
 * own week numbers set the proportions; the cohort window sets the real dates.
 */
export function buildSchedule(input: ScheduleInput): Schedule {
  const { cohortStart } = input.window;
  const startWeek = input.window.startWeek ?? DEFAULT_START_WEEK;
  const prepWeek = input.window.prepWeek ?? DEFAULT_PREP_WEEK;
  const demoWeek = input.window.demoWeek ?? DEFAULT_DEMO_WEEK;

  const buildStart = weekStart(cohortStart, startWeek);
  const buildEnd = weekStart(cohortStart, prepWeek);
  const demoDay = weekStart(cohortStart, demoWeek);

  const buildWeeks = Math.max(1, Math.round((buildEnd.getTime() - buildStart.getTime()) / (7 * DAY)));
  const capacity = { low: buildWeeks * TASKS_PER_WEEK_LOW, high: buildWeeks * TASKS_PER_WEEK_HIGH };

  const ordered = [...input.releases].sort((a, b) => a.key.localeCompare(b.key));
  const totalTasks = ordered.reduce((n, r) => n + (input.storiesByRelease.get(r.key)?.length ?? 0), 0);

  // Three states, not two. The middle one matters: a plan between the low and
  // high estimates WILL probably finish, and telling that student they only
  // reach r1 is pessimistic and wrong. But they should know it is tight.
  //
  //   total <= low      comfortable — no cut line
  //   low < total <= high   tight — no cut line, but say so
  //   total > high      over — cut, and cut at the LOW estimate so the demo
  //                     target is one they are safe to promise
  const fit: 'comfortable' | 'tight' | 'over' =
    totalTasks <= capacity.low ? 'comfortable'
      : totalTasks <= capacity.high ? 'tight'
        : 'over';

  let demoReleaseKey: string | null = null;
  const roadmapReleaseKeys: string[] = [];

  if (fit === 'over') {
    // Walk releases until the CONSERVATIVE capacity is used up. A demo target
    // built on someone's best week is a target they miss on stage.
    let running = 0;
    for (const rel of ordered) {
      const n = input.storiesByRelease.get(rel.key)?.length ?? 0;
      if (demoReleaseKey === null) {
        running += n;
        if (running >= capacity.low) demoReleaseKey = rel.key;
      } else {
        roadmapReleaseKeys.push(rel.key);
      }
    }
    // Pathological: one enormous release. It is still the demo release.
    if (demoReleaseKey === null && ordered.length) demoReleaseKey = ordered[ordered.length - 1].key;
  }

  // Dates. The window is divided by the plan's own week proportions so a
  // release the model thought was long gets more calendar.
  const planLastWeek = Math.max(...ordered.map((r) => r.week_end), 1);
  const buildSpanDays = Math.max(1, (buildEnd.getTime() - buildStart.getTime()) / DAY);

  const tasks: ScheduledTask[] = [];
  for (const rel of ordered) {
    const ids = input.storiesByRelease.get(rel.key) ?? [];
    if (!ids.length) continue;
    const relStartDay = ((rel.week_start - 1) / planLastWeek) * buildSpanDays;
    const relEndDay = (rel.week_end / planLastWeek) * buildSpanDays;
    const slice = Math.max(1, relEndDay - relStartDay);

    ids.forEach((storyId, i) => {
      // Spread within the release, last task landing on the release's end date.
      const offset = relStartDay + (slice * (i + 1)) / ids.length;
      const due = addDays(buildStart, Math.round(offset));
      tasks.push({ storyId, releaseKey: rel.key, dueOn: due > buildEnd ? buildEnd : due });
    });
  }

  return {
    buildStart, buildEnd, demoDay, buildWeeks, capacity, totalTasks,
    demoReleaseKey, roadmapReleaseKeys,
    verdict: verdictFor(totalTasks, capacity, buildWeeks, demoReleaseKey, ordered, fit),
    tasks,
    prep: prepTasks(buildEnd, demoDay),
  };
}

/**
 * The sentence the student reads. Written to be honest rather than encouraging:
 * the point is that they find out now, not in week 9.
 */
function verdictFor(
  total: number,
  capacity: { low: number; high: number },
  weeks: number,
  demoReleaseKey: string | null,
  releases: Array<{ key: string; name: string }>,
  fit: 'comfortable' | 'tight' | 'over',
): string {
  const window = `You have ${weeks} build weeks — realistically ${capacity.low}–${capacity.high} tasks.`;
  if (fit === 'comfortable') {
    return `${window} Your plan has ${total}, so the whole thing fits. Demo the finished build.`;
  }
  if (fit === 'tight') {
    return `${window} Your plan has ${total}, so the whole thing fits — but it is tight. `
      + `Keep the pace up and you demo the finished build.`;
  }
  const rel = releases.find((r) => r.key === demoReleaseKey);
  const name = rel ? `${rel.key.toUpperCase()} — ${rel.name}` : demoReleaseKey;
  return `${window} Your plan has ${total}, so you will reach ${name}. `
    + `That is what you demo. The releases after it are your roadmap for after class — `
    + `most real projects keep going, and yours should.`;
}
