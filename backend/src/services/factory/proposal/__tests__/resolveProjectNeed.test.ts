import { unblockedDocKeys, answerSummary } from '../resolveProjectNeed';
import type { HumanNeed } from '../proposalReviewTypes';

const need = (over: Partial<HumanNeed> & Pick<HumanNeed, 'key' | 'kind'>): HumanNeed => ({
  ask: 'a', why: 'w', format: 'f', blocking: 'score', usedIn: [], ...over,
});

describe('unblockedDocKeys', () => {
  it('returns the distinct documents a need unblocks', () => {
    const n = need({ key: 'fact:x', kind: 'fact', usedIn: [
      { docKey: 'cover' }, { docKey: 'tech', sectionKey: 's1' }, { docKey: 'cover', sectionKey: 's2' },
    ] });
    expect(unblockedDocKeys(n).sort()).toEqual(['cover', 'tech']);
  });
  it('is empty when the need touches no document', () => {
    expect(unblockedDocKeys(need({ key: 'k', kind: 'fact' }))).toEqual([]);
  });
});

describe('answerSummary', () => {
  it('summarizes each payload shape to a short string', () => {
    expect(answerSummary({ value: '12-345' })).toBe('12-345');
    expect(answerSummary({ decision: 'upstream/ds' })).toBe('upstream/ds');
    expect(answerSummary({ fileRef: 'u/1' })).toBe('u/1');
    expect(answerSummary({ signatureRef: 'u/2' })).toBe('u/2');
    expect(answerSummary({ confirmed: true })).toBe('confirmed');
    expect(answerSummary({ confirmed: false })).toBe('declined');
  });
  it('falls back to JSON when there is no scalar', () => {
    expect(answerSummary({ decision: 'go', foo: 1 })).toBe('go');
    expect(answerSummary({ foo: 1 })).toBe('{"foo":1}');
  });
});
