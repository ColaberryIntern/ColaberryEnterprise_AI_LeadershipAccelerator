import { latestByKey } from '../verifyCertBankDrift';

/**
 * The one decision in the drift checker: which stored revision counts as current.
 *
 * A drift checker that picks the wrong revision compares against the wrong text
 * and then reports drift incorrectly in BOTH directions — silence when the bank
 * is stale, noise when it is fine. That is worse than not checking, so the
 * selection is tested even though the rest of the script is a query and a print.
 */
const row = (question_key: string, revision: number, stem: string): any => ({
  question_key, revision, stem, options: [], correct_keys: [], rationale: null,
  distractor_rationales: {}, review_status: 'draft', active_from: null, active_to: null,
});

describe('latestByKey', () => {
  it('picks the highest revision, not the last row the database returned', () => {
    // Deliberately out of order: Postgres returns rows in whatever order it likes
    // without an ORDER BY, and the first version of this could have taken the last.
    const picked = latestByKey([
      row('A1', 2, 'rewritten'),
      row('A1', 1, 'original'),
      row('A1', 3, 'newest'),
    ]);
    expect(picked.get('A1')?.revision).toBe(3);
    expect(picked.get('A1')?.stem).toBe('newest');
  });

  it('keeps each key separate', () => {
    const picked = latestByKey([row('A1', 1, 'a'), row('A2', 5, 'b'), row('A1', 2, 'c')]);
    expect(picked.size).toBe(2);
    expect(picked.get('A1')?.revision).toBe(2);
    expect(picked.get('A2')?.revision).toBe(5);
  });

  it('returns an empty map for an empty bank rather than throwing', () => {
    expect(latestByKey([]).size).toBe(0);
  });
});
