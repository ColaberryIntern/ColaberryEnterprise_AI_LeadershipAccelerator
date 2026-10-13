import {
  runCorpusCase,
  partitionIsTotal,
  CORPUS_STAGES,
  type CorpusFixture,
  type CorpusRun,
} from './corpusRunner';
import { GENERATION_STAGES } from '../../generation/blueprintGeneration';
import { fixtureA } from '../../generation/__tests__/fixtures/referenceFixtures';

/**
 * P7-T1.1 — the corpus runner, and the control that stops it lying about its own coverage.
 *
 * ## What this file is actually for
 *
 * Not "does the runner run". The property worth testing is that **a stage the runner could not
 * reach is a FAILURE rather than an absence.** That is the defect class this programme has
 * already shipped once: `applyMeasurements` iterated an EMPTY map, so the only test for its loop
 * never executed a line of the body, and deleting the whole loop left 850 of 850 tests green. A
 * corpus runner that silently skipped a stage would report a pass over a journey that never
 * happened — the same defect with more surface area.
 *
 * So the runner returns a TOTAL PARTITION of `CORPUS_STAGES`, and the load-bearing test here is
 * the NEGATIVE one: `partitionIsTotal` has to FAIL on a doctored run. Without that, the invariant
 * is a function that returns true and proves nothing.
 */

/** Fixture A, adapted to the runner's descriptor. `acceptance` is the input's `targetAcceptance`. */
const CASE_A: CorpusFixture = {
  id: 'A',
  proves: 'government project, linked proposal and solution tracks: track mappings preserved',
  build: () => ({
    understanding: fixtureA.understanding(),
    project: fixtureA.project(),
    allocation: fixtureA.allocation(),
    agents: fixtureA.agents(),
    effort: fixtureA.effort(),
    declaration: { declaration: fixtureA.declaration(), origin: 'approved_blueprint' },
    targetAcceptance: fixtureA.acceptance(),
  }) as never,
};

describe('the runner drives a real fixture and says exactly how far it got', () => {
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

  it('drove the generation stages, because `composeBlueprint` owns them', () => {
    // Asserted as the SET, not as a count: ten of the wrong ten would pass a count.
    expect([...run.stagesDriven].sort()).toEqual([...GENERATION_STAGES].sort());
  });

  it('reports the three database stages as NOT REACHED, each with a reason', () => {
    const notReached = run.stagesNotReached.map((s) => s.stage).sort();
    expect(notReached).toEqual(['approval', 'planning', 'verification']);
    // A reason on every one. An unreasoned not-reached is the silent skip in disguise.
    for (const s of run.stagesNotReached) {
      expect(s.reason.length).toBeGreaterThan(10);
      expect(s.reason).not.toBe('NO REASON RECORDED');
    }
  });

  it('produced a traceability report whose three lists are consistent', () => {
    const { mustHave, covered, uncovered } = run.traceability;
    expect(mustHave.length).toBeGreaterThan(0);        // the fixture really does carry requirements
    // Every requirement is in exactly one of the two outcome lists. The same partition discipline
    // as the stages, for the same reason.
    expect(covered.length + uncovered.length).toBe(mustHave.length);
    for (const r of covered) expect(uncovered).not.toContain(r);
  });

  it('records the effort bases rather than summarising them, so UNKNOWN stays visible', () => {
    // `reference-fixtures.md` requires effort assumptions recorded per fixture. A mean would hide
    // an `UNKNOWN` basis, which is the one value that matters.
    expect(Array.isArray(run.effortBases)).toBe(true);
    expect(run.effortBases).toEqual([...run.effortBases].sort());
  });

  it('a refusal is a RESULT, not a throw', () => {
    // Several corpus cases exist to be refused. If the runner threw on a refusal, a case designed
    // to be refused would be indistinguishable from the apparatus breaking.
    expect(run.composed).not.toBeUndefined();
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
