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
 * ── OPERATOR OVERRIDES ──────────────────────────────────────────────────────
 *
 * The rule prefers the intake name unconditionally, and for two of the twenty
 * live builds that is wrong — Regina Asafor's intake carries demo text she
 * pasted back in, Million Meshesha's carries a description rather than a name.
 * Both were decided by hand. `--override` is how a hand decision reaches this
 * script WITHOUT a code change, so the next one costs an argument rather than a
 * commit, a review and a deploy:
 *
 *   --override <project-id>=plan          use the plan's name, not intake's
 *   --override <project-id>=intake        use the intake name (the default, said)
 *   --override <project-id>=skip          leave this project NULL, deliberately
 *   --override <project-id>=name:Some Name a hand-typed name, when neither fits
 *
 * Repeatable. Every override is printed in full BEFORE the table — what the rule
 * said, what was asked for, what will actually be written — because the point of
 * a dry run is that a human approves the diff rather than the intention.
 *
 * An override that matches no row, or that asks for a source the project does
 * not have, is a BLOCKING error under `--apply`. Half-applying is the one
 * outcome worse than not applying: the reviewed rows keep their wrong names,
 * every other row is written, and the run can no longer simply be repeated.
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
import {
  deriveProjectName, setProjectNameIfEmpty, parseProjectNameOverride,
  ProjectNameSource, ProjectNameOverride,
} from '../services/sbp/projectNaming';

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
  /** The override directive that produced this, as typed. `null` when none. */
  override: string | null;
  /**
   * What the rule ALONE would have written, always populated.
   *
   * The decision carries its own counterfactual so the dry run can show the
   * before and the after side by side. Without it a reviewer has to re-derive
   * the default in their head to see what the override actually did, which is
   * exactly the step people skip.
   */
  default_name: string | null;
  default_source: ProjectNameSource;
}

/** Render an override back to the spec that would reproduce it. */
function overrideSpec(o: ProjectNameOverride): string {
  return o.kind === 'literal' ? `name:${o.name}` : o.kind;
}

/**
 * Decide one row, optionally under an operator override. Pure, exported and
 * tested — so the naming decision can be reviewed without a database, which is
 * the whole point of the dry run.
 */
export function decideProjectName(row: NameCandidateRow, override?: ProjectNameOverride): NameDecision {
  const candidates = { intakeName: row.intake_name, planName: row.plan_name };
  const base = deriveProjectName(candidates);
  const final = override ? deriveProjectName(candidates, override) : base;
  return {
    project_id: row.project_id,
    student: (row.student ?? '').trim() || '(no enrollment)',
    name: final.name,
    source: final.source,
    idea: (row.idea ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
    task_count: Number(row.task_count ?? 0),
    override: override ? overrideSpec(override) : null,
    default_name: base.name,
    default_source: base.source,
  };
}

/**
 * Decide the whole sweep. Overrides are keyed by project id and looked up here,
 * so a row nobody named is byte-identical to the run with no overrides at all —
 * the containment property the tests assert.
 */
export function decideProjectNames(
  rows: NameCandidateRow[],
  overrides: Map<string, ProjectNameOverride>,
): NameDecision[] {
  return rows.map((r) => decideProjectName(r, overrides.get(r.project_id)));
}

/**
 * Read repeated `--override <project-id>=<directive>` pairs off argv.
 *
 * Every rejection is COLLECTED rather than thrown, so one dry run tells the
 * operator about all of their typos instead of one per attempt. And nothing is
 * ever silently dropped: an override the operator believes is in effect while
 * the default quietly writes is the precise failure this flag exists to prevent.
 */
export function parseOverrideArgs(argv: string[]): {
  overrides: Map<string, ProjectNameOverride>;
  errors: string[];
} {
  const overrides = new Map<string, ProjectNameOverride>();
  const errors: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--override') continue;
    const pair = argv[i + 1];
    if (!pair || pair.startsWith('--')) {
      errors.push('--override needs <project-id>=<plan|intake|skip|name:Some Name>, got nothing');
      continue;
    }
    // First '=' only: a hand-typed name may itself contain one.
    const at = pair.indexOf('=');
    if (at < 1) {
      errors.push(`--override "${pair}" is not <project-id>=<directive>`);
      continue;
    }
    const projectId = pair.slice(0, at).trim();
    const spec = pair.slice(at + 1);
    const parsed = parseProjectNameOverride(spec);
    if (!parsed) {
      errors.push(`--override "${projectId}": "${spec}" is not one of plan | intake | skip | name:<Some Name>`);
      continue;
    }
    if (overrides.has(projectId)) {
      // Last-one-wins is how two operators disagree in silence.
      errors.push(`--override "${projectId}" given more than once`);
      continue;
    }
    overrides.set(projectId, parsed);
  }
  return { overrides, errors };
}

/**
 * The override block, printed BEFORE the table and before any write.
 *
 * This is the visibility requirement in one function: for each override it
 * shows the project id, the student, what the rule said, what was asked for and
 * what will actually be written — plus the two ways an override can fail to
 * take effect, which are otherwise invisible in a clean-looking dry run.
 */
export function formatOverrideReport(
  decisions: NameDecision[],
  overrides: Map<string, ProjectNameOverride>,
): string[] {
  if (overrides.size === 0) return ['  No operator overrides supplied — the derivation rule alone decides.', ''];

  const lines: string[] = ['', `  OPERATOR OVERRIDES — ${overrides.size} supplied`, ''];
  const seen = new Set<string>();

  for (const d of decisions) {
    if (!d.override) continue;
    seen.add(d.project_id);
    const changed = d.name !== d.default_name;
    lines.push(`  ${d.project_id}  ${d.student}`);
    lines.push(`      rule says    ${d.default_source.padEnd(13)} ${d.default_name ?? '(nothing)'}`);
    lines.push(`      override     ${d.override}`);
    if (d.source === 'unmet') {
      lines.push('      will write   UNMET — this project has no such source. NOTHING will be written.');
    } else {
      lines.push(`      will write   ${d.source.padEnd(13)} ${d.name ?? '(nothing)'}${changed ? '   <-- CHANGED' : '   (no change)'}`);
    }
    lines.push('');
  }

  for (const [projectId, o] of overrides) {
    if (seen.has(projectId)) continue;
    // A typo'd uuid is a no-op override. Left unreported, the operator sees a
    // clean dry run and the default name is written to the row they meant to fix.
    lines.push(`  ${projectId}  MATCHED NO PROJECT in this sweep (already named, out of --only scope, or a typo)`);
    lines.push(`      override     ${overrideSpec(o)}`);
    lines.push('');
  }
  return lines;
}

/** Overrides that did not take effect. Blocking under `--apply`. */
export function findOverrideProblems(
  decisions: NameDecision[],
  overrides: Map<string, ProjectNameOverride>,
): string[] {
  const problems: string[] = [];
  const matched = new Set(decisions.filter((d) => d.override).map((d) => d.project_id));
  for (const projectId of overrides.keys()) {
    if (!matched.has(projectId)) problems.push(`override ${projectId} matched no project in the sweep`);
  }
  for (const d of decisions) {
    if (d.source === 'unmet') problems.push(`override ${d.project_id} (${d.student}) is UNMET: "${d.override}" has no value on this project`);
  }
  return problems;
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
  const { overrides, errors: overrideArgErrors } = parseOverrideArgs(process.argv);
  if (overrideArgErrors.length > 0) {
    // A malformed override is fatal in BOTH modes. Printing a dry run that
    // silently ignores one is how an operator comes to believe a hand decision
    // is in effect while the default is what actually gets written.
    for (const e of overrideArgErrors) console.error(`  [override] ${e}`);
    await sequelize.close();
    process.exit(1);
  }

  const [rows]: any = await sequelize.query(SWEEP_SQL, { bind: { only: ONLY } });
  const decisions = decideProjectNames((rows ?? []) as NameCandidateRow[], overrides);
  const overrideProblems = findOverrideProblems(decisions, overrides);

  const named: NameDecision[] = decisions.filter((d: NameDecision) => d.name !== null);
  const skipped: NameDecision[] = decisions.filter((d: NameDecision) => d.name === null);

  const updated: string[] = [];
  const alreadyNamed: string[] = [];
  const failed: { project_id: string; error_class: string; message: string }[] = [];

  if (!AS_JSON) {
    console.log('');
    console.log(`  ${APPLY ? 'APPLY' : 'DRY RUN — nothing will be written'}`);
    // Before the table and before any write: what a human is being asked to
    // approve is the difference between the rule and the hand decision.
    for (const line of formatOverrideReport(decisions, overrides)) console.log(line);
    console.log(`  ${pad('STUDENT', 26)}  ${pad('SOURCE', 13)}  ${pad('PROPOSED NAME', 52)}  TASKS`);
    console.log(`  ${'-'.repeat(26)}  ${'-'.repeat(13)}  ${'-'.repeat(52)}  -----`);
  }

  // Refuse to half-apply. An unmatched or unmet override means the rows a human
  // reviewed would keep their wrong names while every other row was written,
  // and the run could no longer simply be repeated once the typo was fixed.
  if (APPLY && overrideProblems.length > 0) {
    for (const p of overrideProblems) console.error(`  [override] BLOCKING: ${p}`);
    console.error('  Nothing was written. Fix the override and re-run.');
    await sequelize.close();
    process.exit(1);
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
      const mark = d.override ? ' *' : '';
      console.log(`  ${pad(d.student, 26)}  ${pad(d.source + mark, 13)}  ${pad(d.name as string, 52)}  ${d.task_count}`);
    }
  }

  for (const d of skipped) {
    if (!AS_JSON) {
      const why = d.source === 'unmet'
        ? '— OVERRIDE UNMET: nothing written —'
        : d.source === 'operator-skip'
          ? '— SKIPPED by operator override —'
          : '— SKIPPED: no intake name, no plan name —';
      console.log(`  ${pad(d.student, 26)}  ${pad(d.source, 13)}  ${pad(why, 52)}  ${d.task_count}`);
    }
  }

  const summary = {
    mode: APPLY ? 'APPLY' : 'DRY RUN',
    in_scope: decisions.length,
    from_intake: named.filter((d) => d.source === 'intake').length,
    from_plan: named.filter((d) => d.source === 'plan').length,
    from_operator: named.filter((d) => d.source === 'operator').length,
    overridden: decisions.filter((d: NameDecision) => d.override !== null).length,
    override_problems: overrideProblems.length,
    [APPLY ? 'updated' : 'would_update']: named.length,
    skipped_no_source: skipped.filter((d) => d.source === 'none').length,
    skipped_by_operator: skipped.filter((d) => d.source === 'operator-skip').length,
    already_named: alreadyNamed.length,
    failed: failed.length,
  };

  if (AS_JSON) {
    console.log(JSON.stringify({
      summary, named, skipped, failed,
      overrides: [...overrides].map(([project_id, o]) => ({ project_id, override: overrideSpec(o) })),
      override_problems: overrideProblems,
    }, null, 2));
  } else {
    console.log('');
    console.log(`  in scope             ${summary.in_scope}`);
    console.log(`  from intake name     ${summary.from_intake}   (the student's own words)`);
    console.log(`  from plan name       ${summary.from_plan}   (no intake name was given)`);
    if (summary.from_operator > 0) console.log(`  hand-typed name      ${summary.from_operator}   (operator override, neither source used)`);
    console.log(`  overridden           ${summary.overridden}   (* in the table above; detail at the top)`);
    console.log(`  ${APPLY ? 'updated            ' : 'would update       '}  ${named.length}`);
    console.log(`  skipped (no source)  ${summary.skipped_no_source}   (left NULL deliberately — nothing to name them from)`);
    if (summary.skipped_by_operator > 0) console.log(`  skipped (operator)   ${summary.skipped_by_operator}   (left NULL on purpose by --override ...=skip)`);
    if (APPLY) console.log(`  already named        ${summary.already_named}   (named by someone else since the sweep — left alone)`);
    console.log(`  failed               ${summary.failed}`);
    if (overrideProblems.length > 0) {
      console.log('');
      for (const p of overrideProblems) console.log(`  OVERRIDE PROBLEM     ${p}`);
      console.log('  --apply will refuse to run until these are resolved.');
    }
    if (!APPLY) console.log('\n  Re-run with --apply to write.');
    console.log('');
  }

  await sequelize.close();
  if (failed.length > 0 || overrideProblems.length > 0) process.exit(1);
}

// Only when run as a script, so a test can import `decideProjectName` without
// opening a database connection and starting a migration.
if (require.main === module) {
  main().catch((err: any) => {
    console.error(`[backfillProjectNames] ${err?.error_class || 'Error'}: ${err?.message}`);
    process.exit(1);
  });
}
