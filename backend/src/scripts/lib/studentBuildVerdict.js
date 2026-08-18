// studentBuildVerdict.js
//
// The one piece of real judgement in the student-build audit: given a plain
// snapshot of one student's build state, is that student READY to be told
// "your project is set up, go build STORY-000"?
//
// Pure on purpose. No database, no clock, no network, no env. The audit script
// (auditStudentBuilds.js) gathers the facts and this decides; the emailer
// (emailStudentBuildReady.js) re-derives the same verdict from the same facts
// rather than trusting a verdict it was handed. Both paths therefore agree by
// construction, and the interesting logic is testable in milliseconds without a
// container. See __tests__/studentBuildVerdict.test.js.
//
// THE PIPELINE THIS MODELS
//   intake submitted -> plan generated -> plan clears the blocking gate rules ->
//   plan published -> tasks materialized -> STORY-000 injected -> due dates
//   applied from the cohort start date -> project made the enrollment's active one
//
// Every NOT_READY reason names the FIRST stage that did not complete, because
// that is the stage a human has to go fix. Reporting "no tasks" when the real
// story is "the intake never reached the server" sends the operator to the
// wrong place.
//
// WHAT READY DOES *NOT* MEAN, AND WHY VERIFICATION IS NOT IN THE LADDER
// PR #1463 shipped the build-verification loop, so student_tasks.verified_at is
// finally written by something. It is deliberately NOT a readiness gate. READY
// answers "can this student open their board and start", which is true before
// they have built anything; verification answers "did they finish", which is the
// far end of the same pipeline. Gating READY on it would mark every student who
// has not finished their capstone as NOT_READY and suppress the email telling
// them to start, which is exactly backwards.
//
// This matters because the readiness definition here is deliberately identical
// to the one in the build-student-project skill's canonical query - published
// AND STORY-000 AND tasks > 0 AND undated_tasks = 0 AND active project - and
// #1463 did not change that query. So this ladder does not change either.
// Verification surfaces as NOTES instead, which is also where the skill's own
// checklist puts it ("no complete rows with verified_at IS NULL that you cannot
// account for"). If a future change ever does move verification into the ladder,
// the skill's query has to move in the same commit, or the two start disagreeing
// about what "ready" means - which is the failure this pair exists to prevent.

/**
 * @typedef {object} BuildSnapshot
 * @property {boolean} hasProject           an enrollment-linked project exists at all
 * @property {string|null} intakeStatus     build_intake.status, or null when no intake row exists
 * @property {string|null} planStatus       latest build_plans.status ('draft'|'published'|'superseded'), or null
 * @property {boolean|null} planGateOk      latest build_plans.gate_ok (true only when the plan is spotless)
 * @property {string[]} gateViolationRules  distinct rule names from build_plans.gate_violations
 * @property {boolean} hasPublishedPlan     a build_plans row with status='published' exists for this project
 * @property {number} taskCount             rows in student_tasks for this project
 * @property {boolean} hasStory000          a student_tasks row with story_id='STORY-000' exists
 * @property {number} datedTaskCount        rows in student_tasks with due_on IS NOT NULL
 * @property {boolean} isActiveProject      projects.id === enrollments.active_project_id
 * @property {string|null} cohortStartDate  cohorts.start_date as YYYY-MM-DD, or null
 * @property {number} [browserImportedLists] task lists whose cluster is not r<n>/prep
 * @property {number} [verifiedTaskCount]   student_tasks with verified_at set (PR #1463's loop)
 * @property {number} [completeUnverifiedCount] status='complete' with verified_at NULL
 */

/**
 * @typedef {object} Verdict
 * @property {'READY'|'NOT_READY'} verdict
 * @property {string} reason   the blocking stage in plain words, or 'build is set up' when READY
 * @property {string} stage    machine-readable stage key, stable for grouping and metrics
 * @property {string[]} notes  non-blocking observations worth a human's attention
 */

// Stage keys are part of this module's contract: the audit groups by them and
// the emailer filters on verdict, so renaming one is a breaking change.
const STAGES = {
  NO_PROJECT: 'no_project',
  NO_INTAKE: 'no_intake',
  INTAKE_GENERATING: 'intake_generating',
  GENERATION_FAILED: 'generation_failed',
  GATE_FAILED: 'gate_failed',
  NO_PLAN: 'no_plan',
  PLAN_UNPUBLISHED: 'plan_unpublished',
  PLAN_SUPERSEDED: 'plan_superseded',
  NO_TASKS: 'no_tasks',
  NO_STORY_000: 'no_story_000',
  TASKS_UNDATED: 'tasks_undated',
  NO_ACTIVE_PROJECT: 'no_active_project',
  READY: 'ready',
};

/**
 * Mirror of BLOCKING_RULES in backend/src/services/sbp/planGate.ts.
 *
 * Duplicated rather than imported because that is TypeScript compiled into
 * dist/ and these are plain scripts that must run from source in a container.
 * The distinction it encodes is load-bearing and easy to get wrong:
 * `build_plans.gate_ok` is TRUE only for a plan with ZERO violations, so a
 * perfectly healthy published plan routinely carries gate_ok = false with a
 * couple of style warnings on it. Treating gate_ok = false as "gate failed"
 * would report half a healthy cohort as broken.
 *
 * A plan is genuinely blocked only when it trips one of these.
 * studentBuildVerdict.test.js asserts this list against planGate.ts so the two
 * cannot drift apart silently.
 */
const BLOCKING_GATE_RULES = [
  'must_uncovered',
  'dangling_requirement',
  'dangling_release',
  'dangling_blocked_by',
  'malformed_requirement',
  'malformed_story',
  'r0_missing',
  'r0_not_ungated',
  'invented_vendor',
];

function distinct(values) {
  const seen = [];
  for (const v of values || []) {
    const name = String(v == null ? '' : v).trim();
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/**
 * Derive the verdict for one student's build.
 *
 * @param {BuildSnapshot} snap
 * @returns {Verdict}
 */
function deriveVerdict(snap) {
  const s = snap || {};
  const notes = [];
  const taskCount = Number(s.taskCount || 0);
  const datedTaskCount = Number(s.datedTaskCount || 0);
  const rules = distinct(s.gateViolationRules);
  const blocking = rules.filter((r) => BLOCKING_GATE_RULES.includes(r));
  const warnings = rules.filter((r) => !BLOCKING_GATE_RULES.includes(r));

  const out = (verdict, stage, reason) => ({ verdict, stage, reason, notes });

  // 1. Nothing to audit. The student never started, or the project creation
  //    call never landed. Either way there is no build to be ready.
  if (!s.hasProject) {
    return out('NOT_READY', STAGES.NO_PROJECT, 'no build project on this enrollment');
  }

  // 2. The intake is the student's own words about what they are building. A
  //    project row with no intake row means the wizard opened and the submit
  //    never reached the server, which from the student's side looks exactly
  //    like having done it.
  if (!s.intakeStatus) {
    return out('NOT_READY', STAGES.NO_INTAKE, 'no build intake - never reached the server');
  }

  // 3. Generation itself broke, or is still running. Both are replayable and
  //    neither is the student's fault, so they read differently to whoever
  //    picks this up.
  if (s.intakeStatus === 'failed') {
    return out('NOT_READY', STAGES.GENERATION_FAILED, 'plan generation failed - the intake is replayable');
  }
  if (s.intakeStatus === 'generating') {
    return out('NOT_READY', STAGES.INTAKE_GENERATING, 'plan generation still in flight');
  }

  // 4. The gate rejected the plan. Named rules, because the fix differs
  //    entirely per rule and a bare "gate failed" costs whoever picks this up a
  //    database round trip to find out which one.
  //
  //    Only BLOCKING_GATE_RULES count. A published plan carrying nothing but
  //    style warnings is fine and is not reported as failed.
  if (s.intakeStatus === 'gate_failed' || (blocking.length > 0 && !s.hasPublishedPlan)) {
    const detail = blocking.length ? blocking.join(', ')
      : (rules.length ? rules.join(', ') : 'rules not recorded');
    return out('NOT_READY', STAGES.GATE_FAILED, `gate_failed: ${detail}`);
  }

  // 5. Intake landed, decomposition never produced a plan row.
  if (!s.planStatus) {
    return out('NOT_READY', STAGES.NO_PLAN, 'intake captured but no plan was generated');
  }

  // 6. The common one. The plan exists and is publishable, and nobody pressed
  //    publish, so nothing was ever materialized into tasks the student can see.
  if (!s.hasPublishedPlan) {
    if (s.planStatus === 'superseded') {
      return out('NOT_READY', STAGES.PLAN_SUPERSEDED, 'plan superseded with nothing published in its place');
    }
    return out('NOT_READY', STAGES.PLAN_UNPUBLISHED, 'plan drafted but never published');
  }

  // A newer draft stacked on top of a published plan is legitimate (the student
  // is revising) but worth flagging, since what they see is still the published one.
  if (s.planStatus === 'draft') {
    notes.push('a newer draft plan sits above the published one');
  }
  if (warnings.length) {
    notes.push(`non-blocking gate warnings: ${warnings.join(', ')}`);
  }
  // Task lists whose cluster is not r<n> or prep were written by the browser's
  // localStorage import path rather than by publish. Worth saying out loud: it
  // is the signature of a stale tab having written over the real build.
  if (Number(s.browserImportedLists || 0) > 0) {
    notes.push(`${s.browserImportedLists} task list(s) look browser-imported, not materialized by publish`);
  }
  // Verification progress, from PR #1463's loop. A note, never a gate - see the
  // header. Silent at zero on purpose: today NO project has a provisioned repo,
  // so the loop has nothing to read and zero is the expected reading for every
  // student. A note on every row would be noise that says nothing about that row.
  const verified = Number(s.verifiedTaskCount || 0);
  if (verified > 0) {
    notes.push(`${verified} of ${taskCount} tasks verified complete`);
  }
  // status='complete' with no verified_at earns no points and no surface says so.
  // Legitimate only for rows predating the verification columns; anything newer
  // means something wrote 'complete' down a path that is not
  // markTaskVerifiedComplete, which is the hole PR #1459 closed.
  const unverified = Number(s.completeUnverifiedCount || 0);
  if (unverified > 0) {
    notes.push(`${unverified} task(s) marked complete with no verified_at - these earn no points`);
  }

  // 7. Published, but materialization never ran or died part way through.
  if (taskCount === 0) {
    return out('NOT_READY', STAGES.NO_TASKS, 'plan published but no tasks were materialized');
  }

  // 8. STORY-000 is injected by materialization, not produced by the model, so
  //    its absence means these tasks predate the Command Center or arrived by
  //    some other route (a stale-tab localStorage import, for instance). The
  //    email we send names STORY-000 as their next step, so it had better exist.
  if (!s.hasStory000) {
    return out('NOT_READY', STAGES.NO_STORY_000, `${taskCount} tasks materialized but STORY-000 is missing`);
  }

  // 9. Due dates come from the cohort start date. With none, the board has no
  //    sequence and "your next step" means nothing on a timeline.
  //
  //    Every task must carry one, not most of them. That is the bar the
  //    build-student-project runbook's readiness query sets, and this tool
  //    disagreeing with the canonical query would be worse than being strict.
  if (datedTaskCount === 0) {
    const why = s.cohortStartDate
      ? `cohort start date ${s.cohortStartDate} was never applied`
      : 'cohort has no start date';
    return out('NOT_READY', STAGES.TASKS_UNDATED, `tasks present but undated - ${why}`);
  }
  if (datedTaskCount < taskCount) {
    return out('NOT_READY', STAGES.TASKS_UNDATED,
      `${taskCount - datedTaskCount} of ${taskCount} tasks have no due date`);
  }

  // 10. The build is sound but the portal will not open on it. Last in the
  //     ladder because it is a one-column fix and everything above it is not.
  if (!s.isActiveProject) {
    return out('NOT_READY', STAGES.NO_ACTIVE_PROJECT,
      'build is complete but it is not the enrollment active project');
  }

  return out('READY', STAGES.READY, 'build is set up');
}

module.exports = { deriveVerdict, STAGES, BLOCKING_GATE_RULES };
