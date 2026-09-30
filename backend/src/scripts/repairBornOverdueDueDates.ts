#!/usr/bin/env node
/**
 * repairBornOverdueDueDates — re-date the builds that were born overdue.
 *
 * WHAT HAPPENED (July 2026 cohort, found 2026-08-18):
 *   The capstone schedule is a pure function of `cohorts.start_date`. July's
 *   build window opens on cohort week 4 — Thursday 2026-08-13. All 21 builds
 *   were published 2026-08-14..2026-08-17, so every one of them was dated
 *   against a window that had already opened. 44 of 416 dated tasks were
 *   overdue the moment a student first opened their Projects page, and
 *   STORY-000 — the very first thing they are asked to run — was overdue for
 *   18 of the 21. Taiwo Oludimimu asked about it on the 13th.
 *
 *   A second defect stacked on top: 5 plans emitted their first release with
 *   `week_start: 0`, which made the offset arithmetic negative and pushed
 *   tasks BEFORE the build start. One student's first story was dated five
 *   days before his window opened.
 *
 * BOTH ARE FIXED IN `buildSchedule.ts`. This script exists only to repair the
 * rows that were written before that fix landed. It computes nothing of its
 * own: it calls the same `scheduleForEnrollment` the publisher calls, with the
 * plan's own `published_at`, and writes the answer. That is what makes it
 * idempotent and what makes it agree with the next republish instead of
 * fighting it.
 *
 * SAFETY — this script writes exactly two columns, `due_on` and
 * `due_baseline_on`, and nothing else. It will not touch a row that:
 *   - a student has marked `complete`, or
 *   - carries a `verified_at`, or
 *   - belongs to the demo-prep week (those dates do not move), or
 *   - carries a story the current plan no longer contains, or
 *   - would move EARLIER (a repair that pulls a deadline in is a bug).
 *
 * WHY THE BASELINE MOVES TOO. `due_baseline_on` is normally written once and
 * never rewritten, so that slippage stays visible. Here the baseline itself is
 * the broken value — it was never a date any student saw and agreed to, it was
 * a date generated against a window that had already closed. Measuring
 * slippage from it would mean every student starts the term already behind on
 * a commitment nobody made. So the baseline is reset with the due date, once,
 * and this is the only script permitted to do that.
 *
 * FAILURE PATH. Dry run by default; `--apply` is required to write. Each
 * project is its own transaction, so a failure part way through leaves earlier
 * projects correctly repaired and later ones untouched — and re-running
 * finishes the job, because the script is idempotent. No retries, no backoff:
 * this is an operator-run one-shot, and a failure should stop and be read, not
 * be swallowed and retried.
 *
 *   npx ts-node src/scripts/repairBornOverdueDueDates.ts            # dry run
 *   npx ts-node src/scripts/repairBornOverdueDueDates.ts --apply    # write
 */
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { BuildPlan } from '../services/sbp/planContract';
import { scheduleForEnrollment } from '../services/sbp/scheduleForEnrollment';
import { COMMAND_CENTER_STORY_ID } from '../services/sbp/commandCenterStory';

const APPLY = process.argv.includes('--apply');
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface TaskRow {
  id: string;
  story_id: string;
  release_key: string | null;
  status: string;
  verified_at: string | null;
  due_on: string | null;
  due_baseline_on: string | null;
}

interface Change {
  student: string; story_id: string; from: string | null; to: string; shiftDays: number;
}

/** Why a row was left alone. Counted and printed — silent skips hide bugs. */
type SkipReason = 'complete' | 'verified' | 'prep' | 'not_in_plan' | 'no_schedule'
  | 'unchanged' | 'would_move_earlier' | 'undated';

async function main(): Promise<void> {
  const projects = await sequelize.query<{
    project_id: string; enrollment_id: string; full_name: string;
    plan_json: BuildPlan; published_at: string | null;
  }>(
    `SELECT bp.project_id, p.enrollment_id, e.full_name, bp.plan_json, bp.published_at
       FROM build_plans bp
       JOIN projects p     ON p.id = bp.project_id
       JOIN enrollments e  ON e.id = p.enrollment_id
      WHERE bp.status = 'published'
      ORDER BY e.full_name`,
    { type: QueryTypes.SELECT },
  );

  const changes: Change[] = [];
  const skips: Record<SkipReason, number> = {
    complete: 0, verified: 0, prep: 0, not_in_plan: 0, no_schedule: 0,
    unchanged: 0, would_move_earlier: 0, undated: 0,
  };

  for (const proj of projects) {
    const schedule = await scheduleForEnrollment(
      proj.enrollment_id, proj.plan_json, null, proj.published_at,
    );
    if (!schedule) { skips.no_schedule += 1; continue; }

    // The full story -> date map the publisher would write, assembled exactly
    // the way materializeTasks assembles it: STORY-000 lands on the build
    // start, prep tasks come from the prep block, everything else from tasks.
    const want = new Map<string, Date>();
    want.set(COMMAND_CENTER_STORY_ID, schedule.buildStart);
    schedule.tasks.forEach((t) => want.set(t.storyId, t.dueOn));
    schedule.prep.forEach((p) => want.set(p.key, p.dueOn));

    const tasks = await sequelize.query<TaskRow>(
      `SELECT id, story_id, release_key, status, verified_at, due_on, due_baseline_on
         FROM student_tasks WHERE project_id = :pid ORDER BY story_id`,
      { type: QueryTypes.SELECT, replacements: { pid: proj.project_id } },
    );

    const writes: Array<{ id: string; to: string }> = [];
    for (const t of tasks) {
      if (t.status === 'complete') { skips.complete += 1; continue; }
      if (t.verified_at) { skips.verified += 1; continue; }
      if ((t.release_key ?? '') === 'prep') { skips.prep += 1; continue; }
      if (!t.due_on) { skips.undated += 1; continue; }

      const target = want.get(t.story_id);
      if (!target) { skips.not_in_plan += 1; continue; }

      const to = iso(target);
      if (to === t.due_on) { skips.unchanged += 1; continue; }
      if (to < t.due_on) { skips.would_move_earlier += 1; continue; }

      const shiftDays = Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${t.due_on}T00:00:00Z`)) / 86_400_000,
      );
      changes.push({ student: proj.full_name, story_id: t.story_id, from: t.due_on, to, shiftDays });
      writes.push({ id: t.id, to });
    }

    if (APPLY && writes.length) {
      await sequelize.transaction(async (tx: Transaction) => {
        for (const w of writes) {
          // Two columns. Named explicitly rather than built from an object so
          // that no future edit can widen this statement by accident.
          await sequelize.query(
            `UPDATE student_tasks
                SET due_on = :d, due_baseline_on = :d, updated_at = NOW()
              WHERE id = :id
                AND status <> 'complete'
                AND verified_at IS NULL`,
            { replacements: { d: w.to, id: w.id }, transaction: tx },
          );
        }
      });
    }
  }

  const moved = changes.length;
  const byShift: Record<number, number> = {};
  changes.forEach((c) => { byShift[c.shiftDays] = (byShift[c.shiftDays] ?? 0) + 1; });

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'sbp-date-repair',
    event: APPLY ? 'due_dates_repaired' : 'due_dates_dry_run',
    outcome: 'success',
    context: {
      mode: APPLY ? 'APPLY' : 'DRY-RUN',
      projects: projects.length,
      rows_moved: moved,
      skips,
      shift_histogram_days: byShift,
      earliest_new_date: changes.reduce<string | null>((m, c) => (!m || c.to < m ? c.to : m), null),
      latest_new_date: changes.reduce<string | null>((m, c) => (!m || c.to > m ? c.to : m), null),
    },
  }, null, 2));

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN — nothing written'}: ${moved} rows\n`);
  const byStudent = new Map<string, Change[]>();
  changes.forEach((c) => byStudent.set(c.student, [...(byStudent.get(c.student) ?? []), c]));
  for (const [student, cs] of [...byStudent].sort((a, b) => a[0].localeCompare(b[0]))) {
    const max = Math.max(...cs.map((c) => c.shiftDays));
    console.log(`  ${student.padEnd(26)} ${String(cs.length).padStart(3)} rows  max +${max}d  `
      + `${cs.reduce((m, c) => (c.to < m ? c.to : m), '9999-99-99')} .. `
      + `${cs.reduce((m, c) => (c.to > m ? c.to : m), '0000-00-00')}`);
  }
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'sbp-date-repair',
      event: 'due_date_repair_failed', outcome: 'failure',
      error_class: err?.name ?? 'Error', context: { message: err?.message },
    }));
    console.error(err?.stack ?? err);
    process.exit(1);
  });
