/**
 * backfillStory000Prompt — regenerate the STORY-000 prompt AND its acceptance
 * criteria for every already-published build.
 *
 * WHY THIS EXISTS
 * Updating `commandCenterStory.ts` changes what NEW publishes produce. It does
 * nothing for a student who already published: their prompt was rendered once,
 * at publish time, and stored on `student_tasks.build`. Every student already
 * on a build would keep reading the old text forever.
 *
 * ── WHY IT IS TWO COLUMNS NOW, AND WHY "ONE COLUMN" WAS THE BUG ──────────────
 *
 * This header used to read "ONE COLUMN. ONE ROW PER BUILD. Nothing else, ever."
 * That intent is precisely what made this script wrong, and it is worth keeping
 * the wreckage on the record.
 *
 * #1490 took `COMMAND_CENTER_ACCEPTANCE` from three criteria to five. This
 * script swept all 20 published builds, rewrote `build` — whose "Done means"
 * section renders from that same constant — reported every build updated, and
 * was telling the truth about the only column it could see. It never imported
 * the constant, never selected `acceptance`, and so had no visibility into the
 * column it was desyncing.
 *
 * Live result on 19 of 20 builds: a prompt listing FIVE criteria, a portal
 * checklist reading THREE, and a verifier grading against FIVE. Three things
 * done correctly, three boxes ticked, and a student held at `submitted 3/5`
 * against two criteria their checklist never showed them.
 *
 * The script was convergent on `build` and NON-convergent on `acceptance`: no
 * number of re-runs could ever have repaired it, because the row it had broken
 * reported `unchanged` on every subsequent pass. That is the property that made
 * this invisible, and it is why the remedy is structural rather than one more
 * column in the UPDATE. Both columns now come from a single
 * `commandCenterTaskColumns()` call, the same one `materializeTasks` writes
 * from, so there is no longer a place where this script can hold the prompt
 * without also holding the criteria that prompt renders.
 *
 * WHAT IT TOUCHES — still deliberately as narrow as it can be:
 *
 *     UPDATE student_tasks SET build = <freshly rendered prompt>,
 *                              acceptance = <the current criteria>
 *      WHERE story_id = 'STORY-000' AND project_id = ...
 *
 * TWO COLUMNS, AND THEY MOVE TOGETHER OR NOT AT ALL. Nothing else.
 *
 *   - `status` is NOT touched. A finished Story 000 stays finished.
 *   - `verified_at`, `verified_by`, `verified_ref`, `verification_json` are NOT
 *     touched, so no verification is undone and no evidence is disturbed.
 *   - Points are NOT touched. Awards live in `evidence_records`, which this
 *     script never opens.
 *   - `due_on` / `due_baseline_on` are NOT touched, so nobody's deadline moves.
 *
 * A wider option existed and was REJECTED: `materializePlanAsTasks` already
 * refreshes STORY-000 as a side effect, and calling it would have been three
 * lines. It also re-writes every other task row on the project. Re-materialising
 * twenty live builds to change one text column is a blast radius nobody asked
 * for.
 *
 * NO REPO WRITES. STORY-000 is deliberately kept out of `plan.stories`, and
 * `renderDocs` iterates `plan.stories` — so the Command Center prompt has NEVER
 * been rendered into a student repo. There is no `docs/stories/STORY-000.md` to
 * clobber, no CLAUDE.md splice to perform, and no bot commit to make. Starting
 * to write repo files as part of a prompt-text backfill would be new behaviour
 * smuggled in under a migration, so this script does not do it. Students read
 * this prompt in the portal, which reads the column this script updates.
 *
 * NO EMAILS. NO NOTIFICATIONS. Nothing here contacts a student.
 *
 * IDEMPOTENT AND CONVERGENT: it renders both columns and compares BOTH to what
 * is stored. Identical on both means no UPDATE is issued at all. Running it
 * twice changes nothing the second time, and — the property that was missing —
 * a row that is stale in EITHER column is seen as stale, so a re-run after a
 * criteria change repairs what an earlier run left behind instead of skipping
 * it forever.
 *
 * The script keeps its name. It backfills more than the prompt now, but the
 * name is in a runbook and in `node dist/scripts/backfillStory000Prompt.js`;
 * renaming the entry point of a migration is a worse trade than a slightly
 * narrow name.
 *
 * DUE DATES ARE PRESERVED by recomputing each student's schedule from their
 * cohort's start_date before rendering — the same derivation the orchestrator
 * uses at publish. Rendering with a null schedule would silently strip the due
 * dates out of the prompt text, which would be a regression disguised as a
 * backfill. A cohort with no start_date legitimately yields a null schedule and
 * a dateless prompt; that is a supported state, not an error.
 *
 * Run (dry run, writes nothing):
 *   node dist/scripts/backfillStory000Prompt.js
 *   node dist/scripts/backfillStory000Prompt.js --cohort "July 2026" --verbose
 *
 * Apply:
 *   node dist/scripts/backfillStory000Prompt.js --apply
 *   node dist/scripts/backfillStory000Prompt.js --apply --only <projectId>
 *
 * Flags:
 *   --apply            Actually write. WITHOUT THIS NOTHING IS WRITTEN.
 *   --cohort <needle>  Restrict to one cohort (uuid or case-insensitive name fragment).
 *   --only <projectId> Restrict to a single project. Use this for the first real run.
 *   --verbose          One line per build.
 *   --json             Machine-readable summary on stdout.
 *
 * Output: a table of project / student / outcome, and a count of
 * would-update / unchanged / skipped / failed.
 */
import { sequelize } from '../config/database';
import { COMMAND_CENTER_STORY_ID } from '../services/sbp/commandCenterStory';
import {
  commandCenterColumnDrift, commandCenterTaskColumns, normaliseAcceptance,
  type CommandCenterColumnDrift, type CommandCenterTaskColumns,
} from '../services/sbp/commandCenterTaskColumns';
import { buildSchedule, Schedule } from '../services/sbp/buildSchedule';
import type { BuildPlan } from '../services/sbp/planContract';

// TypeScript, not JavaScript, deliberately: this repo has no `allowJs`, so a
// .js file under backend/src never reaches dist and the deploy step
// `node dist/scripts/backfillStory000Prompt.js` would fail with MODULE_NOT_FOUND
// on a production box at the exact moment somebody is trying to run a migration.

export interface SweepRow {
  project_id: string;
  enrollment_id: string;
  email: string | null;
  enrollment_status: string | null;
  cohort_name: string | null;
  cohort_start: string | Date | null;
  plan_version: number;
  plan_json: unknown;
  task_id: string;
  task_status: string;
  verified_at: Date | string | null;
  current_build: string | null;
  /** JSON column: an array from jsonb, a string from an unparsed driver, or null. */
  current_acceptance: unknown;
}

function flag(name: string): boolean { return process.argv.includes(`--${name}`); }
function value(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

const APPLY = flag('apply');
const VERBOSE = flag('verbose');
const AS_JSON = flag('json');
const COHORT = value('cohort');
const ONLY = value('only');

/**
 * Every build that has a published plan AND a STORY-000 row.
 *
 * The denominator comes from the cohort, not from a handed-over list: the join
 * starts at published plans and walks out to enrollments and cohorts, so a build
 * cannot be missed because somebody forgot to mention it. `DISTINCT ON` takes
 * the highest published version per project, which is the plan the student is
 * actually on.
 */
const SWEEP_SQL = `
  SELECT DISTINCT ON (p.id)
         p.id            AS project_id,
         p.enrollment_id AS enrollment_id,
         e.email         AS email,
         e.status        AS enrollment_status,
         c.name          AS cohort_name,
         c.start_date    AS cohort_start,
         bp.version      AS plan_version,
         bp.plan_json    AS plan_json,
         st.id           AS task_id,
         st.status       AS task_status,
         st.verified_at  AS verified_at,
         st.build        AS current_build,
         st.acceptance   AS current_acceptance
    FROM build_plans bp
    JOIN projects p       ON p.id = bp.project_id
    JOIN enrollments e    ON e.id = p.enrollment_id
    LEFT JOIN cohorts c   ON c.id = e.cohort_id
    JOIN student_tasks st ON st.project_id = p.id AND st.story_id = $1
   WHERE bp.status = 'published'
   ORDER BY p.id, bp.version DESC
`;

/** The orchestrator's schedule derivation, per student. Null is a valid answer. */
function scheduleFor(plan: BuildPlan, cohortStart: string | Date | null): Schedule | null {
  if (!cohortStart) return null;
  const storiesByRelease = new Map<string, string[]>();
  for (const rel of plan.releases || []) {
    storiesByRelease.set(rel.key, (plan.stories || []).filter((x) => x.release === rel.key).map((x) => x.id));
  }
  return buildSchedule({
    window: { cohortStart: new Date(cohortStart) },
    releases: plan.releases || [],
    storiesByRelease,
  });
}

/**
 * The per-row decision: what this row SHOULD hold, and whether what it holds
 * today differs.
 *
 * Exported and pure so the case that broke — a row whose `build` is already
 * current and whose `acceptance` is versions behind — can be tested without a
 * database, a cohort or a published plan. That case was invisible to this
 * script for the whole of its life precisely because the decision lived inline
 * in the sweep loop where nothing could reach it.
 */
export function story000RowUpdate(row: SweepRow, plan: BuildPlan): {
  next: CommandCenterTaskColumns;
  drift: CommandCenterColumnDrift;
} {
  const next = commandCenterTaskColumns(plan, scheduleFor(plan, row.cohort_start));
  const drift = commandCenterColumnDrift(
    { build: row.current_build, acceptance: row.current_acceptance },
    next,
  );
  return { next, drift };
}

function matchesCohort(row: SweepRow, needle: string | null): boolean {
  if (!needle) return true;
  const name = String(row.cohort_name || '');
  return name.toLowerCase().includes(needle.toLowerCase());
}

async function main() {
  const [rows] = await sequelize.query(SWEEP_SQL, { bind: [COMMAND_CENTER_STORY_ID] }) as unknown as [SweepRow[], unknown];

  const scoped = rows
    .filter((r) => matchesCohort(r, COHORT))
    .filter((r) => !ONLY || String(r.project_id) === ONLY);

  const out = {
    would_update: [] as Array<Record<string, unknown>>,
    unchanged: [] as Array<Record<string, unknown>>,
    failed: [] as Array<Record<string, unknown>>,
    skipped_no_plan: [] as Array<Record<string, unknown>>,
  };

  for (const row of scoped) {
    const label = `${String(row.project_id).slice(0, 8)} ${row.email}`;
    try {
      const plan = (typeof row.plan_json === 'string' ? JSON.parse(row.plan_json) : row.plan_json) as BuildPlan;
      if (!plan || !Array.isArray(plan.stories) || plan.stories.length === 0) {
        out.skipped_no_plan.push({ project_id: row.project_id, email: row.email, reason: 'plan has no stories' });
        continue;
      }

      const { next, drift } = story000RowUpdate(row, plan);
      const current = row.current_build || '';
      const currentAcceptance = normaliseAcceptance(row.current_acceptance);

      if (!drift.needs_update) {
        out.unchanged.push({ project_id: row.project_id, email: row.email });
        if (VERBOSE) console.log(`  unchanged  ${label}`);
        continue;
      }

      const record = {
        project_id: row.project_id,
        email: row.email,
        cohort: row.cohort_name,
        task_status: row.task_status,
        verified: Boolean(row.verified_at),
        was_len: current.length,
        will_len: next.build.length,
        // Reported separately because they fail separately, and the failure
        // that hid for a whole release was `build_changed: false` sitting
        // beside `acceptance_changed: true` — a row the old rule called
        // unchanged.
        build_changed: drift.build_changed,
        acceptance_changed: drift.acceptance_changed,
        was_criteria: currentAcceptance.length,
        will_criteria: next.acceptance.length,
      };

      if (APPLY) {
        // BOTH COLUMNS IN ONE STATEMENT. They render from the same constant, so
        // a writer that can move one without the other is a writer that can
        // desync 19 live builds — which is exactly what happened. The WHERE is
        // pinned to the exact task row we read, so a concurrent republish
        // cannot cause this to write to a different story.
        await sequelize.query(
          `UPDATE student_tasks
              SET build = $1, acceptance = $2::jsonb, updated_at = NOW()
            WHERE id = $3 AND story_id = $4`,
          { bind: [next.build, JSON.stringify(next.acceptance), row.task_id, COMMAND_CENTER_STORY_ID] },
        );
      }
      out.would_update.push(record);
      if (VERBOSE) {
        const cols = [
          drift.build_changed ? `prompt ${current.length} -> ${next.build.length} chars` : null,
          drift.acceptance_changed
            ? `criteria ${currentAcceptance.length} -> ${next.acceptance.length}`
            : null,
        ].filter(Boolean).join(', ');
        console.log(`  ${APPLY ? 'updated  ' : 'would-upd'}  ${label}  ${cols}`
          + `${row.task_status === 'complete' ? '  [complete — status untouched]' : ''}`);
      }
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? String(err);
      out.failed.push({ project_id: row.project_id, email: row.email, error: message });
      console.error(`  FAILED     ${label}: ${message}`);
    }
  }

  const summary = {
    mode: APPLY ? 'APPLY' : 'DRY RUN',
    cohort_filter: COHORT || '(all)',
    builds_in_scope: scoped.length,
    [APPLY ? 'updated' : 'would_update']: out.would_update.length,
    unchanged: out.unchanged.length,
    skipped_no_plan: out.skipped_no_plan.length,
    failed: out.failed.length,
    completed_story000_preserved: out.would_update.filter((r) => r.task_status === 'complete').length,
    verified_story000_preserved: out.would_update.filter((r) => r.verified).length,
    // Broken out because the second number is the one that would have caught
    // the desync: rows whose prompt was already current and whose criteria were
    // not are invisible in a single "updated" count.
    prompt_stale: out.would_update.filter((r) => r.build_changed).length,
    criteria_stale: out.would_update.filter((r) => r.acceptance_changed).length,
  };

  if (AS_JSON) {
    console.log(JSON.stringify({ summary, ...out }, null, 2));
  } else {
    console.log('');
    console.log(`  ${summary.mode}${APPLY ? '' : ' — nothing was written'}`);
    console.log(`  cohort filter        ${summary.cohort_filter}`);
    console.log(`  builds in scope      ${summary.builds_in_scope}`);
    console.log(`  ${APPLY ? 'updated' : 'would update'}         ${out.would_update.length}`);
    console.log(`  already current      ${out.unchanged.length}`);
    console.log(`  of those, prompt     ${summary.prompt_stale}  stale`);
    console.log(`  of those, criteria   ${summary.criteria_stale}  stale`);
    console.log(`  skipped (no plan)    ${out.skipped_no_plan.length}`);
    console.log(`  failed               ${out.failed.length}`);
    console.log(`  of those, complete   ${summary.completed_story000_preserved}  (status left untouched)`);
    console.log(`  of those, verified   ${summary.verified_story000_preserved}  (verification left untouched)`);
    if (!APPLY) console.log('\n  Re-run with --apply to write.');
    console.log('');
  }

  await sequelize.close();
  if (out.failed.length > 0) process.exit(1);
}

// Only when run as a script. Without this guard, importing the module to test
// `story000RowUpdate` would open a database connection and start a migration —
// which is why that decision had never been tested.
if (require.main === module) {
  main().catch((err: any) => {
    console.error(`[backfillStory000Prompt] ${err?.error_class || 'Error'}: ${err?.message}`);
    process.exit(1);
  });
}
