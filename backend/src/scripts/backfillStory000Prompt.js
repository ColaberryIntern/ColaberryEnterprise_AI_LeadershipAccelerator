/**
 * backfillStory000Prompt — regenerate the STORY-000 prompt for every already-
 * published build.
 *
 * WHY THIS EXISTS
 * Updating `commandCenterStory.ts` changes what NEW publishes produce. It does
 * nothing for a student who already published: their prompt was rendered once,
 * at publish time, and stored on `student_tasks.build`. Every student already
 * on a build would keep reading the old text forever.
 *
 * WHAT IT TOUCHES — and this is deliberately as narrow as it can be:
 *
 *     UPDATE student_tasks SET build = <freshly rendered prompt>
 *      WHERE story_id = 'STORY-000' AND project_id = ...
 *
 * ONE COLUMN. ONE ROW PER BUILD. Nothing else, ever.
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
 * IDEMPOTENT: it renders the prompt and compares it to what is stored. Identical
 * means no UPDATE is issued at all. Running it twice changes nothing the second
 * time, and the second run reports every build as `unchanged`.
 *
 * DUE DATES ARE PRESERVED by recomputing each student's schedule from their
 * cohort's start_date before rendering — the same derivation the orchestrator
 * uses at publish. Rendering with a null schedule would silently strip the due
 * dates out of the prompt text, which would be a regression disguised as a
 * backfill. A cohort with no start_date legitimately yields a null schedule and
 * a dateless prompt; that is a supported state, not an error.
 *
 * Run (dry run, writes nothing):
 *   node backfillStory000Prompt.js
 *   node backfillStory000Prompt.js --cohort "July 2026" --verbose
 *
 * Apply:
 *   node backfillStory000Prompt.js --apply
 *   node backfillStory000Prompt.js --apply --only <projectId>
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
const path = require('path');

// Compiled TS lives in dist when this runs inside the backend container. The
// relative hop differs depending on whether the script is run from src (ts-node)
// or copied next to dist, so both are attempted before giving up loudly — a
// backfill that silently rendered the WRONG prompt would be worse than one that
// refuses to start.
function load(moduleId) {
  const candidates = [
    // Explicit override first, so the script can be docker-cp'd anywhere
    // (SBP_MODULE_DIR=/app/dist/services/sbp) without guessing hops.
    ...(process.env.SBP_MODULE_DIR ? [path.join(process.env.SBP_MODULE_DIR, moduleId)] : []),
    `../services/sbp/${moduleId}`,
    `../../dist/services/sbp/${moduleId}`,
    `./dist/services/sbp/${moduleId}`,
    path.join(process.cwd(), 'dist', 'services', 'sbp', moduleId),
  ];
  const tried = [];
  for (const c of candidates) {
    try { return require(c); } catch (err) { tried.push(`${c} (${err.code || err.message})`); }
  }
  throw new Error(`Cannot load ${moduleId}. Tried:\n  ${tried.join('\n  ')}`);
}

const { commandCenterPrompt, COMMAND_CENTER_STORY_ID } = load('commandCenterStory');
const { buildSchedule } = load('buildSchedule');

function flag(name) { return process.argv.includes(`--${name}`); }
function value(name, fallback = null) {
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
         st.build        AS current_build
    FROM build_plans bp
    JOIN projects p       ON p.id = bp.project_id
    JOIN enrollments e    ON e.id = p.enrollment_id
    LEFT JOIN cohorts c   ON c.id = e.cohort_id
    JOIN student_tasks st ON st.project_id = p.id AND st.story_id = $1
   WHERE bp.status = 'published'
   ORDER BY p.id, bp.version DESC
`;

/** The orchestrator's schedule derivation, per student. Null is a valid answer. */
function scheduleFor(plan, cohortStart) {
  if (!cohortStart) return null;
  const storiesByRelease = new Map();
  for (const rel of plan.releases || []) {
    storiesByRelease.set(rel.key, (plan.stories || []).filter((s) => s.release === rel.key).map((s) => s.id));
  }
  return buildSchedule({
    window: { cohortStart: new Date(cohortStart) },
    releases: plan.releases || [],
    storiesByRelease,
  });
}

function matchesCohort(row, needle) {
  if (!needle) return true;
  const name = String(row.cohort_name || '');
  return name.toLowerCase().includes(needle.toLowerCase());
}

async function main() {
  const { sequelize } = require(process.env.DB_MODULE || '../config/database');

  const [rows] = await sequelize.query(SWEEP_SQL, { bind: [COMMAND_CENTER_STORY_ID] });

  const scoped = rows
    .filter((r) => matchesCohort(r, COHORT))
    .filter((r) => !ONLY || String(r.project_id) === ONLY);

  const out = { would_update: [], unchanged: [], failed: [], skipped_no_plan: [] };

  for (const row of scoped) {
    const label = `${String(row.project_id).slice(0, 8)} ${row.email}`;
    try {
      const plan = typeof row.plan_json === 'string' ? JSON.parse(row.plan_json) : row.plan_json;
      if (!plan || !Array.isArray(plan.stories) || plan.stories.length === 0) {
        out.skipped_no_plan.push({ project_id: row.project_id, email: row.email, reason: 'plan has no stories' });
        continue;
      }

      const next = commandCenterPrompt(plan, scheduleFor(plan, row.cohort_start));
      const current = row.current_build || '';

      if (next === current) {
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
        will_len: next.length,
      };

      if (APPLY) {
        // ONE COLUMN. The WHERE is pinned to the exact task row we read, so a
        // concurrent republish cannot cause this to write to a different story.
        await sequelize.query(
          `UPDATE student_tasks SET build = $1, updated_at = NOW() WHERE id = $2 AND story_id = $3`,
          { bind: [next, row.task_id, COMMAND_CENTER_STORY_ID] },
        );
      }
      out.would_update.push(record);
      if (VERBOSE) {
        console.log(`  ${APPLY ? 'updated  ' : 'would-upd'}  ${label}  ${current.length} -> ${next.length} chars`
          + `${row.task_status === 'complete' ? '  [complete — status untouched]' : ''}`);
      }
    } catch (err) {
      out.failed.push({ project_id: row.project_id, email: row.email, error: err.message });
      console.error(`  FAILED     ${label}: ${err.message}`);
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

main().catch((err) => {
  console.error(`[backfillStory000Prompt] ${err.error_class || 'Error'}: ${err.message}`);
  process.exit(1);
});
