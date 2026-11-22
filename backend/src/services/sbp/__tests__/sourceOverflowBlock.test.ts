/**
 * P7-T1.3 and L9.6 — the source-overflow block, now ON, and the proof that it refuses the right
 * inputs and only those.
 *
 * ## The decision was pre-registered, then measured, then re-measured
 *
 * `plan-phase7.md` §3.3 fixed the rule BEFORE the data was seen, because "with no decision rule
 * pre-committed, any measurement justifies any outcome including the status quo":
 *
 *   any build in the last 90 days over the cap  -> implement a BLOCKING overflow behind the flag
 *   zero                                        -> keep detect-only, ship a tripwire
 *
 * The October measurement that this file used to quote (48 rows, p90 27,772, 11 over) was taken
 * against a 20,000 character brief cap. L12.2 then raised `MAX_BRIEF_CHARS` to 150,000 so the
 * questions step could read a whole scope document, which moved the cap 7.5x and left that
 * paragraph describing a limit the code no longer has. It is replaced rather than kept, because
 * a justification that no longer refers to the shipped constants is not evidence.
 *
 * Re-measured 20 November 2026 against `accelerator_prod`, read-only, at the budgets this module
 * actually exports:
 *
 *   build_intake.idea              56 rows   max 19,996   over budget 0   over intake cap 0
 *   assembled intake               56 rows   max 38,820   over budget 0
 *   project_understandings.items   26 rows   max 80,613   over budget 0   (cap 200,000)
 *
 * `build_plans.plan_json` reaches 497,062 and is excluded on purpose: it is generation OUTPUT,
 * and these budgets do not govern it.
 *
 * ## Why ON is safe, in two arguments rather than one
 *
 * 56 rows is a modest sample, so the structural argument is stated first and does not depend on
 * it: the intake cap is 60,000 and the brief budget is 150,000, so a brief cannot reach the limit
 * by construction. The measured argument is the second: 7.5x of headroom on the largest real
 * brief, 2.5x on the largest expansion. Turning this on cannot fail a build that succeeds today.
 * What it can do is refuse an input the system has never yet received, which is precisely the
 * case where silent clipping would do the most damage.
 *
 * ## Why the refusal lives inside `sourceBlocks`
 *
 * Both generation stages already call it, so the control cannot become a producer with no
 * consumer. That is not a hypothetical worry: this same programme shipped two bypass detectors
 * that were written, tested, and called from nothing.
 */
import { FLAGS } from '../../../config/featureFlags';
import {
  sourceBlocks, sourceOverflows, SourceOverflowError,
  MAX_BRIEF_CHARS, MAX_DOCUMENT_CHARS,
} from '../decomposePrompt';

/** A brief over the cap, and a document under it, so one tag overflows and the other does not. */
const OVER = {
  brief: 'b'.repeat(MAX_BRIEF_CHARS + 500),
  document: 'd'.repeat(100),
};
const UNDER = { brief: 'short brief', document: 'short document' };

/** Flip the flag for one test and always put it back, so ordering cannot leak state. */
function withFlag<T>(on: boolean, fn: () => T): T {
  const prev = FLAGS.sbpSourceOverflowBlock;
  (FLAGS as { sbpSourceOverflowBlock: boolean }).sbpSourceOverflowBlock = on;
  try {
    return fn();
  } finally {
    (FLAGS as { sbpSourceOverflowBlock: boolean }).sbpSourceOverflowBlock = prev;
  }
}

describe('the flag DEFAULTS ON, and the escape hatch still works', () => {
  it('defaults to ON, so a student brief is never quietly half-read', () => {
    // Asserted against the real module rather than the local helper, and in the form the module
    // uses: `!== 'false'`. An env var left unset must now mean ON, which is the whole flip.
    expect(FLAGS.sbpSourceOverflowBlock).toBe(true);
    expect(process.env.ENABLE_SBP_SOURCE_OVERFLOW_BLOCK).not.toBe('false');
  });

  it('with the flag OFF an over-long brief is clipped and labelled, as it did before the flip', () => {
    const out = withFlag(false, () => sourceBlocks(OVER));

    expect(out).toContain(`…[truncated at ${MAX_BRIEF_CHARS} chars]`);
    // The clip really happened: the body is the cap plus the label, not the full input.
    expect(out).not.toContain('b'.repeat(MAX_BRIEF_CHARS + 1));
  });

  it('OFF IS BYTE-IDENTICAL for input that does not overflow, which is the common case', () => {
    // The strongest form of "unchanged": the same string, not merely a passing assertion about
    // part of it. If the block ever leaked into the non-overflow path this fails.
    const a = withFlag(false, () => sourceBlocks(UNDER));
    const b = withFlag(true, () => sourceBlocks(UNDER));
    expect(a).toBe(b);
    expect(a).toContain('short brief');
  });
});

describe('with the flag ON it REFUSES rather than sending the model half a brief', () => {
  it('throws a typed SourceOverflowError naming the tag, the limit and what is lost', () => {
    const call = () => withFlag(true, () => sourceBlocks(OVER));

    expect(call).toThrow(SourceOverflowError);
    try {
      call();
      throw new Error('expected a refusal');
    } catch (e) {
      const err = e as SourceOverflowError;
      expect(err.name).toBe('SourceOverflowError');
      // The numbers a human needs to act, not just "too long".
      expect(err.message).toContain('ORIGINAL_BRIEF');
      expect(err.message).toContain(String(MAX_BRIEF_CHARS));
      expect(err.message).toContain('500');
      // The overflow list is carried, so a caller can report per tag without re-deriving it.
      expect(err.overflows).toHaveLength(1);
      expect(err.overflows[0]).toMatchObject({ tag: 'ORIGINAL_BRIEF', droppedChars: 500 });
    }
  });

  it('does NOT refuse input that fits, so the flag is a gate and not an outage', () => {
    expect(() => withFlag(true, () => sourceBlocks(UNDER))).not.toThrow();
  });

  it('refuses on the DOCUMENT tag too, not only the brief', () => {
    // Both budgets, because a rule that only covered the smaller input would leave the 200,000
    // character document path exactly as silent as it is today.
    const doc = { brief: 'fine', document: 'd'.repeat(MAX_DOCUMENT_CHARS + 1) };
    try {
      withFlag(true, () => sourceBlocks(doc));
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as SourceOverflowError).overflows[0].tag).toBe('EXPANDED_DOCUMENT');
    }
  });
});

describe('SAFE-002: the named trap, asserted directly', () => {
  /**
   * `plan-phase7.md` names this: "`decomposePrompt.delimited()` IS the SAFE-002 injection
   * defence. Any change to clipping must preserve the delimiters, asserted directly, or
   * hardening the overflow would weaken injection resistance."
   *
   * So the delimiters and their ORDER are asserted on the same path the block was added to.
   */
  it('both source blocks keep their open and close tags with the flag off', () => {
    const out = withFlag(false, () => sourceBlocks(OVER));
    for (const tag of ['ORIGINAL_BRIEF', 'EXPANDED_DOCUMENT']) {
      expect(out).toContain(`<${tag}>`);
      expect(out).toContain(`</${tag}>`);
    }
  });

  it('the brief still PRECEDES the document, which is the grounding order', () => {
    const out = withFlag(false, () => sourceBlocks(UNDER));
    expect(out.indexOf('<ORIGINAL_BRIEF>')).toBeLessThan(out.indexOf('<EXPANDED_DOCUMENT>'));
  });

  it('a clipped body stays INSIDE its delimiters, so the truncation label cannot escape', () => {
    // The specific way a clipping change could break the defence: a label emitted outside the
    // tag would be read by the model as instruction rather than as quoted source.
    const out = withFlag(false, () => sourceBlocks(OVER));
    const open = out.indexOf('<ORIGINAL_BRIEF>');
    const close = out.indexOf('</ORIGINAL_BRIEF>');
    const label = out.indexOf('…[truncated at');
    expect(label).toBeGreaterThan(open);
    expect(label).toBeLessThan(close);
  });
});

describe('the detector and the block agree, because they read the same function', () => {
  it('sourceOverflows reports exactly what the refusal carries', () => {
    // Two implementations of "is this over budget" would eventually disagree, and the one in the
    // error message is the one a human reads.
    const detected = sourceOverflows(OVER);
    try {
      withFlag(true, () => sourceBlocks(OVER));
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as SourceOverflowError).overflows).toEqual(detected);
    }
  });
});
