/**
 * Pure scheduling-window helpers for gov build plans — kept in their own module (not in govBuildPlanAI)
 * so that materialization can use them without depending on the AI-plan module, which tests mock.
 */
import type { Schedule } from '../sbp/buildSchedule';

const DAY_MS = 86_400_000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The ship-by date: the day BEFORE the deadline, never earlier than today. Null when no deadline is known.
 * The build/proposal must land before the cutoff, and a plan that finishes ON the deadline leaves no margin —
 * so we target the day before (the owner's rule: "day before the deadline; it's already last minute").
 */
export function govShipByDate(deadline: Date | null | undefined, now0: Date): Date | null {
  if (!deadline) return null;
  const dayBefore = startOfUtcDay(new Date(startOfUtcDay(deadline).getTime() - DAY_MS));
  return dayBefore.getTime() < now0.getTime() ? now0 : dayBefore;
}

/**
 * Linearly rescale every date in a schedule onto the window [now0, ship-by], so the plan finishes the day
 * before the deadline instead of spreading over the plan's natural weeks (which can land years out — the
 * "pushed to 2027" bug). Order and relative spacing are preserved; the last STORY lands exactly on ship-by.
 * PURE, and the identity function when no deadline is known (keeps the natural-weeks forward estimate).
 */
export function rescaleScheduleToDeadline(schedule: Schedule, now0: Date, deadline: Date | null): Schedule {
  const shipBy = govShipByDate(deadline, now0);
  if (!shipBy) return schedule;
  const toT = (d: Date): number => startOfUtcDay(d).getTime();
  // Anchor on the STORY dates (the real build work), so the LAST story lands exactly on ship-by. Demo/prep
  // sit naturally after the last story, so they map past ship-by and clamp onto it (demo = the day before).
  const taskT = schedule.tasks.map((t) => toT(t.dueOn));
  if (taskT.length === 0) return schedule; // nothing to place
  const minT = Math.min(...taskT);
  const maxT = Math.max(...taskT);
  const span = maxT - minT;
  const target = shipBy.getTime() - now0.getTime();
  const map = (d: Date): Date => {
    const frac = span > 0 ? (toT(d) - minT) / span : 1; // single-date plans collapse onto ship-by
    const nd = now0.getTime() + Math.round(frac * target);
    return new Date(Math.min(Math.max(nd, now0.getTime()), shipBy.getTime()));
  };
  return {
    ...schedule,
    buildStart: map(schedule.buildStart),
    buildEnd: map(schedule.buildEnd),
    demoDay: map(schedule.demoDay),
    tasks: schedule.tasks.map((t) => ({ ...t, dueOn: map(t.dueOn) })),
    prep: schedule.prep.map((p) => ({ ...p, dueOn: map(p.dueOn) })),
  };
}
