/**
 * backfillPrepTaskTitles — rename the demo-prep tasks after the video each one
 * asks for, on builds that already exist.
 *
 * WHY THIS EXISTS
 *
 * Ali, 2026-10-24, looking at the Projects list: "The step names don't match
 * the video names." PREP-1 read "Write the Demo Narrative: the Problem, the One
 * Moment, the Guardrail" while the Studio asked it for a Project Introduction
 * video. The titles described stages of one demo — narrative, run-through,
 * slides, rehearse, final — on tasks that are now one specific KIND of
 * presentation each.
 *
 * `buildSchedule.prepTasks` carries the new names, but that only affects tasks
 * materialised from now on. Every already-published build keeps the title it
 * was created with, so without this script a cohort mid-programme would be
 * split between old names and new — worse than either alone.
 *
 * PREP-1 ALSO HAD TWO NAMES. `studentTitleFor` overrode it to "Tell Your
 * Project's Story" and exactly one component called that override, so the
 * Studio sidebar and the task list disagreed about what the same task was
 * called. Renaming the STORED title is what makes every surface agree.
 *
 * ── WHY A SCRIPT, AND NOT A SCHEMA STATEMENT ────────────────────────────────
 *
 * This was written twice in the wrong place first, and both times a guard test
 * caught it, correctly:
 *
 *   1. In `ensurePresentationStudioSchema` — which has a test forbidding any
 *      write to `student_tasks`, because the Studio must never be able to mint
 *      task completion. A title is not completion, but the boundary is the
 *      point: once the Studio can write to that table, the guard means nothing.
 *   2. In `ensureSbpSchema` — which owns `student_tasks`, but whose test allows
 *      only `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. A schema-ensure module
 *      adds structure; it does not rewrite rows.
 *
 * A one-off data correction belongs in a script that someone runs deliberately
 * and can read the output of. That is this file.
 *
 * ── WHAT IT TOUCHES ─────────────────────────────────────────────────────────
 *
 * `title` only. Completion, evidence, points and due dates all key on
 * `story_id`, never on this text, so the rename cannot disturb the tasks that
 * are already verified. It does not touch `description`, `narrative` or
 * `build`: those carry the task's instructions, which are a separate question
 * from what it is called.
 *
 * Idempotent on the value — a row already holding the new title is skipped, so
 * running it twice changes nothing the second time.
 *
 * Usage:
 *   node dist/scripts/backfillPrepTaskTitles.js            # dry run, prints the plan
 *   node dist/scripts/backfillPrepTaskTitles.js --write    # applies it
 */
import { sequelize } from '../config/database';

/**
 * The names, which must agree with `buildSchedule.prepTasks`. A test asserts
 * they do — two copies of a fact are only safe while something fails when they
 * diverge.
 */
const TITLES: ReadonlyArray<{ storyId: string; title: string }> = [
  { storyId: 'PREP-1', title: 'Record Your Project Introduction' },
  { storyId: 'PREP-2', title: 'Record Your Working-System Demo' },
  { storyId: 'PREP-3', title: 'Record Your AI Visual Presentation' },
  { storyId: 'PREP-4', title: 'Record Your Stakeholder Update' },
  { storyId: 'PREP-5', title: 'Record Your Final Showcase' },
  { storyId: 'PREP-6', title: 'Present at Demo Day' },
];

export interface BackfillRow {
  storyId: string;
  title: string;
  wouldChange: number;
  changed: number;
}

/** What a run would do, or did. Pure of process concerns so a test can call it. */
export async function backfillPrepTaskTitles(write: boolean): Promise<BackfillRow[]> {
  const out: BackfillRow[] = [];

  for (const { storyId, title } of TITLES) {
    const [countRows] = await sequelize.query(
      `SELECT COUNT(*)::int AS n
         FROM student_tasks
        WHERE story_id = :storyId
          AND title IS DISTINCT FROM :title`,
      { replacements: { storyId, title } },
    ) as [Array<{ n: number }>, unknown];

    const wouldChange = Number(countRows?.[0]?.n ?? 0);
    let changed = 0;

    if (write && wouldChange > 0) {
      const [rows] = await sequelize.query(
        `UPDATE student_tasks
            SET title = :title, updated_at = NOW()
          WHERE story_id = :storyId
            AND title IS DISTINCT FROM :title
        RETURNING id`,
        { replacements: { storyId, title } },
      ) as [Array<{ id: string }>, unknown];
      changed = rows?.length ?? 0;
    }

    out.push({ storyId, title, wouldChange, changed });
  }

  return out;
}

/* istanbul ignore next -- the CLI wrapper; the work above is what is tested. */
async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const rows = await backfillPrepTaskTitles(write);

  console.log(write ? 'APPLYING' : 'DRY RUN — pass --write to apply');
  for (const r of rows) {
    console.log(
      `  ${r.storyId}  ${write ? `renamed ${r.changed}` : `would rename ${r.wouldChange}`}`
      + `  ->  ${r.title}`,
    );
  }
  const total = rows.reduce((n, r) => n + (write ? r.changed : r.wouldChange), 0);
  console.log(write ? `renamed ${total} task(s)` : `${total} task(s) would be renamed`);
  await sequelize.close();
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err) => {
    console.error('backfillPrepTaskTitles failed:', err);
    process.exit(1);
  });
}
