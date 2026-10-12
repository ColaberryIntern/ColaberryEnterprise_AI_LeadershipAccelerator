/**
 * buildSchedule — PURE, total deadline-aware release scheduling for the Gov Build step.
 *
 * Given the deterministic build plan's releases (in order) and a submission deadline, assign each
 * release a {startDate, endDate} window so the LAST release ends ON/BEFORE the deadline, evenly
 * back-scheduled from the deadline with a small submission buffer, starting today. This does NOT
 * change the requirement-cited story spine (deriveGovBuildPlan) — it is a read-model overlay that
 * lets the Build step read as "scheduled to finish before the deadline".
 *
 * No I/O, no React, no Date.now() side-channel — `now` is passed in, so it is deterministic and
 * unit-testable. When the deadline is unknown, windows are laid out forward from today at a fixed
 * cadence and flagged `unscheduled` (there is nothing to finish before).
 */

export interface ReleaseLike { key: string; name: string }

export interface ScheduledRelease extends ReleaseLike {
  /** ISO date (YYYY-MM-DD) the release window opens. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) the release window closes. */
  endDate: string;
}

export interface ScheduleResult {
  releases: ScheduledRelease[];
  /** The deadline the windows were scheduled against (ISO date), or null when none was known. */
  deadline: string | null;
  /** True when no deadline was known — windows are a forward cadence from today, not back-scheduled. */
  unscheduled: boolean;
  /** True when the deadline leaves real room to finish before it (last end ≤ deadline − buffer and ≥ today). */
  feasible: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBMISSION_BUFFER_DAYS = 2;   // finish this many days BEFORE the deadline, to leave submission slack
const DEFAULT_CADENCE_DAYS = 14;    // forward window length per release when there is no deadline

function toDate(d: Date | string | null | undefined): Date | null {
  if (d == null) return null;
  const parsed = d instanceof Date ? d : new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Midnight UTC of the given instant — windows are date-granular. */
function startOfDay(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS) * DAY_MS;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Assign each release an ordered, non-overlapping {startDate, endDate} window.
 * - With a deadline: back-schedule so the last window ends at (deadline − buffer), never after the
 *   deadline; windows split the span from today to that point evenly. If the deadline leaves no room
 *   (it is today or in the past), windows collapse to the latest feasible point and `feasible` is false,
 *   but the last end is STILL ≤ the deadline.
 * - Without a deadline: lay windows forward from today at DEFAULT_CADENCE_DAYS each, `unscheduled: true`.
 */
export function scheduleReleases(
  releases: ReleaseLike[],
  opts: { deadline: Date | string | null; now?: Date | string },
): ScheduleResult {
  const list = Array.isArray(releases) ? releases : [];
  const nowDate = toDate(opts.now) ?? new Date();
  const now0 = startOfDay(nowDate);
  const deadlineDate = toDate(opts.deadline);

  // No deadline → forward cadence, flagged unscheduled.
  if (!deadlineDate) {
    const scheduled: ScheduledRelease[] = list.map((r, i) => ({
      key: r.key, name: r.name,
      startDate: iso(now0 + i * DEFAULT_CADENCE_DAYS * DAY_MS),
      endDate: iso(now0 + (i + 1) * DEFAULT_CADENCE_DAYS * DAY_MS),
    }));
    return { releases: scheduled, deadline: null, unscheduled: true, feasible: false };
  }

  const deadline0 = startOfDay(deadlineDate);
  // Target the buffered finish line, but never schedule an end AFTER the deadline itself.
  const targetEnd = Math.min(deadline0, deadline0 - SUBMISSION_BUFFER_DAYS * DAY_MS);
  const feasible = targetEnd > now0;
  // Span to divide. When infeasible (deadline today/past), clamp to zero so windows collapse at targetEnd —
  // ordered and non-overlapping, and the last end is still ≤ the deadline.
  const spanStart = feasible ? now0 : targetEnd;
  const spanEnd = targetEnd;
  const n = list.length;

  const scheduled: ScheduledRelease[] = list.map((r, i) => {
    const start = n > 0 ? spanStart + Math.round(((spanEnd - spanStart) * i) / n) : spanStart;
    const end = n > 0 ? spanStart + Math.round(((spanEnd - spanStart) * (i + 1)) / n) : spanEnd;
    return { key: r.key, name: r.name, startDate: iso(start), endDate: iso(end) };
  });

  return { releases: scheduled, deadline: iso(deadline0), unscheduled: false, feasible };
}
