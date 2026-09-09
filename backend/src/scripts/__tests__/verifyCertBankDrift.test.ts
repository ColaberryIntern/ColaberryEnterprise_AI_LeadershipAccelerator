import { latestByKey, classifyItem } from '../verifyCertBankDrift';

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

/**
 * The four-way verdict, including the case the first live run missed.
 *
 * On 2026-09-09 this script reported DRIFTED: 0 against production while
 * CCARF-A1 was serving its pre-rewrite revision 1. Revision 2 held the rewritten
 * content and matched the authored item perfectly, so the latest-revision
 * comparison was satisfied — and nothing asked which revision a student would
 * actually receive. These tests exist so that gap cannot reopen.
 */
const authored = {
  question_key: 'A1',
  stem: 'A research system runs each researcher as a subagent. Monitoring shows the context stays flat.',
  options: [{ key: 'A', text: 'one' }, { key: 'B', text: 'two' }],
  correct_keys: ['A'],
  rationale: 'Because isolation is the point.',
  distractor_rationales: { B: 'no' },
};

const rev = (revision: number, over: any = {}): any => ({
  question_key: 'A1',
  revision,
  stem: authored.stem,
  options: authored.options,
  correct_keys: authored.correct_keys,
  rationale: authored.rationale,
  distractor_rationales: authored.distractor_rationales,
  review_status: 'draft',
  active_from: null,
  active_to: null,
  ...over,
});

describe('classifyItem', () => {
  it('reports missing when nothing is stored', () => {
    expect(classifyItem(authored, []).verdict).toBe('missing');
  });

  it('reports drifted when the latest stored revision is not what we authored', () => {
    expect(classifyItem(authored, [rev(1, { stem: 'something else entirely' })]).verdict).toBe('drifted');
  });

  it('reports unservable when the content is right but nothing is approved', () => {
    expect(classifyItem(authored, [rev(1), rev(2)]).verdict).toBe('unservable');
  });

  it('reports ok when the approved revision IS the authored content', () => {
    const out = classifyItem(authored, [rev(1), rev(2, { review_status: 'approved' })]);
    expect(out.verdict).toBe('ok');
    expect(out.servedRevision).toBe(2);
  });

  it('reports STALE when an OLD revision is approved and the new one waits', () => {
    // The production case, exactly: rev 1 approved with the pre-rewrite text,
    // rev 2 holding the rewrite as a draft. The latest revision matches what we
    // authored, so a latest-only check calls this clean while a student is being
    // served the superseded question.
    const out = classifyItem(authored, [
      rev(1, { stem: 'Each researcher runs as a subagent. What is the reason?', review_status: 'approved' }),
      rev(2),
    ]);
    expect(out.verdict).toBe('stale');
    expect(out.servedRevision).toBe(1);
  });

  it('does not call it stale when the approved older revision matches anyway', () => {
    // Same shape, but rev 2 changed nothing a student sees. Flagging this would
    // train people to ignore the category.
    const out = classifyItem(authored, [rev(1, { review_status: 'approved' }), rev(2)]);
    expect(out.verdict).toBe('ok');
    expect(out.servedRevision).toBe(1);
  });

  it('ignores an approved revision that is outside its active window', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const out = classifyItem(authored, [rev(1, { review_status: 'approved', active_to: past })]);
    expect(out.verdict).toBe('unservable');
  });
});
