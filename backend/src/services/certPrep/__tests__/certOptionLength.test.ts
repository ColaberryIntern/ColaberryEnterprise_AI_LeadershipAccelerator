import {
  lengthPlan, longestOptionKey, KEEP_EVERY, MIN_MARGIN_CHARS, MAX_MARGIN_CHARS,
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
