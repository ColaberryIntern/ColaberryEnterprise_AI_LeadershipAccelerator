/**
 * §103 cases 5 to 8: the VARIANTS — one person in several roles, the low-information
 * interview, source overflow, and a blueprint changed in flight.
 *
 * Split from `corpusCases.test.ts` when that file crossed the 500-line hard ceiling. The seam is
 * real rather than arbitrary: cases 1 to 4 run the four fixtures end to end through generation,
 * while these four are variants, and two of them are properties of the GATE rather than of
 * generation at all. Shared apparatus lives in `corpusCaseFixtures.ts`.
 */
import { runCorpusCase, type CorpusFixture } from './corpusRunner';
import { fixtureC } from '../../generation/__tests__/fixtures/referenceFixtures';
import { prerequisiteGaps, blockingGaps } from '../../lifecyclePrerequisites';
import { completeEvidence } from '../evidenceFixture';
import {
  measureAutomation, renderShare, type EffortAssessment,
} from '../../generation/effortMeasures';
import {
  buildFactoryDecomposeUserPrompt, coversRequirementBlocks, sourceBlocksPrecedeContext,
  MAX_BLOCK_CHARS, MAX_BLOCKS,
} from '../../../factory/factoryDecomposePrompt';
import { fieldsOf, abcComposition, caseOf } from './corpusCaseFixtures';
import {
  buildDecomposeUserPrompt, sourceOverflows, SourceOverflowError, briefPrecedesDocument,
  MAX_BRIEF_CHARS,
} from '../../../sbp/decomposePrompt';
import { FLAGS } from '../../../../config/featureFlags';

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

  // GAP 1 AND GAP 2 WERE RECORDED HERE, AND ARE NOW CLOSED. They documented a prompt that
  // dropped source blocks with nothing said, while the completeness check reported full
  // coverage because it read the instruction line rather than the delimited body. These two
  // cases are kept, inverted, so the closure cannot silently regress.
  it('a block over the cap is dropped, SAYS SO, and the coverage check now refuses', () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => block(`blk-${i + 1}`, `requirement number ${i + 1}`));
    const inputs = { sourceBlocks: blocks, requirements: [], context: 'c' };
    const prompt = buildFactoryDecomposeUserPrompt(inputs);
    const body = sourceSection(prompt);

    // Still dropped: the cap is a real limit and this does not pretend otherwise.
    expect(body).not.toContain(`requirement number ${MAX_BLOCKS + 1}`);
    expect(body).toContain('requirement number 1');

    // NO LONGER SILENT: the body names what did not arrive.
    expect(body).toContain('truncated');
    expect(body).toContain(`blk-${MAX_BLOCKS + 1}`);

    // AND THE CHECK NO LONGER LIES. It reads the delimited body and keys on the rendered
    // `[id]` form, so the plain-text notice listing the dropped id cannot satisfy it.
    expect(coversRequirementBlocks(prompt, inputs)).toBe(false);
    expect(body).not.toContain(`[blk-${MAX_BLOCKS + 1}]`);
  });

  it('a block longer than MAX_BLOCK_CHARS is clipped and LABELLED, and still counts as supplied', () => {
    const tail = 'THE TAIL THE MODEL NEVER SEES';
    const inputs = {
      sourceBlocks: [block('blk-long', `${'x'.repeat(MAX_BLOCK_CHARS)}${tail}`)],
      requirements: [], context: 'c',
    };
    const prompt = buildFactoryDecomposeUserPrompt(inputs);
    const body = sourceSection(prompt);

    expect(body).not.toContain(tail);
    expect(body).toContain(`truncated at ${MAX_BLOCK_CHARS} chars`);

    // TRUE on purpose, and the distinction matters: this block WAS supplied, so coverage holds.
    // What was lost is its tail, and the label is what says so. Coverage is about supply; the
    // truncation notice is about completeness, and conflating them would make one of the two
    // unreportable.
    expect(coversRequirementBlocks(prompt, inputs)).toBe(true);
  });

  it('the instruction cannot order the model to cite a block it was never given', () => {
    // The root cause: the instruction line was built from the FULL input while the body was
    // sliced, so the two disagreed. They now share one definition of "supplied".
    const blocks = Array.from({ length: MAX_BLOCKS + 2 }, (_, i) => block(`blk-${i + 1}`, `requirement number ${i + 1}`));
    const prompt = buildFactoryDecomposeUserPrompt({ sourceBlocks: blocks, requirements: [], context: 'c' });
    const instruction = prompt.slice(0, prompt.indexOf('<SOURCE_BLOCKS>'));

    expect(instruction).toContain('blk-1');
    expect(instruction).not.toContain(`blk-${MAX_BLOCKS + 1},`);
    expect(instruction).not.toContain(`blk-${MAX_BLOCKS + 2}`);
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
// ───────── case 7, second path: the SBP pipeline, which now REFUSES rather than clipping ─────────

/**
 * §103 case 7 asks for "an explicit completeness check, chunking, or a **visible blocking
 * overflow**". The block above records the FACTORY path, which drops, labels, and whose coverage
 * check now refuses. This block covers the other path with a budget, and it is the one where the
 * behavior changed: the **SBP** pipeline, which every student build goes through.
 *
 * Until 2026-11-21 `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK` defaulted OFF, so an over-budget brief was
 * clipped with a `…[truncated at N chars]` label inside the prompt and the build proceeded. The
 * flag now defaults ON, and the refusal is `SourceOverflowError`, carrying
 * `error_class: 'SourceOverflowBlocked'`.
 *
 * ## Why this arm is here and not only in `decomposePrompt`'s own suite
 *
 * `decomposePrompt.sourceTruncation.test.ts` tests the function. This tests the CORPUS CASE: that
 * one of the eight shapes `reference-fixtures.md` requires is now satisfied by a visible blocking
 * overflow rather than by a silent one. Those are different claims, and §103 case 7's row is the
 * one that says which of the three permitted answers the system actually gives.
 *
 * Every assertion runs in BOTH directions. A refusal that fired on every input would satisfy a
 * one-way test while making the pipeline unusable, which is the recurring defect this repo pays
 * for, so the under-budget control is not optional.
 */
describe('§103 case 7, the SBP path: an over-budget source is REFUSED, not clipped', () => {
  const overBudget = { brief: 'x'.repeat(MAX_BRIEF_CHARS + 1), document: '' };
  const underBudget = { brief: 'a short brief the student actually wrote', document: '' };

  it('the overflow is DETECTED, with the dropped character count named', () => {
    // Detection is separate from refusal: `sourceOverflows` is what the operator sees in the log
    // after turning the block off, and it has to keep working for that to be true.
    const overflows = sourceOverflows(overBudget);

    expect(overflows).toHaveLength(1);
    expect(overflows[0].tag).toBe('ORIGINAL_BRIEF');
    expect(overflows[0].limit).toBe(MAX_BRIEF_CHARS);
    expect(overflows[0].actual).toBe(MAX_BRIEF_CHARS + 1);
    // The number that makes the refusal arguable rather than a bare rejection.
    expect(overflows[0].droppedChars).toBe(1);
  });

  it('and an under-budget source overflows NOTHING, so detection is not unconditional', () => {
    expect(sourceOverflows(underBudget)).toEqual([]);
  });

  it('THE BEHAVIOR CHANGE: the prompt build REFUSES with `SourceOverflowBlocked`', () => {
    /*
     * The assertion L7.1's acceptance names. Asserted on the error's own `error_class` rather
     * than on its message, because the class is what `decomposeService` reads to classify the
     * failure and what an operator greps for; the message is prose and may be reworded.
     */
    expect(FLAGS.sbpSourceOverflowBlock).toBe(true);

    let caught: unknown = null;
    try {
      buildDecomposeUserPrompt(overBudget);
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SourceOverflowError);
    expect((caught as SourceOverflowError).error_class).toBe('SourceOverflowBlocked');
    // The message names the budget and says what the consequence of proceeding would have been,
    // because "too long" is not actionable and "shorten or split" is.
    expect((caught as SourceOverflowError).message).toContain(String(MAX_BRIEF_CHARS));
    expect((caught as SourceOverflowError).message).toContain('Shorten the input or split the build');
  });

  it('and an under-budget source still builds, so the refusal is SELECTIVE', () => {
    // The control, and the one that matters most: a `sourceBlocks` that threw on every input
    // would pass the test above while refusing every student build in the system.
    expect(() => buildDecomposeUserPrompt(underBudget)).not.toThrow();
    expect(buildDecomposeUserPrompt(underBudget)).toContain('a short brief the student actually wrote');
  });

  it('the SAFE-002 delimiters survive the refusal path, exactly as on the factory path', () => {
    // The named trap applies to both paths: a fix that refused without keeping the tags would
    // harden the overflow and weaken injection resistance in the same change.
    const prompt = buildDecomposeUserPrompt(underBudget);
    for (const tag of ['ORIGINAL_BRIEF', 'EXPANDED_DOCUMENT']) {
      expect(prompt).toContain(`<${tag}>`);
      expect(prompt).toContain(`</${tag}>`);
    }
    expect(briefPrecedesDocument(prompt)).toBe(true);
    /*
     * AND THE NEGATIVE DIRECTION, which nothing in this repo asserted. A verifier hollowed
     * `briefPrecedesDocument` to `return true` and every corpus suite stayed green: all seven
     * call sites in `src/` assert `true` and none asserted `false`, so the function could not
     * fail. Grounding order is the SAFE-002 invariant; a predicate that cannot say no does not
     * check it.
     */
    expect(briefPrecedesDocument('<EXPANDED_DOCUMENT></EXPANDED_DOCUMENT><ORIGINAL_BRIEF></ORIGINAL_BRIEF>')).toBe(false);
    expect(briefPrecedesDocument('neither tag is present')).toBe(false);
  });

  it('with the block OFF the same source is CLIPPED rather than refused, which is what changed', () => {
    /*
     * The before-state, kept rather than deleted. This is what an operator gets after setting
     * `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK=false`, which is the documented rollback, so deleting
     * its coverage on the day the default changed would stop testing a shipped behavior.
     *
     * Read through the flag object rather than through `process.env`, because `FLAGS` is
     * evaluated at module load and an env write here would not reach it.
     */
    const saved = FLAGS.sbpSourceOverflowBlock;
    try {
      (FLAGS as { sbpSourceOverflowBlock: boolean }).sbpSourceOverflowBlock = false;
      const prompt = buildDecomposeUserPrompt(overBudget);
      expect(prompt).toContain('truncated');
      // And the overflow is still DETECTED with the block off, which is what makes the label
      // honest rather than decorative.
      expect(sourceOverflows(overBudget)).toHaveLength(1);
    } finally {
      (FLAGS as { sbpSourceOverflowBlock: boolean }).sbpSourceOverflowBlock = saved;
    }
    // Restored, so the suite order cannot change the result of the test above.
    expect(FLAGS.sbpSourceOverflowBlock).toBe(true);
  });
});
