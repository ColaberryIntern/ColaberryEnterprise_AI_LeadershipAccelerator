/**
 * scheduleFromBoard — a Schedule built from a project's ALREADY-materialized task dates.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `.colaberry/plan.json` gets its dates at render time from `scheduleForEnrollment`, which
 * forward-schedules the plan's release week numbers from a cohort start / publish anchor. That is
 * right for a normal SBP build, whose tasks were dated by that same function. It is WRONG for a GOV
 * build: a gov build's tasks are dated by `govSyntheticSchedule`, which BACK-schedules to finish the
 * day before the solicitation deadline. Dating plan.json with the cohort scheduler therefore disagrees
 * with the task table it is supposed to mirror — the symptom Omolola saw on Saratoga, every release
 * reading the same wrong day.
 *
 * The board is the source of truth for a gov build's dates. This reads them back: one Schedule whose
 * task due dates ARE the `student_tasks.due_on` already on the board, so plan.json and the tasks agree.
 *
 * PURE core (`scheduleFromBoardTasks`) so it is testable from a literal; a thin async loader reads the
 * rows. Returns null when no STORY task carries a due date, so the caller falls back to the cohort
 * scheduler exactly as before — a gov build with undated tasks is no worse off than today.
 */
import type { Schedule, ScheduledTask } from './buildSchedule';

/** The board columns this needs. `due_on` is `student_tasks.due_on` (a Date or YYYY-MM-DD string). */
export interface BoardTaskRow {
  story_id: string | null;
  release_key: string | null;
  due_on: string | Date | null;
  title?: string | null;
}

const DAY = 86_400_000;

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build a Schedule from the materialized board rows. STORY-* tasks with a due date become the schedule's
 * tasks (so each story's plan.json `due_on` is its real board date); PREP-* tasks become the prep block
 * and set demo day. Null when no dated story task exists. PURE.
 */
export function scheduleFromBoardTasks(rows: BoardTaskRow[]): Schedule | null {
  const storyTasks: ScheduledTask[] = [];
  for (const r of rows) {
    if (typeof r.story_id !== 'string' || !/^STORY-/.test(r.story_id)) continue;
    const dueOn = toDate(r.due_on);
    if (!dueOn) continue;
    storyTasks.push({ storyId: r.story_id, releaseKey: String(r.release_key ?? 'r0'), dueOn });
  }
  if (storyTasks.length === 0) return null;

  const prep = rows
    .filter((r) => typeof r.story_id === 'string' && /^PREP-/.test(r.story_id) && toDate(r.due_on))
    .map((r) => ({ key: String(r.story_id), title: String(r.title ?? r.story_id), dueOn: toDate(r.due_on)! }))
    .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());

  const storyTimes = storyTasks.map((t) => t.dueOn.getTime());
  const buildStart = new Date(Math.min(...storyTimes));
  const buildEnd = new Date(Math.max(...storyTimes));
  const demoDay = prep.length ? prep[prep.length - 1].dueOn : buildEnd;
  const buildWeeks = Math.max(1, Math.round((buildEnd.getTime() - buildStart.getTime()) / (7 * DAY)));

  return {
    buildStart,
    buildEnd,
    demoDay,
    buildWeeks,
    // Capacity/verdict are the cohort scheduler's "will it fit" advice; a gov build is already dated to
    // its deadline, so there is no cut line to compute. Report the plain window and no verdict.
    capacity: { low: buildWeeks, high: buildWeeks * 2 },
    totalTasks: storyTasks.length,
    demoReleaseKey: null,
    roadmapReleaseKeys: [],
    verdict: '',
    tasks: storyTasks,
    prep,
  };
}

/**
 * Load the board rows for a project and build the board-dated Schedule. Returns null on any problem or
 * when the board has no dated story task, so the caller falls back to the cohort scheduler.
 */
export async function scheduleFromBoard(projectId: string): Promise<Schedule | null> {
  try {
    const { default: StudentTask } = await import('../../models/StudentTask');
    const rows: any[] = await StudentTask.findAll({ where: { project_id: projectId } });
    return scheduleFromBoardTasks(
      rows.map((r) => ({ story_id: r.story_id, release_key: r.release_key, due_on: r.due_on, title: r.title })),
    );
  } catch {
    return null;
  }
}
