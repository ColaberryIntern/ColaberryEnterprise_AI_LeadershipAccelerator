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
import {
  fixtureA, fixtureB, fixtureC,
} from '../../generation/__tests__/fixtures/referenceFixtures';
import {
  manualOnlyUnderstanding, manualOnlyProject, manualOnlyAllocation, manualOnlyAgents,
  manualOnlyDeclaration, manualOnlyEffort, manualOnlyAcceptance,
} from '../../generation/__tests__/fixtures/manualOnly';
import { ws, wsState, acceptedDesign } from '../../generation/__tests__/fixtures/acceptedDesign';
import { prerequisiteGaps, blockingGaps } from '../../lifecyclePrerequisites';
import { factoryProjectView } from '../../../factory/factoryProjectView';
import { completeEvidence } from '../evidenceFixture';
import {
  measureAutomation, renderShare, type EffortAssessment,
} from '../../generation/effortMeasures';
import {
  buildFactoryDecomposeUserPrompt, coversRequirementBlocks, sourceBlocksPrecedeContext,
  MAX_BLOCK_CHARS, MAX_BLOCKS,
} from '../../../factory/factoryDecomposePrompt';

type Fixture = typeof fixtureA;

const fieldsOf = (fx: Fixture) => ({
  understanding: fx.understanding(),
  project: fx.project(),
  allocation: fx.allocation(),
  agents: fx.agents(),
  effort: fx.effort(),
  declaration: { declaration: fx.declaration(), origin: 'approved_blueprint' as const },
  targetAcceptance: fx.acceptance(),
});

/** A, B and C share the same task ids, so they share a composition. */
const abcComposition = () => ({
  bindings: [ws('t-draft', 'r-1'), ws('t-review', 'r-1')],
  workspaceStates: [wsState('t-draft'), wsState('t-review')],
  design: acceptedDesign(),
  // Fixture B carries the corpus's only rework edge and declares its own bound. Inert for A and
  // C, which have no rework edge: `validateProcess` looks up bounds only for edges a project has.
  reworkBounds: fixtureB.reworkBounds(),
});

/** Fixture D has its own task ids (`t-intake`) and its own role, so it needs its own. */
const dComposition = () => ({
  bindings: [ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel')],
  workspaceStates: [wsState('t-intake'), wsState('t-review')],
  design: acceptedDesign(),
});

const caseOf = (id: string, proves: string, fx: Fixture): CorpusFixture => ({
  id, proves, build: () => fieldsOf(fx), composition: abcComposition(),
});

const fixtureDCase = (over: { effort?: EffortAssessment[] } = {}): CorpusFixture => ({
  id: 'D-manual-only',
  proves: '"all human" is a RECORDED DECISION, not an empty allocation',
  build: () => ({
    understanding: manualOnlyUnderstanding(),
    project: manualOnlyProject(),
    allocation: manualOnlyAllocation(),
    agents: manualOnlyAgents(),
    effort: over.effort ?? manualOnlyEffort(),
    declaration: { declaration: manualOnlyDeclaration(), origin: 'approved_blueprint' as const },
    targetAcceptance: manualOnlyAcceptance(),
  }),
  composition: dComposition(),
});

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
    expect(byType.proposal).toEqual(['REQ-CANON-1']);
    expect(byType.solution_build).toEqual(['REQ-CANON-1']);
    expect(byType.proposal).toEqual(byType.solution_build);
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

describe('§103 case 5: one person in several roles does NOT satisfy separation of duty', () => {
  /**
   * Driven against the GATE, not generation, because that is where the rule lives.
   *
   * `blueprint_approved` compares `proposedBy` with `approval.approvedBy`. The case in the
   * document is a human "wearing two role hats", and the point is that the comparison keys on
   * IDENTITY, so giving the same person a second role id changes nothing. A rule that compared
   * roles instead would pass this and would be exactly the ceremonial loophole the lifecycle
   * exists to close.
   */
  const sameHuman = 'capture.manager@example.test';

  it('the approver and the proposer being one identity is REFUSED', () => {
    const e = completeEvidence();
    e.proposedBy = sameHuman;
    e.approval = { ...e.approval!, approvedBy: sameHuman };

    const gaps = prerequisiteGaps('blueprint_approved', e);
    const self = gaps.find((g) => g.rule === 'approval_self_approved');

    expect(self).toBeDefined();
    expect(self?.kind).toBe('unmet');
    expect(self?.message).toContain(sameHuman);
  });

  it('and a DIFFERENT approver passes, so the rule is not refusing everything', () => {
    const e = completeEvidence();
    e.proposedBy = sameHuman;
    e.approval = { ...e.approval!, approvedBy: 'director@example.test' };

    expect(prerequisiteGaps('blueprint_approved', e).map((g) => g.rule))
      .not.toContain('approval_self_approved');
  });

  it('a role change does NOT launder it: the two role hats are the same person', () => {
    // The case as the document words it. `approvedByRole` differs, the identity does not, and the
    // refusal must stand. If this ever passes, separation of duty has become a naming convention.
    const e = completeEvidence();
    e.proposedBy = sameHuman;
    e.approval = { ...e.approval!, approvedBy: sameHuman, approvedByRole: 'DELIVERY_OWNER' };

    expect(prerequisiteGaps('blueprint_approved', e).map((g) => g.rule))
      .toContain('approval_self_approved');
  });
});

// ──────────────────────── case 6: the low-information interview ────────────────────────

describe('§103 case 6: a low-information interview refuses to invent a number', () => {
  /**
   * The document's wording is the test: "unknowns stay `open`; coverage is reported as
   * incomplete; **no fabricated zeros and no precise-looking percentage**." Three different
   * failures, so three different assertions -- a single "it reports something" check would pass
   * on all three.
   *
   * ## What I ASSUMED, and what the system actually does
   *
   * The first version of this case dropped one task's assessment and expected a partial measure
   * with incomplete coverage. Composition REFUSED instead, at the `effort` stage, so
   * `composed.draft` was null and there were no measures to inspect.
   *
   * That is the better behaviour and the case now asserts it. Refusing is how the system avoids
   * publishing a share computed over the tasks that happen to have data -- which would be a
   * precise-looking percentage over a silently shrunken denominator, exactly what §103
   * forbids. The measure layer is still exercised directly below, because the gate refusing and
   * the arithmetic refusing to fabricate are two different guarantees and only one of them is
   * visible from composition.
   */
  const sparse = (): CorpusFixture => ({
    id: 'C-low-information',
    proves: 'a task with no assessment refuses rather than shrinking the denominator',
    build: () => ({
      ...fieldsOf(fixtureC),
      // One task assessed, one not. NOT an empty list: that is a different case (nothing was
      // asked at all) and would make the refusal mean something else.
      effort: [fixtureC.effort()[1]],
    }),
    composition: abcComposition(),
  });

  it('THE GATE: a task absent from the effort list refuses at `effort`, naming the task', () => {
    // The code is `EFFORT_TASK_UNACCOUNTED`, not `EFFORT_UNASSESSED`, and the distinction is the
    // whole of case 6. The shipped message draws it: "Omitting a task is not the same as
    // assessing it and finding nothing: the first inflates every share, the second lowers
    // coverage." A low-information interview produces the SECOND; silently dropping a task
    // produces the first, and that is what this refusal prevents.
    const run = runCorpusCase(sparse());
    const refusals = run.composed?.refusals ?? [];

    expect(refusals.map((r) => r.stage)).toContain('effort');
    const unaccounted = refusals.find((r) => r.code === 'EFFORT_TASK_UNACCOUNTED');
    expect(unaccounted).toBeDefined();
    // The task is named, so the gap is actionable rather than a count to go hunting through.
    expect(unaccounted?.subject).toBe('t-draft');
    expect(unaccounted?.message).toContain('coverage denominator');
    // And generation stopped there rather than carrying on to produce a share anyway.
    expect(run.generationStoppedAt).toBe('effort');
  });

  it('THE ARITHMETIC: all-unknown basis yields a NULL share, never a fabricated zero', () => {
    // Driven directly, because the gate refuses before measures are produced. `UNKNOWN` basis is
    // the low-information shape: minutes were offered but they are not evidence, so they are
    // excluded from the total and counted against coverage.
    const unknown: EffortAssessment[] = fixtureC.effort()
      .map((a) => ({ ...a, basis: 'UNKNOWN' as const }));
    const m = measureAutomation(unknown);

    // The one that matters. A `0` here reads as "we measured, and there is no automation", which
    // is a finding manufactured out of missing data.
    expect(m.aiShare.fraction).toBeNull();
    expect(m.aiShare.fraction).not.toBe(0);
    // The derived judgement refuses to be made rather than defaulting to false.
    expect(m.belowTarget).toBeNull();
    expect(m.belowTarget).not.toBe(false);
    // Coverage is REPORTED, and reported as incomplete: zero of the offered tasks were usable.
    expect(m.coverage.assessedTasks).toBe(0);
    expect(m.coverage.totalTasks).toBe(unknown.length);
    expect(m.coverage.totalTasks).toBeGreaterThan(0);
    // Every unusable task says so by name rather than vanishing from the denominator.
    expect(m.issues.map((i) => i.code)).toEqual(['EFFORT_BASIS_UNKNOWN', 'EFFORT_BASIS_UNKNOWN']);
  });

  it('THE RENDERING: an unassessed share prints as "not assessed" WITH its denominator', () => {
    // `renderShare` calls itself "the only sanctioned way to turn a Share into text", because a
    // bare percentage is a claim without a denominator. This is that claim, asserted.
    const m = measureAutomation(fixtureC.effort().map((a) => ({ ...a, basis: 'UNKNOWN' as const })));
    const text = renderShare(m.aiShare, m.coverage);

    expect(text).toContain('not assessed');
    expect(text).toContain('2 tasks');
    // No percentage anywhere in it. This is the "no precise-looking percentage" clause, and a
    // substring check for '%' is the whole of it.
    expect(text).not.toContain('%');
  });

  it('the FULL fixture does produce a share with a percentage, so the nulls are the data', () => {
    // The control. Without it, a measures implementation that returned null unconditionally, or a
    // renderer that never printed a percentage, would pass every assertion above.
    const m = measureAutomation(fixtureC.effort());
    expect(m.aiShare.fraction).not.toBeNull();
    expect(typeof m.belowTarget).toBe('boolean');
    expect(renderShare(m.aiShare, m.coverage)).toContain('%');
  });
});

// ─────────────── case 8: the blueprint changed while generation was in flight ───────────────

describe('§103 case 8: an in-flight generation cannot publish against a superseded revision', () => {
  /**
   * Time-of-check / time-of-use, re-checked at plan authorization.
   *
   * `blueprint_approved` holds the approval's revision; `currentManifestRevision` is what the
   * manifest is at NOW. A generation that started before a revision landed carries the older
   * approval, and the gate must refuse rather than publish against it.
   */
  it('an approval for an older revision is REFUSED once the manifest moves', () => {
    const e = completeEvidence();
    e.approval = { ...e.approval!, revision: 4 };
    e.currentManifestRevision = 5;

    const moved = prerequisiteGaps('blueprint_approved', e).find((g) => g.rule === 'approval_revision_moved');
    expect(moved).toBeDefined();
    // Both numbers named, so a reviewer knows which way it moved without opening the table.
    expect(moved?.message).toContain('4');
    expect(moved?.message).toContain('5');
  });

  it('and `planning` re-checks it, which is the point of a TOCTOU rule', () => {
    // Checking once at approval is what the rule exists to prevent. `planning` inherits
    // `blueprint_approved`, so the refusal has to survive into the stage that authorizes the plan.
    const e = completeEvidence();
    e.approval = { ...e.approval!, revision: 4 };
    e.currentManifestRevision = 5;

    expect(blockingGaps(prerequisiteGaps('planning', e)).map((g) => g.rule))
      .toContain('approval_revision_moved');
  });

  it('a matching revision passes both stages, so the rule is not refusing everything', () => {
    const e = completeEvidence();
    e.approval = { ...e.approval!, revision: 4 };
    e.currentManifestRevision = 4;

    expect(blockingGaps(prerequisiteGaps('planning', e))).toEqual([]);
  });
});

// ──────────────── case 7: source exceeding the model's input limits ────────────────

/**
 * §103 case 7 wants "an explicit completeness check, chunking, or a **visible blocking
 * overflow**". The factory path has a completeness check. THIS BLOCK RECORDS THAT IT DOES NOT
 * DETECT THE OVERFLOW, which is a finding rather than a passing feature.
 *
 * ## What the check actually checks
 *
 * `coversRequirementBlocks` returns true when "every requirement block id is named in the prompt
 * for the model to cite". The ids are named in the instruction line at the top of the prompt, and
 * that line is NOT inside a `delimited()` call. Only the three bodies are — SOURCE_BLOCKS,
 * REQUIREMENTS and CONTEXT — and `delimited()` clips at its cap with a `…[truncated at N chars]`
 * label.
 *
 * So when the source body overflows, the ids survive in the header and the TEXT is cut. The check
 * returns true for a prompt the model cannot answer from: it is verifying that we asked for the
 * blocks, not that we supplied them.
 *
 * ## Why this is recorded here and fixed elsewhere
 *
 * `plan-phase7.md` assigns the overflow flag and its production measurement to **T1.3**, kept
 * separate because that path is the only part of T1 that can change behaviour on a live
 * student-facing surface. T1.2 is tests and fixtures. Pinning the current behaviour is what makes
 * T1.3 a change to something known rather than something assumed — and when T1.3 lands, THIS
 * TEST SHOULD FAIL, which is the signal that the gap closed.
 *
 * The named trap, from the plan: `delimited()` **is** the SAFE-002 injection defence. Any fix must
 * preserve the delimiters, so the assertion below pins those too.
 */
describe('§103 case 7: source overflow drops blocks SILENTLY, and the check does not see it', () => {
  const block = (id: string, text: string) => ({ id, locator: '1.0', text, kind: 'requirement' as const });

  /** The SOURCE_BLOCKS section only, so "named in the header" and "supplied to the model" differ. */
  const sourceSection = (prompt: string): string => {
    const a = prompt.indexOf('<SOURCE_BLOCKS>');
    const b = prompt.indexOf('</SOURCE_BLOCKS>');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return prompt.slice(a, b);
  };

  it('under every cap: the id is in the header AND the text reaches the model', () => {
    const inputs = {
      sourceBlocks: [block('blk-1', 'the system must notify the applicant')],
      requirements: [], context: 'a short brief',
    };
    const prompt = buildFactoryDecomposeUserPrompt(inputs);

    expect(coversRequirementBlocks(prompt, inputs)).toBe(true);
    expect(sourceSection(prompt)).toContain('the system must notify the applicant');
  });

  it('RECORDED GAP 1: block 201 is dropped ENTIRELY and UNLABELLED, yet the check returns true', () => {
    // `renderBlocks` does `.slice(0, MAX_BLOCKS)`. There is no truncation label for this one --
    // `delimited()` only labels when the JOINED body exceeds its own cap, and 201 short blocks do
    // not come close. So the block does not arrive and nothing says so.
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => block(`blk-${i + 1}`, `requirement number ${i + 1}`));
    const inputs = { sourceBlocks: blocks, requirements: [], context: 'c' };
    const prompt = buildFactoryDecomposeUserPrompt(inputs);
    const body = sourceSection(prompt);

    // Dropped: the 201st block's text never reaches the model.
    expect(body).not.toContain(`requirement number ${MAX_BLOCKS + 1}`);
    expect(body).toContain('requirement number 1');
    // Silent: no label anywhere saying anything was removed.
    expect(prompt).not.toContain('truncated');

    // AND THE COMPLETENESS CHECK IS SATISFIED, because the id is listed in the instruction line
    // at the top, which `delimited()` never touches. The check verifies we ASKED for the block,
    // not that we SUPPLIED it. This is the finding §103 case 7 exists to force.
    expect(coversRequirementBlocks(prompt, inputs)).toBe(true);
  });

  it('RECORDED GAP 2: a block longer than MAX_BLOCK_CHARS is clipped, also unlabelled', () => {
    const tail = 'THE TAIL THE MODEL NEVER SEES';
    const inputs = {
      sourceBlocks: [block('blk-long', `${'x'.repeat(MAX_BLOCK_CHARS)}${tail}`)],
      requirements: [], context: 'c',
    };
    const prompt = buildFactoryDecomposeUserPrompt(inputs);

    expect(sourceSection(prompt)).not.toContain(tail);
    expect(prompt).not.toContain('truncated');
    expect(coversRequirementBlocks(prompt, inputs)).toBe(true);
  });

  it('the SAFE-002 delimiters and the grounding order survive, which any fix must preserve', () => {
    // `delimited()` is the injection defence, not a formatter. A fix that chunked or refused
    // without keeping the tags would harden the overflow and weaken injection resistance in the
    // same change -- the named trap in `plan-phase7.md`.
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => block(`blk-${i + 1}`, `r${i + 1}`));
    const prompt = buildFactoryDecomposeUserPrompt({ sourceBlocks: blocks, requirements: [], context: 'c' });

    for (const tag of ['SOURCE_BLOCKS', 'REQUIREMENTS', 'CONTEXT']) {
      expect(prompt).toContain(`<${tag}>`);
      expect(prompt).toContain(`</${tag}>`);
    }
    expect(sourceBlocksPrecedeContext(prompt)).toBe(true);
  });

  it('the check is NOT vacuous: it returns false when an id is genuinely never asked for', () => {
    // The control. Without it, every `true` above could mean the function always returns true and
    // the recorded gap would be a misreading of a constant.
    const inputs = { sourceBlocks: [block('blk-1', 'asked')], requirements: [], context: 'c' };
    const prompt = buildFactoryDecomposeUserPrompt(inputs);
    const extra = { ...inputs, sourceBlocks: [...inputs.sourceBlocks, block('blk-never-asked', 'absent')] };

    expect(coversRequirementBlocks(prompt, extra)).toBe(false);
  });
});
