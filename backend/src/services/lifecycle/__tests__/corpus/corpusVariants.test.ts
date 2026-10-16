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
import { measureAutomation, renderShare } from '../../generation/effortMeasures';
import {
  buildFactoryDecomposeUserPrompt, coversRequirementBlocks, sourceBlocksPrecedeContext,
  MAX_BLOCK_CHARS, MAX_BLOCKS,
} from '../../../factory/factoryDecomposePrompt';
import { fieldsOf, abcComposition, caseOf } from './corpusCaseFixtures';

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
