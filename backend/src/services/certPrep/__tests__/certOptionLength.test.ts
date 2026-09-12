import {
  lengthPlan, longestOptionKey, hasOptionLabel, stripOptionLabels,
  extensionProblem, contentRetention,
  KEEP_EVERY, MIN_MARGIN_CHARS, MAX_MARGIN_CHARS, CONTENT_RETENTION_MIN,
} from '../certOptionLength';
import { assignAnswerPosition } from '../../../data/certBlueprints/items/itemFactory';

/**
 * The length plan is a pure decision, so it is held to the properties that make
 * it safe to run in a loop: it is deterministic, it never asks to lengthen when
 * there is nothing to fix, it keeps a fixed share of keys longest so the bank
 * lands at chance rather than at zero, and its keep decision does not travel
 * with the answer position.
 */

const item = (key: string, texts: [string, string, string, string], correct = 'A') => ({
  question_key: key,
  options: ['A', 'B', 'C', 'D'].map((k, i) => ({ key: k, text: texts[i] })),
  correct_keys: [correct],
});

describe('option labels — "D. Allocate more capacity" as option D', () => {
  it('recognises the ways a model writes the letter in front', () => {
    for (const t of ['D. Allocate more capacity', 'b) lower the threshold', 'C - add logging', 'A: retry it', '  D.  spaced']) {
      expect(hasOptionLabel(t)).toBe(true);
    }
  });

  it('does not mistake ordinary English for a label', () => {
    for (const t of ['A retry fixes a call that failed', 'E.g. something', 'Disable the step', 'B2B integrations first', 'C++ tooling']) {
      expect(hasOptionLabel(t)).toBe(false);
    }
  });

  it('strips every labelled option and names them; returns the same object when clean', () => {
    const dirty = item('k', ['fine', 'B. lower the threshold', 'fine', 'D) allocate']);
    const out = stripOptionLabels(dirty);
    expect(out.changed).toEqual(['B', 'D']);
    expect(out.item.options.map((o) => o.text)).toEqual(['fine', 'lower the threshold', 'fine', 'allocate']);
    expect(dirty.options[1].text).toBe('B. lower the threshold'); // input untouched
    const clean = item('k', ['a', 'b', 'c', 'd']);
    expect(stripOptionLabels(clean).item).toBe(clean);
  });
});

describe('an extension, not a rewrite', () => {
  // Every case below is a real pair from the first authored run, which passed
  // the bounds check, the invariants, the rubric and the triage.
  const original = 'Retry the failed step with exponential backoff';

  it('accepts the original with more detail added to it', () => {
    expect(extensionProblem(original, `${original} and a capped number of attempts`)).toBeNull();
  });

  it('refuses a fluent replacement that says the same thing in new words', () => {
    // Keeps the opening word, so the retention rule is what has to catch it.
    const rewrite = 'Retry the unsuccessful operation again, using progressively longer waits between tries';
    expect(extensionProblem(original, rewrite)).toMatch(/rewritten rather than extended/);
  });

  it('refuses a changed opening word, because the options answer the stem as a set', () => {
    // "That redacted values are replaced ..." -> "Ensure redacted values are replaced ..."
    const before = 'That redacted values are replaced with a consistent placeholder';
    const after = 'Ensure redacted values are replaced with a consistent placeholder across every field';
    expect(extensionProblem(before, after)).toMatch(/opening word changed: "that" -> "ensure"/);
  });

  it('refuses a full stop the three sibling options do not have', () => {
    expect(extensionProblem(original, `${original} and a capped number of attempts.`))
      .toMatch(/trailing punctuation changed: "none" -> "\."/);
  });

  it('refuses dropping a full stop the siblings do have', () => {
    expect(extensionProblem(`${original}.`, `${original} and a capped number of attempts`))
      .toMatch(/trailing punctuation changed: "\." -> "none"/);
  });

  it('refuses anything not actually longer', () => {
    expect(extensionProblem(original, 'Retry the step')).toMatch(/not longer/);
  });

  it('measures retention on meaning-carrying words, ignoring the scaffolding', () => {
    // Same content words, different connectives: retention is total.
    expect(contentRetention('Retry the failed step with backoff', 'Retry a failed step using backoff')).toBe(1);
    expect(contentRetention('alpha bravo charlie', 'alpha bravo charlie delta')).toBe(1);
    expect(contentRetention('alpha bravo charlie delta', 'alpha bravo')).toBe(0.5);
  });

  it('has a floor strict enough to have caught the run that motivated it', () => {
    // The first authored run's median retention was 0.40.
    expect(CONTENT_RETENTION_MIN).toBeGreaterThan(0.4);
  });
});

describe('longestOptionKey', () => {
  it('measures trimmed characters', () => {
    expect(longestOptionKey(item('k', ['aa', 'bbbb   ', 'c', 'dd']))).toBe('B');
  });
  it('is null for no options', () => {
    expect(longestOptionKey({ options: [] })).toBeNull();
  });
});

describe('lengthPlan', () => {
  it('leaves multi-select items alone', () => {
    const p = lengthPlan({ ...item('k', ['long long long', 'b', 'c', 'd']), correct_keys: ['A', 'B'] });
    expect(p.target).toBeNull();
    expect(p.keyIsLongest).toBe(false);
  });

  it('does nothing when the key is not the longest option', () => {
    const p = lengthPlan(item('k', ['short', 'a much longer wrong answer', 'c', 'd']));
    expect(p.keyIsLongest).toBe(false);
    expect(p.target).toBeNull();
  });

  it('targets the longest DISTRACTOR with bounds just above the key', () => {
    // Find a key the hash does not keep, so the plan has to produce a target.
    let k = 0;
    let p = lengthPlan(item(`CCARF-D1-${k}`, ['the correct answer, twenty', 'medium wrong', 'x', 'yy']));
    while (p.keep) { k += 1; p = lengthPlan(item(`CCARF-D1-${k}`, ['the correct answer, twenty', 'medium wrong', 'x', 'yy'])); }
    expect(p.keyIsLongest).toBe(true);
    expect(p.target).toBe('B');
    expect(p.minChars).toBe('the correct answer, twenty'.length + MIN_MARGIN_CHARS);
    expect(p.maxChars).toBe('the correct answer, twenty'.length + MAX_MARGIN_CHARS);
  });

  it('is deterministic for a key', () => {
    const a = lengthPlan(item('CCARF-D2-41', ['longest of all here', 'b', 'c', 'd']));
    const b = lengthPlan(item('CCARF-D2-41', ['longest of all here', 'b', 'c', 'd']));
    expect(a).toEqual(b);
  });

  it('keeps about one key in KEEP_EVERY longest, so the bank lands near chance', () => {
    const keys = Array.from({ length: 600 }, (_, i) => `CCARF-D${(i % 5) + 1}-${30 + Math.floor(i / 5)}`);
    const kept = keys.filter((k) => lengthPlan(item(k, ['longest option here', 'b', 'c', 'd'])).keep).length;
    const share = kept / keys.length;
    expect(share).toBeGreaterThan(1 / KEEP_EVERY - 0.08);
    expect(share).toBeLessThan(1 / KEEP_EVERY + 0.08);
  });

  it('does not decide "keep" along with the answer position', () => {
    // Both are hashes of the key. If they moved together, "the key is at A"
    // would predict "the key is allowed to be longest", which is a cue.
    const keys = Array.from({ length: 800 }, (_, i) => `CCARF-D${(i % 5) + 1}-${30 + Math.floor(i / 5)}`);
    const byPosition: Record<string, { n: number; kept: number }> = {};
    for (const k of keys) {
      const placed = assignAnswerPosition(k, [['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd']], ['A']);
      const pos = placed.correct[0];
      const keep = lengthPlan(item(k, ['longest option here', 'b', 'c', 'd'])).keep;
      byPosition[pos] = byPosition[pos] ?? { n: 0, kept: 0 };
      byPosition[pos].n += 1;
      if (keep) byPosition[pos].kept += 1;
    }
    const overall = Object.values(byPosition).reduce((s, x) => s + x.kept, 0) / keys.length;
    for (const [, x] of Object.entries(byPosition)) {
      expect(Math.abs(x.kept / x.n - overall)).toBeLessThan(0.12);
    }
  });
});
