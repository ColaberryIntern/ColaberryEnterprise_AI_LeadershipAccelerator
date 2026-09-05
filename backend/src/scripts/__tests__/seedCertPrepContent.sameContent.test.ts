/**
 * The seeder's "has this item changed?" comparison.
 *
 * This exists because of a defect that only appeared on the SECOND --revise run
 * against production: one item in 150 re-minted a fresh draft revision every
 * single time, forever. Nothing failed. The symptom was a review queue that
 * grew by one on every run, and a script that could never settle.
 *
 * The cause was the same one that had been fixed in seedTypeCertificationMap
 * that morning, in a private helper this file could not reach: jsonb does not
 * store keys in the order you wrote them. `distractor_rationales` came back
 * from Postgres as {B, C, D} and the rebalance built it as {C, D, B}. Identical
 * content, different strings.
 *
 * Both seeders now use utils/canonicalHash, whose own header warns that two
 * implementations of one invariant is the failure mode. It was right.
 */
import { sameContent } from '../lib/certItemContent';

const authored = {
  stem: 'Which representation best expresses uncertainty?',
  options: [{ key: 'A', text: 'a nullable confidence score' }, { key: 'B', text: 'a required string' }],
  correct_keys: ['A'],
  rationale: 'A nullable score can say "I do not know".',
  distractor_rationales: { C: 'free text is unusable', D: 'a list defers the decision', B: 'a required string forces an answer' },
};

describe('sameContent', () => {
  it('the production case: jsonb key order is not a change', () => {
    // Exactly CCARF-D4-13 -- Postgres returns the rationale keys sorted.
    const stored = { ...authored, distractor_rationales: { B: 'a required string forces an answer', C: 'free text is unusable', D: 'a list defers the decision' } };
    expect(sameContent(stored, authored)).toBe(true);
  });

  it('a moved answer IS a change - this is what --revise exists to catch', () => {
    const stored = { ...authored, correct_keys: ['B'] };
    expect(sameContent(stored, authored)).toBe(false);
  });

  it('reworded option text is a change', () => {
    const stored = { ...authored, options: [{ key: 'A', text: 'a nullable score' }, { key: 'B', text: 'a required string' }] };
    expect(sameContent(stored, authored)).toBe(false);
  });

  it('a reordered options ARRAY is a change - position is the thing being fixed', () => {
    const stored = { ...authored, options: [{ key: 'B', text: 'a required string' }, { key: 'A', text: 'a nullable confidence score' }] };
    expect(sameContent(stored, authored)).toBe(false);
  });

  it('an edited stem or rationale is a change, because a student reads both', () => {
    expect(sameContent({ ...authored, stem: 'Which one?' }, authored)).toBe(false);
    expect(sameContent({ ...authored, rationale: 'different' }, authored)).toBe(false);
  });

  it('a null stored rationale is not equal to an authored one', () => {
    expect(sameContent({ ...authored, rationale: null }, authored)).toBe(false);
  });
});
