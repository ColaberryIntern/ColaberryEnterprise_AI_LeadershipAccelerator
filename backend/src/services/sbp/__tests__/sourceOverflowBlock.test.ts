/**
 * P7-T1.3 — the source-overflow block, and the proof that it is inert until it is switched on.
 *
 * ## The decision was pre-registered, then measured
 *
 * `plan-phase7.md` §3.3 fixed the rule BEFORE the data was seen, because "with no decision rule
 * pre-committed, any measurement justifies any outcome including the status quo":
 *
 *   any build in the last 90 days over the cap  -> implement a BLOCKING overflow behind the flag
 *   zero                                        -> keep detect-only, ship a tripwire
 *
 * Measured on production 16 October 2026 with the SHIPPED `buildBriefText` over the stored
 * `build_intake` rows, not with a SQL approximation of it:
 *
 *   rows                 48          <- the denominator, and the whole corpus; 90 days is all time
 *   p50 / p90 / p95      5,737 / 27,772 / 28,844
 *   max                  41,679      <- more than double the cap
 *   over MAX_BRIEF_CHARS 11 of 48, every one inside 90 days
 *
 * So roughly a quarter of real student briefs are being clipped in production today, p90 sits
 * well above the cap, and the blocking branch fires.
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

describe('the flag DEFAULTS OFF, and off means byte-for-byte unchanged', () => {
  it('defaults to off, because the env var is unset in every environment that has not opted in', () => {
    // Asserted against the real module rather than the local helper. A flag that shipped on
    // would change a live student-facing path on the next deploy.
    expect(FLAGS.sbpSourceOverflowBlock).toBe(false);
    expect(process.env.ENABLE_SBP_SOURCE_OVERFLOW_BLOCK).not.toBe('true');
  });

  it('with the flag OFF an over-long brief is clipped and labelled, exactly as before', () => {
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
