/**
 * Criterion identity, pinned — the punctuation contract.
 *
 * PRODUCTION EVIDENCE (2026-08-15). STORY-000's trust acceptance line is:
 *
 *   Trust — no tab shows a number, a connection or a result the project has
 *   not actually produced.
 *
 * That is a real U+2014 EM DASH, and STORY-000 is the one story every student
 * in the cohort builds. Any student, editor, agent or copy-paste path that
 * turned it into "-", "--" or an en dash had their claim land in
 * `rejected_claims`: the story sat at `submitted`, no points were awarded, and
 * the student was told their claim "does not match any acceptance criterion" —
 * accurate and useless. A live test confirmed that exact rejection path fires.
 *
 * THE LINE THESE TESTS HOLD. Forgiving about how the text is TYPED, never
 * about what it SAYS. Two halves, and the second half is the one the whole
 * gating model rests on:
 *
 *   1. Every punctuation variant of the same sentence is the same criterion.
 *   2. A REWORDED or paraphrased criterion is a DIFFERENT criterion, still
 *      rejected, still unverified. A student must never be able to pass by
 *      claiming something they did not meet, and two genuinely distinct
 *      criteria must never collapse into one.
 *
 * Pure functions only — no GitHub, no database, no clock.
 */
import { normaliseCriterion, ProgressFile, PROGRESS_SCHEMA_VERSION } from '../progressContract';
import { decideStory, PlanStorySpec, CommitFact } from '../verifyDecision';
import { COMMAND_CENTER_ACCEPTANCE, COMMAND_CENTER_STORY_ID } from '../../commandCenterStory';

/**
 * The real production sentence, read from the shipping constant, not retyped.
 *
 * Found by CONTENT, not by index. This list grows — the Command Center data
 * contract added two criteria ahead of this one — and a positional pin silently
 * re-points every punctuation test at a criterion with no dash in it at all,
 * leaving the suite green while testing nothing. The guard below asserts the
 * exact sentence, so a wrong pick fails loudly instead.
 */
const TRUST = COMMAND_CENTER_ACCEPTANCE.find((c) => c.includes('—'))!;

/** Swap the em dash in the real criterion for whatever a given keyboard produced. */
const withDash = (dash: string, spaced = true): string =>
  TRUST.replace(' — ', spaced ? ` ${dash} ` : dash);

/**
 * Claim EVERY criterion the plan asks for, with the trust criterion replaced by
 * `variant`. Written against the whole constant rather than a hand-listed three,
 * so adding a criterion to the plan cannot quietly turn a "verified" assertion
 * into a partial one.
 */
const claimAllWithTrustAs = (variant: string, passed = true): Array<[string, boolean]> =>
  COMMAND_CENTER_ACCEPTANCE.map((c) => (c === TRUST ? [variant, passed] : [c, true]) as [string, boolean]);

function progressWith(criteria: Array<[string, boolean]>): ProgressFile {
  return {
    schema_version: PROGRESS_SCHEMA_VERSION,
    project: 'Test',
    stories: [{
      id: COMMAND_CENTER_STORY_ID,
      release: 'R1',
      acceptance_total: criteria.length,
      criteria: criteria.map(([text, passed]) => ({ text, passed })),
      files_touched: ['src/CommandCenter.tsx'],
      tests_added: [],
      notes: null,
      updated_at: null,
    }],
  };
}

const spec: PlanStorySpec = {
  id: COMMAND_CENTER_STORY_ID,
  acceptance: [...COMMAND_CENTER_ACCEPTANCE],
};

const goodCommit: CommitFact = {
  sha: 'a'.repeat(40),
  message: `${COMMAND_CENTER_STORY_ID}: build the command center`,
  changed_files: 4,
  committed_at: '2026-08-15T10:00:00Z',
  author: 'student',
};

// ── 1. the sentence is fixed, so the test tracks reality ────────────────────

describe('the production criterion this bug was found on', () => {
  it('still contains a real em dash (if this fails, re-point the test, do not delete it)', () => {
    expect(TRUST).toContain('—');
    expect(TRUST).toBe(
      'Trust — no tab shows a number, a connection or a result the project has not actually produced.',
    );
  });

  /**
   * ANTI-VACUITY GUARD. `withDash` is a string replace: if TRUST ever stops
   * containing ' — ', every variant below silently becomes TRUST itself and the
   * whole punctuation suite passes while asserting nothing. That is not
   * hypothetical — pinning TRUST by array index did exactly this when the
   * Command Center data contract inserted two criteria ahead of it. Assert the
   * substitution actually substitutes.
   */
  it('produces a genuinely different string for each dash variant', () => {
    for (const dash of ['-', '--', '–', '−']) {
      expect(withDash(dash)).not.toBe(TRUST);
      expect(withDash(dash, false)).not.toBe(TRUST);
    }
  });
});

// ── 2. forgiving about how it is TYPED ──────────────────────────────────────

describe('normaliseCriterion tolerates typing variants', () => {
  const canonical = normaliseCriterion(TRUST);

  it.each([
    ['em dash U+2014 (the plan itself)', withDash('—')],
    ['en dash U+2013', withDash('–')],
    ['plain hyphen U+002D', withDash('-')],
    ['double hyphen', withDash('--')],
    ['triple hyphen', withDash('---')],
    ['minus sign U+2212', withDash('−')],
    ['figure dash U+2012', withDash('‒')],
    ['horizontal bar U+2015', withDash('―')],
    ['non-breaking hyphen U+2011', withDash('‑')],
    ['hyphen U+2010', withDash('‐')],
    ['fullwidth hyphen U+FF0D', withDash('－')],
    ['em dash, no surrounding spaces', withDash('—', false)],
    ['double hyphen, no surrounding spaces', withDash('--', false)],
    ['hyphen, no surrounding spaces', withDash('-', false)],
  ])('matches the plan when the dash is a %s', (_label, variant) => {
    expect(normaliseCriterion(variant)).toBe(canonical);
  });

  it('matches across smart vs straight double quotes', () => {
    const straight = 'Given sample mode, the badge reads "sample" on every card.';
    const smart = 'Given sample mode, the badge reads “sample” on every card.';
    expect(normaliseCriterion(smart)).toBe(normaliseCriterion(straight));
  });

  it('matches across smart vs straight apostrophes', () => {
    const straight = "The student's own plan drives every tab.";
    const smart = 'The student’s own plan drives every tab.';
    expect(normaliseCriterion(smart)).toBe(normaliseCriterion(straight));
  });

  it('matches across a trailing period', () => {
    expect(normaliseCriterion('The roster endpoint returns 200.'))
      .toBe(normaliseCriterion('The roster endpoint returns 200'));
  });

  it('matches across a Word round trip (smart quotes + en dash + non-breaking space)', () => {
    const typed = 'Trust – no tab shows the student’s “fake” numbers';
    const plain = 'Trust - no tab shows the student\'s "fake" numbers.';
    expect(normaliseCriterion(typed)).toBe(normaliseCriterion(plain));
  });

  it('matches across invisible copy-paste debris (zero-width space, soft hyphen, BOM)', () => {
    const debris = `﻿Trust — no​ tab shows a num­ber, a connection or a result `
      + 'the project has not actually produced.';
    expect(normaliseCriterion(debris)).toBe(canonical);
  });

  it('matches across unicode composition (NFC vs NFD)', () => {
    const composed = 'The café report renders.';
    const decomposed = 'The café report renders.';
    expect(composed).not.toBe(decomposed);          // genuinely different bytes
    expect(normaliseCriterion(decomposed)).toBe(normaliseCriterion(composed));
  });

  it('is idempotent — normalising an already-normalised string changes nothing', () => {
    for (const t of [TRUST, ...COMMAND_CENTER_ACCEPTANCE, withDash('--'), 'a "b" c.']) {
      expect(normaliseCriterion(normaliseCriterion(t))).toBe(normaliseCriterion(t));
    }
  });
});

// ── 3. never forgiving about what it SAYS ───────────────────────────────────

describe('normaliseCriterion keeps distinct criteria distinct', () => {
  /**
   * Pairs that a careless normaliser would merge. Each pair is two DIFFERENT
   * claims about the system, and no amount of punctuation tolerance may fuse
   * them. If a step you are adding fails one of these, the step is wrong.
   */
  it.each([
    ['a statement vs a question', 'The API returns 200', 'The API returns 200?'],
    ['hyphenated vs spaced words', 'The export is read-only', 'The export is read only'],
    ['possessive vs plural', "The user's data is deleted", 'The users data is deleted'],
    ['quoted vs unquoted term', 'The label is "sample"', 'The label is sample'],
    ['different numbers', 'The retry budget is 3 attempts', 'The retry budget is 30 attempts'],
    ['a colon is not noise', 'The job runs at 10:00', 'The job runs at 1000'],
    ['superscript is not a digit', 'The chart plots x² over time', 'The chart plots x2 over time'],
    ['a dropped prefix is a reword', TRUST, TRUST.replace('Trust — ', '')],
    ['a dropped clause is a reword', TRUST, 'Trust — no tab shows a number the project has not actually produced.'],
    ['negation', 'Every tab is reachable', 'Every tab is not reachable'],
  ])('does not merge %s', (_label, a, b) => {
    expect(normaliseCriterion(a)).not.toBe(normaliseCriterion(b));
  });

  it('maps every real STORY-000 criterion to its own distinct key', () => {
    const keys = new Set(COMMAND_CENTER_ACCEPTANCE.map(normaliseCriterion));
    expect(keys.size).toBe(COMMAND_CENTER_ACCEPTANCE.length);
  });

  it('keeps a realistic plan\'s criteria fully distinct after normalisation', () => {
    const plan = [
      ...COMMAND_CENTER_ACCEPTANCE,
      'Given the roster endpoint, when an admin calls it, then it returns 200 with a list of members.',
      'Given the roster endpoint, when an unauthenticated caller calls it, then it returns 401.',
      'Given the roster endpoint, when a member has left, then that member is excluded.',
      'Given sample mode, when the toggle is switched to real, then every card refetches.',
      'The integrations panel shows one row per system of record named in the plan.',
      'The integrations panel shows a live indicator per row.',
    ];
    expect(new Set(plan.map(normaliseCriterion)).size).toBe(plan.length);
  });
});

// ── 4. the same rules at the decision boundary, on BOTH sides ───────────────

describe('decideStory applies the same normalisation to plan and claim', () => {
  it('verifies STORY-000 when the student typed hyphens instead of the em dash', () => {
    const progress = progressWith(claimAllWithTrustAs(withDash('--')));
    const v = decideStory(spec, progress, [goodCommit]);
    expect(v.rejected_claims).toEqual([]);
    expect(v.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length);
    expect(v.state).toBe('verified');
  });

  it('verifies when the whole file came back through a smart-quote editor', () => {
    const progress = progressWith(
      COMMAND_CENTER_ACCEPTANCE.map((t) => [
        t.replace(/—/g, '–').replace(/'/g, '’'),
        true,
      ] as [string, boolean]),
    );
    const v = decideStory(spec, progress, [goodCommit]);
    expect(v.rejected_claims).toEqual([]);
    expect(v.state).toBe('verified');
  });

  /**
   * THE REGRESSION THAT MATTERS MOST. Punctuation tolerance must not become
   * meaning tolerance: a student who writes their own, easier criterion still
   * gets nothing for it.
   */
  it('still rejects a REWORDED criterion, and still refuses to verify', () => {
    const reworded = 'Trust — no tab shows fake data.';
    const progress = progressWith(claimAllWithTrustAs(reworded));
    const v = decideStory(spec, progress, [goodCommit]);
    expect(v.rejected_claims).toEqual([reworded]);
    expect(v.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length - 1);
    expect(v.state).toBe('submitted');
    expect(v.outstanding).toEqual([TRUST]);
  });

  it('still rejects a paraphrase that keeps most of the words', () => {
    const paraphrase = 'Trust — no tab shows a number, a connection or a result the project did not produce.';
    const v = decideStory(spec, progressWith([[paraphrase, true]]), [goodCommit]);
    expect(v.rejected_claims).toEqual([paraphrase]);
    expect(v.criteria_passed).toBe(0);
    expect(v.state).toBe('in_progress');
  });

  it('still rejects an invented criterion the plan never asked for', () => {
    const invented = 'The Command Center looks nice.';
    const v = decideStory(spec, progressWith([[invented, true]]), [goodCommit]);
    expect(v.rejected_claims).toEqual([invented]);
    expect(v.state).toBe('in_progress');
  });

  it('does not let punctuation tolerance flip a criterion the student marked false', () => {
    const progress = progressWith(claimAllWithTrustAs(withDash('-'), false));
    const v = decideStory(spec, progress, [goodCommit]);
    expect(v.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length - 1);
    expect(v.state).toBe('submitted');
    expect(v.outstanding).toEqual([TRUST]);
  });
});
