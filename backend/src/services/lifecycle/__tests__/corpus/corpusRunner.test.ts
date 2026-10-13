import {
  runCorpusCase,
  partitionIsTotal,
  type CorpusFixture,
  type CorpusRun,
} from './corpusRunner';
import {
  CORPUS_STAGES,
  DB_BACKED_STAGES,
  SHORT_CIRCUIT_STAGES,
  SURFACE_CHECK_STAGES,
  TERMINAL_STAGE,
} from './corpusStages';
import { GENERATION_STAGES } from '../../generation/blueprintGeneration';
import { LIFECYCLE_STAGES } from '../../lifecycleStages';
import { factoryValidate } from '../../../factory/factoryValidate';
import type { FactoryProject } from '../../../factory/contracts/factoryContract';
import { fixtureA } from '../../generation/__tests__/fixtures/referenceFixtures';

/**
 * P7-T1.1 — the corpus runner, and the controls that stop it lying about its own coverage.
 *
 * ## What this file is actually for
 *
 * Not "does the runner run". Two properties, and attempt 1 had neither:
 *
 * 1. **A stage the runner could not reach is a FAILURE rather than an absence.** That is the
 *    defect class this programme has already shipped once: `applyMeasurements` iterated an EMPTY
 *    map, so the only test for its loop never executed a line of the body, and deleting the whole
 *    loop left 850 of 850 tests green.
 * 2. **Each stage's `driven` flag is TRUE OF THAT STAGE.** Attempt 1 satisfied property 1 and
 *    failed this one: `driven` was one boolean fanned across ten stages, so a case refusing at
 *    `agents` still reported `effort`, `design` and `complete` as driven and `partitionIsTotal`
 *    returned true. A total partition over a vocabulary, false about every member.
 *
 * Property 2 is why the short-circuit block below exists, and why it is the load-bearing one.
 * Property 1 alone is satisfiable by a function that always returns true.
 */

type Origin = 'approved_blueprint' | 'model_turn';

const baseFields = (origin: Origin) => ({
  understanding: fixtureA.understanding(),
  project: fixtureA.project(),
  allocation: fixtureA.allocation(),
  agents: fixtureA.agents(),
  effort: fixtureA.effort(),
  declaration: { declaration: fixtureA.declaration(), origin },
  targetAcceptance: fixtureA.acceptance(),
});

/** Fixture A, adapted to the runner's descriptor. `acceptance` is the input's `targetAcceptance`. */
const CASE_A: CorpusFixture = {
  id: 'A',
  proves: 'government project, linked proposal and solution tracks: track mappings preserved',
  build: () => baseFields('approved_blueprint'),
};

/**
 * Fixture A with a model-supplied declaration. Refuses at `agents` BEFORE the handoff runs.
 *
 * This is the verifier's own probe, kept as a permanent control. `generateBlueprintOnce`'s first
 * guard returns `stage: 'agents'` with code `DECLARATION_SELF_SUPPLIED` before
 * `buildSourceHandoff` is ever called, so `handoff`, `process` and `allocation` did not run
 * either — the one case where the refusing stage is NOT preceded by passing ones.
 */
const CASE_A_MODEL_TURN: CorpusFixture = {
  id: 'A-model-turn',
  proves: 'a declaration from the same model turn refuses before the handoff runs',
  build: () => baseFields('model_turn'),
};

/**
 * Fixture A plus a requirement block no task cites. Refuses at `process`.
 *
 * Two jobs in one case, both real. It is a short-circuit case whose refusal comes from the
 * MIDDLE of the sequence (handoff passed, allocation onward never ran), and it is the negative
 * case for requirement coverage: `factoryValidate`'s `SOURCE_COVERAGE` rule must name the
 * uncited block. `processValidation.ts` spreads `factoryValidate(project)`, so this is the real
 * pipeline refusing, not a corpus-only notion.
 */
const CASE_A_UNCITED: CorpusFixture = {
  id: 'A-uncited-block',
  proves: 'a requirement block cited by no task is named, and generation stops at `process`',
  build: () => {
    const fields = baseFields('approved_blueprint');
    const project = fields.project as FactoryProject;
    project.source_blocks = [
      ...project.source_blocks,
      { id: 'blk-uncited', locator: '3.0', text: 'stated', kind: 'requirement' },
    ];
    return fields;
  },
};

/**
 * Fixture A with two workspace-state declarations supplied.
 *
 * Exists so `workspaceCount` is MEASURED against two different inputs rather than asserted
 * against one. A field only ever checked on a case where it is 0 is indistinguishable from a
 * field hardcoded to 0 — which is the shape of every decorative control this programme has
 * caught, including `effortBases` sorted-equals-itself over a one-element array in attempt 1.
 */
const CASE_A_WITH_WORKSPACES: CorpusFixture = {
  id: 'A-two-workspaces',
  proves: 'workspace counts are recorded per fixture, as `reference-fixtures.md` requires',
  build: () => baseFields('approved_blueprint'),
  composition: {
    workspaceStates: [
      { workspaceId: 'ws-intake', states: [], keyboardReachableActions: [] },
      { workspaceId: 'ws-review', states: [], keyboardReachableActions: [] },
    ],
  },
};

describe('THE VOCABULARY CONTROL: the stage lists are derived, not retyped', () => {
  // Attempt 1 appended 'approval', 'planning' and 'verification' — a third stage vocabulary, two
  // of whose three strings exist nowhere in the system. Nothing caught it because nothing checked
  // the names against the system's own. These are those checks.

  it('every DB-backed stage is a REAL member of LIFECYCLE_STAGES', () => {
    for (const stage of DB_BACKED_STAGES) {
      expect(LIFECYCLE_STAGES as ReadonlyArray<string>).toContain(stage);
    }
  });

  it('the three slices partition GENERATION_STAGES exactly, in order', () => {
    // So an insertion into GENERATION_STAGES cannot silently land outside every slice — which
    // would make it a stage the runner never reports at all.
    expect([...SHORT_CIRCUIT_STAGES, ...SURFACE_CHECK_STAGES, TERMINAL_STAGE])
      .toEqual([...GENERATION_STAGES]);
  });

  it('CORPUS_STAGES is DISTINCT, so the partition cannot be satisfied by a duplicate', () => {
    expect(new Set(CORPUS_STAGES).size).toBe(CORPUS_STAGES.length);
  });
});

describe('a clean case: the runner drives every composed stage and says so', () => {
  let run: CorpusRun;
  let elapsedMs = 0;

  beforeAll(() => {
    const started = Date.now();
    run = runCorpusCase(CASE_A);
    elapsedMs = Date.now() - started;
  });

  it('accounts for EVERY stage, with no stage unaccounted for', () => {
    expect(run.outcomes).toHaveLength(CORPUS_STAGES.length);
    expect(partitionIsTotal(run)).toBe(true);

    // Named, not counted. A length check would not say WHICH stage went missing.
    const accounted = [...run.stagesDriven, ...run.stagesNotReached.map((s) => s.stage)].sort();
    expect(accounted).toEqual([...CORPUS_STAGES].sort());
  });

  it('drove all ten composed stages IN ORDER, and generation reached its terminal marker', () => {
    expect(run.stagesDriven).toEqual([...GENERATION_STAGES]);
    expect(run.generationStoppedAt).toBeNull();
  });

  it('reports the five DB-backed stages NOT REACHED, each naming what actually needs a database', () => {
    expect(run.stagesNotReached.map((s) => s.stage)).toEqual([...DB_BACKED_STAGES]);
    for (const s of run.stagesNotReached) {
      // The reason must name the two functions that genuinely need a database. Attempt 1 said
      // only "needs a database", which overstated the blocker: `prerequisiteGaps`,
      // `evaluateTransition` and `storyTraceability` are pure.
      expect(s.reason).toContain('approveBlueprint');
      expect(s.reason).toContain('publishedPlanState');
      expect(s.reason).not.toBe('NO REASON RECORDED');
    }
  });

  it('measured requirement-block coverage with the SHIPPED rule, and found it complete', () => {
    const t = run.traceability;
    expect(t.requirementBlocks).toEqual(['blk-sec-m', 'blk-matrix']);
    expect(t.covered).toEqual(['blk-sec-m', 'blk-matrix']);
    expect(t.uncovered).toEqual([]);
    // The parse control. A `SOURCE_COVERAGE` message that did not parse would silently empty
    // `uncovered`, so it is reported instead and must be absent.
    expect(t.unparsedCoverageIssues).toEqual([]);
  });

  it('records what the customer STATED without pretending it is joined to anything', () => {
    expect(run.traceability.statedRequirements).toEqual([
      'The proposal must address every evaluation factor in Section M.',
      'A compliance matrix maps each requirement to the section answering it.',
    ]);
  });

  it('reports requirement-to-STORY coverage as NOT ASSESSABLE — null, never an empty list', () => {
    // `storyTraceability.ts`'s own header: returning `[]` "would report 'measured, no gaps' for
    // data nobody measured, which is the gate bypass `applyMeasurements` was rewritten to
    // prevent." No stories exist until planning is driven, and planning is DB-backed.
    expect(run.traceability.storyCoverage).toBeNull();
    expect(run.traceability.storyCoverageReason).toContain('NOT ASSESSABLE');
    expect(run.traceability.storyCoverageReason).toContain('requirementsWithoutStory');
  });

  it('records the effort bases by NAME rather than summarising them', () => {
    // `reference-fixtures.md` requires effort assumptions recorded per fixture. A mean would hide
    // an `UNKNOWN` basis, which is the one value that matters. Asserted as the exact set: a
    // sorted-equals-itself check on a one-element array is unfalsifiable, which is why attempt
    // 1's version survived having `effortBases` emptied.
    expect(run.effortBases).toEqual(['ESTIMATED']);
  });

  it('records the workspace count, and it TRACKS the input rather than being a constant', () => {
    // `reference-fixtures.md` requires workspace counts recorded per fixture. Two inputs, two
    // different answers — the minimum needed for this assertion to be able to fail.
    expect(run.workspaceCount).toBe(0);
    expect(runCorpusCase(CASE_A_WITH_WORKSPACES).workspaceCount).toBe(2);
  });

  it('a refusal is a RESULT, not a throw', () => {
    // Several corpus cases exist to be refused. If the runner threw on a refusal, a case designed
    // to be refused would be indistinguishable from the apparatus breaking.
    expect(run.composed).not.toBeNull();
    expect(() => runCorpusCase(CASE_A)).not.toThrow();
  });

  it('RUNTIME CAP: one case is far inside the 8-minute budget for the whole suite', () => {
    // The plan caps the corpus suite at 8 minutes because it runs inside the required
    // `Backend unit tests` check. Measured per case here so the budget is tracked from the
    // first case rather than discovered at the sixteenth.
    expect(elapsedMs).toBeLessThan(10_000);
    // eslint-disable-next-line no-console
    console.log(`[corpus] case A drove ${run.stagesDriven.length} stages in ${elapsedMs}ms`);
  });
});

describe('THE PER-STAGE CONTROL: a short-circuit must un-drive the stages after it', () => {
  // THE LOAD-BEARING BLOCK. Attempt 1 passed every assertion in the clean block above while
  // reporting stages driven that never executed, because `driven` was a constant. These cases
  // are the ones a constant cannot survive.

  describe('refusing at `agents` before the handoff runs', () => {
    let run: CorpusRun;
    beforeAll(() => { run = runCorpusCase(CASE_A_MODEL_TURN); });

    it('names `agents` as where generation stopped', () => {
      expect(run.generationStoppedAt).toBe('agents');
    });

    it('does NOT claim the stages after the refusal were driven', () => {
      // The exact assertion attempt 1 failed. `effort` and `complete` never ran.
      expect(run.stagesDriven).not.toContain('effort');
      expect(run.stagesDriven).not.toContain(TERMINAL_STAGE);
    });

    it('does NOT claim the stages BEFORE the refusal were driven either', () => {
      // Stricter than the general rule, and specific to this guard: `DECLARATION_SELF_SUPPLIED`
      // returns before `buildSourceHandoff` is called, so the three stages that normally precede
      // `agents` did not run. Reporting them driven is the same lie in the other direction.
      expect(run.stagesDriven).not.toContain('handoff');
      expect(run.stagesDriven).not.toContain('process');
      expect(run.stagesDriven).not.toContain('allocation');
    });

    it('drove EXACTLY the refusing stage plus the four unconditional surface checks', () => {
      // Asserted as the whole list, so neither over- nor under-reporting can hide.
      expect(run.stagesDriven).toEqual(['agents', ...SURFACE_CHECK_STAGES]);
    });

    it('gives every un-driven generation stage a reason naming the pre-check', () => {
      // EVERY un-driven generation stage, not only the ones before `agents`. When the pre-check
      // fires nothing else in generation ran at all, so `effort` is unreached for the same reason
      // `handoff` is — not because "generation stopped at agents" after running up to it. The
      // first version of this assertion expected the ordering reason for `effort` and failed,
      // which is the distinction being kept.
      const reasons = new Map(run.stagesNotReached.map((s) => [s.stage, s.reason]));
      for (const stage of ['handoff', 'process', 'allocation', 'effort'] as const) {
        expect(reasons.get(stage)).toContain('DECLARATION_SELF_SUPPLIED');
        expect(reasons.get(stage)).toContain('never executed');
      }
      // The terminal marker is unreached for the ordering reason, which is a different fact.
      expect(reasons.get(TERMINAL_STAGE)).toContain("generation refused at 'agents'");
    });

    it('the surface checks really did run, proven by their own refusals', () => {
      // Not an assumption from `composeBlueprint`'s comment: the refusals it returned name
      // `design`, so that check executed and judged. This is why a generation short-circuit must
      // NOT be reported as un-driving `design`.
      const refusedStages = (run.composed?.refusals ?? []).map((r) => r.stage);
      expect(refusedStages).toContain('design');
      expect(run.stagesDriven).toContain('design');
    });

    it('still accounts for every stage', () => {
      expect(partitionIsTotal(run)).toBe(true);
      expect(run.outcomes).toHaveLength(CORPUS_STAGES.length);
    });
  });

  describe('refusing in the MIDDLE of the sequence, at `process`', () => {
    let run: CorpusRun;
    beforeAll(() => { run = runCorpusCase(CASE_A_UNCITED); });

    it('drove the stages up to and including the refusal, and nothing after', () => {
      expect(run.generationStoppedAt).toBe('process');
      expect(run.stagesDriven).toEqual(['handoff', 'process', ...SURFACE_CHECK_STAGES]);
      for (const stage of ['allocation', 'agents', 'effort', TERMINAL_STAGE] as const) {
        expect(run.stagesDriven).not.toContain(stage);
      }
    });

    it('distinguishes `handoff` (ran, passed) from `allocation` (never ran)', () => {
      // The distinction a constant cannot make: both are non-refusing stages, one executed and
      // one did not.
      expect(run.stagesDriven).toContain('handoff');
      const reasons = new Map(run.stagesNotReached.map((s) => [s.stage, s.reason]));
      expect(reasons.get('allocation')).toContain("generation stopped at 'process'");
    });

    it('still accounts for every stage', () => {
      expect(partitionIsTotal(run)).toBe(true);
    });
  });
});

describe('THE COVERAGE CONTROL: the traceability rule must be able to report a GAP', () => {
  // Attempt 1's coverage rule was dead: it read `composed.draft.tasks`, and `BlueprintDraft` has
  // no `tasks` field, so `covered` was `[]` for every input and a mutant replacing the whole
  // computation with `const covered: string[] = []` stayed green at 12 of 12. A rule that cannot
  // report a gap is not a rule.

  let clean: CorpusRun;
  let uncited: CorpusRun;
  beforeAll(() => {
    clean = runCorpusCase(CASE_A);
    uncited = runCorpusCase(CASE_A_UNCITED);
  });

  it('NAMES the uncited requirement block', () => {
    expect(uncited.traceability.uncovered).toEqual(['blk-uncited']);
  });

  it('keeps `covered` NON-EMPTY, so emptying it is detectable', () => {
    // The specific hole in attempt 1. If `covered` is always `[]`, every assertion about it is
    // vacuous and every mutation to it is invisible.
    expect(clean.traceability.covered.length).toBeGreaterThan(0);
    expect(uncited.traceability.covered).toEqual(['blk-sec-m', 'blk-matrix']);
  });

  it('the two lists PARTITION the requirement blocks, by name', () => {
    const t = uncited.traceability;
    expect([...t.covered, ...t.uncovered].sort()).toEqual([...t.requirementBlocks].sort());
    for (const id of t.covered) expect(t.uncovered).not.toContain(id);
  });

  it('the SHIPPED rule is the instrument, not a copy of it', () => {
    // Ties the report to `factoryValidate` itself. If the runner reimplemented the rule, this
    // would still pass while the two drifted — so it asserts the shipped validator independently
    // produces the same finding the runner reported.
    const project = CASE_A_UNCITED.build().project as FactoryProject;
    const shipped = factoryValidate(project).filter((i) => i.code === 'SOURCE_COVERAGE');
    expect(shipped.map((i) => i.message)).toEqual(['requirement block blk-uncited is cited by no task']);
    expect(factoryValidate(CASE_A.build().project as FactoryProject)
      .filter((i) => i.code === 'SOURCE_COVERAGE')).toEqual([]);
  });

  it('the parse of the shipped rule is EXHAUSTIVE over the issues it emits', () => {
    // What `unparsedCoverageIssues` can honestly prove. Every `SOURCE_COVERAGE` issue the
    // shipped validator produced yielded a block id, so `uncovered` is the WHOLE finding and
    // not a silently filtered subset of it. Non-vacuous because the issue list is asserted
    // non-empty first.
    //
    // What it cannot prove is that it catches message-format drift: a verifier deleted the
    // push into it and the suite stayed GREEN, because the shipped rule has one call site and
    // one format, so no real input can land in that list. Breaking the regex is caught by the
    // `covered`/`uncovered` assertions above instead.
    const project = CASE_A_UNCITED.build().project as FactoryProject;
    const issues = factoryValidate(project).filter((i) => i.code === 'SOURCE_COVERAGE');
    expect(issues.length).toBeGreaterThan(0);
    expect(uncited.traceability.uncovered).toHaveLength(issues.length);
    expect(uncited.traceability.unparsedCoverageIssues).toEqual([]);
  });

  it('an uncited requirement block is a REAL pipeline refusal, not a corpus-only notion', () => {
    const refusals = (uncited.composed?.refusals ?? []).map((r) => [r.stage, r.code]);
    expect(refusals).toContainEqual(['process', 'SOURCE_COVERAGE']);
  });
});

describe('THE NEGATIVE CONTROL: the partition check must be able to FAIL', () => {
  // Without this block, `partitionIsTotal` could `return true` and every assertion above would
  // still pass. This programme has shipped three controls that proved nothing until the control
  // itself was tested, so the invariant gets its own adversary.

  const good = () => runCorpusCase(CASE_A);

  it('fails when a stage is DROPPED from the outcome list', () => {
    const doctored = good();
    doctored.outcomes = doctored.outcomes.slice(1);
    doctored.stagesDriven = doctored.outcomes.filter((o) => o.driven).map((o) => o.stage);
    expect(partitionIsTotal(doctored)).toBe(false);
  });

  it('fails when a stage is DUPLICATED instead of distinct', () => {
    // A duplicate keeps the length right and the set wrong, which a length-only check would miss.
    const doctored = good();
    doctored.outcomes = [doctored.outcomes[0], ...doctored.outcomes.slice(0, -1)];
    doctored.stagesDriven = doctored.outcomes.filter((o) => o.driven).map((o) => o.stage);
    expect(partitionIsTotal(doctored)).toBe(false);
  });

  it('fails when a not-reached stage carries NO REASON', () => {
    // The specific hole: a stage accounted for, but unexplained. That is a silent skip wearing
    // the paperwork of an honest one.
    const doctored = good();
    doctored.stagesNotReached = doctored.stagesNotReached.map((s) => ({ ...s, reason: '' }));
    expect(partitionIsTotal(doctored)).toBe(false);
  });

  it('fails when driven and not-reached DISAGREE with the outcome list', () => {
    const doctored = good();
    doctored.stagesNotReached = [];
    expect(partitionIsTotal(doctored)).toBe(false);
  });

  it('POSITIVE COUNTERPART: the undoctored run passes', () => {
    // Without this, a `partitionIsTotal` that returned false unconditionally would satisfy every
    // test above and the whole corpus would be unrunnable for a reason nobody could see.
    expect(partitionIsTotal(good())).toBe(true);
  });
});
