/**
 * P7-T1.2 — the eight required corpus cases from `reference-fixtures.md` §103.
 *
 * ## The seam with `corpusControls.test.ts`
 *
 * That file owns the §139 POSITIVE CONTROLS: each check observed failing against a clean
 * baseline, so a passing check is known to be capable of failing. This file owns the §103 CASES:
 * each is a shape the system must handle correctly, several of which are variants rather than
 * separate fixtures. Controls prove the apparatus works; cases prove the product does.
 *
 * ## Four of the eight run the generation half; two are PURE prerequisite checks
 *
 * Cases 1 to 4 and 6 drive `runCorpusCase`. Cases 5 and 8 — multiple roles held by one person,
 * and a blueprint changed while generation is in flight — are properties of
 * `lifecyclePrerequisites`, which is pure and DB-free by design, so they are driven directly
 * against an evidence snapshot. That is not a shortcut: the gate is where those two rules live,
 * and testing them through generation would be testing the wrong layer.
 *
 * Case 7, source overflow, is **recorded rather than closed here**. The plan assigns the flag and
 * the production measurement to T1.3 because that path is the only part of T1 that can change
 * behaviour on a live student-facing surface. What this file does is pin the CURRENT behaviour so
 * T1.3 changes something known rather than something assumed.
 */

import { runCorpusCase, type CorpusFixture } from './corpusRunner';
import { fixtureA, fixtureB, fixtureC } from '../../generation/__tests__/fixtures/referenceFixtures';
import { factoryProjectView } from '../../../factory/factoryProjectView';
import { manualOnlyEffort } from '../../generation/__tests__/fixtures/manualOnly';
import { caseOf, fixtureDCase } from './corpusCaseFixtures';

// ─────────────────────────── cases 1 to 4: the four fixtures ───────────────────────────

describe('§103 cases 1 to 4: each fixture composes, and records its OWN numbers', () => {
  const CASES: Array<[string, CorpusFixture]> = [
    ['1. ordinary AI service application (C)',
      caseOf('C-ordinary', 'the common path works end to end', fixtureC)],
    ['2. government, two tracks (A)',
      caseOf('A-government', 'track-bearing requirements survive composition', fixtureA)],
    ['3. human-heavy workflow (B)',
      caseOf('B-human-heavy', 'below-target is honest, not reclassified', fixtureB)],
    ['4. manual-only workflow (D)', fixtureDCase()],
  ];

  it.each(CASES)('%s composes with zero refusals and reaches `complete`', (_label, fx) => {
    const run = runCorpusCase(fx);
    expect(run.composed?.refusals ?? []).toEqual([]);
    expect(run.generationStoppedAt).toBeNull();
    expect(run.stagesDriven).toContain('complete');
  });

  /**
   * `reference-fixtures.md` asks for workspace counts and effort assumptions **per fixture, each
   * with its basis**. Per fixture is the operative phrase: a single aggregate would hide that
   * fixture A is wholly ESTIMATED while B and D are wholly MEASURED, which is the difference
   * between a number you can plan with and a number somebody guessed.
   */
  it.each(CASES)('%s records its workspace count and its effort BASES by name', (_label, fx) => {
    const run = runCorpusCase(fx);
    expect(run.workspaceCount).toBe(2);
    expect(run.effortBases.length).toBeGreaterThan(0);
    // Named, never summarised: UNKNOWN has to stay visible as itself.
    for (const b of run.effortBases) expect(['MEASURED', 'ESTIMATED', 'UNKNOWN']).toContain(b);
  });

  it('the four fixtures do NOT all share one effort basis, so the per-fixture record earns its keep', () => {
    // The control on the assertion above. If every fixture reported the same basis, "per fixture"
    // would be decoration and an aggregate would lose nothing.
    const bases = CASES.map(([, fx]) => runCorpusCase(fx).effortBases.join('+'));
    expect(new Set(bases).size).toBeGreaterThan(1);
  });

  /**
   * MUST-HAVE TRACEABILITY AS A DERIVED ENUMERATION, which is the plan's acceptance wording.
   *
   * A count is not an enumeration: "3 of 3 covered" is true of a run that matched the wrong three.
   * The runner reports the block IDS, derived from the project and from `factoryValidate`'s
   * shipped `SOURCE_COVERAGE` rule, so the assertion below names them.
   */
  /**
   * THE PROPERTY §103 CASE 2 ACTUALLY NAMES, which this suite previously only claimed.
   *
   * The spec row is "Government project, linked proposal + solution tracks | A | track mappings
   * preserved", and `reference-fixtures.md` requires that "a requirement spanning both tracks
   * appears once with a stable canonical ID, mapped into both requirement_proposal_sections and
   * requirement_solution_stories".
   *
   * An independent verifier found the case LABELLED with that and asserting none of it: fixture A
   * carried `tracks: []` and `requirements: []`, and no test in this directory mentioned a track.
   * A prose claim with nothing behind it is the defect class this phase refuses.
   *
   * Driven against `factoryProjectView`, which declares itself pure with no I/O and computes
   * `tracks[].requirementIds` directly -- the same pure-layer route cases 5 and 8 use. The
   * assertion is BY ID and is the SAME id on both sides, because "one requirement appears in two
   * tracks" and "two requirements happen to exist" are different facts and a count cannot tell
   * them apart.
   */
  it('case 2 keeps ONE canonical requirement id in BOTH tracks — the property the row names', () => {
    const view = factoryProjectView(fixtureA.project());
    const byType = Object.fromEntries(view.tracks.map((t) => [t.trackType, t.requirementIds]));

    expect(Object.keys(byType).sort()).toEqual(['proposal', 'solution_build']);
    // The same id, not merely one id each. A canonical id is what lets a compliance matrix join
    // the proposal answer to the build story.
    // The canonical id is in BOTH.
    expect(byType.proposal).toContain('REQ-CANON-1');
    expect(byType.solution_build).toContain('REQ-CANON-1');

    // AND THE TRACK-EXCLUSIVE ONE IS IN EXACTLY ONE. This is the half that makes it a JOIN
    // rather than a dump: deleting the track filter in `factoryProjectView` used to leave every
    // test in the tree green, because one requirement cannot show over-inclusion.
    expect(byType.proposal).toContain('REQ-PROP-ONLY');
    expect(byType.solution_build).not.toContain('REQ-PROP-ONLY');

    // Exact membership, so a third requirement cannot appear unnoticed on either side.
    expect([...byType.proposal].sort()).toEqual(['REQ-CANON-1', 'REQ-PROP-ONLY']);
    expect(byType.solution_build).toEqual(['REQ-CANON-1']);
  });

  it('and fixtures B and C do NOT inherit tracks, so the shape belongs to the government case', () => {
    // `shell()` is shared by A, B and C. Without this, making A two-track would silently give the
    // admissions and service-business fixtures a government contract shape.
    expect(factoryProjectView(fixtureB.project()).tracks).toEqual([]);
    expect(factoryProjectView(fixtureC.project()).tracks).toEqual([]);
  });

  it('case 2 enumerates its requirement blocks BY ID, covered and uncovered', () => {
    const t = runCorpusCase(caseOf('A-government', 'enumeration', fixtureA)).traceability;

    // THE COMMAND IS PRINTED, because the acceptance clause is "a derived enumeration WITH THE
    // COMMAND PRINTED". An enumeration nobody else can reproduce is still a number I am asking
    // to be believed. Printed rather than only written in a comment so it appears in the run log.
    // eslint-disable-next-line no-console
    console.log([
      '[corpus] requirement-block coverage for fixture A.',
      'Derived by factoryValidate SOURCE_COVERAGE via corpusRunner.requirementCoverage.',
      'Reproduce:  node ../node_modules/jest/bin/jest.js -c jest.ci.config.ts'
        + ' --runTestsByPath src/services/lifecycle/__tests__/corpus/corpusCases.test.ts',
      `blocks=${JSON.stringify(t.requirementBlocks)}`,
      `covered=${JSON.stringify(t.covered)}`,
      `uncovered=${JSON.stringify(t.uncovered)}`,
    ].join('\n  '));

    expect(t.requirementBlocks.sort()).toEqual(['blk-matrix', 'blk-sec-m']);
    expect(t.covered.sort()).toEqual(['blk-matrix', 'blk-sec-m']);
    expect(t.uncovered).toEqual([]);
    // Partition, asserted: every block is in exactly one of the two lists. Without this, both
    // could be populated from the same source and the report would still look complete.
    expect([...t.covered, ...t.uncovered].sort()).toEqual(t.requirementBlocks.sort());
  });

  it('and it reports story coverage as NOT ASSESSABLE with a reason, never as an empty list', () => {
    // `[]` would read as "measured, no gaps" for data nobody measured. Stories do not exist until
    // planning, which is DB-backed and deferred by the runner.
    const t = runCorpusCase(caseOf('A-government', 'enumeration', fixtureA)).traceability;
    expect(t.storyCoverage).toBeNull();
    expect(t.storyCoverageReason).toBeTruthy();
  });

  it('case 3 is below target and says so WITH its denominator, rather than being reclassified', () => {
    const m = runCorpusCase(caseOf('B-human-heavy', 'below target', fixtureB)).composed!.draft!.measures!;
    expect(m.belowTarget).toBe(true);
    // The honest answer is a low share, not a reclassified decision. The denominator is what
    // stops it being a bare percentage.
    expect(m.aiShare.denominatorMinutes).toBeGreaterThan(0);
    expect(m.aiShare.fraction!).toBeLessThan(0.85);
  });

  /**
   * FIXTURE D'S VIOLATING TWIN. Every fixture ships one; D had none, and the extension point
   * where it belonged -- `fixtureDCase({ effort })` -- was never called with an argument. A
   * verifier found the dead hook sitting exactly where the missing twin went.
   *
   * The twin is the manual-only fixture with its effort assessed as UNKNOWN basis. That is the
   * violation that matters FOR THIS FIXTURE: D's whole claim is that 0% automation is a recorded
   * decision backed by measured human minutes, so minutes that are not evidence turn the recorded
   * decision back into an assertion.
   */
  it('TWIN: fixture D with UNKNOWN-basis minutes is REFUSED, and the clean D is not', () => {
    const twin = fixtureDCase({
      effort: manualOnlyEffort().map((a) => ({ ...a, basis: 'UNKNOWN' as const })),
    });
    const codes = (runCorpusCase(twin).composed?.refusals ?? []).map((r) => r.code);
    expect(codes).toContain('EFFORT_BASIS_UNKNOWN');

    // The half that makes the twin mean something: the clean fixture does NOT refuse.
    expect((runCorpusCase(fixtureDCase()).composed?.refusals ?? []).map((r) => r.code))
      .not.toContain('EFFORT_BASIS_UNKNOWN');
  });

  it('case 4 is 0% automated BY DECISION: an empty agent roster with a recorded acceptance', () => {
    const run = runCorpusCase(fixtureDCase());
    const m = run.composed!.draft!.measures!;

    expect(m.aiShare.numeratorMinutes).toBe(0);
    expect(m.belowTarget).toBe(true);
    // The distinction fixture D exists for: zero automation is the REQUIREMENT, so it composes
    // cleanly rather than refusing. An empty agent roster is correct here, not a gap.
    expect(run.composed?.refusals ?? []).toEqual([]);
  });
});

// ─────────────────────── case 5: multiple roles held by one person ───────────────────────
