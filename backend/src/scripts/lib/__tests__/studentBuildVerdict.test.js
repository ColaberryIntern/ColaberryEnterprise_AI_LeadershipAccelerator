// Tests for the student-build verdict.
//
// Two things must never break, and they are the two that would cost something:
//   1. A student whose build is not actually usable is never called READY.
//      emailStudentBuildReady.js mails on this verdict alone, so a false READY
//      is an email telling someone to go open a board that is not there.
//   2. The reason names the FIRST stage that failed. A reason pointing at the
//      wrong stage sends whoever is fixing it to the wrong place, which is
//      worse than no reason at all.

const fs = require('fs');
const path = require('path');
const { deriveVerdict, STAGES, BLOCKING_GATE_RULES } = require('../studentBuildVerdict');

// A build with nothing wrong with it. Each test breaks exactly one thing, so a
// failure names its own cause.
const READY = Object.freeze({
  hasProject: true,
  intakeStatus: 'drafted',
  planStatus: 'published',
  planGateOk: true,
  gateViolationRules: [],
  hasPublishedPlan: true,
  taskCount: 20,
  hasStory000: true,
  datedTaskCount: 20,
  isActiveProject: true,
  cohortStartDate: '2026-07-23',
});

const v = (over = {}) => deriveVerdict({ ...READY, ...over });

describe('the happy path', () => {
  test('a fully set up build is READY', () => {
    const r = v();
    expect(r.verdict).toBe('READY');
    expect(r.stage).toBe(STAGES.READY);
    expect(r.notes).toEqual([]);
  });

  test('READY survives a newer draft stacked on the published plan, but says so', () => {
    const r = v({ planStatus: 'draft' });
    expect(r.verdict).toBe('READY');
    expect(r.notes).toContain('a newer draft plan sits above the published one');
  });

  test('READY notes a browser-imported task list without blocking on it', () => {
    const r = v({ browserImportedLists: 2 });
    expect(r.verdict).toBe('READY');
    expect(r.notes.join(' ')).toMatch(/2 task list\(s\) look browser-imported/);
  });
});

describe('each stage blocks, with the reason naming that stage', () => {
  const cases = [
    ['no project at all', { hasProject: false }, STAGES.NO_PROJECT, /no build project/],
    ['intake never arrived', { intakeStatus: null }, STAGES.NO_INTAKE, /never reached the server/],
    ['generation failed', { intakeStatus: 'failed' }, STAGES.GENERATION_FAILED, /replayable/],
    ['generation in flight', { intakeStatus: 'generating' }, STAGES.INTAKE_GENERATING, /in flight/],
    ['plan row missing', { intakeStatus: 'captured', planStatus: null, hasPublishedPlan: false }, STAGES.NO_PLAN, /no plan was generated/],
    ['drafted, never published', { planStatus: 'draft', hasPublishedPlan: false }, STAGES.PLAN_UNPUBLISHED, /never published/],
    ['superseded with nothing live', { planStatus: 'superseded', hasPublishedPlan: false }, STAGES.PLAN_SUPERSEDED, /superseded/],
    ['published but no tasks', { taskCount: 0, datedTaskCount: 0 }, STAGES.NO_TASKS, /no tasks were materialized/],
    ['tasks without STORY-000', { hasStory000: false }, STAGES.NO_STORY_000, /STORY-000 is missing/],
    ['tasks undated', { datedTaskCount: 0 }, STAGES.TASKS_UNDATED, /undated/],
    ['not the active project', { isActiveProject: false }, STAGES.NO_ACTIVE_PROJECT, /active project/],
  ];

  test.each(cases)('%s', (_label, over, stage, reasonRx) => {
    const r = v(over);
    expect(r.verdict).toBe('NOT_READY');
    expect(r.stage).toBe(stage);
    expect(r.reason).toMatch(reasonRx);
  });
});

describe('the gate, where gate_ok is not the question', () => {
  // The trap this guards: build_plans.gate_ok is TRUE only for a plan with zero
  // violations, so healthy published plans routinely carry gate_ok = false with
  // a style warning on them. Reading gate_ok as "did the gate fail" would call
  // most of a working cohort broken.
  test('a published plan with only non-blocking warnings is still READY', () => {
    const r = v({ planGateOk: false, gateViolationRules: ['requirement_unfalsifiable', 'release_unbalanced'] });
    expect(r.verdict).toBe('READY');
    expect(r.notes.join(' ')).toMatch(/non-blocking gate warnings: requirement_unfalsifiable, release_unbalanced/);
  });

  test('an unpublished plan with a blocking rule is gate_failed, and the rule is named', () => {
    const r = v({
      planStatus: 'draft', hasPublishedPlan: false, planGateOk: false,
      gateViolationRules: ['must_uncovered', 'release_unbalanced'],
    });
    expect(r.stage).toBe(STAGES.GATE_FAILED);
    expect(r.reason).toBe('gate_failed: must_uncovered');   // the warning is not listed as a cause
  });

  test('intake status gate_failed blocks even when the recorded rules are non-blocking', () => {
    // Real production row: the intake was marked gate_failed before the
    // blocking/non-blocking split existed. Trust the recorded status.
    const r = v({ intakeStatus: 'gate_failed', planGateOk: false, gateViolationRules: ['requirement_unfalsifiable'] });
    expect(r.stage).toBe(STAGES.GATE_FAILED);
    expect(r.reason).toBe('gate_failed: requirement_unfalsifiable');
  });

  test('gate_failed with no recorded rules still says so rather than showing an empty list', () => {
    const r = v({ intakeStatus: 'gate_failed', gateViolationRules: [] });
    expect(r.reason).toBe('gate_failed: rules not recorded');
  });

  test('duplicate rule names are reported once', () => {
    const r = v({ intakeStatus: 'gate_failed', gateViolationRules: ['must_uncovered', 'must_uncovered', ' must_uncovered '] });
    expect(r.reason).toBe('gate_failed: must_uncovered');
  });

  // The blocking set is duplicated out of planGate.ts because these scripts run
  // from source in a container and cannot import compiled TypeScript. Assert the
  // copy against the original so the two cannot drift apart unnoticed.
  test('the blocking rule list matches BLOCKING_RULES in planGate.ts', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../services/sbp/planGate.ts'), 'utf8',
    );
    const block = /export const BLOCKING_RULES[^[]*\[([\s\S]*?)\]/.exec(src);
    expect(block).not.toBeNull();
    const fromSource = (block[1].match(/'([a-z0-9_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    expect(fromSource.length).toBeGreaterThan(0);
    expect([...BLOCKING_GATE_RULES].sort()).toEqual([...fromSource].sort());
  });
});

describe('ordering: the reason names the first failure, not the last', () => {
  test('a build broken at every stage reports the intake, not the tasks', () => {
    const r = v({
      intakeStatus: null, planStatus: null, hasPublishedPlan: false,
      taskCount: 0, datedTaskCount: 0, hasStory000: false, isActiveProject: false,
    });
    expect(r.stage).toBe(STAGES.NO_INTAKE);
  });

  test('no project outranks a missing intake', () => {
    expect(v({ hasProject: false, intakeStatus: null }).stage).toBe(STAGES.NO_PROJECT);
  });

  test('an unpublished plan outranks the tasks that somehow exist under it', () => {
    // Seen in production: ten tasks against a plan that was never published,
    // left behind by an earlier materialization path. The plan is the real story.
    const r = v({ planStatus: 'draft', hasPublishedPlan: false, taskCount: 10, datedTaskCount: 0, hasStory000: false });
    expect(r.stage).toBe(STAGES.PLAN_UNPUBLISHED);
  });

  test('a missing STORY-000 outranks undated tasks', () => {
    expect(v({ hasStory000: false, datedTaskCount: 0 }).stage).toBe(STAGES.NO_STORY_000);
  });
});

describe('the undated reason distinguishes the ways dates go missing', () => {
  test('no cohort start date at all', () => {
    expect(v({ datedTaskCount: 0, cohortStartDate: null }).reason)
      .toBe('tasks present but undated - cohort has no start date');
  });

  test('a cohort start date that was never applied', () => {
    expect(v({ datedTaskCount: 0, cohortStartDate: '2026-07-23' }).reason)
      .toBe('tasks present but undated - cohort start date 2026-07-23 was never applied');
  });

  // The build-student-project runbook's readiness query requires
  // `undated_tasks = 0`. This tool must not call a student ready that the
  // canonical query would not.
  test('even one undated task blocks, and the reason counts them', () => {
    const r = v({ datedTaskCount: 19, taskCount: 20 });
    expect(r.verdict).toBe('NOT_READY');
    expect(r.stage).toBe(STAGES.TASKS_UNDATED);
    expect(r.reason).toBe('1 of 20 tasks have no due date');
  });
});

describe('hostile and empty input', () => {
  test('an empty snapshot is NOT_READY rather than a crash', () => {
    expect(deriveVerdict({}).verdict).toBe('NOT_READY');
    expect(deriveVerdict({}).stage).toBe(STAGES.NO_PROJECT);
  });

  test('undefined is NOT_READY rather than a crash', () => {
    expect(deriveVerdict(undefined).verdict).toBe('NOT_READY');
  });

  test('null and non-string entries in the rule list do not become reasons', () => {
    const r = v({ intakeStatus: 'gate_failed', gateViolationRules: [null, undefined, '', 'must_uncovered'] });
    expect(r.reason).toBe('gate_failed: must_uncovered');
  });

  test('string counts from a JSON round trip are still counted', () => {
    // JSON.parse of an audit file can hand back numbers as strings if anything
    // upstream stringifies them; the verdict must not read "0" as truthy.
    expect(v({ taskCount: '0', datedTaskCount: '0' }).stage).toBe(STAGES.NO_TASKS);
    expect(v({ taskCount: '20', datedTaskCount: '20' }).verdict).toBe('READY');
  });

  test('a verdict never mutates the snapshot it was given', () => {
    const snap = { ...READY };
    const frozen = JSON.stringify(snap);
    deriveVerdict(snap);
    expect(JSON.stringify(snap)).toBe(frozen);
  });
});
