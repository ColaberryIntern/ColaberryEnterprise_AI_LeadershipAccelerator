/**
 * backfillProjectNames — give every existing student build the real name its
 * own intake or plan already carries.
 *
 * WHY THIS EXISTS
 *
 * `sbp/projectNaming` now names a project at intake, and fills from the plan at
 * publish. That changes what NEW builds do and nothing at all for the cohort
 * already on the platform. Measured 2026-08-16 in production: 34 projects, 6
 * named, 28 with `projects.name IS NULL`. Exactly 20 of those are student builds
 * carrying both an intake and a plan, and the portal renders the generic literal
 * "Your build" for every one of them.
 *
 * WHERE THE NAMES COME FROM — this script INVENTS NOTHING:
 *
 *   1. `build_intake.name`  — what the student typed into the wizard. 15 of 20.
 *   2. `build_plans.plan_json->>'project_name'` — the published plan's own
 *      title, generated from the student's idea. Covers the other 5.
 *   3. Neither ⇒ SKIPPED and reported, never invented. A build nobody can name
 *      from the student's own words keeps the honest fallback the UI has. There
 *      is no "Project 4" in this script; a numbered template is a name the
 *      student would not recognise, which is the thing this whole change exists
 *      to stop.
 *
 * It derives through `deriveProjectName` and writes through
 * `setProjectNameIfEmpty` — the SAME two functions the live pipeline uses. That
 * is deliberate: a backfill with its own private copy of the naming rule is a
 * backfill that disagrees with the pipeline the moment either one changes.
 *
 * WHAT IT TOUCHES: `projects.name` (and `updated_at`). One column, one row per
 * build, and only rows where the name is currently NULL or blank.
 *
 *   - No task, plan, intake, status, points, verification or repo row is read
 *     for writing or written at all.
 *   - NO EMAILS. NO NOTIFICATIONS. NO REPO COMMITS. Nothing here contacts a
 *     student or touches GitHub.
 *
 * NEVER OVERWRITES A NAME A STUDENT SET. The UPDATE is guarded on
 * `name IS NULL OR btrim(name) = ''` inside `setProjectNameIfEmpty`, so a row
 * that already has a name is unreachable from here. That guard — not the SELECT
 * — is what makes this safe: the scope query and the write are separated by
 * however long the sweep takes, and a student may name their project in that
 * window.
 *
 * IDEMPOTENT: the second run matches no rows, updates nothing, and says so.
 *
 * DRY RUN BY DEFAULT. It prints the proposed name for every build and writes
 * nothing until `--apply` is passed.
 *
 *   node dist/scripts/backfillProjectNames.js                 # dry run
 *   node dist/scripts/backfillProjectNames.js --json          # machine readable
 *   node dist/scripts/backfillProjectNames.js --only <uuid>   # one project
 *   node dist/scripts/backfillProjectNames.js --apply         # write
 *
 * TypeScript, not JavaScript, and deliberately: `allowJs` is off, so a `.js`
 * file under `backend/src` is never compiled into `dist` and the command above
 * would fail with MODULE_NOT_FOUND.
 */
import { sequelize } from '../config/database';
import { deriveProjectName, setProjectNameIfEmpty, ProjectNameSource } from '../services/sbp/projectNaming';

function flag(name: string): boolean { return process.argv.includes(`--${name}`); }
function value(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const APPLY = flag('apply');
const AS_JSON = flag('json');
const ONLY = value('only');

/** One candidate row, as the sweep reads it. */
export interface NameCandidateRow {
  project_id: string;
  student: string | null;
  intake_name: string | null;
  plan_name: string | null;
  idea: string | null;
  task_count: number;
}

export interface NameDecision {
  project_id: string;
  student: string;
  name: string | null;
  source: ProjectNameSource;
  /** What the student wrote, trimmed for display only. Never used as a name. */
  idea: string;
  task_count: number;
}

/**
 * Decide one row. Pure, exported and tested — so the naming decision can be
 * reviewed without a database, which is the whole point of the dry run.
 */
export function decideProjectName(row: NameCandidateRow): NameDecision {
  const { name, source } = deriveProjectName({
    intakeName: row.intake_name,
    planName: row.plan_name,
  });
  return {
    project_id: row.project_id,
    student: (row.student ?? '').trim() || '(no enrollment)',
    name,
    source,
    idea: (row.idea ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
    task_count: Number(row.task_count ?? 0),
  };
}

/**
 * Rows in scope: an empty name AND some evidence this is a real student build.
 *
 * The evidence test (intake, plan, or at least one materialized task) exists to
 * keep six abandoned empty shells — created during April/May testing, no intake,
 * no plan, no tasks — out of a report a human has to read. They are counted in
 * the summary rather than silently dropped.
 *
 * `DISTINCT ON` picks one plan per project, preferring the published version,
 * because a project can carry several `build_plans` rows and only one of them is
 * the one the student is actually on.
 */
const SWEEP_SQL = `
  WITH best_plan AS (
    SELECT DISTINCT ON (project_id)
           project_id,
           plan_json->>'project_name' AS plan_name
      FROM build_plans
     ORDER BY project_id, (status = 'published') DESC, version DESC
  )
  SELECT p.id::text                AS project_id,
         e.full_name               AS student,
         bi.name                   AS intake_name,
         bp.plan_name              AS plan_name,
         bi.idea                   AS idea,
         (SELECT count(*) FROM student_tasks st WHERE st.project_id = p.id) AS task_count
    FROM projects p
    LEFT JOIN build_intake bi ON bi.project_id = p.id
    LEFT JOIN best_plan   bp ON bp.project_id = p.id
    LEFT JOIN enrollments  e ON e.id = COALESCE(bi.enrollment_id, p.enrollment_id)
   WHERE (p.name IS NULL OR btrim(p.name) = '')
     AND (bi.project_id IS NOT NULL
          OR bp.project_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM student_tasks st WHERE st.project_id = p.id))
     AND ($only::text IS NULL OR p.id::text = $only)
   ORDER BY e.full_name NULLS LAST, p.created_at
`;

function pad(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n);
}

async function main(): Promise<void> {
  const [rows]: any = await sequelize.query(SWEEP_SQL, { bind: { only: ONLY } });
  const decisions = (rows ?? []).map((r: NameCandidateRow) => decideProjectName(r));

  const named: NameDecision[] = decisions.filter((d: NameDecision) => d.name !== null);
  const skipped: NameDecision[] = decisions.filter((d: NameDecision) => d.name === null);

  const updated: string[] = [];
  const alreadyNamed: string[] = [];
  const failed: { project_id: string; error_class: string; message: string }[] = [];

  if (!AS_JSON) {
    console.log('');
    console.log(`  ${APPLY ? 'APPLY' : 'DRY RUN — nothing will be written'}`);
    console.log('');
    console.log(`  ${pad('STUDENT', 26)}  ${pad('SOURCE', 7)}  ${pad('PROPOSED NAME', 52)}  TASKS`);
    console.log(`  ${'-'.repeat(26)}  ${'-'.repeat(7)}  ${'-'.repeat(52)}  -----`);
  }

  for (const d of named) {
    if (APPLY) {
      try {
        const wrote = await setProjectNameIfEmpty(d.project_id, d.name);
        (wrote ? updated : alreadyNamed).push(d.project_id);
      } catch (err: any) {
        failed.push({
          project_id: d.project_id,
          error_class: err?.name ?? 'Error',
          message: err?.message ?? 'unknown',
        });
      }
    }
    if (!AS_JSON) {
      console.log(`  ${pad(d.student, 26)}  ${pad(d.source, 7)}  ${pad(d.name as string, 52)}  ${d.task_count}`);
    }
  }

  for (const d of skipped) {
    if (!AS_JSON) {
      console.log(`  ${pad(d.student, 26)}  ${pad('none', 7)}  ${pad('— SKIPPED: no intake name, no plan name —', 52)}  ${d.task_count}`);
    }
  }

  const summary = {
    mode: APPLY ? 'APPLY' : 'DRY RUN',
    in_scope: decisions.length,
    from_intake: named.filter((d) => d.source === 'intake').length,
    from_plan: named.filter((d) => d.source === 'plan').length,
    [APPLY ? 'updated' : 'would_update']: named.length,
    skipped_no_source: skipped.length,
    already_named: alreadyNamed.length,
    failed: failed.length,
  };

  if (AS_JSON) {
    console.log(JSON.stringify({ summary, named, skipped, failed }, null, 2));
  } else {
    console.log('');
    console.log(`  in scope             ${summary.in_scope}`);
    console.log(`  from intake name     ${summary.from_intake}   (the student's own words)`);
    console.log(`  from plan name       ${summary.from_plan}   (no intake name was given)`);
    console.log(`  ${APPLY ? 'updated            ' : 'would update       '}  ${named.length}`);
    console.log(`  skipped (no source)  ${summary.skipped_no_source}   (left NULL deliberately — nothing to name them from)`);
    if (APPLY) console.log(`  already named        ${summary.already_named}   (named by someone else since the sweep — left alone)`);
    console.log(`  failed               ${summary.failed}`);
    if (!APPLY) console.log('\n  Re-run with --apply to write.');
    console.log('');
  }

  await sequelize.close();
  if (failed.length > 0) process.exit(1);
}

// Only when run as a script, so a test can import `decideProjectName` without
// opening a database connection and starting a migration.
if (require.main === module) {
  main().catch((err: any) => {
    console.error(`[backfillProjectNames] ${err?.error_class || 'Error'}: ${err?.message}`);
    process.exit(1);
  });
}
